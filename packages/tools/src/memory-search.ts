import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";
import type { MemoryManager } from "@aria/memory";

export function createMemorySearchTool(memory: MemoryManager): ToolImpl {
  return {
    name: "memory_search",
    description:
      "Search persistent memory using hybrid BM25 + semantic search. Returns ranked snippets with source attribution.",
    summary:
      "Search memory for relevant context — returns ranked snippets with sources.",
    dangerLevel: "safe",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query",
      }),
      source: Type.Optional(
        Type.Union(
          [
            Type.Literal("all"),
            Type.Literal("project"),
            Type.Literal("profile"),
            Type.Literal("operational"),
            Type.Literal("journal"),
            Type.Literal("memory"),
          ],
          {
            description: 'Filter by source type (default: "all")',
          },
        ),
      ),
      limit: Type.Optional(
        Type.Number({
          description: "Maximum number of results (default: 5)",
        }),
      ),
    }),
    async execute(args) {
      const query = args.query as string;
      const sourceType = ((args.source as string | undefined) ?? "all");
      const limit = (args.limit as number | undefined) ?? 5;

      try {
        const results = await memory.searchIndex(query, {
          maxResults: limit,
          sourceType: sourceType as "all" | "memory" | "profile" | "project" | "operational" | "journal",
        });

        if (results.length === 0) {
          return { content: "No relevant memories found." };
        }

        const formatted = results.map((r) => {
          const snippet = r.content.length > 500
            ? r.content.slice(0, 500) + "..."
            : r.content;
          const score = r.score.toFixed(2);
          return `[${r.source}:${r.lineStart}-${r.lineEnd}] (score: ${score})\n${snippet}`;
        });

        return { content: formatted.join("\n\n") };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: `Error searching memory: ${msg}`, isError: true };
      }
    },
  };
}
