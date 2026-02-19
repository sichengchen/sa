---
id: 003
title: Core agent runtime
status: pending
type: feature
priority: 3
phase: phase-1
branch: feature/phase-1
created: 2026-02-19
---

# Core agent runtime

## Context
The agent runtime is the central loop: it receives user messages, sends them to the LLM via the model router, handles tool-call responses, executes tools, and returns results. This is the backbone that TUI and Telegram transports will plug into.

## Approach
1. Define core types:
   - `Message` — role (user/assistant/system/tool), content, tool calls, tool results
   - `Conversation` — ordered list of messages with metadata
   - `AgentOptions` — model router, tools registry, memory, system prompt
2. Implement `Agent` class:
   - `constructor(options)` — initializes with router, tools, memory, identity
   - `chat(userMessage): AsyncGenerator<Message>` — streaming conversation loop
   - Handles tool-call responses: parse tool calls → execute → append results → re-send
   - Loads system prompt from identity Markdown file
   - Injects memory context into system prompt
3. Implement a `ToolRegistry` that maps tool names to implementations
4. Conversation history management — append, truncate for context window
5. Write unit tests with a mock LLM provider

## Files to change
- `src/agent/types.ts` (create — Message, Conversation, AgentOptions types)
- `src/agent/agent.ts` (create — Agent class)
- `src/agent/registry.ts` (create — ToolRegistry)
- `src/agent/index.ts` (create — barrel export)
- `tests/agent.test.ts` (create — unit tests with mock provider)

## Verification
- Run: `bun test tests/agent.test.ts`
- Expected: agent sends message, receives response, handles tool calls in loop, respects max iterations
- Edge cases: tool execution failure, empty response, max tool-call depth
