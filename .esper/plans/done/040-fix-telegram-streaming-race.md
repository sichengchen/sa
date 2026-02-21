---
id: 40
title: fix: Telegram streaming replies stack instead of editing in-place
status: done
type: fix
priority: 1
phase: phase-2
branch: fix/telegram-streaming-race
created: 2026-02-20
shipped_at: 2026-02-21
---
# fix: Telegram streaming replies stack instead of editing in-place

## Context

When SA streams a reply on Telegram, the user sees every intermediate chunk stacked as separate lines in the chat instead of a single message that updates in-place:

```
hi
Hi
Hi! How can I help
Hi! How can I
Hi!
Hi! How can I help you today
...
```

### Root cause

There is an **async race condition** in `src/connectors/telegram/transport.ts` lines 176–254. The `onData` callback is `async`, but the Observable subscription fires `text_delta` events synchronously without waiting for the previous callback to resolve.

On the very first `text_delta`:
1. `lastEditTime` is `0`, so the throttle check `Date.now() - 0 > 1000` passes immediately.
2. `sentMsg` is `null`, so `ctx.reply()` is called (an async operation).
3. Before `ctx.reply()` resolves and `sentMsg` is assigned, more `text_delta` events arrive.
4. Each one also sees `sentMsg === null` and `lastEditTime === 0`, so each calls `ctx.reply()` **again**.
5. This creates multiple separate messages instead of one message edited in-place.

Secondary issue: the `catch {}` on line 197 swallows errors without updating `lastEditTime`, which can cause additional rapid-fire edits on the next cycle.

## Approach

1. **Add a send-lock** to serialize the async edit operations. Use a simple promise-chain mutex so that each `text_delta` handler waits for the previous edit to complete before starting its own.

2. **Initialize `lastEditTime` to `Date.now()`** so the throttle properly gates the first edit instead of letting every initial event through.

3. **Move `lastEditTime = Date.now()` into a `finally` block** so it updates even on error, preventing retry storms.

4. The pattern:
   ```typescript
   let editLock = Promise.resolve();
   let lastEditTime = Date.now();

   case "text_delta":
     fullText += event.delta;
     if (Date.now() - lastEditTime > EDIT_THROTTLE_MS && fullText.length > 0) {
       editLock = editLock.then(async () => {
         const html = markdownToHtml(fullText.slice(0, 4096));
         try {
           if (!sentMsg) {
             sentMsg = await ctx.reply(html, { parse_mode: "HTML" });
           } else {
             await ctx.api.editMessageText(...);
           }
         } finally {
           lastEditTime = Date.now();
         }
       });
     }
     break;
   ```

5. Apply the same lock to the `done` handler's final edit to prevent racing with a pending throttled edit.

## Files to change

- `src/connectors/telegram/transport.ts` (modify — add edit lock, fix throttle initialization, fix error handling)
- `src/connectors/discord/transport.ts` (modify — same fix, identical race condition)

## Verification

- Run: `bun run typecheck && bun run lint`
- Manual test: send a message to SA via Telegram, confirm the reply streams as a single updating message
- Expected: one message appears and its content updates in-place until the final response is shown
- Regression check: tool_end messages, tool_approval_request, error messages, and long responses that split into multiple messages should still work correctly

## Progress
- Milestones: 5 commits
- Modified: src/connectors/telegram/transport.ts, src/connectors/discord/transport.ts, src/connectors/shared/stream-handler.ts (new)
- Added: promise-chain edit lock, synchronous lastEditTime gating, catch for "message not modified" error, setMyCommands registration, shared stream handler extraction
- Verification: bun run typecheck passes; bun run lint passes; 201 tests pass
