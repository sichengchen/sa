# ask_user Tool

The `ask_user` tool allows the agent to pause mid-execution and ask the user
a clarifying question. The agent blocks until the user responds, then
continues with the answer as the tool result.

## Parameters

| Parameter | Type     | Required | Description                                    |
| --------- | -------- | -------- | ---------------------------------------------- |
| question  | string   | yes      | The question to ask the user                   |
| options   | string[] | no       | Optional choices for multiple-choice questions |

When `options` is provided and non-empty, connectors render a multiple-choice
picker. When omitted or empty, connectors render a free-text input.

## Danger Level

**safe** — asking a question has no side effects.

## Event Flow

```
Agent calls ask_user(question, options?)
  → Agent yields { type: "user_question", id, question, options }
  → Engine stores a Promise resolver in pendingQuestions Map
  → Connector renders the question UI
  → User responds
  → Connector calls question.answer tRPC mutation
  → Promise resolves with the user's answer
  → Agent receives the answer as tool result content
  → Agent continues execution
```

## tRPC API

### `question.answer` mutation

```
input:  { id: string, answer: string }
output: { acknowledged: boolean }
```

Resolves the pending question identified by `id`. Returns `acknowledged: false`
if the question has already been answered or timed out.

## Timeout

Unanswered questions time out after **10 minutes** (600 seconds). On timeout,
the tool returns an error result:

```
"Question timed out after 10 minutes"
```

The agent receives this as an error tool result and can choose to retry,
proceed without the answer, or inform the user.

## Connector Rendering

### TUI

- **Multiple-choice**: Numbered list with arrow-key navigation and number-key
  selection. Rendered in a bordered cyan box.
- **Free-text**: Standard text input with cursor. Enter to submit.

### Telegram

- **Multiple-choice**: Inline keyboard buttons, one per option. Callback data
  format: `answer:<questionId>:<optionText>`.
- **Free-text**: Plain text message with "(Reply with your answer)". The next
  incoming message from that chat is captured as the answer.

### Chat SDK (Slack, Teams, Google Chat, Discord, GitHub, Linear)

- **Multiple-choice**: Posted as numbered list with instruction to reply
  `answer <number>` or `answer <text>`.
- **Free-text**: Posted with instruction to reply. The next message in the
  thread is captured as the answer.

## Cleanup

Pending questions are automatically rejected when:

- The agent is stopped (`/stop`, `chat.stop`, `chat.stopAll`)
- The session is destroyed
- The engine shuts down or restarts

## Notes

- The `ask_user` tool's `execute()` function is a no-op placeholder. The
  actual blocking flow is handled by the agent's `onAskUser` callback, which
  is wired through the engine's `pendingQuestions` broker.
- If `onAskUser` is not configured (e.g., cron or headless contexts), the
  tool returns an error: "ask_user is not available in this context".
- Empty `options` arrays are treated as free-text (same as omitting `options`).
