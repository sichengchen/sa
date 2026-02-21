---
id: 049
title: Reaction tool for IM emoji tap-backs
status: pending
type: feature
priority: 3
phase: phase-3
branch: feature/phase-3
created: 2026-02-21
---

# Reaction tool for IM emoji tap-backs

## Context
Telegram and Discord both support emoji reactions on messages. Adding a `reaction` tool lets the agent react to user messages with emoji — useful for quick acknowledgments ("thumbs up"), sentiment expression, or interactive feedback without a full text response. The TUI could display reactions as inline text.

## Approach

1. **Create `src/engine/tools/reaction.ts`** — new tool:
   - Parameters: `emoji` (required, string — emoji character or shortcode), `messageRef` (optional — reference to which message to react to; defaults to the last user message)
   - The tool emits a new engine event that connectors handle

2. **Add new EngineEvent type** — in `src/shared/types.ts`, add:
   - `{ type: "reaction", emoji: string, messageRef?: string }`

3. **Handle in Telegram connector** — use Grammy's `ctx.api.setMessageReaction()` to set an emoji reaction on the referenced message. Telegram supports a limited set of reaction emoji — map common emoji to Telegram's supported set.

4. **Handle in Discord connector** — use `message.react(emoji)` to add a reaction to the referenced Discord message.

5. **Handle in TUI** — display as `[emoji reaction]` inline in the chat view.

6. **Track message references** — connectors need to maintain a mapping of internal message IDs to platform-specific message IDs so the agent can reference "the last user message" or a specific message.

## Files to change
- `src/engine/tools/reaction.ts` (create — reaction tool implementation)
- `src/engine/tools/index.ts` (modify — add reactionTool to getBuiltinTools)
- `src/shared/types.ts` (modify — add reaction EngineEvent)
- `src/engine/procedures.ts` (modify — forward reaction events)
- `src/connectors/telegram/transport.ts` (modify — handle reaction events)
- `src/connectors/discord/transport.ts` (modify — handle reaction events)
- `src/connectors/tui/App.tsx` (modify — display reactions)

## Verification
- Run: `bun test && bun run typecheck`
- Expected: Agent can call reaction tool; emoji appears as reaction in Telegram/Discord
- Edge cases: Unsupported emoji on Telegram (limited set); Discord permissions for reactions; multiple reactions on same message; reaction on old messages
