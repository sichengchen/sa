# Architecture Overview

SA is a personal AI agent assistant. It runs as a **daemon (Engine)** that owns all state -- config, model router, tools, memory, skills, sessions, auth, and scheduler. Frontends (TUI, Telegram, Discord, Webhook) are stateless **Connectors** that communicate with the Engine over **tRPC** (HTTP + WebSocket) on `127.0.0.1:7420/7421`.

---

## High-level diagram

```text
                           Frontends (stateless)
                  +------+  +----------+  +---------+
                  | TUI  |  | Telegram |  | Discord |
                  +--+---+  +----+-----+  +----+----+
                     |           |              |
                     +-----+-----+-----+--------+
                           |           |
        tRPC (HTTP+WS)    |   REST/SSE |
      127.0.0.1:7420/7421 |           |
                     +-----+-----------+-----+
                     |     Engine daemon      |
                     |  +-----------------+   |
                     |  | Agent           |   |     POST /webhook/agent
                     |  |  chat loop      |   |     POST /webhook/tasks/:slug
                     |  |  tool dispatch  |   |<--- POST /webhook/heartbeat
                     |  |  approval flow  |   |
                     |  +-----------------+   |
                     |  | ModelRouter     |   |
                     |  | ToolRegistry    |   |
                     |  | SkillRegistry   |   |
                     |  | MemoryManager   |   |
                     |  | SessionManager  |   |
                     |  | AuthManager     |   |
                     |  | Scheduler       |   |
                     |  | Transcriber     |   |
                     |  +-----------------+   |
                     +------------------------+
                               |
                       ~/.sa/  (file-based state)
                       config.json, secrets.enc,
                       IDENTITY.md, USER.md,
                       HEARTBEAT.md, memory/,
                       skills/, engine.*
```

---

## Subsystems

| Subsystem | Path | Responsibility |
|---|---|---|
| Engine core | `src/engine/` | Runtime bootstrap, tRPC procedures, HTTP+WS server, auth, sessions, scheduler |
| Agent | `src/engine/agent/` | Conversation loop, streaming events, tool dispatch, tool approval, loop detection, result size guard |
| Model Router | `src/engine/router/` | Provider/model config, active model switching, tier-based routing, alias resolution, fallback chains. Wraps `@mariozechner/pi-ai` |
| Config | `src/engine/config/` | `IDENTITY.md`, `config.json` (v3), `USER.md`, `secrets.enc` loading/saving/migration |
| Tools | `src/engine/tools/` | 19 built-in tools across three danger tiers. Exec classifier, tool policy manager, background process management |
| Memory | `src/engine/memory/` | Memory directory init, persistence helpers, context loading for system prompt |
| Skills | `src/engine/skills/` | Skill discovery, loading (bundled + user), activation, prompt integration via `SKILL.md` |
| Audio | `src/engine/audio/` | Audio transcription -- prefers local Whisper, falls back to cloud API |
| Connectors | `src/connectors/` | TUI (Ink + React), Telegram (Grammy), Discord (Discord.js), shared stream handler |
| CLI | `src/cli/` | `sa` command entry point, daemon control, onboarding wizard, config editor |
| Shared | `src/shared/` | Typed tRPC client factory, cross-layer types, connector base, markdown formatting |

---

## Engine startup flow

1. Spawn detached Bun process (`src/engine/index.ts`)
2. `ConfigManager.load()` -- load or create `~/.sa/config.json` (v3), `IDENTITY.md`
3. `MemoryManager.init()` -- ensure `~/.sa/memory/` exists
4. Inject `runtime.env` -- plain env vars from config (env vars take precedence)
5. `config.loadSecrets()` -- decrypt `secrets.enc`, inject API keys into `process.env`
6. Validate provider API keys -- warn if any `apiKeyEnvVar` is missing
7. `ModelRouter.fromConfig()` -- build provider/model registry, set default model, init tiers/aliases/fallbacks
8. `SkillRegistry.loadAll()` -- load bundled + user-installed skills
9. Build tools (19 total) -- 9 builtins + context-bound tools
10. Assemble system prompt (11 components, see below)
11. `createTranscriber()` -- local Whisper if available, else cloud API
12. `SessionManager()` + `AuthManager.init()` -- generate master token
13. Create main session (`main:<uuid8>`) and main agent
14. Ensure `HEARTBEAT.md` exists
15. `Scheduler.start()` -- register built-in heartbeat task
16. Restore persisted cron tasks from `config.json`
17. `startServer()` -- bind HTTP (7420) + WS (7421) listeners
18. Auto-start connectors (Telegram, Discord) if tokens configured

---

## Agent loop

The `Agent` class implements the core chat loop. Each `agent.chat(userText)` call is an async generator yielding `AgentEvent` values:

1. Push user message to history, start timeout timer, init loop detector
2. **LOOP**: build context, get model from router, stream via pi-ai
3. Stream events: `text_delta`, `thinking_delta`, `toolcall_end` (collected), `done`, `error`
4. On `done` with tool calls: for each call, check timeout, run approval flow if needed, check loop detector, execute tool, cap result size, push result to history, continue loop
5. On `done` without tool calls: yield `done`, return

**Loop detection**: warn at 10 repeated calls, block at 20, circuit-break at 30.
**Result size guard**: truncate tool results exceeding 400,000 chars.

---

## Streaming events

| Event | Fields | Description |
|---|---|---|
| `text_delta` | `delta` | Incremental text output |
| `thinking_delta` | `delta` | Incremental thinking/reasoning output |
| `tool_start` | `name`, `id` | Tool execution started |
| `tool_end` | `name`, `id`, `content`, `isError` | Tool execution finished with result |
| `tool_approval_request` | `name`, `id`, `args` | Connector must approve or reject |
| `reaction` | `emoji` | Emoji reaction to forward to IM connector |
| `done` | `stopReason` | Chat turn complete |
| `error` | `message` | Error occurred |

Event filtering by `ToolPolicyManager`: verbosity levels (`verbose`/`minimal`/`silent`) and per-tool overrides control which events reach each connector. See `tools/README.md`.

---

## Model router

**Provider resolution**: look up model config by name, resolve provider, resolve API key (`env > secrets > error`). Custom `baseUrl` providers use openai-completions API; others use pi-ai `getModel()`.

**Task-tier routing**: `getModelForTask(taskType)` resolves tier via `taskTierOverrides` > `DEFAULT_TASK_TIER` > `"normal"`, then model via `tierModels[tier]` > `activeModelName`.

| Tier | Default task types |
|---|---|
| `performance` | chat, tool_use, reasoning |
| `normal` | (fallback) |
| `eco` | classification, summarization, transcription |

**Model aliases**: short names mapped to model config names (e.g., `fast` -> `haiku`). Resolved in `model.switch` and task routing.

**Fallback chains**: each model can specify a `fallback` model name. Circular chains rejected at startup.

---

## System prompt assembly

1. Identity prompt (from `IDENTITY.md`)
2. Available Tools section (formatted list: `- toolName [dangerLevel]: summary`)
3. Tool Call Style guide (safe/moderate/dangerous narration rules)
4. Reactions guide (when to react with emoji vs. reply)
5. Group Chat guide (name-prefixed messages, address by name)
6. Safety advisory (no independent goals, human oversight)
7. User Profile (from `USER.md`, if present)
8. Session heartbeat (current date/time + active model name)
9. Memory context (loaded from `~/.sa/memory/`)
10. Skills directive (scan `<available_skills>`, `read_skill` before replying)
11. Available skills list (name + description for each loaded skill)

---

## tRPC API surface

| Namespace | Procedure | Type | Description |
|---|---|---|---|
| `health` | `ping` | query | Status, uptime, sessions, model, agentName. **Unauthenticated.** |
| `chat` | `send` | mutation | Touch session, non-streaming send |
| `chat` | `stream` | subscription | Stream `EngineEvent` values for a chat turn |
| `chat` | `history` | query | Message history for a session |
| `chat` | `transcribeAndSend` | subscription | Transcribe audio, then stream chat response |
| `session` | `create` | mutation | Create a new session |
| `session` | `getLatest` | query | Most recently active session for a prefix |
| `session` | `list` | query | List all active sessions |
| `session` | `destroy` | mutation | Destroy session and agent |
| `tool` | `config` | query | Tool approval mode for a session |
| `tool` | `approve` | mutation | Approve/reject a pending tool call |
| `tool` | `acceptForSession` | mutation | Auto-approve tool for rest of session |
| `model` | `list` | query | List all model configurations |
| `model` | `active` | query | Get active model name |
| `model` | `switch` | mutation | Switch active model (supports aliases) |
| `model` | `add` | mutation | Add a model configuration |
| `model` | `remove` | mutation | Remove a model configuration |
| `model` | `tiers` | query | Current tier-to-model mapping |
| `model` | `setTier` | mutation | Assign model to a tier |
| `model` | `routing` | query | Full routing state |
| `provider` | `list` | query | List configured providers |
| `provider` | `add` | mutation | Add a provider |
| `provider` | `remove` | mutation | Remove a provider |
| `skill` | `list` | query | List loaded skills with activation status |
| `skill` | `activate` | mutation | Activate a skill by name |
| `auth` | `pair` | mutation | Device-flow pairing. **Unauthenticated.** |
| `auth` | `code` | query | Generate one-time pairing code. **Unauthenticated.** |
| `cron` | `list` | query | List scheduled tasks |
| `cron` | `add` | mutation | Add a cron task |
| `cron` | `remove` | mutation | Remove a user-defined cron task |
| `webhookTask` | `list` | query | List webhook tasks |
| `webhookTask` | `add` | mutation | Add a webhook task |
| `webhookTask` | `update` | mutation | Update a webhook task |
| `webhookTask` | `remove` | mutation | Remove a webhook task |
| `heartbeat` | `status` | query | Heartbeat config, last result, main session ID |
| `heartbeat` | `configure` | mutation | Update heartbeat enabled/interval |
| `heartbeat` | `trigger` | mutation | Manually trigger heartbeat |
| `mainSession` | `info` | query | Main session metadata |

---

## Config directory layout

```text
~/.sa/
  config.json           Config v3: runtime + providers + models + automation
  IDENTITY.md           Agent personality and base system prompt
  USER.md               User profile (optional)
  HEARTBEAT.md          Heartbeat checklist
  secrets.enc           Encrypted API keys and secrets
  .salt                 Salt for secrets encryption
  memory/               Persistent memory notes
    MEMORY.md
    topics/
    journal/
  skills/               User-installed skills
    .registry.json      ClawHub install metadata
  automation/           Cron and webhook task logs
  engine.url            Discovery file: HTTP URL
  engine.pid            Daemon PID
  engine.token          Master auth token (mode 0600)
  engine.log            Daemon stdout/stderr
  engine.heartbeat      Last heartbeat health JSON
```

---

## Design notes

- **Daemon + connector split**: one runtime state, multiple frontends. Closing TUI does not stop the engine.
- **File-based config**: no database. `config.json` v3 is the single source of truth.
- **One Agent per session**: conversation isolation. Main session persists across heartbeats; connector and cron sessions get fresh agents.
- **Streaming-first**: agent yields events as they arrive from the LLM. tRPC subscriptions and SSE webhooks forward with minimal buffering.
- **pi-ai abstraction**: unified streaming interface across Anthropic, OpenAI, Google, OpenRouter. Use type assertion `(getModel as (p: string, m: string) => Model<Api>)` for dynamic strings.
- **Skills are Markdown**: lightweight, version-controllable, shareable via ClawHub. No code execution in skill loading.
- **Audio transcription**: prefers local Whisper, falls back to cloud API.
- **Tool approval is per-connector**: TUI defaults to auto-approve; IM connectors default to `"ask"`.
- **Webhook tasks**: `{{payload}}` interpolation in prompt templates for external service integration.
- **Cron persistence**: tasks survive restarts via `config.json` storage.
