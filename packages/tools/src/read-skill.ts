import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";
import type { SkillRegistry } from "@aria/runtime/skills";

/** Create a tool that lets the Agent read and activate a skill's full instructions */
export function createReadSkillTool(registry: SkillRegistry): ToolImpl {
  return {
    name: "read_skill",
    description:
      "Read and activate a skill's full instructions. Use this when a task matches an available skill's description.",
    summary:
      "Read and activate a skill's full instructions. Call this when a task matches an available skill's description in the <available_skills> block.",
    dangerLevel: "safe",
    parameters: Type.Object({
      name: Type.String({
        description: "The name of the skill to read (from <available_skills>)",
      }),
      path: Type.Optional(
        Type.String({
          description:
            'Optional sub-file path within the skill directory. Use "__index__" to list all files, or a relative path like "docs/overview.md" to read a specific file. Omit to read the main SKILL.md.',
        }),
      ),
    }),
    async execute(args) {
      const name = args.name as string;
      const path = args.path as string | undefined;

      // No path — existing behavior: load SKILL.md and activate
      if (!path) {
        const content = await registry.getContent(name);
        if (!content) {
          return {
            content: `Skill "${name}" not found. Check <available_skills> for available skill names.`,
            isError: true,
          };
        }
        await registry.activate(name);
        return { content };
      }

      // Traversal guard
      if (path.includes("..")) {
        return {
          content: "Path traversal is not allowed.",
          isError: true,
        };
      }

      // __index__ — list all files
      if (path === "__index__") {
        const files = await registry.listFiles(name);
        if (files.length === 0) {
          return {
            content: `Skill "${name}" not found or has no files.`,
            isError: true,
          };
        }
        return { content: files.join("\n") };
      }

      // Load a specific sub-file
      const content = await registry.getSubFile(name, path);
      if (content === null) {
        return {
          content: `File "${path}" not found in skill "${name}". Use path "__index__" to list available files.`,
          isError: true,
        };
      }
      return { content };
    },
  };
}
