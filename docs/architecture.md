# Architecture

The **Engine** is a long-running daemon. It owns the agent, model router, tools, memory, skills, sessions, auth tokens, scheduler, and audio transcriber. The TUI connects on demand; Telegram/Discord connectors auto-start when configured.

## High-level overview

```text
Connectors (Telegram / Discord, auto-start when configured)
                    │
TUI (on-demand) ────┤  tRPC over HTTP + WebSocket
                    │
Webhook ────────────┤  POST /webhook (REST, JSON or SSE)
                    │
             Engine daemon (127.0.0.1:7420 + :7421)
                ├─ Agent (streaming chat + tool loop)
                ├─ ModelRouter (providers/models)
                ├─ Tool registry (16 tools)
                ├─ SkillRegistry (bundled + local skills)
                ├─ MemoryManager
                ├─ SessionManager
                ├─ AuthManager
                ├─ Scheduler
                └─ Transcriber (audio → text)
```

## Subsystems

| Subsystem | Path | Responsibility |
|---|---|---|
| engine core | `src/engine/` | Runtime bootstrap, tRPC procedures, server startup, auth, sessions, scheduler |
| agent | `src/engine/agent/` | Conversation loop, streaming events, tool dispatch, approval flow |
| router | `src/engine/router/` | Provider/model config and active model switching via `@mariozechner/pi-ai` |
| config | `src/engine/config/` | `IDENTITY.md`, `config.json`, `USER.md`, `secrets.enc` loading/saving |
| tools | `src/engine/tools/` | Runtime tools (file I/O, exec, web, reaction, ClawHub, env management) |
| memory | `src/engine/memory/` | Memory directory init and persistence helpers |
| skills | `src/engine/skills/` | Skill discovery, loading, activation, and prompt integration |
| clawhub | `src/engine/clawhub/` | ClawHub API client + skill installer |
| audio | `src/engine/audio/` | Audio transcription (local Whisper or cloud API) |
| connectors | `src/connectors/` | TUI, Telegram, Discord transports and shared stream handler |
| cli | `src/cli/` | `sa` command, daemon control, onboarding/config UIs |
| shared | `src/shared/` | Shared tRPC client and cross-layer types |

## Engine startup flow

```text
sa engine start
  └─ spawns: bun run src/engine/index.ts
      ├─ createRuntime()
      │   ├─ ConfigManager.load()         -> creates/loads IDENTITY.md + config.json
      │   ├─ MemoryManager.init()
      │   ├─ inject runtime.env           -> plain env vars from config.json
      │   ├─ config.loadSecrets()         -> secrets.enc (env vars take precedence)
      │   ├─ ModelRouter.fromConfig()     -> providers/models/defaultModel from config.json
      │   ├─ SkillRegistry.loadAll()      -> bundled + ~/.sa/skills
      │   ├─ build tools                  -> 16 tools (builtins + context-bound)
      │   ├─ assemble system prompt       -> identity + tools + safety + profile + memory + skills
      │   ├─ Scheduler.start()            -> heartbeat task
      │   ├─ createTranscriber()          -> local Whisper or cloud backend
      │   └─ AuthManager.init()           -> writes engine.token
      ├─ startServer(runtime)
      │   ├─ HTTP (default 7420)          -> /health + /webhook + /trpc
      │   ├─ WebSocket (default 7421)     -> tRPC subscriptions
      │   └─ writes engine.url
      └─ auto-start connectors (if tokens configured)
          ├─ Telegram
          └─ Discord
```

## TUI flow

```text
sa (no args)
  ├─ if no config: run onboarding wizard
  ├─ ensureEngine()                   -> starts daemon if not running
  ├─ read engine.url + engine.token
  ├─ create tRPC client (HTTP + WS)
  ├─ session.create(connectorType=tui)
  └─ chat.stream(sessionId, message)
      ├─ emits: text_delta | thinking_delta | tool_start | tool_end
      ├─ may emit: tool_approval_request (then connector calls tool.approve)
      ├─ may emit: reaction (emoji forwarded to IM connectors)
      └─ terminates with: done | error
```

## Webhook flow

```text
POST /webhook
  ├─ check runtime.webhook.enabled
  ├─ authenticate via shared secret (body.secret or X-Webhook-Secret header)
  ├─ create or resume session (connectorType=webhook)
  ├─ if Accept: text/event-stream → SSE streaming (same events as tRPC)
  └─ else → synchronous JSON response: { sessionId, response, toolCalls }
```

## tRPC API surface

| Namespace | Procedures |
|---|---|
| `health` | `ping` |
| `chat` | `send`, `stream`, `history`, `transcribeAndSend` |
| `session` | `create`, `list`, `destroy` |
| `tool` | `approve`, `acceptForSession`, `config` |
| `model` | `list`, `active`, `switch`, `add`, `remove` |
| `provider` | `list`, `add`, `remove` |
| `skill` | `list`, `activate` |
| `auth` | `pair`, `code` |
| `cron` | `list`, `add`, `remove` |

## Streaming events

The agent yields `EngineEvent` types during a chat turn:

| Event | Description |
|---|---|
| `text_delta` | Incremental text output |
| `thinking_delta` | Incremental thinking/reasoning output |
| `tool_start` | Tool execution started (TUI only; IM connectors show a compact summary at `tool_end`) |
| `tool_end` | Tool execution finished with result |
| `tool_approval_request` | Connector must approve/reject a tool call |
| `reaction` | Emoji reaction to forward to IM connector |
| `done` | Chat turn complete |
| `error` | Error occurred |

Safe tools (`read`, `web_search`, `web_fetch`, `remember`, `read_skill`, `reaction`, `set_env_secret`, `set_env_variable`, `clawhub_search`) are auto-approved and suppressed from IM tool output.

## Auth model

- Engine startup writes a master token to `~/.sa/engine.token`.
- Connectors read/pass this token as a bearer credential.
- `auth.code` and `auth.pair` provide one-time pairing flow for remote connectors.
- Auth state is managed by `AuthManager`; enforcement middleware is minimal and most procedures are currently public.

## Design notes

- Daemon + connector split keeps one runtime state while supporting multiple frontends.
- Config is file-based (`IDENTITY.md`, `USER.md`, `config.json`, `secrets.enc`) with no database.
- `config.json` v3 merges runtime + providers + models into one source of truth.
- Skills are Markdown (`SKILL.md`) and can be bundled, local, or installed from ClawHub.
- Audio transcription prefers local Whisper when available, falling back to cloud API.
- Tool approval is configurable per connector type (`never`, `ask`, `always`).
