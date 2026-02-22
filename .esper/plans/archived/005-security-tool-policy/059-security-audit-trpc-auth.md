---
id: 59
title: Security audit: tRPC auth and network
status: done
type: feature
priority: 2
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# Security audit: tRPC auth and network

## Context
The SA Engine exposes tRPC endpoints on `127.0.0.1:7420` (HTTP) and `127.0.0.1:7421` (WebSocket). Authentication works via:
- Master token written to `~/.sa/engine.token` (chmod 600) — read by local connectors
- Device-flow pairing codes for remote connectors
- `AuthManager` in `src/engine/auth.ts` generates tokens, validates them, and supports revocation

However, the tRPC router in `src/engine/procedures.ts` uses `publicProcedure` for ALL endpoints — **no auth middleware is applied**. The `auth.pair` and `auth.code` endpoints exist, but tokens are never checked on other routes. Any process on localhost can call any tRPC method without authentication.

The webhook endpoint in `src/engine/server.ts` has its own shared secret check, but this is separate from the tRPC auth system.

## Approach

### Step 1: Audit current auth enforcement
Read `src/engine/context.ts` to understand the tRPC context. Check if there's any middleware that validates tokens. Currently expected: none.

### Step 2: Add auth middleware to tRPC
Create a `protectedProcedure` that:
1. Reads `Authorization: Bearer <token>` from the request headers
2. Calls `runtime.auth.validate(token)` to verify
3. Attaches connector info to the tRPC context
4. Rejects with 401 if invalid

Apply `protectedProcedure` to all routes except:
- `health.ping` (monitoring, no auth needed)
- `auth.pair` (unauthenticated by design — it's the pairing flow)
- `auth.code` (generates pairing codes — could arguably require auth, but needed for bootstrap)

### Step 3: Update connectors to send auth tokens
Connectors currently don't send the master token with tRPC requests. Update `src/shared/client.ts` (the tRPC client factory) to accept a token and include it as a Bearer header.

Update each connector:
- TUI: reads `engine.token` from disk, passes to client factory
- Telegram: already pairs via device-flow, should use its session token
- Discord: same as Telegram

### Step 4: Audit WebSocket auth
The WebSocket server on port 7421 (used for tRPC subscriptions) may not propagate auth headers. Check if `applyWSSHandler` supports auth, and if not, add connection-level token validation.

### Step 5: Audit localhost binding
Verify that `127.0.0.1` binding is enforced (not `0.0.0.0`). Check that the hostname is not overridable to a public interface via config or env var without explicit user intent.

### Step 6: Audit webhook endpoint
The webhook at `/webhook` uses a shared secret from config. Audit:
- Is the secret comparison timing-safe? (currently uses `!==` — vulnerable to timing attacks)
- Is there rate limiting?
- Can the webhook be enabled accidentally?

## Files to change
- `src/engine/context.ts` (modify — add auth info to context type)
- `src/engine/procedures.ts` (modify — add protectedProcedure middleware, apply to routes)
- `src/engine/trpc.ts` (modify — add middleware if this is where tRPC is initialized)
- `src/shared/client.ts` (modify — accept token in client factory, send as Bearer header)
- `src/connectors/tui/client.ts` (modify — read and pass master token)
- `src/connectors/telegram/transport.ts` (modify — pass session token)
- `src/connectors/discord/transport.ts` (modify — pass session token)
- `src/engine/server.ts` (modify — timing-safe secret comparison for webhook, audit binding)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass
- Test: unauthenticated tRPC call to `chat.stream` should return 401
- Test: authenticated call with valid token should succeed
- Test: TUI connector can still connect (reads token from disk)
- Test: webhook with correct secret succeeds, wrong secret returns 401
- Edge cases: expired/revoked tokens, WebSocket reconnection with stale token
- Manual: start engine, try `curl http://127.0.0.1:7420/trpc/health.ping` — should work (public)
- Manual: try `curl http://127.0.0.1:7420/trpc/session.list` — should return 401

## Progress
- Updated context.ts to extract Bearer token from HTTP request headers and support rawToken override for WS
- Added authMiddleware + protectedProcedure in procedures.ts — validates token via runtime.auth.validate()
- Applied protectedProcedure to all routes except health.ping, auth.pair, auth.code (3 public, rest protected)
- Updated server.ts: pass request to tRPC createContext for token extraction
- Added WS connection-level auth: token extracted from URL query param (?token=xxx) on WS upgrade
- Replaced webhook secret comparison with timingSafeEqual (prevents timing attacks)
- Updated webhook internal callers to use master token for protected routes
- Updated shared/client.ts to append token to WS URL query string
- Verified localhost binding (127.0.0.1 is hardcoded default, only overridable via explicit hostname option)
- Connectors already read master token from engine.token — no changes needed
- Modified: context.ts, procedures.ts, server.ts, shared/client.ts
- Verification: typecheck passed, lint passed, 297 tests passed
