---
id: 117
title: Google Chat connector via Chat SDK
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# Google Chat connector via Chat SDK

## Context

Google Chat supports Chat SDK with card-based UI but no modals. SA needs a Google Chat connector using the shared ChatSDKAdapter.

Google Chat uses service account credentials for bot authentication.

## Approach

1. Install `@chat-adapter/gchat`: `bun add @chat-adapter/gchat`
2. Create `src/connectors/gchat/index.ts`:
   - Use ChatSDKAdapter with Google Chat adapter
   - Configure Google Chat cards for tool approval buttons
   - Space-based session management (per Google Chat space)
3. Create `src/connectors/gchat/config.ts`:
   - Required: Google Cloud service account credentials (JSON key file path or inline)
   - Store via `set_env_secret`
4. Wire into `src/cli/index.ts` — add `sa gchat` subcommand
5. Update `specs/connectors.md` with Google Chat setup instructions

## Files to change

- `package.json` (modify — add `@chat-adapter/gchat`)
- `src/connectors/gchat/index.ts` (create — Google Chat connector entry)
- `src/connectors/gchat/config.ts` (create — credential config)
- `src/cli/index.ts` (modify — add `sa gchat` command)
- `specs/connectors.md` (modify — Google Chat setup docs)

## Verification

- Run: `bun run typecheck`
- Expected: Google Chat connector compiles correctly
- Manual: Register Google Chat app, start connector, mention in space, verify response
- Edge cases: Google Chat card format limitations, space vs DM threading
