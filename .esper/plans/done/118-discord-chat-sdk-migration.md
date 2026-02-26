---
id: 118
title: Discord connector migration to Chat SDK
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# Discord connector migration to Chat SDK

## Context

SA currently has a Discord connector at `src/connectors/discord/` using Discord.js directly. This needs to be replaced with the Chat SDK version to unify the codebase. The existing connector handles: message events, @mention gating, per-channel sessions, slash commands (`/new`, `/status`, `/model`, `/provider`), tool approval via buttons, emoji reactions, audio transcription, and sender attribution in guilds.

All these features must be preserved in the Chat SDK version.

## Approach

1. Install `@chat-adapter/discord`: `bun add @chat-adapter/discord`
2. Create `src/connectors/discord-sdk/index.ts` (new directory to avoid conflicts during migration):
   - Use ChatSDKAdapter with Discord adapter
   - Map existing features:
     - @mention gating → Chat SDK `onNewMention` (natural fit)
     - Per-channel sessions → thread-based session prefixes
     - Slash commands → `onSlashCommand` handler
     - Tool approval buttons → `onButtonClick` handler
     - Emoji reactions → `onReaction` handler
     - Sender attribution → extract from Chat SDK message metadata
   - Audio transcription: check if Chat SDK supports audio attachments, fallback to direct Discord API if needed
3. Verify feature parity with existing `src/connectors/discord/`:
   - Compare all event handlers
   - Ensure formatter output matches (Discord markdown, 2000-char limit)
4. Remove old connector:
   - Delete `src/connectors/discord/` directory
   - Move `src/connectors/discord-sdk/` to `src/connectors/discord/`
   - Remove `discord.js` from `package.json` dependencies
5. Update `src/cli/index.ts` — point `sa discord` to new connector
6. Update `specs/connectors.md`

## Files to change

- `package.json` (modify — add `@chat-adapter/discord`, remove `discord.js`)
- `src/connectors/discord/` (delete — remove old Discord.js connector)
- `src/connectors/discord/index.ts` (create — new Chat SDK Discord connector)
- `src/connectors/discord/config.ts` (create — credential config)
- `src/cli/index.ts` (modify — update discord command)
- `specs/connectors.md` (modify — update Discord docs)

## Verification

- Run: `bun run typecheck && bun run lint`
- Expected: No references to old Discord.js types remain
- Manual: Start Discord connector, test @mention, slash commands, tool approval, reactions
- Edge cases: Discord 2000-char message limit, embed formatting, voice channel audio
