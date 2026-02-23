---
id: 91
title: fix: temp dir leak, clearTimeout gap, and silent stream-handler catches
status: done
type: fix
priority: 2
phase: 007-memory-redesign
branch: fix/error-handling-leaks
created: 2026-02-23
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/24
---
# fix: temp dir leak, clearTimeout gap, and silent stream-handler catches

## Context

Three error handling / resource management issues found in the audit:

**1. Temp directory leak in transcriber (`audio/transcriber.ts:40,84`)**
Both `whisper-cpp` and `whisper-python` paths create a temp directory with `mkdtemp(join(tmpdir(), "sa-audio-"))`. The cleanup logic unlinks individual audio files but never removes the directory itself. Over time (especially for voice-heavy usage), `sa-audio-*` directories accumulate in the OS temp folder and are never cleaned up. This is a slow disk space leak.

**2. Missing `clearTimeout` on error path in web-fetch (`web-fetch.ts:41-51`)**
`setTimeout` is set at line 41 to abort the fetch after a deadline. `clearTimeout(timer)` is only called in the success path (inside the `if (res.ok)` branch). If `fetch()` throws (network error) or `res.text()` throws, the timer is never cleared. Node/Bun garbage-collects the timer eventually, but the pattern is fragile and can delay process exit in tests.

**3. Silent `catch {}` blocks in stream-handler (`stream-handler.ts:61,79`)**
Two empty catch blocks swallow all errors from message edit operations on platform APIs (Telegram, Discord). When a platform API call fails (rate limit, deleted message, network drop), the failure is invisible — no log, no debug output, no metric. This makes debugging platform-specific issues extremely hard.

## Approach

1. **Transcriber:** After unlinking audio files in both `whisper-cpp` and `whisper-python` cleanup sections, add `await rm(dir, { recursive: true, force: true })` (or `rmdir(dir)`). Wrap in try/catch to not fail the overall transcription if cleanup fails. Use `fs/promises` which is already imported.

2. **web-fetch:** Move `clearTimeout(timer)` into a `finally` block so it runs regardless of whether `fetch()` or `res.text()` succeeds or throws.

3. **stream-handler:** Replace `catch {}` with `catch (err) { console.warn("[stream-handler] edit failed:", err instanceof Error ? err.message : err); }`. Preserves fail-silent behavior (not rethrowing) but surfaces failures in engine logs.

## Files to change

- [src/engine/audio/transcriber.ts](src/engine/audio/transcriber.ts) (modify — add `rmdir`/`rm` after file unlink in both whisper paths)
- [src/engine/tools/web-fetch.ts](src/engine/tools/web-fetch.ts) (modify — wrap `clearTimeout` in `finally` block)
- [src/connectors/shared/stream-handler.ts](src/connectors/shared/stream-handler.ts) (modify — replace `catch {}` with logged catch at lines 61 and 79)

## Verification

- Run: `bun test` — full suite must pass
- Manual test transcriber: run a voice transcription, confirm no `sa-audio-*` dir remains in `$TMPDIR` after completion
- Manual test web-fetch: simulate network error (bad URL) — confirm no stray timer warnings in test output
- Regression check: Telegram/Discord message editing should still silently skip on rate-limit errors (the behavior is preserved; only logging is added)

## Progress
- Transcriber: replaced individual file unlinks with `rm(dir, { recursive: true, force: true })` in both whisper-cpp and whisper-python finally blocks
- web-fetch: moved controller/timer declarations outside try block, added finally block for clearTimeout
- stream-handler: replaced both empty `catch {}` with `console.warn` logging (edit failed, final edit failed)
- Modified: src/engine/audio/transcriber.ts, src/engine/tools/web-fetch.ts, src/connectors/shared/stream-handler.ts
- Verification: 535 tests pass, lint clean, typecheck clean
