# Approval Flow

Dynamic approval flow combining tool intent, compatibility danger levels, and
connector approval modes to decide whether a tool call requires user
confirmation.

---

## Tool Intent

New harness-governed tools report a `ToolIntent`:

```ts
{
  toolName: "bash",
  environment: "default" | "host" | "external",
  filesystemEffect: "none" | "virtual" | "host_read" | "host_write",
  network: "none" | "allowlist" | "full",
  leases: string[],
  command?: string,
  cwd?: string
}
```

Approval is required for host execution, host writes, full network, secret
injection, applying virtual diffs to real files, deploy/publish/push/delete,
system/process operations, and gated external sandbox creation.

Usually no approval is required for just-bash in-memory commands, project
`OverlayFs` reads, virtual writes, safe allowlisted network, and non-secret
leases.

## Compatibility Danger Levels

Legacy and compatibility tools still declare a `dangerLevel` property. It is a
fallback compatibility signal, not the only approval input.

| Level       | Meaning                                          | Approval behavior                                         |
| ----------- | ------------------------------------------------ | --------------------------------------------------------- |
| `safe`      | Read-only or side-effect-free                    | Always auto-approved, no user interaction                 |
| `moderate`  | Writes state but generally reversible            | Auto-approved by default; prompts only in `"always"` mode |
| `dangerous` | Destructive, irreversible, or security-sensitive | Always requires explicit user approval                    |

---

## Built-in Tool Classification

| Tool               | Danger level | Rationale                                                       |
| ------------------ | ------------ | --------------------------------------------------------------- |
| `read`             | safe         | Read-only file access                                           |
| `web_search`       | safe         | Read-only web search                                            |
| `web_fetch`        | safe         | Read-only URL fetch                                             |
| `read_skill`       | safe         | Read-only skill loading                                         |
| `exec_status`      | safe         | Read-only process status check                                  |
| `remember`         | safe         | Appends to memory files                                         |
| `reaction`         | safe         | Sends emoji reactions                                           |
| `set_env_secret`   | safe         | Stores secrets (encrypted)                                      |
| `set_env_variable` | safe         | Stores plain config vars                                        |
| `notify`           | safe         | Sends notifications to connectors                               |
| `ask_user`         | safe         | Asks user a clarifying question                                 |
| `write`            | moderate     | Creates or overwrites files                                     |
| `edit`             | moderate     | Edits files in place                                            |
| `delegate`         | moderate     | Delegates work to a sub-agent                                   |
| `exec`             | dangerous    | Compatibility shell command routed through harness environments |
| `exec_kill`        | dangerous    | Kills background processes                                      |

Compatibility danger levels can be overridden per-tool in `config.json` under
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

## Compatibility Decision Matrix

| Danger level | `"never"` / `"ask"` | `"always"`      |
| ------------ | ------------------- | --------------- |
| safe         | Auto-approve        | Auto-approve    |
| moderate     | Auto-approve        | **Prompt user** |
| dangerous    | **Prompt user**     | **Prompt user** |

Key design points:

- **Safe tools never prompt** -- even under `"always"` mode.
- **Dangerous tools always prompt** -- even under `"never"` mode.
- **Moderate tools are the swing tier** -- only prompted in `"always"` mode.
- `ToolIntent` can still require approval even when the compatibility danger
  level would otherwise auto-approve.

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
