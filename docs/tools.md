# Built-in Tools

SA exposes 16 runtime tools to the agent.

| Tool | Purpose |
|---|---|
| `read` | Read file contents |
| `write` | Create/overwrite files |
| `edit` | Exact single-occurrence string replacement |
| `exec` | Execute shell commands (workdir, env, background, yield timeout) |
| `exec_status` | Check status/output of a background process |
| `exec_kill` | Kill a background process |
| `web_fetch` | Fetch a URL and return content as markdown |
| `web_search` | Web search via Brave or Perplexity |
| `reaction` | React to a message with an emoji (IM connectors) |
| `clawhub_search` | Search ClawHub skills |
| `remember` | Save memory entry by key |
| `read_skill` | Load + activate a skill by name |
| `clawhub_install` | Install a skill from ClawHub |
| `clawhub_update` | Update one/all installed ClawHub skills |
| `set_env_secret` | Store a secret in the encrypted vault (secrets.enc) |
| `set_env_variable` | Set a plain environment variable in config.json |

## `read`

Read file contents as text.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Absolute file path |
| `offset` | number | No | Start line (1-based, default `1`) |
| `limit` | number | No | Max lines to return |

## `write`

Write full content to a file (creates parent directories, overwrites existing file).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Absolute file path |
| `content` | string | Yes | Full file content |

## `edit`

Exact string replacement. `old_string` must appear exactly once.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file_path` | string | Yes | Absolute file path |
| `old_string` | string | Yes | Exact string to replace |
| `new_string` | string | Yes | Replacement string |

## `exec`

Execute a shell command (`sh -c`). Replaces the legacy `bash` tool. Supports working directory, environment overrides, background mode, yield timeout (auto-background after delay), and process timeout.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `command` | string | Yes | Shell command |
| `workdir` | string | No | Working directory (defaults to cwd) |
| `env` | object | No | Environment variable overrides merged with `process.env` |
| `background` | boolean | No | Start in background immediately and return a handle |
| `yieldMs` | number | No | Auto-background after this many ms if still running (default `10000`; `0` to wait indefinitely up to timeout) |
| `timeout` | number | No | Kill after this many seconds (default `1800`) |

## `exec_status`

Check status and output of a background `exec` process.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `handle` | string | Yes | Background process handle returned by `exec` |

## `exec_kill`

Kill a background `exec` process and return its final output.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `handle` | string | Yes | Background process handle to kill |

## `web_fetch`

Fetch a URL and return its content. HTML is converted to markdown; JSON/text/XML returned as-is.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | The URL to fetch |
| `maxLength` | number | No | Max characters to return (default `50000`) |
| `headers` | object | No | Additional HTTP headers to send |

## `web_search`

Search the web using Brave Search or Perplexity API. Auto-selects the available backend based on configured API keys (`BRAVE_API_KEY` or `PERPLEXITY_API_KEY`).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query |
| `count` | number | No | Number of results (default `5`) |
| `backend` | string | No | `"brave"`, `"perplexity"`, or `"auto"` (default) |

## `reaction`

React to the user's message with an emoji. The reaction is forwarded to IM connectors (Telegram, Discord) as a native message reaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `emoji` | string | Yes | Emoji character (e.g. `👍`, `❤️`, `😂`) |

## `clawhub_search`

Search ClawHub (`clawhub.ai`) for skills.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search query |

## `remember`

Save a memory topic entry under the configured memory directory.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Memory key (sanitized to filename-safe form) |
| `content` | string | Yes | Content to save |

## `read_skill`

Load and activate a skill from the discovered skill list.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Skill name from `<available_skills>` |

## `clawhub_install`

Install a skill by ClawHub slug.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `slug` | string | Yes | Skill slug (example: `steipete/apple-notes`) |
| `version` | string | No | Specific version (defaults to latest) |

## `clawhub_update`

Update installed ClawHub skills.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `slug` | string | No | Skill slug to update; omit to check all installed skills |

## `set_env_secret`

Store a sensitive value (API key, token, password) in SA's encrypted vault (`secrets.enc`). The value is injected as an environment variable immediately and persists across restarts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Environment variable name (e.g. `BRAVE_API_KEY`) |
| `value` | string | Yes | The secret value |

## `set_env_variable`

Set a non-sensitive environment variable in `config.json` (`runtime.env`). The value is injected immediately and persists across restarts. Do not use for secrets — use `set_env_secret` instead.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Environment variable name (e.g. `SA_LOG_LEVEL`) |
| `value` | string | Yes | The value to set |

## Tool approval

Tools are classified as **safe** or **unsafe** for approval purposes. Safe tools (`read`, `read_skill`, `remember`, `reaction`, `set_env_secret`, `set_env_variable`, `clawhub_search`, `web_search`, `web_fetch`) are always auto-approved. Unsafe tools (`exec`, `write`, `edit`, `exec_status`, `exec_kill`, `clawhub_install`, `clawhub_update`) follow the per-connector approval mode configured in `config.json` (`runtime.toolApproval`).

Approval modes:
- `"never"` — auto-approve everything (default for TUI)
- `"ask"` — prompt the connector for each unsafe tool call (default for IM connectors)
- `"always"` — always prompt, even for safe tools
