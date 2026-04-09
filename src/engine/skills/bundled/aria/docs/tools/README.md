# Tools Overview and Classification

Esperta Aria provides 23 built-in tools organized by danger level, plus dynamic `mcp_*`
tools discovered from configured MCP servers. The engine owns all tool
definitions; connectors never invoke tools directly.

## Tool Inventory

| #  | Tool             | Danger     | Purpose                              |
|----|------------------|------------|--------------------------------------|
| 1  | read             | safe       | Read file contents                   |
| 2  | write            | moderate   | Create/overwrite files               |
| 3  | edit             | moderate   | Exact string replacement             |
| 4  | exec             | dangerous* | Execute shell commands (hybrid)      |
| 5  | exec_status      | safe       | Check background process status      |
| 6  | exec_kill        | dangerous  | Kill a background process            |
| 7  | web_fetch        | safe       | Fetch a URL                          |
| 8  | web_search       | safe       | Web search via Brave or Perplexity   |
| 9  | reaction         | safe       | React with emoji                     |
| 10 | memory_write     | safe       | Write to layered memory or journal   |
| 11 | memory_search    | safe       | Search memory (BM25 + vector)        |
| 12 | memory_read      | safe       | Read memory entry by key or date     |
| 13 | memory_delete    | safe       | Delete topic memory entry            |
| 14 | read_skill       | safe       | Load and activate a skill            |
| 15 | skill_manage     | moderate   | Create and patch reusable user skills |
| 16 | set_env_secret   | safe       | Store encrypted secret               |
| 17 | set_env_variable | safe       | Set plain env var                    |
| 18 | notify           | safe       | Push notification to connectors      |
| 19 | delegate         | moderate   | Delegate to sub-agent                |
| 20 | delegate_status  | safe       | Check sub-agent status               |
| 21 | ask_user         | safe       | Ask the user a clarifying question   |
| 22 | claude_code      | moderate   | Delegate task to Claude Code CLI     |
| 23 | codex            | moderate   | Delegate task to Codex CLI           |

*exec uses hybrid classification — see [exec.md](exec.md).

Dynamic MCP tools are surfaced with the prefix `mcp_<server>_<tool>` and are
also grouped into dynamic toolsets such as `mcp:filesystem`.

---

## Danger Classification System

Every tool is assigned a danger level that governs approval behavior.

### Levels

| Level      | Description                                                       |
|------------|-------------------------------------------------------------------|
| safe       | Auto-approve, low visibility. Read-only or side-effect-free.      |
| moderate   | Context-dependent. Auto-approve in "never"/"ask"; prompt in "always". |
| dangerous  | Always requires approval, even in "never" mode.                   |

Unknown or unregistered tools default to **dangerous**.

### 3-Tier Approval Flow

The approval decision combines danger level with the user's configured approval
mode (`runtime.toolPolicy.approvalMode`).

| Danger \ Mode | never       | ask              | always          |
|---------------|-------------|------------------|-----------------|
| safe          | auto-approve| auto-approve     | auto-approve    |
| moderate      | auto-approve| auto-approve     | prompt user     |
| dangerous     | prompt user | prompt user      | prompt user     |

Notes:
- `exec` uses hybrid classification: the effective danger level is determined
  at runtime by `classifyExecCommand()` after the agent declares its own
  assessment. See [exec.md](exec.md) for the full algorithm.
- Full approval flow details: `docs/security/approval-flow.md`.

---

## Per-Tool Config Overrides

Individual tools can have their danger level and reporting behavior overridden
in config.

### Schema

```
runtime.toolPolicy.overrides.<tool_name>:
  dangerLevel?: "safe" | "moderate" | "dangerous"
  report?: "always" | "never" | "on_error"
```

### Fields

- **dangerLevel** — Changes the tool's approval behavior. Overrides the
  built-in classification.
- **report** — Controls whether `tool_start`/`tool_end` events are emitted
  to connectors.
  - `"always"` — emit start and end events unconditionally.
  - `"never"` — suppress all tool events.
  - `"on_error"` — emit only when the tool errors.

### Resolution Order

```
config override > built-in default > "dangerous" fallback
```

For `exec`: the hybrid classifier runs *after* override resolution. If you
override exec to "safe", the classifier still re-evaluates based on the
actual command.

---

## Tool Policy Verbosity

Controls how much tool execution detail connectors display.

### Levels

| Level   | Start events shown                         | End events shown                    |
|---------|--------------------------------------------|-------------------------------------|
| verbose | All tools                                  | All tools                           |
| minimal | moderate + dangerous only                  | errors + dangerous only             |
| silent  | dangerous + long-running (>10s) only       | errors only                         |

### Per-Connector Defaults

| Connector    | Default   |
|--------------|-----------|
| TUI          | minimal   |
| Telegram     | silent    |
| Discord      | silent    |
| Slack        | silent    |
| Teams        | silent    |
| Google Chat  | silent    |
| GitHub       | silent    |
| Linear       | silent    |
| WeChat       | silent    |
| Webhook      | silent    |

### Config Example

```json
{
  "runtime": {
    "toolPolicy": {
      "verbosity": "minimal",
      "connectorOverrides": {
        "telegram": "silent"
      }
    }
  }
}
```

### Long-Running Detection

In `silent` mode, tools running longer than **10 seconds** emit a start event
so the user knows something is happening.

---

## Safety Guards

### Tool Result Size Guard

Tool outputs exceeding **400,000 characters** are truncated before being
returned to the model.

### Tool Loop Detection

| Threshold | Action        |
|-----------|---------------|
| 10 calls  | Warn          |
| 20 calls  | Block          |
| 30 calls  | Circuit-break  |

Circuit-break terminates the current agent turn and returns an error to the
user.
