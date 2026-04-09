# Architecture Overview

Esperta Aria is a local-first agent platform. It runs as a durable **runtime daemon** that owns prompt assembly, tools, approvals, sessions, MCP connectivity, automation, and connector-facing interaction streams. Frontends (TUI, Telegram, Slack, Teams, Google Chat, Discord, GitHub, Linear, WeChat, Webhook) are thin **surfaces** that communicate with the runtime over **tRPC** (HTTP + WebSocket) on `127.0.0.1:7420/7421`.

---

## High-level diagram

```text
                              Frontends (stateless)
        +------+  +----------+  +-------+  +-------+  +-------+
        | TUI  |  | Telegram |  | Slack |  | Teams |  | GChat |
        +--+---+  +----+-----+  +---+---+  +---+---+  +---+---+
           |           |            |           |           |
           |   +---------+  +----------+  +--------+  +--------+  +--------+
           |   | Discord |  |  GitHub  |  | Linear |  | WeChat |  | Webhook|
           |   +----+----+  +----+-----+  +----+---+  +----+---+  +----+---+
           |        |            |             |            |            |
           +--------+-----+-----+------+------+------+-----+------+------+
                          |            |
           tRPC (HTTP+WS) |   REST/SSE |
         127.0.0.1:7420/7421           |
                    +-----+------------+-----+
                    |     Engine daemon      |
                    |  +-----------------+   |
                    |  | Agent           |   |     POST /webhook/agent
                    |  |  chat loop      |   |     POST /webhook/tasks/:slug
                    |  |  tool dispatch  |   |<--- POST /webhook/heartbeat
                    |  |  approval flow  |   |
                    |  |  ask_user flow  |   |
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
                      ~/.aria/  (runtime home)
                      aria.db, config.json, secrets.enc,
                      IDENTITY.md, USER.md,
                      HEARTBEAT.md, memory/,
                      skills/, engine.*
```

---

## Subsystems

| Subsystem | Path | Responsibility |
|---|---|---|
| Engine core | `src/engine/` | Runtime bootstrap, tRPC procedures, HTTP+WS server, auth, sessions, scheduler |
| Prompt engine | `src/engine/prompt-engine.ts` | Assemble identity, policy, layered memory, toolset affordances, context files, and session overlays |
| Agent | `src/engine/agent/` | Conversation loop, streaming events, tool dispatch, tool approval, loop detection, result size guard |
| Model Router | `src/engine/router/` | Provider/model config, active model switching, tier-based routing, alias resolution, fallback chains. Wraps `@mariozechner/pi-ai` |
| Config | `src/engine/config/` | `IDENTITY.md`, `config.json` (v3), `USER.md`, `secrets.enc` loading/saving |
| Tools | `src/engine/tools/` | 23 built-in tools plus dynamic `mcp_*` tools. Exec classifier, tool policy manager, background process management, coding agent subprocess infra |
| Memory | `src/engine/memory/` | Layered memory files, retrieval indexing, embeddings, and prompt-context loading |
| Operational store | `src/engine/operational-store.ts` | Durable SQLite store for sessions, messages, runs, tool calls, approvals, prompt cache, and automation state |
| Session archive | `src/engine/session-archive.ts` | Long-form transcript archive, compact summaries, archive-backed history lookup, FTS search |
| Checkpoints | `src/engine/checkpoints.ts` | Shadow-git filesystem snapshots, diff, and rollback for mutating tool calls |
| Skills | `src/engine/skills/` | Skill discovery, loading (bundled + user), activation, prompt integration via `SKILL.md` |
| MCP | `src/engine/mcp.ts` | Connect configured MCP servers, surface remote tools, resources, and prompts |
| Audio | `src/engine/audio/` | Audio transcription -- prefers local Whisper, falls back to cloud API |
| Connectors | `src/connectors/` | TUI (Ink + React), Telegram, WeChat long-poll connector, Chat SDK connectors (Slack, Teams, Google Chat, Discord, GitHub, Linear), shared stream handler |
| CLI | `src/cli/` | `aria` command entry point, daemon control, onboarding wizard, config editor |
| Shared | `src/shared/` | Typed tRPC client factory, cross-layer types, connector base, markdown formatting |

---

## Engine startup flow

1. Spawn detached Bun process (`src/engine/index.ts`)
2. `ConfigManager.load()` -- load or create `~/.aria/config.json` (v3), `IDENTITY.md`
3. `MemoryManager.init()` -- ensure `~/.aria/memory/` exists
4. `SessionArchiveManager.init()` -- open `~/.aria/session-archive.sqlite`
5. `OperationalStore.init()` -- open `~/.aria/aria.db` with restart-safe operational state
6. Inject `runtime.env` -- plain env vars from config (env vars take precedence)
7. `config.loadSecrets()` -- decrypt `secrets.enc`, inject API keys into `process.env`
8. Validate provider API keys -- warn if any `apiKeyEnvVar` is missing
9. `ModelRouter.fromConfig()` -- build provider/model registry, set default model, init tiers/aliases/fallbacks
10. `SkillRegistry.loadAll()` -- load bundled + user-installed skills
11. `CheckpointManager()` -- prepare per-turn snapshotting for mutating tools
12. `MCPManager.init()` -- connect configured MCP servers and discover remote tools/resources/prompts
13. Build tools (23 built-ins + any dynamic `mcp_*` tools)
14. `PromptEngine.buildBasePrompt()` -- compose identity, policy, memory, toolsets, skills, and context files
15. `createTranscriber()` -- local Whisper if available, else cloud API
16. `SessionManager()` + `AuthManager.init()` -- generate master token
17. Create main session (`main:<uuid8>`) and main agent
18. Ensure `HEARTBEAT.md` exists
19. `Scheduler.start()` -- register built-in heartbeat task
20. Restore persisted cron and webhook task records
21. `startServer()` -- bind HTTP (7420) + WS (7421) listeners
22. Start connector surfaces explicitly as needed (`aria telegram`, `aria wechat`, `aria slack`, etc.)

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

## Context Enrichment

Before a normal chat turn reaches the model, Esperta Aria enriches the user message in three stages:

1. **Project context files**: the runtime auto-loads the nearest `.aria.md`, `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` file into the system prompt. As tools move into subdirectories, matching context files are appended as tool-result hints.
2. **Inline `@` references**: `chat.stream` expands `@file:path[:start-end]`, `@folder:path`, `@diff`, `@staged`, and `@url:https://...` into attached context blocks before the model sees the turn.
3. **Memory context**: after reference expansion, Esperta Aria queries persistent memory using the expanded message and prepends any relevant `<memory_context>` block.

`@` references are constrained to the active workspace root and warn instead of expanding when a path escapes the workspace or hits a blocked secret location.

---

## Streaming events

| Event | Fields | Description |
|---|---|---|
| `text_delta` | `delta` | Incremental text output |
| `thinking_delta` | `delta` | Incremental thinking/reasoning output |
| `tool_start` | `name`, `id` | Tool execution started |
| `tool_end` | `name`, `id`, `content`, `isError` | Tool execution finished with result |
| `tool_approval_request` | `name`, `id`, `args` | Connector must approve or reject |
| `user_question` | `id`, `question`, `options?` | Agent asks user a clarifying question |
| `reaction` | `emoji` | Emoji reaction to forward to IM connector |
| `done` | `stopReason` | Chat turn complete |
| `error` | `message` | Error occurred |

Event filtering by `ToolPolicyManager`: verbosity levels (`verbose`/`minimal`/`silent`) and per-tool overrides control which events reach each connector. See `tools/README.md`.

---

## Authorization Model

Esperta Aria separates authentication from authorization:

- **Master token** calls are trusted for engine-wide administration.
- **Session token** calls are limited to the paired connector's own
  `connectorId` + `connectorType` scope.
- **Webhook token** calls are accepted only on `/webhook/*` HTTP routes and are
  rejected by the tRPC middleware.

In practice, session-scoped callers can chat, list/resume their own sessions,
and answer pending approvals/questions for those sessions, but they cannot
enumerate other connectors' sessions, manage automation, inspect MCP surfaces,
or restart the engine.

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
4. Memory guide + current memory context (from `~/.aria/memory/`)
5. Skills directive + available skills list (`read_skill` before replying)
6. Skill learning guide (`skill_manage` for reusable workflows)
7. Project context files (`.aria.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`) if discovered
8. Reactions guide (when to react with emoji vs. reply)
9. Group Chat guide (name-prefixed messages, address by name)
10. Safety advisory (no independent goals, human oversight)
11. User Profile (from `USER.md`, if present)
12. Session heartbeat (current date/time + active model name)

---

## tRPC API surface

| Namespace | Procedure | Type | Description |
|---|---|---|---|
| `health` | `ping` | query | Status, uptime, sessions, model, agentName. **Unauthenticated.** |
| `chat` | `send` | mutation | Touch session, non-streaming send |
| `chat` | `stream` | subscription | Stream `EngineEvent` values for a chat turn |
| `chat` | `stop` | mutation | Cancel running agent work for a session |
| `chat` | `stopAll` | mutation | Cancel all running agent work across sessions |
| `chat` | `history` | query | Message history for a session |
| `chat` | `transcribeAndSend` | subscription | Transcribe audio, then stream chat response |
| `session` | `create` | mutation | Create a new session |
| `session` | `getLatest` | query | Most recently active session for a prefix |
| `session` | `list` | query | List all active sessions |
| `session` | `listArchived` | query | List recent archived sessions |
| `session` | `search` | query | Search archived session transcripts and summaries |
| `session` | `destroy` | mutation | Destroy session and agent |
| `checkpoint` | `list` | query | List rollback checkpoints for a session or working directory |
| `checkpoint` | `diff` | query | Diff current working tree against a checkpoint |
| `checkpoint` | `restore` | mutation | Restore a checkpoint, optionally for one file |
| `toolset` | `list` | query | List builtin and dynamic toolsets |
| `mcp` | `listServers` | query | List configured MCP servers and connection state |
| `mcp` | `listTools` | query | List connected MCP tools |
| `mcp` | `listPrompts` | query | List prompts from an MCP server |
| `mcp` | `getPrompt` | query | Resolve an MCP prompt to concrete content |
| `mcp` | `listResources` | query | List resources from an MCP server |
| `mcp` | `readResource` | query | Read a resource from an MCP server |
| `tool` | `config` | query | Tool approval mode for a session |
| `tool` | `approve` | mutation | Approve/reject a pending tool call |
| `tool` | `acceptForSession` | mutation | Auto-approve tool for rest of session |
| `question` | `answer` | mutation | Answer a pending agent question |
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
| `skill` | `reload` | mutation | Reload bundled and user skills from disk and refresh the runtime skill catalog |
| `auth` | `pair` | mutation | Device-flow pairing. **Unauthenticated.** |
| `auth` | `code` | query | Generate one-time pairing code. **Unauthenticated.** |
| `cron` | `list` | query | List scheduled tasks |
| `cron` | `add` | mutation | Add a cron task |
| `cron` | `update` | mutation | Update a cron task in place |
| `cron` | `pause` | mutation | Pause a cron task without deleting it |
| `cron` | `resume` | mutation | Resume a paused cron task |
| `cron` | `run` | mutation | Trigger a cron task immediately |
| `cron` | `remove` | mutation | Remove a user-defined cron task |
| `webhookTask` | `list` | query | List webhook tasks |
| `webhookTask` | `add` | mutation | Add a webhook task |
| `webhookTask` | `update` | mutation | Update a webhook task |
| `webhookTask` | `remove` | mutation | Remove a webhook task |
| `heartbeat` | `status` | query | Heartbeat config, last result, main session ID |
| `heartbeat` | `configure` | mutation | Update heartbeat enabled/interval |
| `heartbeat` | `trigger` | mutation | Manually trigger heartbeat |
| `engine` | `shutdown` | mutation | Gracefully shut down the engine |
| `engine` | `restart` | mutation | Restart the engine (marker-based) |
| `mainSession` | `info` | query | Main session metadata |

---

## Config directory layout

```text
~/.aria/
  config.json           Config v3: runtime + providers + models + automation
  IDENTITY.md           Agent personality and base system prompt
  USER.md               User profile (optional)
  HEARTBEAT.md          Heartbeat checklist
  secrets.enc           Encrypted API keys and secrets
  .salt                 Salt for secrets encryption
  memory/               Persistent memory notes
    MEMORY.md
    project/
    journal/
  skills/               User-installed skills
    .registry.json      ClawHub install metadata
  session-archive.sqlite Persisted session transcripts + FTS search index
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
- **Session archive**: completed turns are synced to a local SQLite archive so `chat.history` survives agent teardown and archived sessions can be searched by content.
- **Graceful shutdown**: engine stop/restart flushes live session archives, aborts pending work, and closes long-lived subsystems (MCP, memory, auth cleanup) before exit.
- **Streaming-first**: agent yields events as they arrive from the LLM. tRPC subscriptions and SSE webhooks forward with minimal buffering.
- **pi-ai abstraction**: unified streaming interface across Anthropic, OpenAI, Google, OpenRouter. Use type assertion `(getModel as (p: string, m: string) => Model<Api>)` for dynamic strings.
- **Chat SDK adapter pattern**: six connectors (Slack, Teams, Google Chat, Discord, GitHub, Linear) share a single `ChatSDKAdapter` class that bridges Chat SDK events to Esperta Aria's tRPC client. Platform-specific code is limited to adapter instantiation and webhook server setup. WeChat is the one native long-poll connector today because Tencent's API is not exposed through Chat SDK.
- **Skills are Markdown**: lightweight, version-controllable, shareable via ClawHub. No code execution in skill loading.
- **Audio transcription**: prefers local Whisper, falls back to cloud API.
- **Tool approval is per-connector**: TUI defaults to auto-approve; IM connectors default to `"ask"`.
- **Authorization is token-scoped**: session tokens are bound to the paired connector identity; master token is required for admin procedures.
- **ask_user flow**: agent yields `user_question` event, blocks via `onAskUser` callback, resumes when connector forwards the answer via `question.answer` tRPC mutation. 10-minute timeout.
- **Coding agent delegation**: `claude_code` and `codex` tools use the `AgentSubprocess` infrastructure for lifecycle management, auth probing, structured output, and background execution.
- **Webhook tasks**: `{{payload}}` interpolation in prompt templates for external service integration.
- **Cron persistence**: tasks survive restarts via `config.json` storage.
- **Runtime control**: `/stop`, `/restart`, `/shutdown` commands available across all connectors for agent abort, engine restart, and shutdown.
