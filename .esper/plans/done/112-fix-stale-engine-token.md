---
id: 112
title: fix: stale engine.token after restart causes auth failure
status: done
type: fix
priority: 1
phase: 008-security-and-subagents
branch: fix/stale-engine-token
created: 2026-02-25
shipped_at: 2026-02-26
pr: https://github.com/sichengchen/sa/pull/30
---
# fix: stale engine.token after restart causes auth failure

## Context

After `sa engine restart`, all connectors (TUI, Telegram, Discord) fail with "Invalid auth token". The token file at `~/.sa/engine.token` doesn't match the running engine's in-memory master token.

**Root cause:** The engine shutdown handler in `src/engine/index.ts` does not await `server.stop()`:

```typescript
function shutdown() {
  try { unlinkSync(PID_FILE); } catch {}
  try { unlinkSync(URL_FILE); } catch {}
  server.stop().then(() => process.exit(0)); // fire-and-forget!
}
```

`server.stop()` is async and calls `auth.cleanup()` (which deletes the token file). But because it's not awaited, the process exits before `auth.cleanup()` runs. The stale token file persists, and when the new engine starts and writes a fresh token, there's a window where the old engine's cleanup could race with the new engine's init — or the cleanup never runs at all, leaving a token that doesn't match any engine.

**The chain:**
1. SIGTERM received → `shutdown()` called
2. `server.stop().then(exit)` — promise is abandoned as process dies
3. `auth.cleanup()` inside `server.stop()` never executes
4. Stale `engine.token` file remains on disk
5. New engine calls `auth.init()` → generates new in-memory token, writes to file
6. But if there's any timing overlap, the file can end up with the wrong token
7. Connectors read the file → "Invalid auth token"

## Approach

1. **Make `shutdown()` async and await `server.stop()`** — ensures `auth.cleanup()` completes before `process.exit(0)`.
2. **Add a timeout guard** — if `server.stop()` hangs, force-exit after 5 seconds to prevent zombie processes.
3. **Add defensive token validation in `auth.init()`** — after writing the token file, read it back and verify it matches the in-memory token. If not, retry the write.

## Files to change

- `src/engine/index.ts` (modify — fix shutdown handler to await server.stop() with timeout)
- `src/engine/auth.ts` (modify — add write-back verification in init())

## Progress

- [x] Fix shutdown handler in `src/engine/index.ts` — added 5s timeout guard, proper error/rejection handling
- [x] Add write-back verification in `src/engine/auth.ts:init()` — reads token back after write, retries if mismatched
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun test src/engine/auth.test.ts` — 24/24 pass

## Verification

- Run: `sa engine restart && sleep 2 && curl -s -X POST http://127.0.0.1:7420/trpc/session.create -H "Content-Type: application/json" -H "Authorization: Bearer $(cat ~/.sa/engine.token)" -d '{"json":{"connectorType":"tui","prefix":"test"}}'`
- Expected: `200 OK` with session object (not 401 Unauthorized)
- Run: `bun run dev` after restart — TUI should connect without "Invalid auth token"
- Regression check: `sa engine stop` should still clean up all runtime files; connectors should still authenticate normally on fresh start
