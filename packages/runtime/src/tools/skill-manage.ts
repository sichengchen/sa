import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ToolImpl } from "../agent/types.js";
import type { SkillRegistry } from "../skills/index.js";
import { isPathInside } from "../path-boundary.js";

const MAX_SKILL_CONTENT_CHARS = 100_000;
const ALLOWED_SUBDIRS = new Set(["references", "templates", "scripts", "assets"]);
const VALID_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

interface SkillManageDeps {
  homeDir: string;
  registry: SkillRegistry;
  onMutate?: () => Promise<void>;
}

function validateSkillName(name: string): string | null {
  if (!name.trim()) return "Skill name is required.";
  if (!VALID_NAME_RE.test(name)) {
    return "Skill names must use lowercase letters, numbers, dots, underscores, or hyphens.";
  }
  return null;
}

function skillsRoot(homeDir: string): string {
  return resolve(homeDir, "skills");
}

function ensureInsideSkillsRoot(rootDir: string, targetPath: string): string | null {
  const resolved = resolve(targetPath);
  return isPathInside(rootDir, resolved) ? resolved : null;
}

function buildSkillDir(homeDir: string, name: string, category?: string): string {
  return category ? join(skillsRoot(homeDir), category, name) : join(skillsRoot(homeDir), name);
}

function findWritableSkillPath(homeDir: string, registry: SkillRegistry, name: string): string | null {
  const meta = registry.get(name);
  if (!meta || meta.filePath.startsWith("embedded:")) {
    return null;
  }
  return ensureInsideSkillsRoot(skillsRoot(homeDir), meta.filePath);
}

function validateFrontmatter(content: string): string | null {
  if (!content.startsWith("---\n")) {
    return "SKILL.md must start with YAML frontmatter.";
  }
  if (!/\n---\n/.test(content)) {
    return "SKILL.md frontmatter must be closed with ---.";
  }
  if (!/name:\s*/.test(content) || !/description:\s*/.test(content)) {
    return "SKILL.md frontmatter must include name and description.";
  }
  if (content.length > MAX_SKILL_CONTENT_CHARS) {
    return `SKILL.md exceeds ${MAX_SKILL_CONTENT_CHARS.toLocaleString()} characters.`;
  }
  return null;
}

function validateSubFilePath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized || normalized.includes("..")) {
    return "file_path is invalid.";
  }
  const [topLevel] = normalized.split("/");
  if (!topLevel || !ALLOWED_SUBDIRS.has(topLevel)) {
    return `file_path must live under ${Array.from(ALLOWED_SUBDIRS).join(", ")}.`;
  }
  return null;
}

export function createSkillManageTool(deps: SkillManageDeps): ToolImpl {
  return {
    name: "skill_manage",
    description: "Create, update, patch, and delete reusable skills under ~/.aria/skills.",
    summary: "Manage reusable skills. Use this to save successful workflows as skills and patch outdated skills.",
    dangerLevel: "moderate",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create"),
        Type.Literal("edit"),
        Type.Literal("patch"),
        Type.Literal("delete"),
        Type.Literal("write_file"),
        Type.Literal("remove_file"),
      ]),
      name: Type.String({ description: "Skill name" }),
      category: Type.Optional(Type.String({ description: "Optional category directory for new skills" })),
      content: Type.Optional(Type.String({ description: "Full SKILL.md content for create/edit" })),
      old_string: Type.Optional(Type.String({ description: "Existing text to replace for patch" })),
      new_string: Type.Optional(Type.String({ description: "Replacement text for patch" })),
      file_path: Type.Optional(Type.String({ description: "Relative path under references/, templates/, scripts/, or assets/" })),
      file_content: Type.Optional(Type.String({ description: "Content for write_file" })),
    }),
    async execute(args) {
      const action = String(args.action ?? "");
      const name = String(args.name ?? "");
      const category = typeof args.category === "string" ? args.category.trim() : undefined;
      const rootDir = skillsRoot(deps.homeDir);

      const nameError = validateSkillName(name);
      if (nameError) {
        return { content: nameError, isError: true };
      }

      await mkdir(rootDir, { recursive: true });

      switch (action) {
        case "create": {
          const content = String(args.content ?? "");
          const validationError = validateFrontmatter(content);
          if (validationError) {
            return { content: validationError, isError: true };
          }
          const skillDir = buildSkillDir(deps.homeDir, name, category);
          const skillFile = join(skillDir, "SKILL.md");
          const existing = findWritableSkillPath(deps.homeDir, deps.registry, name);
          if (existing) {
            return { content: `Skill "${name}" already exists at ${existing}.`, isError: true };
          }
          await mkdir(skillDir, { recursive: true });
          await writeFile(skillFile, content);
          await deps.registry.loadAll(deps.homeDir);
          await deps.onMutate?.();
          return { content: `Created skill: ${name}` };
        }

        case "edit": {
          const content = String(args.content ?? "");
          const validationError = validateFrontmatter(content);
          if (validationError) {
            return { content: validationError, isError: true };
          }
          const skillPath = findWritableSkillPath(deps.homeDir, deps.registry, name);
          if (!skillPath) {
            return { content: `Skill "${name}" is not editable from ~/.aria/skills.`, isError: true };
          }
          await writeFile(skillPath, content);
          await deps.registry.loadAll(deps.homeDir);
          await deps.onMutate?.();
          return { content: `Updated skill: ${name}` };
        }

        case "patch": {
          const oldString = String(args.old_string ?? "");
          const newString = String(args.new_string ?? "");
          const skillPath = findWritableSkillPath(deps.homeDir, deps.registry, name);
          if (!skillPath) {
            return { content: `Skill "${name}" is not editable from ~/.aria/skills.`, isError: true };
          }
          const current = await readFile(skillPath, "utf-8");
          const occurrences = current.split(oldString).length - 1;
          if (occurrences !== 1) {
            return { content: `Patch target must appear exactly once; found ${occurrences}.`, isError: true };
          }
          const updated = current.replace(oldString, newString);
          if (updated.length > MAX_SKILL_CONTENT_CHARS) {
            return { content: `Patched skill would exceed ${MAX_SKILL_CONTENT_CHARS.toLocaleString()} characters.`, isError: true };
          }
          await writeFile(skillPath, updated);
          await deps.registry.loadAll(deps.homeDir);
          await deps.onMutate?.();
          return { content: `Patched skill: ${name}` };
        }

        case "delete": {
          const skillPath = findWritableSkillPath(deps.homeDir, deps.registry, name);
          if (!skillPath) {
            return { content: `Skill "${name}" is not removable from ~/.aria/skills.`, isError: true };
          }
          await rm(dirname(skillPath), { recursive: true, force: true });
          await deps.registry.loadAll(deps.homeDir);
          await deps.onMutate?.();
          return { content: `Deleted skill: ${name}` };
        }

        case "write_file": {
          const relativePath = String(args.file_path ?? "");
          const pathError = validateSubFilePath(relativePath);
          if (pathError) {
            return { content: pathError, isError: true };
          }
          const skillPath = findWritableSkillPath(deps.homeDir, deps.registry, name);
          if (!skillPath) {
            return { content: `Skill "${name}" is not editable from ~/.aria/skills.`, isError: true };
          }
          const skillDir = dirname(skillPath);
          const targetPath = ensureInsideSkillsRoot(rootDir, join(skillDir, relativePath));
          if (!targetPath) {
            return { content: "file_path escapes the skills directory.", isError: true };
          }
          const fileContent = String(args.file_content ?? "");
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, fileContent);
          await deps.registry.loadAll(deps.homeDir);
          await deps.onMutate?.();
          return { content: `Wrote skill file: ${name}/${relativePath}` };
        }

        case "remove_file": {
          const relativePath = String(args.file_path ?? "");
          const pathError = validateSubFilePath(relativePath);
          if (pathError) {
            return { content: pathError, isError: true };
          }
          const skillPath = findWritableSkillPath(deps.homeDir, deps.registry, name);
          if (!skillPath) {
            return { content: `Skill "${name}" is not editable from ~/.aria/skills.`, isError: true };
          }
          const skillDir = dirname(skillPath);
          const targetPath = ensureInsideSkillsRoot(rootDir, join(skillDir, relativePath));
          if (!targetPath) {
            return { content: "file_path escapes the skills directory.", isError: true };
          }
          await rm(targetPath, { force: true });
          await deps.registry.loadAll(deps.homeDir);
          await deps.onMutate?.();
          return { content: `Removed skill file: ${name}/${relativePath}` };
        }

        default:
          return { content: `Unknown action: ${action}`, isError: true };
      }
    },
  };
}
