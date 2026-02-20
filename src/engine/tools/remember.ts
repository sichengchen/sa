import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import type { MemoryManager } from "../memory/index.js";

export function createRememberTool(memory: MemoryManager): ToolImpl {
  return {
    name: "remember",
    description:
      "Save a piece of information to long-term memory. Use a short descriptive key and the content to remember.",
    parameters: Type.Object({
      key: Type.String({
        description: "Short descriptive key for this memory (e.g. 'user-preferences', 'project-context')",
      }),
      content: Type.String({
        description: "The content to remember",
      }),
    }),
    async execute(args) {
      const key = args.key as string;
      const content = args.content as string;
      try {
        await memory.save(key, content);
        return { content: `Saved memory: ${key}` };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error saving memory: ${msg}`, isError: true };
      }
    },
  };
}
