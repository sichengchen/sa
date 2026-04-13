import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isPathInside, toRelativeIfInside } from "@aria/policy";

const REFERENCE_PATTERN =
  /(?<![\w/])@(?:(?<simple>diff|staged)\b|(?<kind>file|folder|url):(?<value>\S+))/g;
const TRAILING_PUNCTUATION = /[.,;!?]+$/;
const MAX_INJECTED_CHARS = 80_000;
const SOFT_WARNING_CHARS = 40_000;
const MAX_FOLDER_ENTRIES = 200;
const SECRET_PATH_FRAGMENTS = [
  "/.ssh",
  "/.aws",
  "/.gnupg",
  "/.kube",
  "/.docker",
  "/.config/gh",
  "/.aria",
];

export interface ContextReference {
  raw: string;
  kind: "diff" | "staged" | "file" | "folder" | "url";
  target: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface ContextReferenceResult {
  message: string;
  originalMessage: string;
  references: ContextReference[];
  warnings: string[];
  blocked: boolean;
}

export interface ContextReferenceOptions {
  cwd?: string;
  allowedRoot?: string;
  fetchUrl?: (url: string) => Promise<string>;
}

function estimateChars(text: string): number {
  return text.length;
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(TRAILING_PUNCTUATION, "");
}

function normalizePath(baseDir: string, rawPath: string): string {
  return rawPath.startsWith("/") ? resolve(rawPath) : resolve(baseDir, rawPath);
}

function ensurePathAllowed(path: string, allowedRoot: string): void {
  if (!isPathInside(allowedRoot, path)) {
    throw new Error("path escapes the active workspace");
  }
  for (const fragment of SECRET_PATH_FRAGMENTS) {
    if (path.includes(fragment)) {
      throw new Error("path is blocked by the reference policy");
    }
  }
}

function parseLineRange(target: string): { target: string; lineStart?: number; lineEnd?: number } {
  const match = target.match(/^(.*?):(\d+)(?:-(\d+))?$/);
  if (!match) {
    return { target };
  }
  return {
    target: match[1] ?? target,
    lineStart: Number(match[2]),
    lineEnd: Number(match[3] ?? match[2]),
  };
}

export function parseContextReferences(message: string): ContextReference[] {
  if (!message) {
    return [];
  }

  const refs: ContextReference[] = [];
  for (const match of message.matchAll(REFERENCE_PATTERN)) {
    const simple = match.groups?.simple;
    if (simple === "diff" || simple === "staged") {
      refs.push({ raw: match[0], kind: simple, target: "" });
      continue;
    }

    const kind = match.groups?.kind;
    const rawValue = stripTrailingPunctuation(match.groups?.value ?? "");
    if (!kind || !rawValue) {
      continue;
    }

    if (kind === "file") {
      const parsed = parseLineRange(rawValue);
      refs.push({
        raw: match[0],
        kind: "file",
        target: parsed.target,
        lineStart: parsed.lineStart,
        lineEnd: parsed.lineEnd,
      });
      continue;
    }

    refs.push({
      raw: match[0],
      kind: kind as "folder" | "url",
      target: rawValue,
    });
  }

  return refs;
}

function removeReferenceTokens(message: string, refs: ContextReference[]): string {
  let stripped = message;
  for (const ref of refs) {
    stripped = stripped.replace(ref.raw, "").replace(/\s{2,}/g, " ");
  }
  return stripped.trim();
}

async function expandFileReference(
  ref: ContextReference,
  cwd: string,
  allowedRoot: string,
): Promise<string> {
  const filePath = normalizePath(cwd, ref.target);
  ensurePathAllowed(filePath, allowedRoot);
  const raw = await readFile(filePath, "utf-8");
  let content = raw;

  if (ref.lineStart !== undefined) {
    const lines = raw.split("\n");
    const startIndex = Math.max(0, ref.lineStart - 1);
    const endIndex = Math.min(lines.length, ref.lineEnd ?? ref.lineStart);
    content = lines.slice(startIndex, endIndex).join("\n");
  }

  return `📄 ${ref.raw}\n\`\`\`\n${content}\n\`\`\``;
}

async function walkFolder(dirPath: string, root: string, depth = 0): Promise<string[]> {
  if (depth > 5) {
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const lines: string[] = [];
  for (const entry of entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_FOLDER_ENTRIES)) {
    const fullPath = resolve(dirPath, entry.name);
    const display = relativePath(root, fullPath);
    lines.push(`${"  ".repeat(depth)}- ${display}${entry.isDirectory() ? "/" : ""}`);
    if (entry.isDirectory()) {
      lines.push(...(await walkFolder(fullPath, root, depth + 1)));
    }
  }
  return lines;
}

function relativePath(root: string, target: string): string {
  return toRelativeIfInside(root, target) ?? target;
}

async function expandFolderReference(
  ref: ContextReference,
  cwd: string,
  allowedRoot: string,
): Promise<string> {
  const folderPath = normalizePath(cwd, ref.target);
  ensurePathAllowed(folderPath, allowedRoot);
  const listing = await walkFolder(folderPath, folderPath);
  return `📁 ${ref.raw}\n${listing.join("\n") || "(empty folder)"}`;
}

function expandGitReference(ref: ContextReference, cwd: string): string {
  const args = ref.kind === "staged" ? ["git", "diff", "--staged"] : ["git", "diff"];
  const proc = Bun.spawnSync(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = proc.success
    ? new TextDecoder().decode(proc.stdout).trim() || "(no diff)"
    : new TextDecoder().decode(proc.stderr).trim() || "git diff failed";
  return `🧾 ${ref.raw}\n\`\`\`diff\n${output}\n\`\`\``;
}

async function expandUrlReference(
  ref: ContextReference,
  fetchUrl?: (url: string) => Promise<string>,
): Promise<string> {
  if (!fetchUrl) {
    return `🌐 ${ref.raw}\n(no URL fetcher configured)`;
  }
  const content = await fetchUrl(ref.target);
  return `🌐 ${ref.raw}\n${content}`;
}

export async function preprocessContextReferences(
  message: string,
  options: ContextReferenceOptions = {},
): Promise<ContextReferenceResult> {
  const refs = parseContextReferences(message);
  if (refs.length === 0) {
    return {
      message,
      originalMessage: message,
      references: [],
      warnings: [],
      blocked: false,
    };
  }

  const cwd = resolve(options.cwd ?? process.env.TERMINAL_CWD ?? process.cwd());
  const allowedRoot = resolve(options.allowedRoot ?? cwd);
  const warnings: string[] = [];
  const blocks: string[] = [];
  let totalChars = 0;

  for (const ref of refs) {
    try {
      let block = "";
      switch (ref.kind) {
        case "file":
          block = await expandFileReference(ref, cwd, allowedRoot);
          break;
        case "folder":
          block = await expandFolderReference(ref, cwd, allowedRoot);
          break;
        case "diff":
        case "staged":
          block = expandGitReference(ref, cwd);
          break;
        case "url":
          block = await expandUrlReference(ref, options.fetchUrl);
          break;
      }
      blocks.push(block);
      totalChars += estimateChars(block);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${ref.raw}: ${message}`);
    }
  }

  if (totalChars > MAX_INJECTED_CHARS) {
    warnings.push(
      `@ references blocked: ${totalChars} chars exceeds the ${MAX_INJECTED_CHARS} char hard limit.`,
    );
    return {
      message,
      originalMessage: message,
      references: refs,
      warnings,
      blocked: true,
    };
  }

  if (totalChars > SOFT_WARNING_CHARS) {
    warnings.push(
      `@ references expanded to ${totalChars} chars, which exceeds the ${SOFT_WARNING_CHARS} char soft limit.`,
    );
  }

  const stripped = removeReferenceTokens(message, refs);
  const parts = [stripped];
  if (warnings.length > 0) {
    parts.push(`--- Context Warnings ---\n${warnings.map((warning) => `- ${warning}`).join("\n")}`);
  }
  if (blocks.length > 0) {
    parts.push(`--- Attached Context ---\n\n${blocks.join("\n\n")}`);
  }

  return {
    message: parts.filter(Boolean).join("\n\n").trim(),
    originalMessage: message,
    references: refs,
    warnings,
    blocked: false,
  };
}
