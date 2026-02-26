---
id: 120
title: Linear connector via Chat SDK
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# Linear connector via Chat SDK

## Context

Linear is a limited Chat SDK platform — mentions and reactions only (similar to GitHub). SA's Linear connector would let users @mention SA in issue comments for task analysis, prioritization help, and context lookup.

## Approach

1. Install `@chat-adapter/linear`: `bun add @chat-adapter/linear`
2. Create `src/connectors/linear/index.ts`:
   - Use ChatSDKAdapter with Linear adapter
   - `onNewMention` → create session, generate full response, post as comment
   - `onReaction` → forward to engine
   - Session management: per-issue sessions (`linear:{issueId}`)
   - Tool approval: auto-approve or reaction-based (Linear has no buttons)
3. Create `src/connectors/linear/config.ts`:
   - Required: `LINEAR_API_KEY`
   - Optional: `LINEAR_WEBHOOK_SECRET`
4. Wire into `src/cli/index.ts` — add `sa linear` subcommand
5. Update `specs/connectors.md` with Linear setup instructions

## Files to change

- `package.json` (modify — add `@chat-adapter/linear`)
- `src/connectors/linear/index.ts` (create — Linear connector entry)
- `src/connectors/linear/config.ts` (create — credential config)
- `src/cli/index.ts` (modify — add `sa linear` command)
- `specs/connectors.md` (modify — Linear setup docs)

## Verification

- Run: `bun run typecheck`
- Expected: Linear connector compiles correctly
- Manual: Configure webhook, @mention bot in issue comment, verify response
- Edge cases: Linear API rate limits, comment formatting
