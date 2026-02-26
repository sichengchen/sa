---
id: 96
title: Ask User Question tool
status: done
type: feature
priority: 2
phase: 009-chat-sdk-and-agent-tools
branch: feature/009-chat-sdk-and-agent-tools
created: 2026-02-23
shipped_at: 2026-02-26
---
# Ask User Question tool

## Context

SA's agent can currently only interact with the user through chat messages and tool approval requests. There's no way for the agent to pause mid-execution and ask a clarifying question — it either guesses or proceeds without clarification.

The tool approval system already implements the exact blocking pattern needed:
- Agent yields an event → connector renders UI → user responds → tRPC mutation resolves a pending Promise → agent resumes.

Key files in the existing approval flow:
- `src/engine/agent/agent.ts` (lines 102-131) — `onToolApproval` callback, `await` blocks the generator
- `src/engine/procedures.ts` (lines 42-49) — `pendingApprovals` Map stores Promise resolvers
- `src/engine/procedures.ts` (lines 482-527) — `tool.approve` / `tool.acceptForSession` mutations
- `src/connectors/tui/ToolApproval.tsx` — Ink component with `useInput` for y/n/a
- `src/connectors/telegram/transport.ts` (lines 256-266) — inline keyboard buttons for approve/reject

Tool definition pattern (`src/engine/agent/types.ts`):
```ts
export interface ToolImpl<TParams extends TSchema = TSchema> {
  name: string;
  description: string;
  dangerLevel: DangerLevel;
  parameters: TParams;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}
```

## Approach

### 1. Add new EngineEvent type

In `src/shared/types.ts`, add:
```ts
| { type: "user_question"; id: string; question: string; options?: string[] }
```
- `id` matches the tool call ID so connectors can route the answer back.
- `question` is the agent's question text.
- `options` (optional) — if provided, render as multiple-choice; otherwise, free-text input.

### 2. Add pending questions broker in procedures.ts

Mirror the `pendingApprovals` pattern:
```ts
const pendingQuestions = new Map<string, (answer: string) => void>();
```
- When `ask_user` is called, store a Promise resolver keyed by tool call ID.
- Add a 10-minute timeout (longer than approval's 5 minutes — questions may need thought).

### 3. Add `question.answer` tRPC mutation

```ts
question: {
  answer: t.procedure
    .input(z.object({ id: z.string(), answer: z.string() }))
    .mutation(({ input }) => {
      const resolver = pendingQuestions.get(input.id);
      if (!resolver) throw new TRPCError({ code: "NOT_FOUND" });
      pendingQuestions.delete(input.id);
      resolver(input.answer);
      return { acknowledged: true };
    })
}
```

### 4. Create `ask_user` tool

New file `src/engine/tools/ask-user.ts`:
- `name: "ask_user"`
- `dangerLevel: "safe"` — asking a question is never dangerous.
- Parameters: `question: string`, `options?: string[]` (array of choices).
- `execute()` does NOT run the question itself — it returns a placeholder. The actual blocking happens via a new `onAskUser` callback in `AgentOptions`, similar to `onToolApproval`.

### 5. Add `onAskUser` callback to agent

In `src/engine/agent/agent.ts`:
- Add `onAskUser?: (id: string, question: string, options?: string[]) => Promise<string>` to `AgentOptions`.
- In the tool dispatch loop, when tool name is `ask_user`:
  1. Yield `{ type: "user_question", id, question, options }` event.
  2. `await this.options.onAskUser(id, question, options)` — blocks the generator.
  3. Return the answer as the tool result content.

### 6. Wire up in `getSessionAgent()` (procedures.ts)

Provide the `onAskUser` callback that creates a Promise, stores its resolver in `pendingQuestions`, and returns the Promise. Same pattern as `onToolApproval`.

### 7. Emit through `filterAgentEvents`

Pass `user_question` events through to connectors (no policy filtering needed — always emit).

### 8. TUI connector — `UserQuestion.tsx`

New Ink component in `src/connectors/tui/`:
- Renders the question text in a bordered box (like `ToolApproval.tsx`).
- **Multiple-choice mode** (when `options` present): numbered list, arrow-key navigation or number-key selection, Enter to confirm.
- **Free-text mode**: render the standard `TextInput` component, Enter to submit.
- On submit: call `client.question.answer.mutate({ id, answer })`, clear pending state.
- In `App.tsx`: add `pendingQuestion` state, handle `user_question` event, swap input area for `UserQuestion` component when active.

### 9. Telegram connector — question handling

In `src/connectors/telegram/transport.ts`:
- **Multiple-choice**: send message with inline keyboard buttons (one per option). Callback query handler calls `client.question.answer.mutate()`.
- **Free-text**: send the question as a plain message. Set conversation state to "awaiting answer for question ID X". Next incoming message from that chat resolves it via the mutation.

### 10. Chat SDK connector (covers Discord, Slack, Teams, GChat, GitHub, Linear)

In `src/connectors/chat-sdk/adapter.ts`, handle `user_question` events:
- **Multiple-choice**: send message with platform buttons/actions (one per option). Button callback calls `client.question.answer.mutate()`.
- **Free-text**: send the question as a plain message. Track pending question ID in adapter state. Next incoming message from that user resolves it via the mutation.

### 11. Update bundled skill docs

Update `src/engine/skills/bundled/sa/docs/tools.md` to document the new `ask_user` tool.

### 12. Update specs docs

- Update `specs/tools/README.md` — add `ask_user` to tool inventory table (tool #20, safe).
- Create `specs/tools/ask-user.md` — full spec for the tool (parameters, event flow, timeout, connector rendering).
- Update `specs/security/approval-flow.md` if needed to reference the new question flow.

## Files to change

- `src/shared/types.ts` (modify — add `user_question` event type)
- `src/engine/agent/types.ts` (modify — add `onAskUser` to `AgentOptions`)
- `src/engine/agent/agent.ts` (modify — handle `ask_user` tool call with blocking callback)
- `src/engine/tools/ask-user.ts` (create — tool definition)
- `src/engine/tools/index.ts` (modify — register `askUserTool`)
- `src/engine/procedures.ts` (modify — `pendingQuestions` map, `question.answer` mutation, wire `onAskUser`)
- `src/connectors/tui/UserQuestion.tsx` (create — Ink question component)
- `src/connectors/tui/App.tsx` (modify — handle `user_question` event, render `UserQuestion`)
- `src/connectors/telegram/transport.ts` (modify — question event handling + callback queries)
- `src/connectors/chat-sdk/adapter.ts` (modify — question event handling for all Chat SDK connectors)
- `src/engine/skills/bundled/sa/docs/tools.md` (modify — document `ask_user`)
- `specs/tools/README.md` (modify — add `ask_user` to tool inventory)
- `specs/tools/ask-user.md` (create — full tool spec)
- `src/engine/tools/ask-user.test.ts` (create — unit tests)

## Verification

- Run: `bun test`, `bun run typecheck`, `bun run lint`
- Expected: all pass
- Manual: Start engine + TUI, trigger agent to use `ask_user` — verify question renders, free-text and multiple-choice both work, answer returns to agent
- Manual: Telegram — verify inline keyboard for choices, next-message for free-text
- Edge cases:
  - Timeout: question unanswered for 10 minutes → agent receives timeout error, continues gracefully
  - Multiple questions in sequence (agent asks Q1, gets answer, asks Q2)
  - User disconnects mid-question → timeout handles it
  - Empty options array → treat as free-text
  - Very long question text → TUI wraps properly

## Progress
- Implemented ask_user tool with full connector support (TUI, Telegram, Chat SDK)
- Added user_question event to EngineEvent and AgentEvent types
- Added onAskUser callback with 10-minute timeout + pendingQuestions broker
- Created UserQuestion.tsx Ink component (multiple-choice + free-text modes)
- Added question handling to Telegram (inline keyboard + free-text capture)
- Added question handling to Chat SDK adapter (answer command + free-text capture)
- Updated ALL specs and docs for phase 9 (overview, README, CLAUDE.md, cli, configuration, sessions, approval-flow, subagents, tools inventory, coding-agents spec)
- Modified: src/shared/types.ts, src/engine/agent/types.ts, src/engine/agent/agent.ts, src/engine/agent/index.ts, src/engine/tools/ask-user.ts, src/engine/tools/index.ts, src/engine/runtime.ts, src/engine/procedures.ts, src/connectors/tui/UserQuestion.tsx, src/connectors/tui/App.tsx, src/connectors/telegram/transport.ts, src/connectors/chat-sdk/adapter.ts, specs/*, README.md, CLAUDE.md
- Verification: typecheck ✓, lint ✓, tests ✓ (740 pass, 9 skip, 0 fail)
