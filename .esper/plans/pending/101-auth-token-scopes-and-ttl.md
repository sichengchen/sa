---
id: 101
title: "Auth overhaul — token scopes, webhook separation, session TTL"
status: pending
type: feature
priority: 1
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
---

# Auth overhaul — token scopes, webhook separation, session TTL

## Context

`AuthManager` (`src/engine/auth.ts`) currently has two token types: master token (engine lifetime, full access) and session tokens (per-paired connector). Webhooks reuse the config-level bearer token which, if leaked, gives access to all webhook endpoints. Session tokens never expire. Pairing codes are 6 characters with a flat 30s lockout window.

Exploration 011 recommends scoped tokens with TTL:

| Token type | Scope | TTL |
|-----------|-------|-----|
| Master | Full engine (local file read only) | Engine lifetime |
| Session | Connector + session only | 24h (configurable) |
| Webhook | `/webhook/*` endpoints only | Persistent |
| Pairing | One-time bootstrap | 10 minutes |

## Approach

### 1. Separate webhook token generation

- Generate a dedicated webhook token at engine startup (or on first webhook enable), separate from master token
- Store in `~/.sa/engine.webhook-token` with mode `0o600`
- Webhook auth in `server.ts` validates against this dedicated token, never the master token
- If webhook token leaks, attacker only gets webhook access (limited endpoints), not full tRPC

### 2. Session token TTL

- Add `ttl` field to `TokenEntry` in auth.ts
- Default TTL: 24 hours (configurable via `runtime.security.sessionTTL` in config)
- On `validate()`, check if `Date.now() - entry.createdAt > entry.ttl` — if expired, remove token and return null
- On reconnect after expiry, connector must re-pair

### 3. Pairing hardening

- Increase pairing code to 8 characters (from 6) — ~1 trillion combinations vs ~1 billion
- Add 10-minute expiry on pairing codes (current: no expiry)
- Replace flat 30s lockout with exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s cap
- Track consecutive failures per IP/connector (not globally)

### 4. Token type field

Add `type: "master" | "session" | "webhook" | "pairing"` to token entries for audit log integration (plan 104).

### 5. Config section

```typescript
// In runtime config types
security?: {
  sessionTTL?: number;      // seconds, default 86400 (24h)
  pairingTTL?: number;      // seconds, default 600 (10min)
  pairingCodeLength?: number; // default 8
}
```

### 6. Tests

- Unit test: webhook token is separate from master token
- Unit test: expired session token is rejected
- Unit test: pairing code expires after TTL
- Unit test: exponential backoff on failed pairing attempts
- Unit test: 8-character pairing codes generated correctly

## Files to change

- `src/engine/auth.ts` (modify — webhook token, session TTL, pairing hardening, token types)
- `src/engine/auth.test.ts` (modify — new test cases)
- `src/engine/server.ts` (modify — use dedicated webhook token for webhook auth)
- `src/engine/runtime.ts` (modify — generate webhook token at startup)
- `src/engine/config/types.ts` (modify — add security config section)
- `src/engine/config/defaults.ts` (modify — add security defaults)

## Verification

- Run: `bun test src/engine/auth.test.ts`
- Expected: All token lifecycle tests pass — generation, validation, expiry, backoff
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Edge cases: Clock skew (use monotonic time for TTL), race between token expiry check and concurrent requests, backward compatibility (existing paired connectors get migrated with default TTL)
