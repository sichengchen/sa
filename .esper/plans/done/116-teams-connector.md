---
id: 116
title: Microsoft Teams connector via Chat SDK
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# Microsoft Teams connector via Chat SDK

## Context

Microsoft Teams is the second most feature-rich Chat SDK platform — supports Adaptive Cards for interactive buttons and streaming. SA needs a Teams connector using the shared ChatSDKAdapter.

Teams uses Azure Bot Framework credentials: `TEAMS_BOT_ID` and `TEAMS_BOT_PASSWORD`.

## Approach

1. Install `@chat-adapter/teams`: `bun add @chat-adapter/teams`
2. Create `src/connectors/teams/index.ts`:
   - Use ChatSDKAdapter with Teams adapter
   - Configure Teams-specific: Adaptive Card formatting for tool approval buttons, message size limits, conversation-based sessions
3. Create `src/connectors/teams/config.ts`:
   - Required env vars: `TEAMS_BOT_ID`, `TEAMS_BOT_PASSWORD`
   - Optional: `TEAMS_TENANT_ID` for single-tenant bots
4. Wire into `src/cli/index.ts` — add `sa teams` subcommand
5. Update `specs/connectors.md` with Teams setup instructions

## Files to change

- `package.json` (modify — add `@chat-adapter/teams`)
- `src/connectors/teams/index.ts` (create — Teams connector entry)
- `src/connectors/teams/config.ts` (create — credential config)
- `src/cli/index.ts` (modify — add `sa teams` command)
- `specs/connectors.md` (modify — Teams setup docs)

## Verification

- Run: `bun run typecheck`
- Expected: Teams connector compiles correctly
- Manual: Register Azure bot, start connector, mention in Teams channel, verify response
- Edge cases: Adaptive Card rendering, Teams conversation vs channel threads
