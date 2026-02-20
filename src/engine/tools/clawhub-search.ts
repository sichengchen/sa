import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import type { ClawHubClient } from "../clawhub/index.js";

/** Create a tool that lets the Agent search ClawHub for skills */
export function createClawHubSearchTool(client: ClawHubClient): ToolImpl {
  return {
    name: "clawhub_search",
    description:
      "Search the ClawHub skill registry (clawhub.ai) for agent skills. Use this when the user wants to find, browse, or install a skill from the registry.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query describing the kind of skill to find",
      }),
    }),
    async execute(args) {
      const query = args.query as string;
      try {
        const results = await client.search(query, { limit: 10 });
        if (results.items.length === 0) {
          return { content: `No skills found for "${query}" on ClawHub.` };
        }

        const lines = results.items.map(
          (s, i) =>
            `${i + 1}. **${s.name}** (${s.slug})\n   ${s.description}\n   v${s.version} · ${s.downloads} downloads · ${s.tags.join(", ")}`,
        );

        return {
          content: `Found ${results.items.length} skill(s) on ClawHub:\n\n${lines.join("\n\n")}${results.hasMore ? "\n\n(More results available)" : ""}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: `ClawHub search failed: ${message}`, isError: true };
      }
    },
  };
}
