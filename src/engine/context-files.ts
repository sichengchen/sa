import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const CONTEXT_THREAT_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(previous|all|above|prior)\s+instructions/i, "prompt_injection"],
  [/do\s+not\s+tell\s+the\s+user/i, "deception_hide"],
  [/system\s+prompt\s+override/i, "system_override"],
  [/disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, "disregard_rules"],
  [/curl\s+[^\n]*(KEY|TOKEN|SECRET|PASSWORD)/i, "credential_exfiltration"],
  [/cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass)/i, "secret_file_access"],
];

const CONTEXT_INVISIBLE_CHARS = [
  "\u200b", "\u200c", "\u200d", "\u2060", "\ufeff",
  "\u202a", "\u202b", "\u202c", "\u202d", "\u202e",
];

const CONTEXT_PRIORITY = [
  ".sa.md",
  "SA.md",
  "AGENTS.md",
  "agents.md",
  "CLAUDE.md",
  "claude.md",
  ".cursorrules",
] as const;

const MAX_CONTEXT_FILE_CHARS = 20_000;
const MAX_HINT_FILE_CHARS = 8_000;
const MAX_ANCESTOR_WALK = 5;
const PATH_ARG_KEYS = ["file_path", "path", "workdir"] as const;

export interface ContextFileLoadOptions {
  maxFileChars?: number;
}

export interface ContextFileReference {
  path: string;
  filename: string;
  content: string;
}

function findGitRoot(startDir: string): string | null {
  let current = resolve(startDir);
  while (true) {
    if (existsSync(resolve(current, ".git"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function findPreferredContextFile(cwd: string): string | null {
  const gitRoot = findGitRoot(cwd);
  let current = resolve(cwd);

  while (true) {
    for (const filename of CONTEXT_PRIORITY) {
      const candidate = resolve(current, filename);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    if ((gitRoot && current === gitRoot) || dirname(current) === current) {
      return null;
    }
    current = dirname(current);
  }
}

function truncateContextContent(content: string, filename: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }

  const head = Math.floor(maxChars * 0.7);
  const tail = Math.floor(maxChars * 0.2);
  const omitted = content.length - head - tail;

  return [
    content.slice(0, head),
    "",
    `[...truncated ${filename}: kept ${head}+${tail} of ${content.length} chars; ${omitted} chars omitted. Use file tools to inspect the full file.]`,
    "",
    content.slice(-tail),
  ].join("\n");
}

export function scanContextContent(content: string, filename: string): string {
  const findings: string[] = [];

  for (const char of CONTEXT_INVISIBLE_CHARS) {
    if (content.includes(char)) {
      findings.push(`invisible_unicode_U+${char.charCodeAt(0).toString(16).toUpperCase()}`);
    }
  }

  for (const [pattern, label] of CONTEXT_THREAT_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(label);
    }
  }

  if (findings.length === 0) {
    return content;
  }

  return `[BLOCKED: ${filename} contained potential prompt injection (${findings.join(", ")}). Content not loaded.]`;
}

async function loadContextFile(filePath: string, maxChars: number): Promise<ContextFileReference | null> {
  try {
    const raw = (await readFile(filePath, "utf-8")).trim();
    if (!raw) {
      return null;
    }
    const filename = filePath.split("/").at(-1) ?? filePath;
    const scanned = scanContextContent(raw, filename);
    return {
      path: filePath,
      filename,
      content: truncateContextContent(scanned, filename, maxChars),
    };
  } catch {
    return null;
  }
}

function formatContextSection(reference: ContextFileReference, cwd: string): string {
  const relPath = relative(cwd, reference.path) || reference.filename;
  return `## ${relPath}\n${reference.content}`;
}

export async function buildContextFilesPrompt(
  cwd = process.env.TERMINAL_CWD ?? process.cwd(),
  options: ContextFileLoadOptions = {},
): Promise<string> {
  const contextFile = findPreferredContextFile(cwd);
  if (!contextFile) {
    return "";
  }

  const reference = await loadContextFile(contextFile, options.maxFileChars ?? MAX_CONTEXT_FILE_CHARS);
  if (!reference) {
    return "";
  }

  return [
    "## Project Context",
    "The following project context file was discovered automatically and should be followed:",
    "",
    formatContextSection(reference, cwd),
  ].join("\n");
}

function shouldInspectToolArgs(toolName: string): boolean {
  return toolName === "read" || toolName === "write" || toolName === "edit" || toolName === "exec";
}

function addCandidateDirectories(
  rawPath: string,
  workingDir: string,
  loaded: Set<string>,
  candidates: Set<string>,
): void {
  if (!rawPath.trim()) return;

  try {
    let resolvedPath = rawPath.startsWith("/") ? resolve(rawPath) : resolve(workingDir, rawPath);
    if (rawPath.includes("://")) {
      return;
    }
    if (/\.[a-z0-9]+$/i.test(resolvedPath)) {
      resolvedPath = dirname(resolvedPath);
    }

    let current = resolvedPath;
    for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
      if (loaded.has(current)) break;
      candidates.add(current);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // Ignore invalid paths.
  }
}

function extractDirectoriesFromExec(command: string, workingDir: string, loaded: Set<string>, candidates: Set<string>): void {
  const tokens = command.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.startsWith("-")) continue;
    if (!token.includes("/") && !token.includes(".")) continue;
    addCandidateDirectories(token.replace(/^["']|["']$/g, ""), workingDir, loaded, candidates);
  }
}

export class SubdirectoryContextTracker {
  private readonly workingDir: string;
  private readonly maxHintChars: number;
  private readonly loadedDirectories = new Set<string>();

  constructor(
    workingDir = process.env.TERMINAL_CWD ?? process.cwd(),
    maxHintChars = MAX_HINT_FILE_CHARS,
  ) {
    this.workingDir = resolve(workingDir);
    this.maxHintChars = maxHintChars;
    this.loadedDirectories.add(this.workingDir);
  }

  async inspectToolCall(toolName: string, args: Record<string, unknown>): Promise<string | null> {
    if (!shouldInspectToolArgs(toolName)) {
      return null;
    }

    const candidates = new Set<string>();
    for (const key of PATH_ARG_KEYS) {
      const value = args[key];
      if (typeof value === "string") {
        addCandidateDirectories(value, this.workingDir, this.loadedDirectories, candidates);
      }
    }

    if (toolName === "exec" && typeof args.command === "string") {
      extractDirectoriesFromExec(args.command, this.workingDir, this.loadedDirectories, candidates);
    }

    const sections: string[] = [];
    for (const directory of candidates) {
      if (this.loadedDirectories.has(directory)) continue;
      this.loadedDirectories.add(directory);

      for (const filename of CONTEXT_PRIORITY) {
        const candidate = resolve(directory, filename);
        if (!existsSync(candidate)) continue;

        const reference = await loadContextFile(candidate, this.maxHintChars);
        if (!reference) break;

        sections.push(
          `[Subdirectory context discovered: ${relative(this.workingDir, candidate) || reference.filename}]\n${reference.content}`,
        );
        break;
      }
    }

    return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : null;
  }
}
