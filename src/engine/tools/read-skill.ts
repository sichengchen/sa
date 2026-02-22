import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import type { SkillRegistry } from "../skills/index.js";

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
    }),
    async execute(args) {
      const name = args.name as string;
      const content = await registry.getContent(name);
      if (!content) {
        return {
          content: `Skill "${name}" not found. Check <available_skills> for available skill names.`,
          isError: true,
        };
      }
      await registry.activate(name);
      return { content };
    },
  };
}
