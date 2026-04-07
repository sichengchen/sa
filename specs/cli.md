# CLI Commands & TUI

## CLI commands

### `sa` (no arguments)

Detect first run. If `~/.sa/config.json` does not exist, run the onboarding wizard. Otherwise, start the engine daemon (if not running), wait for `/health` to respond, pair with the engine, create a TUI session, and open the Ink-based terminal UI.

### `sa config`

Interactive configuration editor. Provides menus for editing providers, models, connectors, runtime settings, and automation tasks.

### `sa onboard`

Run the setup wizard. Walks through provider API key entry, model selection, Telegram/Discord pairing, and identity configuration.

### `sa engine <subcommand>`

| Subcommand | Description |
|---|---|
| `start` | Spawn the engine daemon as a detached Bun process |
| `stop` | Send SIGTERM to the engine process (via PID file) |
| `status` | Check if the engine is running and report port/PID |
| `logs` | View recent engine daemon log output |
| `restart` | Stop then start the engine |

### `sa stop`

Force-cancel all running agent tasks and tool calls. Sends `chat.stopAll` to the engine.

### `sa restart`

Restart the engine via the `engine.restart` tRPC procedure. The engine writes a restart marker file and exits; the CLI re-launches the daemon.

### `sa shutdown`

Shut down the engine gracefully via the `engine.shutdown` tRPC procedure.

### `sa audit`

Security audit log viewer. Reads `~/.sa/audit.log` (NDJSON).

| Flag | Description |
|---|---|
| `--tail N` | Show last N entries (default: 50) |
| `--tool <name>` | Filter by tool name |
| `--event <type>` | Filter by event type (e.g., `auth_failure`, `security_block`) |
| `--since <duration>` | Entries from the last duration (e.g., `1h`, `30m`, `7d`) |
| `--json` | Output raw JSON instead of table format |

### `sa help`

Show available commands and usage.

---

## TUI slash commands

When chatting in the TUI:

| Command | Description |
|---|---|
| `/new` | Start a new conversation. Destroys the current session and agent, then creates a fresh session under the `tui` prefix. |
| `/stop` | Force-cancel all running agent tasks and tool calls for the current session |
| `/restart` | Restart the SA engine (exits TUI for reconnect) |
| `/shutdown` | Shut down the SA engine completely |
| `/status` | Show engine status (uptime, active model, session count) |
| `/model <name>` | Switch the active model. Supports aliases (e.g., `/model fast`). |
| `/models` | List all configured models with provider and active status |
| `/provider` | List configured providers with API key env var names |
| `/sessions` | List active sessions and open session picker |
| `/switch <id>` | Switch to a different session by ID prefix |
| `/search <query>` | Search archived session transcripts and summaries, then print matching session IDs in the TUI |
| `/history <id>` | Show the transcript for a live session or an archived session without switching the active chat |
| `/rollback` | List recent filesystem checkpoints for the current working directory |
| `/rollback diff <hash>` | Show the diff between the current working tree and a checkpoint |
| `/rollback <hash> [file]` | Restore the full working tree or a single file from a checkpoint |

---

## TUI flow

```text
sa (no arguments)
  |
  +-- If no ~/.sa/config.json: run onboarding wizard
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

**Never write to shell profiles** (`.zshrc`, `.bashrc`) or dotenv files. Use SA's built-in tools:

- `set_env_secret` -- for sensitive values (API keys, tokens). Stored encrypted in `secrets.enc`.
- `set_env_variable` -- for non-sensitive values (feature flags, paths). Stored in `config.json`.

Both take effect immediately and persist across engine restarts.

For interactive key management: `sa config`

### Adding a model

```
sa config -> Models -> + Add new model
```

Or re-run the wizard: `sa onboard`

### Adding a provider

```
sa config -> Providers -> + Add new provider
```

### Checking health

```bash
sa engine status
curl -s http://127.0.0.1:7420/health
```

### Updating bot tokens

```
sa config -> Connectors -> edit token
```

Or re-run: `sa onboard`

### Installing a skill from ClawHub

Ask the agent: "Search ClawHub for [topic]" -- uses the `clawhub` bundled skill, which runs `clawhub` CLI commands via `exec`.
