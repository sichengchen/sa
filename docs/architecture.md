# Architecture

SA uses a daemon + connector architecture. The **Engine** is a long-running background process that owns the agent, model router, memory, skills, and scheduler. **Connectors** are lightweight frontends (TUI, Telegram, Discord) that connect to the Engine via tRPC and relay user messages.

## High-level overview

```
Connectors (TUI / Telegram / Discord)
    │
    │  tRPC over HTTP + WebSocket
    │
Engine (daemon, port 7420)
    ├── Agent — conversation loop, tool dispatch, streaming events
    ├── ModelRouter — multi-provider LLM routing via pi-ai
    ├── MemoryManager — persistent key/value memory
    ├── SkillRegistry — agentskills.io skill loader
    ├── ClawHub client — skill registry search & install
    ├── SessionManager — per-connector session state
    ├── AuthManager — token-based auth, device-flow pairing
    └── Scheduler — cron-like background tasks
```

## Subsystems

| Subsystem        | Path                        | Responsibility                                              |
|------------------|-----------------------------|-------------------------------------------------------------|
| **engine**       | `src/engine/`               | Daemon process: tRPC server, runtime bootstrap, auth, sessions, scheduler |
| **agent**        | `src/agent/`                | Conversation loop: sends messages to the router, dispatches tool calls, streams events |
| **config**       | `src/config/`               | Loads and writes `IDENTITY.md`, `config.json`, `models.json`, `secrets.enc` from `SA_HOME` |
| **router**       | `src/router/`               | Wraps `@mariozechner/pi-ai` to manage multiple model configs and switch between them |
| **tools**        | `src/tools/`                | Built-in tool implementations (read, write, edit, bash, remember, read_skill, clawhub_search) |
| **memory**       | `src/memory/`               | Persists key/value entries to `~/.sa/memory/`; loads them into the system prompt on startup |
| **skills**       | `src/skills/`               | Skill loader, registry, and prompt injection (agentskills.io spec) |
| **clawhub**      | `src/clawhub/`              | ClawHub API client and skill installer |
| **connectors**   | `src/connectors/`           | TUI, Telegram, and Discord connector implementations |
| **shared**       | `src/shared/`               | Shared types, tRPC client factory, Connector interface |
| **cli**          | `src/cli/`                  | `sa` CLI for managing the Engine daemon (start/stop/status/logs/restart) |
| **wizard**       | `src/wizard/`               | First-run onboarding wizard (Ink) |

## Engine startup flow

```
sa engine start
    │
    └─ spawn: bun run src/engine/index.ts (detached)
         │
         ├─ createRuntime()
         │    ├─ ConfigManager.load()
         │    ├─ MemoryManager.init()
         │    ├─ config.loadSecrets()
         │    ├─ ModelRouter.load(models.json, secrets)
         │    ├─ SkillRegistry.loadAll(saHome)
         │    ├─ ClawHubClient + SkillInstaller
         │    ├─ build tools (builtin + remember + read_skill + clawhub_search)
         │    ├─ assemble system prompt (identity + tools + safety + profile + heartbeat + memory + skills)
         │    ├─ Scheduler.start() (heartbeat task)
         │    └─ AuthManager.init() (writes engine.token)
         │
         └─ startServer(runtime)
              ├─ HTTP server on port 7420 (tRPC + /health)
              ├─ WebSocket server on port 7421 (tRPC subscriptions)
              └─ writes engine.url discovery file
```

## Connector flow

```
Connector (e.g. TUI)
    │
    ├─ Read engine.url + engine.token from ~/.sa/
    ├─ Create tRPC client (HTTP + WS)
    ├─ auth.pair(masterToken) → session token
    ├─ session.create() → sessionId
    │
    └─ Chat loop:
         ├─ chat.stream(sessionId, message)  ← tRPC subscription
         │    └─ yields: text_delta, tool_start, tool_end, tool_approval_request, done, error
         └─ tool.approve(toolCallId, approved)  ← when approval required
```

## Authentication

The Engine uses a two-tier token system:

1. **Master token** — written to `~/.sa/engine.token` on startup (file mode 0600). Local connectors read this file to authenticate.
2. **Pairing code** — a 6-character one-time code for remote device-flow pairing (e.g. Telegram/Discord bots on another machine). Exchange the code for a session token via the `auth.pair` RPC.

## tRPC API surface

| Namespace    | Procedure      | Type         | Description                          |
|--------------|----------------|--------------|--------------------------------------|
| `health`     | `ping`         | query        | Health check, uptime, session count  |
| `chat`       | `send`         | mutation     | Send a message (non-streaming)       |
| `chat`       | `stream`       | subscription | Stream AgentEvents for a chat turn   |
| `chat`       | `history`      | query        | Get conversation history             |
| `session`    | `create`       | mutation     | Create a new session                 |
| `session`    | `list`         | query        | List active sessions                 |
| `session`    | `destroy`      | mutation     | Destroy a session and its Agent      |
| `tool`       | `approve`      | mutation     | Approve/reject a pending tool call   |
| `skill`      | `list`         | query        | List loaded skills                   |
| `skill`      | `activate`     | mutation     | Activate a skill                     |
| `skill`      | `search`       | query        | Search ClawHub for skills            |
| `skill`      | `install`      | mutation     | Install a skill from ClawHub         |
| `auth`       | `pair`         | mutation     | Pair with master token or code       |
| `auth`       | `code`         | query        | Generate a pairing code              |
| `cron`       | `list`         | query        | List scheduled tasks                 |
| `cron`       | `add`          | mutation     | Add a cron task                      |
| `cron`       | `remove`       | mutation     | Remove a cron task                   |

## Message flow (Engine mode)

```
User input (via Connector)
    │
    ▼
tRPC: chat.stream(sessionId, message)
    │
    ▼
Agent.chat(message)
    │
    ├─ ModelRouter → LLM (streaming response)
    │
    └─ Tool call in response?
           │
           ├─ Needs approval? → yield tool_approval_request → wait for tool.approve()
           ├─ Dispatch to ToolImpl.execute()
           ├─ Append tool result to conversation
           └─ Loop (up to maxToolRounds)
    │
    ▼
AgentEvents streamed back to Connector via tRPC subscription
    (text_delta, thinking_delta, tool_start, tool_end, done, error)
```

## Key design decisions

- **Daemon + Connector split** — the Engine runs independently; connectors are stateless frontends that can be started/stopped/swapped without losing conversation state.
- **tRPC for IPC** — typed RPC with subscription support for streaming. HTTP for queries/mutations, WebSocket for real-time event streams.
- **Token-based auth** — local connectors use the master token file; remote connectors pair via one-time codes. No passwords, no user accounts.
- **Configuration as files** — `IDENTITY.md`, `config.json`, `models.json`, and `secrets.enc` are the source of truth. No database.
- **Memory in system prompt** — long-term memory is injected into the system prompt on startup, not retrieved dynamically at query time.
- **Provider abstraction via pi-ai** — `@mariozechner/pi-ai` normalises API differences across Anthropic, OpenAI, Google, etc.; the router builds on top of it.
- **Skills as Markdown** — skills follow the agentskills.io spec (SKILL.md with YAML frontmatter). They're loaded on startup and can be activated on demand.
