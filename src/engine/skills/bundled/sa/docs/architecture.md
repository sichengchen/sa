# SA Architecture

SA is a personal AI agent assistant. It runs as a **daemon (Engine)** that owns all
state --- config, model router, tools, memory, skills, sessions, auth, and scheduler.
Frontends (TUI, Telegram, Discord, Webhook) are stateless **Connectors** that
communicate with the Engine over **tRPC** (HTTP + WebSocket) on `127.0.0.1:7420/7421`.

---

## 1. High-level architecture

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

The CLI (`sa`) serves as both a launcher and a management interface. It can start/stop
the daemon, open the TUI connector, run the onboarding wizard, or invoke the
interactive config editor. The Engine itself is a separate long-running Bun process.

---

## 2. Subsystem table

| Subsystem | Path | Responsibility |
|---|---|---|
| Engine core | `src/engine/` | Runtime bootstrap (`runtime.ts`), tRPC procedures (`procedures.ts`), HTTP+WS server (`server.ts`), auth (`auth.ts`), sessions (`sessions.ts`), scheduler (`scheduler.ts`) |
| Agent | `src/engine/agent/` | Conversation loop, streaming events, tool dispatch, tool approval, loop detection, result size guard |
| Model Router | `src/engine/router/` | Provider/model configuration, active model switching, tier-based routing, alias resolution, fallback chains. Wraps `@mariozechner/pi-ai` |
| Config | `src/engine/config/` | `IDENTITY.md`, `config.json` (v3), `USER.md`, `secrets.enc` loading, saving, and migration |
| Tools | `src/engine/tools/` | 14 built-in tools across three danger tiers. Includes exec classifier, tool policy manager, and background process management |
| Memory | `src/engine/memory/` | Memory directory initialization, persistence helpers, context loading for system prompt |
| Skills | `src/engine/skills/` | Skill discovery, loading (bundled + `~/.sa/skills/`), activation, and prompt integration via `SKILL.md` |
| ClawHub skill | `src/engine/skills/bundled/clawhub/` | Self-contained bundled skill for skill search, install, and update via ClawHub |
| Audio | `src/engine/audio/` | Audio transcription --- prefers local Whisper, falls back to cloud API |
| Connectors | `src/connectors/` | TUI (Ink + React), Telegram (Grammy), Discord (Discord.js), shared stream handler |
| CLI | `src/cli/` | `sa` command entry point, daemon control (`engine start/stop/status/logs/restart`), onboarding wizard, config editor |
| Shared | `src/shared/` | Typed tRPC client factory (`client.ts`), cross-layer types (`types.ts`), connector base, markdown formatting |

---

## 3. Engine startup flow

When `sa engine start` is invoked, it spawns a detached Bun process running
`src/engine/index.ts`. That process calls `createRuntime()` to bootstrap every
subsystem, then `startServer()` to bind the HTTP+WS listeners.

```text
sa engine start
  |
  +-- spawns: bun run src/engine/index.ts
       |
       +-- createRuntime()
       |    |
       |    +-- ConfigManager.load()
       |    |     Load or create ~/.sa/config.json (v3), IDENTITY.md
       |    |
       |    +-- MemoryManager.init()
       |    |     Ensure ~/.sa/memory/ directory exists
       |    |
       |    +-- Inject runtime.env
       |    |     Plain env vars from config.json (env vars take precedence)
       |    |
       |    +-- config.loadSecrets()
       |    |     Decrypt secrets.enc -> inject API keys into process.env
       |    |     (env vars > secrets > plain config)
       |    |
       |    +-- Validate provider API keys
       |    |     Warn early if any provider's apiKeyEnvVar is missing
       |    |
       |    +-- ModelRouter.fromConfig()
       |    |     Build provider/model registry, set default model,
       |    |     initialize tier mapping, aliases, task-tier overrides,
       |    |     validate fallback chains
       |    |
       |    +-- SkillRegistry.loadAll()
       |    |     Load bundled skills (src/engine/skills/bundled/*) +
       |    |     user-installed skills (~/.sa/skills/*)
       |    |
       |    +-- Build tools (14 total)
       |    |     9 builtins (read, write, edit, exec, exec_status, exec_kill,
       |    |     web_fetch, web_search, reaction) +
       |    |     5 context-bound (remember, read_skill,
       |    |     set_env_secret, set_env_variable, notify)
       |    |
       |    +-- Assemble system prompt
       |    |     identity + tools section + tool call style guide +
       |    |     reactions guide + group chat guide + safety advisory +
       |    |     user profile + session heartbeat + memory context +
       |    |     skills directive + available_skills list
       |    |
       |    +-- createTranscriber()
       |    |     Local Whisper if available, else cloud API backend
       |    |
       |    +-- SessionManager()
       |    +-- AuthManager.init()
       |    |     Generate master token -> write to ~/.sa/engine.token
       |    |
       |    +-- Create main session
       |    |     sessions.create("main", "engine") -> "main:<uuid8>"
       |    |
       |    +-- Create main agent
       |    |     Used by heartbeat and engine-level tasks
       |    |
       |    +-- Ensure HEARTBEAT.md exists
       |    |     Create from default template if missing
       |    |
       |    +-- Scheduler.start()
       |    |     Register built-in heartbeat task (*/30 * * * *)
       |    |
       |    +-- Restore persisted cron tasks from config.json
       |         For each enabled cronTask in runtime.automation.cronTasks:
       |           create isolated session (cron:<name>:<id>)
       |           run agent with task's prompt
       |
       +-- startServer(runtime)
       |    |
       |    +-- HTTP server (Bun.serve, default port 7420)
       |    |     Routes:
       |    |       GET  /health               -> { status, uptime, sessions, model }
       |    |       POST /webhook/agent        -> direct agent chat (JSON or SSE)
       |    |       POST /webhook              -> legacy alias for /webhook/agent
       |    |       POST /webhook/heartbeat    -> trigger heartbeat immediately
       |    |       POST /webhook/tasks/:slug  -> run a configured webhook task
       |    |       /trpc/*                    -> tRPC fetch handler
       |    |
       |    +-- WebSocket server (port 7421)
       |    |     tRPC subscriptions (chat.stream, chat.transcribeAndSend)
       |    |     Token extracted from ?token= query parameter
       |    |
       |    +-- Write ~/.sa/engine.url
       |
       +-- Auto-start connectors (if tokens configured)
            Telegram, Discord
```

---

## 4. Three-tier session model

Sessions are the unit of conversation state. Each session maps to exactly one Agent
instance that holds its own message history. Session IDs follow a structured
`<prefix>:<suffix>` format where the suffix is an 8-character UUID fragment.

### Session types

| Tier | ID pattern | Creator | Purpose |
|---|---|---|---|
| Main session | `main:<id>` | Engine startup | Engine-level tasks: heartbeat, orchestration. One per engine lifetime. |
| Connector sessions | `tui:<id>`, `telegram:<chatId>:<id>`, `discord:<channelId>:<id>`, `webhook:<id>` | Connector via `session.create` | User-facing conversations. One agent per session. |
| Automation sessions | `cron:<task-name>:<id>`, `webhook:<slug>:<id>` | Scheduler / webhook handler | Isolated, ephemeral sessions for background tasks. |

### Session ID structure

The `SessionManager` provides utilities to parse session IDs:

- `SessionManager.getPrefix("telegram:123456:e5f6")` returns `"telegram:123456"` --- everything before the last colon.
- `SessionManager.getType("telegram:123456:e5f6")` returns `"telegram"` --- the first segment.
- `sessions.getLatest("telegram:123456")` returns the most recently active session under that prefix.

### Session lifecycle

1. **Creation** --- `sessions.create(prefix, connectorType)` generates a new ID and stores the session.
2. **Agent binding** --- On first `chat.stream` call, `getSessionAgent()` lazily creates an `Agent` with the runtime's tools, system prompt, and an approval callback wired to the session's connector type.
3. **Touch** --- Every chat message calls `touchSession()` to update `lastActiveAt`.
4. **Destruction** --- `session.destroy` removes the session and its agent from memory. Connector sessions are destroyed on disconnect; cron sessions are ephemeral.

### Connector types

`ConnectorType = "tui" | "telegram" | "discord" | "webhook" | "engine" | "cron"`

Each connector type has its own default tool approval mode and tool verbosity level,
configured in `config.json`:

```json
{
  "toolApproval": { "tui": "never", "telegram": "ask", "discord": "ask", "webhook": "never" },
  "toolPolicy": {
    "verbosity": { "tui": "minimal", "telegram": "silent", "discord": "silent", "webhook": "silent" }
  }
}
```

---

## 5. Agent loop internals

The `Agent` class in `src/engine/agent/agent.ts` implements the core chat loop. Each
call to `agent.chat(userText)` is an async generator that yields `AgentEvent` values.

### Chat loop

```text
agent.chat(userText)
  |
  +-- Push UserMessage to message history
  +-- Start timeout timer (default 10 minutes)
  +-- Initialize ToolLoopDetector
  |
  +-- LOOP (unbounded, exits on natural completion / timeout / circuit breaker):
       |
       +-- Build Context { systemPrompt, messages, tools }
       +-- model = router.getModel()
       +-- streamOpts = router.getStreamOptions()
       +-- eventStream = pi-ai.stream(model, context, streamOpts)
       |
       +-- For each streaming event:
       |     text_delta      -> yield { type: "text_delta", delta }
       |     thinking_delta  -> yield { type: "thinking_delta", delta }
       |     toolcall_end    -> collect ToolCall, yield tool_start
       |     done            -> see below
       |     error           -> yield error, return
       |
       +-- On done:
            If reason === "toolUse" and toolCalls.length > 0:
              For each tool call:
                1. Check timeout
                2. If onToolApproval callback set:
                     yield tool_approval_request
                     await approval (Promise resolves via tool.approve tRPC call)
                     if rejected: push rejection as tool result, continue
                3. Loop detection pre-check:
                     "block"  -> push blocked result, skip execution
                     "circuit_breaker" -> yield error, terminate loop
                4. Execute tool via registry
                5. Cap result size (default 400,000 chars)
                6. Loop detection post-check (may yield warning)
                7. yield tool_end with result
                8. Push ToolResultMessage to history
              Continue LOOP (send tool results back to LLM)
            Else:
              yield { type: "done", stopReason }
              Return (natural completion)
```

### Tool dispatch

Tools are registered in a `ToolRegistry`. Each tool implements the `ToolImpl` interface:

```typescript
interface ToolImpl {
  name: string;
  description: string;
  summary?: string;            // Richer description for system prompt
  dangerLevel: DangerLevel;    // "safe" | "moderate" | "dangerous"
  parameters: TSchema;         // TypeBox schema for validation
  execute: (args) => Promise<ToolResult>;
}
```

The 17 built-in tools and their danger levels:

| Tool | Danger Level | Description |
|---|---|---|
| `read` | safe | Read file contents |
| `write` | moderate | Write/create files |
| `edit` | moderate | Patch files (search-and-replace) |
| `exec` | dangerous* | Execute shell commands (*hybrid classification) |
| `exec_status` | safe | Check background process status |
| `exec_kill` | dangerous | Kill a background process |
| `web_fetch` | safe | Fetch a URL |
| `web_search` | safe | Web search |
| `reaction` | safe | Send an emoji reaction |
| `remember` | safe | Persist a memory note |
| `read_skill` | safe | Load a skill's full content |
| `set_env_secret` | moderate | Store an encrypted secret |
| `set_env_variable` | moderate | Set a plain environment variable |
| `notify` | safe | Send a notification to a connector |

### Approval flow

The approval flow is a three-tier system based on tool danger level and connector type:

1. **Safe tools** --- always auto-approved, regardless of connector or mode.
2. **Moderate tools** --- auto-approved unless the connector's `toolApproval` mode is `"always"`.
3. **Dangerous tools** --- always require explicit approval, even when the connector mode is `"never"`.

For the `exec` tool specifically, the engine uses **hybrid classification**: the agent
declares a `danger` parameter (`"safe"`, `"moderate"`, or `"dangerous"`), but the
engine independently classifies the command using pattern matching
(`exec-classifier.ts`). Pattern-based overrides take priority:

- Patterns matching destructive operations (rm -rf, sudo, kill, chmod, pipe-to-shell, etc.) are always classified as `"dangerous"`.
- Simple read-only commands (ls, cat, git status, pwd, etc.) are always classified as `"safe"`.
- Everything else trusts the agent's self-declared level.

When approval is required, the engine yields a `tool_approval_request` event. The
connector presents this to the user. The user can:

- **Approve** the call (`tool.approve({ toolCallId, approved: true })`)
- **Reject** the call (`tool.approve({ toolCallId, approved: false })`)
- **Accept for session** (`tool.acceptForSession({ toolCallId })`) --- auto-approves the current call and all future calls to the same tool name within this session

Pending approvals time out after 5 minutes.

### Tool loop detection

The `ToolLoopDetector` tracks recent tool calls within a sliding window and applies
escalating countermeasures:

| Threshold | Default | Action |
|---|---|---|
| Warn | 10 repeats | Yield a warning event |
| Block | 20 repeats | Skip execution, return error result |
| Circuit breaker | 30 repeats | Terminate the agent loop entirely |

### Tool result size guard

Tool results exceeding `maxToolResultChars` (default 400,000 characters) are truncated
with a suffix indicating the truncation occurred. This prevents excessively large tool
outputs from consuming the model's context window.

### Streaming events

The agent yields `AgentEvent` types internally. These are filtered and transformed by
`filterAgentEvents()` in `procedures.ts` before being sent to connectors as
`EngineEvent` values over tRPC.

---

## 6. Streaming events

Events emitted during a chat turn, transported via tRPC subscriptions or SSE:

| Event | Fields | Description |
|---|---|---|
| `text_delta` | `delta: string` | Incremental text output from the model |
| `thinking_delta` | `delta: string` | Incremental thinking/reasoning output (extended thinking models) |
| `tool_start` | `name: string`, `id: string` | Tool execution started. TUI only; IM connectors receive a compact summary at `tool_end` instead. |
| `tool_end` | `name: string`, `id: string`, `content: string`, `isError: boolean` | Tool execution finished with result |
| `tool_approval_request` | `name: string`, `id: string`, `args: Record<string, unknown>` | Connector must approve or reject a tool call |
| `reaction` | `emoji: string` | Emoji reaction to forward to IM connector (intercepted from the `reaction` tool) |
| `done` | `stopReason: string` | Chat turn complete |
| `error` | `message: string` | Error occurred |

### Event filtering (ToolPolicyManager)

The `ToolPolicyManager` controls which tool events are emitted to each connector type.
It uses per-connector **verbosity** levels and optional per-tool **overrides**:

| Verbosity | tool_start shown | tool_end shown |
|---|---|---|
| `verbose` | All tools | All tools |
| `minimal` | Moderate + dangerous | Errors + dangerous |
| `silent` | Dangerous only (or long-running >10s) | Errors only |

Per-tool overrides (`"always"`, `"never"`, `"on_error"`) take precedence over verbosity.

For IM connectors (Telegram, Discord), `tool_start` events are converted to compact
`tool_end` summaries showing the relevant argument (command for exec, path for
read/write, query for search, etc.).

---

## 7. Model router flow

The `ModelRouter` wraps `@mariozechner/pi-ai`'s `getModel()` to provide:

### Provider resolution

```text
router.getModel(name?)
  |
  +-- Look up ModelConfig by name (or activeModelName)
  +-- Look up ProviderConfig by config.provider
  +-- Resolve API key: process.env[apiKeyEnvVar] > secrets.enc > error
  +-- If provider has a baseUrl (custom endpoint):
  |     Return a synthetic Model object with openai-completions API
  +-- Else:
        Call pi-ai getModel(providerType, modelId) with type assertion
```

Because `pi-ai`'s `getModel()` requires literal type parameters, SA uses the pattern:

```typescript
(getModel as (p: string, m: string) => Model<Api>)(providerType, modelId)
```

### Task-tier routing

The router supports routing different task types to different model tiers:

```text
getModelForTask(taskType)
  |
  +-- Resolve tier: taskTierOverrides[task] ?? DEFAULT_TASK_TIER[task] ?? "normal"
  +-- Resolve model: tierModels[tier] ?? activeModelName
  +-- Return getModel(modelName)
```

**Model tiers:** `performance`, `normal`, `eco`

**Task types and default tier mappings:**

| Task Type | Default Tier |
|---|---|
| `chat` | performance |
| `tool_use` | performance |
| `reasoning` | performance |
| `classification` | eco |
| `summarization` | eco |
| `transcription` | eco |

All mappings are overridable via `config.json`:

```json
{
  "runtime": {
    "modelTiers": {
      "performance": "opus",
      "normal": "sonnet",
      "eco": "haiku"
    },
    "taskTierOverrides": {
      "classification": "normal"
    }
  }
}
```

### Model aliases

Short names can be mapped to full model config names:

```json
{
  "runtime": {
    "modelAliases": {
      "fast": "haiku",
      "smart": "opus"
    }
  }
}
```

`router.resolveAlias("fast")` returns `"haiku"`. The `model.switch` procedure resolves
aliases before switching.

### Fallback chains

Each model config can specify a `fallback` model name. When the primary model's
provider fails (e.g., API key missing), the router attempts the fallback. Circular
fallback chains are detected and rejected at startup.

---

## 8. System prompt assembly

The system prompt is assembled once at engine startup from multiple components:

```text
1. Identity prompt          (from IDENTITY.md: personality + base system prompt)
2. Available Tools section  (formatted list: "- toolName [dangerLevel]: summary")
3. Tool Call Style guide    (safe/moderate/dangerous narration rules, exec danger param)
4. Reactions guide          (when to react with emoji vs. reply with text)
5. Group Chat guide         (name-prefixed messages, address by name, stay concise)
6. Safety advisory          (no independent goals, human oversight, safeguard compliance)
7. User Profile             (from USER.md, if present)
8. Session heartbeat        (current date/time + active model name)
9. Memory context           (loaded from ~/.sa/memory/ files)
10. Skills directive        (mandatory scan of available_skills, read_skill before replying)
11. Available skills list   (name + description for each loaded skill)
```

Each component is separated by newlines and concatenated into a single string stored
as `runtime.systemPrompt`.

---

## 9. TUI flow

```text
sa (no arguments)
  |
  +-- If no ~/.sa/config.json: run onboarding wizard
  +-- ensureEngine()
  |     Start daemon if not already running
  |     Wait for /health to respond
  |
  +-- Read ~/.sa/engine.url and ~/.sa/engine.token
  +-- Create tRPC client (HTTP for queries/mutations, WS for subscriptions)
  +-- auth.pair(masterToken, "tui", "tui")
  |     Exchange master token for a session token
  |
  +-- session.create({ connectorType: "tui", prefix: "tui" })
  |     Returns session with ID like "tui:a1b2c3d4"
  |
  +-- Render Ink TUI (React terminal UI)
       |
       +-- User types message
       +-- chat.stream({ sessionId, message })
       |     Subscribe to streaming events
       |
       +-- Render events:
       |     text_delta        -> append to response display
       |     thinking_delta    -> show in thinking indicator
       |     tool_start        -> show tool execution card (TUI only)
       |     tool_end          -> update tool card with result
       |     tool_approval_request -> prompt user: [y]es / [n]o / [a]lways
       |     done              -> mark turn complete
       |     error             -> display error message
       |
       +-- On quit: session.destroy, disconnect
```

---

## 10. Webhook flow

The Engine exposes three webhook endpoints. All require `webhook.enabled: true` in
config and authenticate via Bearer token or legacy shared secret.

### POST /webhook/agent (direct agent chat)

```text
POST /webhook/agent
  |
  +-- Verify webhook.enabled
  +-- Parse JSON body: { message, sessionId? }
  +-- Authenticate (Bearer token)
  +-- Create or resume session (connectorType=webhook)
  |
  +-- If Accept: text/event-stream:
  |     SSE streaming response
  |     Same EngineEvent types as tRPC subscriptions
  |     Each event: "data: {json}\n\n"
  |
  +-- Else:
        Synchronous JSON response
        Collect all text_delta and tool_end events
        Return: { sessionId, response, toolCalls }
```

### POST /webhook/tasks/:slug (routed automation tasks)

```text
POST /webhook/tasks/:slug
  |
  +-- Verify webhook.enabled
  +-- Authenticate (Bearer token)
  +-- Look up task by slug in config.runtime.automation.webhookTasks
  +-- Parse request body as JSON payload
  +-- Truncate payload if >10,000 chars
  +-- Interpolate {{payload}} in task's prompt template
  +-- Create isolated session: webhook:<slug>:<id>
  +-- Dispatch to new Agent instance
  +-- Log result to ~/.sa/automation/webhook-<slug>-<timestamp>.log
  +-- If task.connector configured: send result via notify tool
  +-- Return: { slug, task, response, sessionId }
```

### POST /webhook/heartbeat (trigger heartbeat)

```text
POST /webhook/heartbeat
  |
  +-- Verify webhook.enabled
  +-- Authenticate (Bearer token)
  +-- Verify heartbeat is enabled
  +-- Call scheduler.tick() to run heartbeat immediately
  +-- Return: { triggered, lastResult }
```

---

## 11. tRPC API surface

All procedures require bearer token authentication (via `protectedProcedure`) unless
noted otherwise. Transport: HTTP for queries/mutations, WebSocket for subscriptions.

| Namespace | Procedure | Type | Description |
|---|---|---|---|
| `health` | `ping` | query | Returns `{ status, uptime, sessions, model, agentName }`. **Unauthenticated.** |
| `chat` | `send` | mutation | Touch session, return `{ sessionId }`. Used for non-streaming sends. |
| `chat` | `stream` | subscription | Stream `EngineEvent` values for a chat turn. Core conversation endpoint. |
| `chat` | `history` | query | Return conversation message history for a session. |
| `chat` | `transcribeAndSend` | subscription | Transcribe base64 audio, then stream chat response. Yields transcript as metadata. |
| `session` | `create` | mutation | Create a new session. Input: `{ connectorType, prefix }`. Returns `Session`. |
| `session` | `getLatest` | query | Get most recently active session for a prefix. |
| `session` | `list` | query | List all active sessions. |
| `session` | `destroy` | mutation | Destroy a session and its agent. |
| `tool` | `config` | query | Get the tool approval mode for a session. |
| `tool` | `approve` | mutation | Approve or reject a pending tool call by `toolCallId`. |
| `tool` | `acceptForSession` | mutation | Approve current call and auto-approve the same tool for the rest of the session. |
| `model` | `list` | query | List all model configurations. |
| `model` | `active` | query | Get the active model name. |
| `model` | `switch` | mutation | Switch active model (supports aliases). |
| `model` | `add` | mutation | Add a new model configuration. |
| `model` | `remove` | mutation | Remove a model configuration. Cannot remove the default model. |
| `model` | `tiers` | query | Get the current tier-to-model mapping. |
| `model` | `setTier` | mutation | Assign a model to a tier (performance/normal/eco). |
| `model` | `routing` | query | Get full routing state: tiers, aliases, active/default model. |
| `provider` | `list` | query | List all configured providers. |
| `provider` | `add` | mutation | Add a provider configuration. |
| `provider` | `remove` | mutation | Remove a provider (fails if referenced by models). |
| `skill` | `list` | query | List loaded skills with activation status. |
| `skill` | `activate` | mutation | Manually activate a skill by name. |
| `auth` | `pair` | mutation | Device-flow pairing. Exchange credential for session token. **Unauthenticated.** |
| `auth` | `code` | query | Generate a one-time pairing code for remote device-flow. **Unauthenticated.** |
| `cron` | `list` | query | List all scheduled tasks (built-in and user-defined). |
| `cron` | `add` | mutation | Add a user-defined cron task with agent dispatch. Persisted to config.json. |
| `cron` | `remove` | mutation | Remove a user-defined cron task. Cannot remove built-in tasks. |
| `webhookTask` | `list` | query | List configured webhook tasks. |
| `webhookTask` | `add` | mutation | Add a webhook task (name, slug, prompt template). |
| `webhookTask` | `update` | mutation | Update an existing webhook task's fields. |
| `webhookTask` | `remove` | mutation | Remove a webhook task by slug. |
| `heartbeat` | `status` | query | Get heartbeat config, last result, and main session ID. |
| `heartbeat` | `configure` | mutation | Update heartbeat enabled/interval (in-memory). |
| `heartbeat` | `trigger` | mutation | Manually trigger a heartbeat check. |
| `mainSession` | `info` | query | Get main session metadata (session ID and state). |

---

## 12. Auth model

### Master token

On startup, `AuthManager.init()` generates a 32-byte random hex token and writes it to
`~/.sa/engine.token` with mode `0600`. Local connectors (TUI, auto-started Telegram/Discord)
read this file to authenticate.

### Device-flow pairing

Remote connectors that cannot read the local filesystem use a pairing flow:

1. User runs `sa` TUI or calls `auth.code` to get a 6-character alphanumeric pairing code
   (charset: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` --- no ambiguous 0/O/1/I characters).
2. Remote connector calls `auth.pair({ credential: code, connectorId, connectorType })`.
3. If the code matches the active pairing code, it is consumed (one-time use) and a new
   session token is returned.
4. The session token is used as a Bearer credential for all subsequent tRPC calls.

### Token validation

Every protected tRPC procedure passes through the auth middleware:

```text
Request arrives
  |
  +-- Extract token from:
  |     HTTP: Authorization: Bearer <token>
  |     WS:   ?token=<token> query parameter
  |
  +-- AuthManager.validate(token)
  |     Master token -> always valid, connectorId="master"
  |     Paired token -> look up in pairedTokens map
  |     Otherwise    -> UNAUTHORIZED
  |
  +-- Attach connectorId to context
```

### Webhook authentication

Webhook endpoints use a separate auth path:

- **Bearer token**: `Authorization: Bearer <token>` header, matched against `webhook.token` in config.

Uses timing-safe string comparison to prevent timing attacks.

---

## 13. Scheduler and heartbeat

The `Scheduler` is a lightweight interval-based cron runner. It checks all registered
tasks every 60 seconds and runs any whose cron expression matches the current time.

### Cron expression format

Standard 5-field cron: `minute hour day month weekday`

Supported syntax:
- `*` --- every value
- `*/N` --- every N (step)
- `N` --- exact value
- `N,M` --- comma-separated values

### Built-in heartbeat task

The heartbeat task runs on the main session's agent at a configurable interval
(default: every 30 minutes). It:

1. Always writes a health JSON file (`~/.sa/engine.heartbeat`) with PID, memory usage,
   and timestamp for daemon monitoring.
2. If heartbeat is enabled and a main agent exists:
   - Reads `~/.sa/HEARTBEAT.md` (the checklist).
   - Sends it to the main agent with instructions to review each item.
   - If the agent responds with the suppress token (`HEARTBEAT_OK`), the result is
     marked as suppressed (nothing needs attention).
   - Otherwise, the response is logged as requiring user attention.

### User-defined cron tasks

Users can add cron tasks via `cron.add`. Each task:
- Gets its own isolated session (`cron:<name>:<id>`).
- Runs in a fresh Agent instance with the full tool set.
- Logs results to `~/.sa/automation/<name>-<timestamp>.md`.
- Is persisted to `config.json` and restored on engine restart.
- Supports `oneShot: true` for tasks that auto-delete after first execution.

---

## 14. Skills system

Skills follow the agentskills.io Markdown specification. Each skill is a directory
containing a `SKILL.md` file.

### Skill sources

| Source | Path | Example |
|---|---|---|
| Bundled | `src/engine/skills/bundled/<name>/` | `sa`, `podcast`, `translate` |
| User-installed | `~/.sa/skills/<name>/` | Skills installed manually or via ClawHub |

### Skill lifecycle

1. **Discovery**: `SkillRegistry.loadAll()` scans both directories for `SKILL.md` files.
2. **Metadata extraction**: Name, description, and triggers are parsed from the frontmatter.
3. **System prompt integration**: All loaded skills appear in the `<available_skills>` list in the system prompt.
4. **Activation**: When the agent determines a skill applies, it calls `read_skill` to load the full content, which is returned as a tool result and enters the conversation context.

### Skills directive

The system prompt includes a mandatory directive:

> Before replying to each user message, scan the `<available_skills>` list.
> If exactly one skill clearly applies, call `read_skill` to load it, then follow its instructions.
> If multiple could apply, choose the most specific one.
> If none clearly apply, do not read any skill.
> Never read more than one skill up front.

---

## 15. Config directory layout (`~/.sa/`)

```text
~/.sa/
  +-- config.json           Config v3: runtime + providers + models + automation
  +-- IDENTITY.md           Agent personality and base system prompt
  +-- USER.md               User profile (optional, included in system prompt)
  +-- HEARTBEAT.md          Heartbeat checklist for the agent to review
  +-- secrets.enc           Encrypted API keys and secrets
  +-- .salt                 Salt for secrets encryption
  +-- memory/               Persistent memory notes (written by remember tool)
  +-- skills/               User-installed skills (each with SKILL.md)
  +-- automation/           Cron and webhook task logs
  +-- engine.url            Discovery file: HTTP URL of running engine
  +-- engine.pid            PID of the engine process
  +-- engine.token          Master auth token (mode 0600)
  +-- engine.log            Engine stdout/stderr log
  +-- engine.heartbeat      Last heartbeat health JSON
```

---

## 16. Design notes

- **Daemon + connector split** keeps one runtime state while supporting multiple
  frontends. The TUI is just another connector --- closing it does not stop the engine.

- **File-based config** with no database. `config.json` v3 is the single source of
  truth for providers, models, runtime settings, and automation tasks.

- **One Agent per session** ensures conversation isolation. The main session agent
  persists across heartbeat cycles, accumulating context. Connector and cron sessions
  get fresh agents.

- **Streaming-first architecture** --- the agent yields events as they arrive from the
  LLM. The tRPC subscription layer and SSE webhook endpoints forward these events with
  minimal buffering.

- **pi-ai abstraction** --- the `@mariozechner/pi-ai` library provides a unified
  streaming interface across Anthropic, OpenAI, Google, OpenRouter, and other providers.
  The `ModelRouter` wraps this with SA-specific concerns (config persistence, tiers,
  aliases, fallbacks).

- **Three-tier tool safety** (safe/moderate/dangerous) with hybrid exec classification
  provides defense in depth. The engine never blindly trusts the agent's self-assessment
  of command danger; pattern matching enforces hard overrides.

- **Skills are Markdown** --- lightweight, version-controllable, and shareable via
  ClawHub. No code execution in skill loading; they are pure prompt content.

- **Audio transcription** prefers local Whisper when available (zero network cost,
  lower latency), falling back to cloud API for environments without local model
  support.

- **Tool approval is per-connector** --- TUI defaults to auto-approve (the user is
  sitting at the terminal), while IM connectors default to `"ask"` (the user is remote
  and should confirm dangerous operations).

- **Webhook tasks** support `{{payload}}` interpolation in prompt templates, enabling
  integration with external services (CI/CD, monitoring, etc.) without custom code.

- **Cron persistence** --- tasks survive engine restarts because they are stored in
  `config.json` and re-registered during startup.
