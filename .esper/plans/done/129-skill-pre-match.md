---
id: 129
title: fix: SA doesn't proactively read skills unless user explicitly asks
status: done
type: fix
priority: 1
phase: 009-chat-sdk-and-agent-tools
branch: fix/skill-pre-match
created: 2026-02-26
shipped_at: 2026-02-26
pr: https://github.com/sichengchen/sa/pull/32
---
# fix: SA doesn't proactively read skills unless user explicitly asks

## Context

The SKILLS_DIRECTIVE was too weak ("Before replying… scan the list") and buried at the very end of the system prompt. The agent frequently ignored it.

## Approach

Prompt-only fix — two changes:

1. **Rewrite SKILLS_DIRECTIVE** with stronger, unambiguous language: "CRITICAL", "MUST", "ALWAYS CHECK FIRST", numbered steps, explicit "NEVER skip" guardrails.
2. **Move skillsBlock earlier** in the system prompt assembly — right after tools section instead of dead last — so it's in high-attention position.

## Files changed

- `src/engine/runtime.ts` (modify — rewrite directive, reorder prompt assembly)

## Verification

- `bun run typecheck` — no type errors
- `bun run lint` — clean
- Manual: send "what's on my calendar" → agent reads apple-calendar skill before responding
- Manual: send "hello" → no skill read (general conversation)
