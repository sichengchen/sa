---
id: 119
title: GitHub connector via Chat SDK
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-25
shipped_at: 2026-02-26
---
# GitHub connector via Chat SDK

## Context

GitHub is a limited Chat SDK platform — supports mentions and reactions only (no modals, no streaming edits). SA's GitHub connector would let users @mention SA in issues, PRs, and discussions to get AI assistance directly in GitHub threads.

This is ideal for code review, issue triage, and PR feedback — the agent can use its tools (read, web_search, memory) to provide contextual responses.

## Approach

1. Install `@chat-adapter/github`: `bun add @chat-adapter/github`
2. Create `src/connectors/github/index.ts`:
   - Use ChatSDKAdapter with GitHub adapter
   - `onNewMention` → create session, generate full response (no streaming edits on GitHub), post as comment
   - `onReaction` → forward to engine (limited utility but supported)
   - Session management: per-issue/PR sessions (`github:{owner}/{repo}#{number}`)
   - Tool approval: GitHub has no buttons — use reaction-based approval (thumbs up/down) or auto-approve
3. Create `src/connectors/github/config.ts`:
   - Required: `GITHUB_TOKEN` (bot or personal access token)
   - Optional: `GITHUB_WEBHOOK_SECRET` for webhook validation
4. Wire into `src/cli/index.ts` — add `sa github` subcommand
5. Update `specs/connectors.md` with GitHub setup instructions

## Files to change

- `package.json` (modify — add `@chat-adapter/github`)
- `src/connectors/github/index.ts` (create — GitHub connector entry)
- `src/connectors/github/config.ts` (create — credential config)
- `src/cli/index.ts` (modify — add `sa github` command)
- `specs/connectors.md` (modify — GitHub setup docs)

## Verification

- Run: `bun run typecheck`
- Expected: GitHub connector compiles correctly
- Manual: Configure webhook, @mention bot in issue, verify comment response
- Edge cases: GitHub comment size limits (65536 chars), rate limiting, webhook vs polling
