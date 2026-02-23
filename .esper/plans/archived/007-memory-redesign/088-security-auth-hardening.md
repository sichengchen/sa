---
id: 88
title: fix: timing-safe token comparison and session ID entropy
status: done
type: fix
priority: 1
phase: 007-memory-redesign
branch: fix/security-auth-hardening
created: 2026-02-23
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/22
---
# fix: timing-safe token comparison and session ID entropy

## Context

Two auth-related vulnerabilities identified in the security audit:

**1. Non-constant-time token comparison (`auth.ts:65,77`)**
`AuthManager.authenticate()` uses strict `===` string equality to compare the incoming credential against `this.masterToken` and `this.activePairingCode`. String comparison in JavaScript short-circuits on the first mismatched character, creating a timing side-channel. An attacker making many requests can statistically infer the correct token character by character. Notably, `server.ts:18` already imports and uses `timingSafeEqual` for HTTP bearer checks — `auth.ts` simply missed it.

**2. Weak session IDs (`sessions.ts:5`)**
`crypto.randomUUID().slice(0, 8)` produces only 8 hex characters = 32 bits of entropy. A full UUID (128 bits) is discarded. With 32 bits, birthday collision probability reaches 50% at ~65 k sessions, and brute-force enumeration across a LAN is feasible (~4 billion guesses). Since the engine listens on localhost-only, risk is moderate but non-zero (malicious local processes, SSRF pivots).

## Approach

1. In `src/engine/auth.ts`, replace `===` comparisons with `timingSafeEqual` from Node's `crypto` module (already available via Bun). Ensure both sides are converted to `Buffer` of equal byte length before comparison (unequal-length strings must still return false without revealing length via timing).
2. In `src/engine/sessions.ts`, replace `crypto.randomUUID().slice(0, 8)` with `crypto.randomUUID()` (full 128-bit UUID). Update any downstream code that assumes 8-char IDs.

## Files to change

- [src/engine/auth.ts](src/engine/auth.ts) (modify — replace `===` with `timingSafeEqual` at lines 65 and 77)
- [src/engine/sessions.ts](src/engine/sessions.ts) (modify — use full UUID instead of truncated 8-char slice)

## Verification

- Run: `bun test src/engine/auth` and `bun test src/engine/sessions` (add unit tests for both fixes)
- Expected: token comparison returns false for wrong credentials without short-circuit; session IDs are 36-char UUIDs
- Regression check: `bun test` — verify no test uses hardcoded 8-char session ID format; check TUI/Telegram client session handling still works

## Progress
- Implemented timing-safe `safeCompare()` in auth.ts using `timingSafeEqual`, replaced all 3 `===` comparisons (pair master token, pair pairing code, validate)
- Replaced `shortId()` with `randomSuffix()` using full `crypto.randomUUID()` in sessions.ts
- TUI display code already uses `.slice(0, 8)` for display only — no changes needed
- Added 12 auth unit tests (pair success/failure, validate, revoke) and 9 session unit tests (UUID format, uniqueness, prefix handling)
- Modified: src/engine/auth.ts, src/engine/sessions.ts
- Created: src/engine/auth.test.ts, src/engine/sessions.test.ts
- Verification: all 556 tests pass, lint clean, typecheck clean
