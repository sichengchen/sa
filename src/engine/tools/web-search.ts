import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";

type SearchBackend = "brave" | "perplexity" | "auto";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function getAvailableBackend(): "brave" | "perplexity" | null {
  if (process.env.BRAVE_API_KEY) return "brave";
  if (process.env.PERPLEXITY_API_KEY) return "perplexity";
  return null;
}

async function searchBrave(query: string, count: number): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) throw new Error("BRAVE_API_KEY not set");

  const params = new URLSearchParams({ q: query, count: String(count) });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`Brave API: HTTP ${res.status}`);

  const json = (await res.json()) as {
    web?: { results?: { title: string; url: string; description: string }[] };
  };

  return (json.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }));
}

async function searchPerplexity(query: string, count: number): Promise<SearchResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "user",
          content: `Search the web for: ${query}\n\nReturn the top ${count} results with title, URL, and a brief snippet for each.`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Perplexity API: HTTP ${res.status}`);

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    citations?: string[];
  };

  const answer = json.choices?.[0]?.message?.content ?? "";
  const citations = json.citations ?? [];

  // Return as a single synthesized result with citations
  const results: SearchResult[] = [{
    title: "Perplexity Search Results",
    url: citations[0] ?? "https://perplexity.ai",
    snippet: answer.slice(0, 2000),
  }];

  // Add citation URLs as additional results
  for (const cite of citations.slice(0, count - 1)) {
    results.push({ title: cite, url: cite, snippet: "" });
  }

  return results;
}

export const webSearchTool: ToolImpl = {
  name: "web_search",
  description:
    "Search the web using Brave Search or Perplexity API and return structured results.",
  summary:
    "Search the web and return results (title, URL, snippet). Backends: Brave (BRAVE_API_KEY) or Perplexity (PERPLEXITY_API_KEY). Auto-selects available backend.",
  parameters: Type.Object({
    query: Type.String({ description: "The search query" }),
    count: Type.Optional(Type.Number({ description: "Number of results (default 5)" })),
    backend: Type.Optional(
      Type.Union([Type.Literal("brave"), Type.Literal("perplexity"), Type.Literal("auto")], {
        description: 'Search backend: "brave", "perplexity", or "auto" (default)',
      }),
    ),
  }),
  async execute(args) {
    const query = args.query as string;
    const count = (args.count as number | undefined) ?? 5;
    const backend = (args.backend as SearchBackend | undefined) ?? "auto";

    try {
      let resolvedBackend: "brave" | "perplexity";

      if (backend === "auto") {
        const available = getAvailableBackend();
        if (!available) {
          return {
            content:
              "Error: No search backend configured. Set BRAVE_API_KEY or PERPLEXITY_API_KEY environment variable.",
            isError: true,
          };
        }
        resolvedBackend = available;
      } else {
        resolvedBackend = backend;
      }

      const results =
        resolvedBackend === "brave"
          ? await searchBrave(query, count)
          : await searchPerplexity(query, count);

      if (results.length === 0) {
        return { content: "No results found.", isError: false };
      }

      const output = results
        .map((r, i) => {
          const parts = [`${i + 1}. ${r.title}`, `   ${r.url}`];
          if (r.snippet) parts.push(`   ${r.snippet}`);
          return parts.join("\n");
        })
        .join("\n\n");

      return { content: `Search results (${resolvedBackend}):\n\n${output}`, isError: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error: ${msg}`, isError: true };
    }
  },
};
