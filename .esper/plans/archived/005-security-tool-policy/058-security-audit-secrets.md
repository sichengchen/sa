---
id: 58
title: Security audit: secrets and encryption
status: done
type: feature
priority: 2
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-21
shipped_at: 2026-02-22
pr: https://github.com/sichengchen/sa/pull/10
---
# Security audit: secrets and encryption

## Context
SA stores API keys and tokens in `~/.sa/secrets.enc`, encrypted with AES-256-GCM. The key derivation uses `scryptSync(hostname(), salt, 32)` where the salt is a random 32-byte value stored in `~/.sa/.salt`. This means the encryption key is derived from the machine's hostname — a low-entropy, publicly known value.

Files involved:
- `src/engine/config/secrets.ts` — encrypt/decrypt logic
- `src/engine/config/secrets.test.ts` — existing tests
- `~/.sa/.salt` — random 32-byte salt (chmod 600)
- `~/.sa/secrets.enc` — encrypted secrets (chmod 600)

## Approach

### Step 1: Audit key derivation
The current `deriveKey(salt)` uses `scryptSync(hostname(), salt, 32)`. The hostname is the "password" input to scrypt. This is problematic:
- Hostname is often short and predictable (e.g., "MacBook-Pro", "localhost")
- It's discoverable via network or system info
- The security relies entirely on the salt being secret — but `.salt` is on the same filesystem

**Fix**: Replace hostname with a proper machine-derived secret. Options:
1. Use a randomly generated passphrase stored securely (similar to `.salt` but separate)
2. Use a hardware-derived key if available (macOS Keychain via `security` CLI)
3. At minimum, use a longer machine fingerprint (hostname + username + machine-id)

Recommended: Option 3 as a pragmatic fix — `hostname() + os.userInfo().username + machineId()` provides more entropy while staying local-first.

### Step 2: Audit scrypt parameters
Check that scrypt cost parameters are appropriate. The current call uses defaults. Should use explicit `N=2^14, r=8, p=1` for reasonable security without slow startup.

### Step 3: Audit file permissions
Verify that `.salt` and `secrets.enc` are created with `0o600` and that the code doesn't accidentally expose them. Check that the config directory itself has appropriate permissions.

### Step 4: Audit error handling
The current `loadSecrets()` catches all errors and returns `null` — silently falling back to env vars. This could mask tampering or corruption. Should log a more specific warning.

### Step 5: Add migration path
If key derivation changes, existing users' `secrets.enc` becomes undecryptable. Need a migration: try old derivation first, re-encrypt with new derivation if successful.

### Step 6: Document findings
Write findings to the plan's verification section so they're tracked.

## Files to change
- `src/engine/config/secrets.ts` (modify — improve key derivation, add scrypt params, improve error handling)
- `src/engine/config/secrets.test.ts` (modify — add tests for new derivation, migration path)
- `src/engine/config/manager.ts` (modify — if migration logic is needed during load)

## Verification
- Run: `bun run typecheck && bun run lint && bun test`
- Expected: all pass, secrets tests cover new derivation and migration
- Test: encrypt with old derivation, decrypt with new code (migration works)
- Test: encrypt with new derivation, decrypt succeeds
- Test: tampered `.salt` or `secrets.enc` produces clear error, not silent null
- Edge cases: hostname change after encryption (machine renamed) — should be handled by migration or documented

## Progress
- Replaced hostname-only key derivation with `hostname:username:homedir` machine fingerprint
- Added explicit scrypt parameters (N=16384, r=8, p=1, maxmem=32MB)
- Verified .salt and secrets.enc are created with chmod 0600 (added tests)
- Improved error handling: specific message for corruption vs different machine
- Added transparent migration: tries new derivation first, falls back to legacy hostname-only, re-encrypts on success
- Exported `_internal` for test access to derivation functions
- Added 7 new tests: file permissions (2), key derivation (3), legacy migration (2)
- Modified: config/secrets.ts, config/secrets.test.ts
- Verification: typecheck passed, lint passed, 297 tests passed
