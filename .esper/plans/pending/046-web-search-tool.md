---
id: 046
title: web_search built-in tool
status: pending
type: feature
priority: 2
phase: phase-3
branch: feature/phase-3
created: 2026-02-21
---

# web_search built-in tool

## Context
SA lacks web search capability. Adding a `web_search` tool backed by Brave Search API and/or Perplexity API gives the agent access to current information. Both APIs require API keys; the tool should support multiple backends configured via environment variables.

## Approach

1. **Create `src/engine/tools/web-search.ts`** — new tool:
   - Parameters: `query` (required), `count` (optional, default 5), `backend` (optional: "brave" | "perplexity" | "auto")
   - `"auto"` (default): use whichever backend has a configured API key; prefer Brave if both are set
   - **Brave Search**: `GET https://api.search.brave.com/res/v1/web/search?q=<query>&count=<count>` with `X-Subscription-Token` header
   - **Perplexity**: `POST https://api.perplexity.ai/chat/completions` with a search-optimized prompt (Perplexity returns synthesized answers, not raw results)
   - Return structured results: `{ results: [{ title, url, snippet }] }` for Brave; `{ answer, citations }` for Perplexity
   - Unified output format: list of results with title, URL, snippet/summary

2. **Config integration** — API keys via env vars:
   - `BRAVE_API_KEY` for Brave Search
   - `PERPLEXITY_API_KEY` for Perplexity
   - Tool should indicate which backend(s) are available and error clearly if none configured

3. **Add to built-in tools** — register in `getBuiltinTools()`.

4. **Update tool summary** — add web_search to prompt.ts.

## Files to change
- `src/engine/tools/web-search.ts` (create — web search tool with Brave + Perplexity backends)
- `src/engine/tools/index.ts` (modify — add webSearchTool to getBuiltinTools)
- `src/engine/agent/prompt.ts` (modify — add tool summary)

## Verification
- Run: `bun test`
- Expected: Tool searches with available backend and returns structured results
- Edge cases: No API key configured (clear error message), rate limiting, empty results, Perplexity response format differences
