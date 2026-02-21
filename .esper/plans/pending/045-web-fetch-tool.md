---
id: 045
title: web_fetch built-in tool
status: pending
type: feature
priority: 2
phase: phase-3
branch: feature/phase-3
created: 2026-02-21
---

# web_fetch built-in tool

## Context
SA has no built-in way for the agent to fetch web content. The bash tool could run `curl`, but that returns raw HTML. A dedicated `web_fetch` tool that converts HTML to readable markdown is significantly more useful for the agent.

## Approach

1. **Create `src/engine/tools/web-fetch.ts`** — new tool:
   - Parameters: `url` (required), `maxLength` (optional, default 50000 chars), `headers` (optional key/value)
   - Fetch the URL with a reasonable User-Agent header
   - Convert HTML response to markdown using a library like `turndown` or `node-html-markdown`
   - Truncate output to maxLength to avoid overwhelming context
   - Return plain text for non-HTML content types (JSON, plain text, XML)
   - Handle errors gracefully (HTTP errors, timeouts, invalid URLs)

2. **Add to built-in tools** — register in `src/engine/tools/index.ts` `getBuiltinTools()`.

3. **Add dependency** — install `node-html-markdown` (lightweight, no DOM dependency, works with Bun).

4. **Update tool summary** — add web_fetch description to prompt.ts.

## Files to change
- `src/engine/tools/web-fetch.ts` (create — web fetch + HTML-to-markdown tool)
- `src/engine/tools/index.ts` (modify — add webFetchTool to getBuiltinTools)
- `src/engine/agent/prompt.ts` (modify — add tool summary)
- `package.json` (modify — add node-html-markdown dependency)

## Verification
- Run: `bun test`
- Expected: Tool fetches a URL and returns markdown content; handles errors gracefully
- Edge cases: Very large pages (truncation), non-HTML content types, redirect handling, HTTPS-only URLs, timeout on slow servers
