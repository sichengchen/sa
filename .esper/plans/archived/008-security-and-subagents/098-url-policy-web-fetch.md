---
id: 98
title: URL policy for web_fetch — SSRF protection
status: done
type: feature
priority: 1
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
pr: https://github.com/sichengchen/sa/pull/29
---
# URL policy for web_fetch — SSRF protection

## Context

`web_fetch` (`src/engine/tools/web-fetch.ts`) is classified as `dangerLevel: "safe"` — no approval needed. It validates URL syntax via `new URL()` but has zero URL filtering. It can hit:
- `http://127.0.0.1:7420` (SA's own engine API — full tRPC access)
- `http://169.254.169.254` (cloud metadata endpoints)
- Any private-range IP or localhost service
- SA engine WebSocket port 7421

The tool uses `redirect: "follow"` which means even if the initial URL looks safe, a redirect could point to a blocked target. This is the largest unmitigated security gap identified in exploration 011.

## Approach

### 1. Create URL policy module (`src/engine/tools/url-policy.ts`)

Define blocked hosts, schemes, and ports:

```typescript
const BLOCKED_HOST_PATTERNS = [
  /^127\.\d+\.\d+\.\d+$/,         // all loopback
  /^0\.0\.0\.0$/,
  /^::1$/,                          // IPv6 loopback
  /^localhost$/i,
  /^.*\.local$/i,                   // mDNS
  /^metadata\.google\.internal$/,   // GCP metadata
  /^169\.254\.169\.254$/,           // AWS/Azure/GCP metadata
  /^100\.100\.100\.200$/,           // Alibaba metadata
  /^10\.\d+\.\d+\.\d+$/,           // private class A
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // private class B
  /^192\.168\.\d+\.\d+$/,          // private class C
];

const BLOCKED_SCHEMES = new Set(["file", "ftp", "gopher", "ldap", "dict", "data"]);
const BLOCKED_PORTS = new Set([7420, 7421]);  // SA engine ports
const FORBIDDEN_HEADERS = new Set(["authorization", "cookie", "host", "x-forwarded-for"]);
const MAX_REDIRECTS = 5;
```

Export `validateUrl(url: string): { ok: true } | { ok: false; reason: string }` that checks scheme, host pattern, port, and resolves hostname to check resolved IP isn't in blocked ranges.

Export `validateHeaders(headers: Record<string, string>): Record<string, string>` that strips forbidden headers.

### 2. Integrate into web_fetch (`src/engine/tools/web-fetch.ts`)

- Call `validateUrl()` before `fetch()`. On failure, return `{ content: "Blocked by URL policy: <reason>", isError: true }`.
- Switch from `redirect: "follow"` to `redirect: "manual"`. Follow redirects manually up to `MAX_REDIRECTS`, re-validating each redirect URL with `validateUrl()`.
- Strip forbidden headers from any user-supplied headers parameter.
- Add `blocked_by: "url_policy"` metadata to error results (for future inline escalation integration in plan 102).

### 3. DNS rebinding protection

After the fetch resolves, validate the response URL (which may differ from the request URL due to redirects). This is defense-in-depth since we already follow redirects manually.

### 4. Config section

Add optional `runtime.security.urlPolicy` to config types:
```typescript
urlPolicy?: {
  additionalBlockedHosts?: string[];   // user can add more blocked patterns
  allowedExceptions?: string[];         // override blocks for specific URLs (e.g., "http://localhost:3000")
}
```

The `allowedExceptions` list is checked before the blocklist — this is the persistent equivalent of "add to fence" from the future inline escalation plan.

### 5. Tests

- Unit tests for `validateUrl()`: blocked schemes, loopback IPs, private ranges, cloud metadata, SA ports, clean URLs pass
- Unit tests for redirect following: redirect to blocked URL is caught
- Unit test for `allowedExceptions` override
- Integration test: web_fetch with blocked URL returns error

## Files to change

- `src/engine/tools/url-policy.ts` (create — URL validation module)
- `src/engine/tools/url-policy.test.ts` (create — unit tests)
- `src/engine/tools/web-fetch.ts` (modify — integrate URL policy, manual redirect following)
- `src/engine/config/types.ts` (modify — add `urlPolicy` to runtime config)
- `src/engine/config/defaults.ts` (modify — add urlPolicy defaults)

## Verification

- Run: `bun test src/engine/tools/url-policy.test.ts`
- Expected: All URL validation tests pass — blocked hosts, schemes, ports, private ranges, redirects
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Edge cases: IPv6-mapped IPv4 (`::ffff:127.0.0.1`), URL with port in host string, punycode domains, redirect chains > MAX_REDIRECTS

## Progress
- Created `url-policy.ts` with validateUrl(), validateHeaders(), blocked host/scheme/port patterns
- Added IPv6-mapped loopback detection (both dotted and hex forms)
- Converted webFetchTool to factory `createWebFetchTool(urlPolicy?)` with manual redirect following
- Added `urlPolicy` config section to RuntimeConfig and defaults
- Created 29 unit tests covering all blocked patterns, config overrides, header stripping
- Updated runtime.ts, index.ts, and 3 test files for factory pattern
- Modified: url-policy.ts, url-policy.test.ts, web-fetch.ts, index.ts, runtime.ts, types.ts, defaults.ts, tools.test.ts, agent-flow.test.ts, smoke.test.ts
- Verification: typecheck, lint, all 594 tests pass
