# Approval Flow

3-tier approval matrix combining tool danger levels with connector approval
modes to decide whether a tool call requires user confirmation.

---

## Danger Levels

Every tool declares a `dangerLevel` property that drives the approval flow.

| Level       | Meaning                                          | Approval behavior                                         |
| ----------- | ------------------------------------------------ | --------------------------------------------------------- |
| `safe`      | Read-only or side-effect-free                    | Always auto-approved, no user interaction                 |
| `moderate`  | Writes state but generally reversible            | Auto-approved by default; prompts only in `"always"` mode |
| `dangerous` | Destructive, irreversible, or security-sensitive | Always requires explicit user approval                    |

---

## Built-in Tool Classification

| Tool               | Danger level | Rationale                         |
| ------------------ | ------------ | --------------------------------- |
| `read`             | safe         | Read-only file access             |
| `web_search`       | safe         | Read-only web search              |
| `web_fetch`        | safe         | Read-only URL fetch               |
| `read_skill`       | safe         | Read-only skill loading           |
| `exec_status`      | safe         | Read-only process status check    |
| `remember`         | safe         | Appends to memory files           |
| `reaction`         | safe         | Sends emoji reactions             |
| `set_env_secret`   | safe         | Stores secrets (encrypted)        |
| `set_env_variable` | safe         | Stores plain config vars          |
| `notify`           | safe         | Sends notifications to connectors |
| `ask_user`         | safe         | Asks user a clarifying question   |
| `write`            | moderate     | Creates or overwrites files       |
| `edit`             | moderate     | Edits files in place              |
| `delegate`         | moderate     | Delegates work to a sub-agent     |
| `claude_code`      | moderate     | Delegates task to Claude Code CLI |
| `codex`            | moderate     | Delegates task to Codex CLI       |
| `exec`             | dangerous    | Arbitrary shell command execution |
| `exec_kill`        | dangerous    | Kills background processes        |

Danger levels can be overridden per-tool in `config.json` under
`runtime.toolPolicy.overrides`.

---

## Connector Approval Modes

Each connector type has an approval mode configured in
`runtime.toolApproval`:

| Mode       | Default for                                                    | Behavior                                                                 |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `"never"`  | TUI, Webhook                                                   | Safe and moderate auto-approve. Dangerous still prompts.                 |
| `"ask"`    | Telegram, Slack, Teams, GChat, Discord, GitHub, Linear, WeChat | Same as `"never"` in practice -- moderate auto-approves, dangerous asks. |
| `"always"` | —                                                              | Both moderate and dangerous prompt. Only safe auto-approves.             |

---

## Decision Matrix

| Danger level | `"never"` / `"ask"` | `"always"`      |
| ------------ | ------------------- | --------------- |
| safe         | Auto-approve        | Auto-approve    |
| moderate     | Auto-approve        | **Prompt user** |
| dangerous    | **Prompt user**     | **Prompt user** |

Key design points:

- **Safe tools never prompt** -- even under `"always"` mode.
- **Dangerous tools always prompt** -- even under `"never"` mode.
- **Moderate tools are the swing tier** -- only prompted in `"always"` mode.

---

## Approval Timeout

If the user does not respond within **5 minutes**, the approval request
auto-rejects and the tool call is denied.

---

## Session-Level Overrides

When a user approves a dangerous tool call, they can choose "accept for session"
via the `tool.acceptForSession` tRPC procedure. This adds the tool name to a
per-session override set (`sessionToolOverrides`), so subsequent calls to the
same tool in that session auto-approve without prompting.

---

## Default Config Example

```json
{
  "runtime": {
    "toolApproval": {
      "tui": "never",
      "telegram": "ask",
      "slack": "ask",
      "teams": "ask",
      "gchat": "ask",
      "discord": "ask",
      "github": "ask",
      "linear": "ask",
      "wechat": "ask",
      "webhook": "never"
    }
  }
}
```

---

## System Prompt Integration

The system prompt includes two security-relevant sections:

**Safety Advisory** -- directs the agent to prioritize safety and human
oversight over task completion, never bypass safeguards or manipulate the user.

**Tool Call Style Guide**:

- **Safe tools** -- call silently, no narration needed
- **Moderate tools** -- brief narration only for multi-step work
- **Dangerous tools** -- always state what you are about to do and why before calling
- The agent must always set the `danger` parameter on `exec` calls
