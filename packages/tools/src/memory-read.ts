import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";
import type { MemoryManager } from "@aria/memory";

export function createMemoryReadTool(memory: MemoryManager): ToolImpl {
  return {
    name: "memory_read",
    description:
      "Read the full content of a specific memory file by project memory key or journal date.",
    summary:
      "Read a memory entry by key or journal date. Use after memory_search to get full context.",
    dangerLevel: "safe",
    parameters: Type.Object({
      key: Type.String({
        description:
          'Project memory key (e.g. "user-preferences") or journal date (e.g. "2026-02-22")',
      }),
      layer: Type.Optional(
        Type.Union([
          Type.Literal("profile"),
          Type.Literal("project"),
          Type.Literal("operational"),
          Type.Literal("journal"),
        ], {
          description: 'Optional memory layer. Defaults to "project" unless key is a journal date.',
        }),
      ),
    }),
    async execute(args) {
      const key = args.key as string;
      const layer = args.layer as "profile" | "project" | "operational" | "journal" | undefined;

      try {
        // Check if it's a journal date (YYYY-MM-DD format)
        if (layer === "journal" || /^\d{4}-\d{2}-\d{2}$/.test(key)) {
          const content = await memory.getJournal(key);
          if (content === null) {
            return { content: `No journal entry for: ${key}` };
          }
          return { content };
        }

        const resolvedLayer = layer ?? "project";
        const content = await memory.getLayer(resolvedLayer, key);
        if (content === null) {
          return {
            content: resolvedLayer === "project"
              ? `No memory found for key: ${key}`
              : `No ${resolvedLayer} memory found for key: ${key}`,
          };
        }
        return { content };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error reading memory: ${msg}`, isError: true };
      }
    },
  };
}
