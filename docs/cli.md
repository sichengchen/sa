# CLI Commands & TUI

## CLI commands

Public CLI identity: `aria`.

### `aria` (no arguments)

Detect first run. If `~/.aria/config.json` does not exist, run the onboarding wizard. Otherwise, start the engine daemon (if not running), wait for `/health` to respond, pair with the engine, create a TUI session, and open the Ink-based terminal UI.

### `aria config`

Interactive configuration editor. Provides menus for editing providers, models, connectors, runtime settings, and automation tasks.

### `aria onboard`

Run the setup wizard. Walks through provider API key entry, model selection, Telegram/Discord pairing, and identity configuration.

### `aria engine <subcommand>`

| Subcommand | Description |
|---|---|
| `start` | Spawn the engine daemon as a detached Bun process |
| `stop` | Send SIGTERM to the engine process (via PID file) |
| `status` | Check if the engine is running and report port/PID |
| `logs` | View recent engine daemon log output |
| `restart` | Stop then start the engine |

### `aria stop`

Force-cancel all running agent tasks and tool calls. Sends `chat.stopAll` to the engine.

### `aria restart`

Restart the engine via the `engine.restart` tRPC procedure. The engine writes a restart marker file and exits; the CLI re-launches the daemon.

### `aria shutdown`

Shut down the engine gracefully via the `engine.shutdown` tRPC procedure.

### `aria audit`

Security audit log viewer. Reads `~/.aria/audit.log` (NDJSON).

| Flag | Description |
|---|---|
| `--tail N` | Show last N entries (default: 50) |
| `--tool <name>` | Filter by tool name |
| `--event <type>` | Filter by event type (e.g., `auth_failure`, `security_block`) |
| `--since <duration>` | Entries from the last duration (e.g., `1h`, `30m`, `7d`) |
| `--session <id>` | Filter by session ID or prefix |
| `--json` | Output raw JSON instead of table format |

### `aria automation`

Durable automation inspection for task state and recent runs.

| Subcommand | Description |
|---|---|
| `list` | Show heartbeat, cron, and webhook tasks with status and next run |
| `runs [task]` | Show recent automation executions, including retry attempts and delivery status |

### `aria memory`

Layered memory inspection for the operator.

| Subcommand | Description |
|---|---|
| `list` | Show curated memory size, layer keys, and recent journal days |
| `list <layer>` | Show keys for `profile`, `project`, `operational`, or `journal` |
| `read <layer> <key>` | Read one memory entry (`curated` does not require a key) |
| `search <query>` | Search memory across layers |

### `aria help`

Show available commands and usage.

---

## TUI slash commands

When chatting in the TUI:

| Command | Description |
|---|---|
| `/new` | Start a new conversation. Destroys the current session and agent, then creates a fresh session under the `tui` prefix. |
| `/stop` | Force-cancel all running agent tasks and tool calls for the current session |
| `/restart` | Restart Aria Runtime (exits TUI for reconnect) |
| `/shutdown` | Shut down Aria Runtime completely |
| `/status` | Show engine status (uptime, active model, session count) |
| `/model <name>` | Switch the active model. Supports aliases (e.g., `/model fast`). |
| `/models` | List all configured models with provider and active status |
| `/provider` | List configured providers with API key env var names |
| `/sessions` | List active sessions and open session picker |
| `/archives` | List recently archived sessions without switching the active chat |
| `/switch <id>` | Switch to a different session by ID prefix |
| `/search <query>` | Search archived session transcripts and summaries, then print matching session IDs in the TUI |
| `/history <id>` | Show the transcript for a live session or an archived session without switching the active chat |
| `/automation` | Show durable automation tasks and their current status |
| `/runs [task]` | Show recent automation executions, including retry attempts and delivery status |
| `/approvals [all]` | Show pending approval requests for the current session or globally |
| `/memory` | Inspect layered memory, read specific entries, or search memory |
| `/audit [all|N]` | Inspect recent audit entries for the current session or globally |
| `/rollback` | List recent filesystem checkpoints for the current working directory |
| `/rollback diff <hash>` | Show the diff between the current working tree and a checkpoint |
| `/rollback <hash> [file]` | Restore the full working tree or a single file from a checkpoint |

---

## TUI flow

```text
aria (no arguments)
  |
  +-- If no ~/.aria/config.json: run onboarding wizard
  +-- ensureEngine()
  |     Start daemon if not running, wait for /health
  +-- Read engine.url + engine.token
  +-- Create tRPC client (HTTP + WS)
  +-- auth.pair(masterToken, "tui", "tui")
  +-- session.create({ connectorType: "tui", prefix: "tui" })
  +-- Render Ink TUI
       |
       +-- User types message
       +-- chat.stream({ sessionId, message })
       +-- Render events:
       |     text_delta           -> append to response
       |     thinking_delta       -> show in thinking indicator
       |     tool_start           -> show tool execution card
       |     tool_end             -> update tool card with result
       |     tool_approval_request -> prompt: [y]es / [n]o / [a]lways
       |     user_question         -> show question UI (choice/free-text)
       |     reaction              -> show emoji
       |     done                 -> mark turn complete
       |     error                -> display error message
       +-- On quit: session.destroy, disconnect
```

---

## Common tasks

### Setting environment variables

**Never write to shell profiles** (`.zshrc`, `.bashrc`) or dotenv files. Use Esperta Aria's built-in tools:

- `set_env_secret` -- for sensitive values (API keys, tokens). Stored encrypted in `secrets.enc`.
- `set_env_variable` -- for non-sensitive values (feature flags, paths). Stored in `config.json`.

Both take effect immediately and persist across engine restarts.

For interactive key management: `aria config`

### Adding a model

```
aria config -> Models -> + Add new model
```

Or re-run the wizard: `aria onboard`

### Adding a provider

```
aria config -> Providers -> + Add new provider
```

### Checking health

```bash
aria engine status
curl -s http://127.0.0.1:7420/health
```

### Updating bot tokens

```
aria config -> Connectors -> edit token
```

Or re-run: `aria onboard`

### Installing a skill from ClawHub

Ask the agent: "Search ClawHub for [topic]" -- uses the `clawhub` bundled skill, which runs `clawhub` CLI commands via `exec`.
