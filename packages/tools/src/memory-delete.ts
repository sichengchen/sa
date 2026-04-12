import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";
import type { MemoryManager } from "@aria/memory";

export function createMemoryDeleteTool(memory: MemoryManager): ToolImpl {
  return {
    name: "memory_delete",
    description:
      "Delete a project memory entry by key. Only works on layer files, not journal or MEMORY.md.",
    summary:
      "Delete project or layered memory by key. Cannot delete journal entries or MEMORY.md.",
    dangerLevel: "safe",
    parameters: Type.Object({
      key: Type.String({
        description: "The project memory key to delete (e.g. 'user-preferences')",
      }),
      layer: Type.Optional(
        Type.Union([
          Type.Literal("profile"),
          Type.Literal("project"),
          Type.Literal("operational"),
        ], {
          description: 'Optional memory layer. Defaults to "project".',
        }),
      ),
    }),
    async execute(args) {
      const key = args.key as string;
      const layer = (args.layer as "profile" | "project" | "operational" | undefined) ?? "project";
      try {
        const deleted = await memory.deleteLayer(layer, key);
        if (!deleted) {
          return {
            content: layer === "project"
              ? `No memory found for key: ${key}`
              : `No ${layer} memory found for key: ${key}`,
          };
        }
        return {
          content: layer === "project"
            ? `Deleted memory: ${key}`
            : `Deleted ${layer} memory: ${key}`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error deleting memory: ${msg}`, isError: true };
      }
    },
  };
}
