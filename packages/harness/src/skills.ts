import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AriaSessionEnv } from "./session-env.js";

export interface HarnessSkill {
  name: string;
  path: string;
  instructions: string;
  description?: string;
}

export interface SkillResolutionOptions {
  projectRoot?: string;
  ariaHome?: string;
  bundledRoot?: string;
}

export async function resolveSkill(
  nameOrPath: string,
  options: SkillResolutionOptions = {},
): Promise<HarnessSkill | null> {
  const candidates = skillCandidates(nameOrPath, options);
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const instructions = await readFile(candidate, "utf8");
    const name =
      parseFrontmatterField(instructions, "name") ?? nameOrPath.replace(/\/SKILL\.md$/, "");
    const description = parseFrontmatterField(instructions, "description") ?? undefined;
    return { name, path: candidate, instructions, description };
  }
  return null;
}

export async function resolveSkillFromEnv(
  env: AriaSessionEnv,
  nameOrPath: string,
  options: Pick<SkillResolutionOptions, "ariaHome" | "bundledRoot"> = {},
): Promise<HarnessSkill | null> {
  const candidates = envSkillCandidates(nameOrPath);
  for (const candidate of candidates) {
    if (!(await env.exists(candidate))) continue;
    const instructions = await env.readFile(candidate);
    const name =
      parseFrontmatterField(instructions, "name") ?? nameOrPath.replace(/\/SKILL\.md$/, "");
    const description = parseFrontmatterField(instructions, "description") ?? undefined;
    return { name, path: candidate, instructions, description };
  }

  if (options.ariaHome || options.bundledRoot) {
    return resolveSkill(nameOrPath, {
      ariaHome: options.ariaHome,
      bundledRoot: options.bundledRoot,
    });
  }
  return null;
}

export function skillCandidates(nameOrPath: string, options: SkillResolutionOptions): string[] {
  if (nameOrPath.startsWith(".") || nameOrPath.startsWith("/")) {
    return [resolve(options.projectRoot ?? process.cwd(), nameOrPath)];
  }
  const file = nameOrPath.endsWith(".md") ? nameOrPath : join(nameOrPath, "SKILL.md");
  return [
    options.projectRoot ? join(options.projectRoot, ".aria", "skills", file) : "",
    options.projectRoot ? join(options.projectRoot, ".agents", "skills", file) : "",
    options.ariaHome ? join(options.ariaHome, "skills", file) : "",
    options.bundledRoot ? join(options.bundledRoot, file) : "",
  ].filter(Boolean);
}

function envSkillCandidates(nameOrPath: string): string[] {
  if (nameOrPath.startsWith("/") || nameOrPath.startsWith(".") || nameOrPath.includes("/")) {
    return [nameOrPath];
  }
  const file = nameOrPath.endsWith(".md") ? nameOrPath : join(nameOrPath, "SKILL.md");
  return [join(".aria", "skills", file), join(".agents", "skills", file)];
}

function parseFrontmatterField(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^---[\\s\\S]*?^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim().replace(/^["']|["']$/g, "") ?? null;
}
