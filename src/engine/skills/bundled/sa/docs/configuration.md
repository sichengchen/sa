# Configuration

SA stores all configuration in a local directory (default: `~/.sa/`). Override the location by setting the `SA_HOME` environment variable.

---

## Environment variables

You can set values in your shell profile, a project `.env` file, or via SA's built-in tools at runtime.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic provider API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI provider API key |
| `GOOGLE_AI_API_KEY` | If using Google | Google AI provider API key |
| `OPENROUTER_API_KEY` | If using OpenRouter | OpenRouter provider API key |
| `BRAVE_API_KEY` | Optional | Brave Search API key (enables `web_search` tool) |
| `PERPLEXITY_API_KEY` | Optional | Perplexity API key (fallback for `web_search` tool) |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token (enables Telegram connector) |
| `DISCORD_TOKEN` | Optional | Discord bot token (enables Discord connector) |
| `DISCORD_GUILD_ID` | Optional | Restrict Discord bot to a specific guild |
| `SA_HOME` | Optional | Override config directory (default: `~/.sa/`) |
| `SA_ENGINE_PORT` | Optional | Override Engine HTTP port (default `7420`; WS uses port `7421`) |

API keys are resolved in order: environment variable first, then `secrets.enc`, then `runtime.env`.

---

## Config directory layout

```text
~/.sa/
  IDENTITY.md        # agent name, personality, and system prompt
  USER.md            # user profile and preferences
  HEARTBEAT.md       # heartbeat checklist (checked every interval)
  config.json        # v3 config (runtime + providers + models + automation)
  secrets.enc        # encrypted secrets payload (AES-256-GCM)
  .salt              # salt used for encryption key derivation
  memory/            # memory files
    MEMORY.md
    topics/
  skills/            # local + ClawHub-installed skills
    .registry.json   # ClawHub install metadata
  engine.url         # daemon discovery URL
  engine.pid         # daemon PID
  engine.token       # daemon auth token
  engine.log         # daemon logs
  engine.heartbeat   # heartbeat metadata JSON from scheduler
```

---

## `config.json` (v3)

Single source of truth for runtime settings, providers, models, routing, policy, and automation.

### Full annotated example

```jsonc
{
  "version": 3,

  // --- Runtime settings ---
  "runtime": {
    // Last-active model name, persisted by runtime updates
    "activeModel": "sonnet",

    // Legacy: env var name holding Telegram bot token
    "telegramBotTokenEnvVar": "TELEGRAM_BOT_TOKEN",

    // Memory subsystem
    "memory": {
      "enabled": true,
      "directory": "memory"           // relative to SA_HOME
    },

    // Per-connector tool approval mode
    "toolApproval": {
      "tui": "never",
      "telegram": "ask",
      "discord": "ask",
      "webhook": "never"
    },

    // Webhook connector
    "webhook": {
      "enabled": true,
      "token": "my-bearer-token-123", // preferred: Bearer auth header
      "secret": "legacy-shared-secret" // deprecated: body/header secret
    },

    // Audio transcription
    "audio": {
      "enabled": true,
      "preferLocal": true              // prefer local Whisper over cloud API
    },

    // Plain (non-secret) env vars injected at engine startup
    "env": {
      "SA_LOG_LEVEL": "info"
    },

    // Model tier mapping: tier name -> configured model name
    "modelTiers": {
      "performance": "opus",
      "normal": "sonnet",
      "eco": "haiku"
    },

    // Task-to-tier overrides (override DEFAULT_TASK_TIER built-in mapping)
    "taskTierOverrides": {
      "chat": "performance",
      "classification": "eco",
      "summarization": "eco"
    },

    // Shorthand aliases for model names
    "modelAliases": {
      "fast": "haiku",
      "smart": "opus",
      "default": "sonnet"
    },

    // Tool policy: per-connector verbosity and per-tool overrides
    "toolPolicy": {
      "verbosity": {
        "tui": "minimal",
        "telegram": "silent",
        "discord": "silent",
        "webhook": "silent"
      },
      "overrides": {
        "exec": { "dangerLevel": "dangerous", "report": "always" },
        "web_fetch": { "report": "never" }
      }
    },

    // Heartbeat configuration
    "heartbeat": {
      "enabled": true,
      "intervalMinutes": 30,
      "checklistPath": "HEARTBEAT.md",  // relative to SA_HOME
      "suppressToken": "HEARTBEAT_OK"
    },

    // Automation: cron tasks and webhook-triggered tasks
    "automation": {
      "cronTasks": [
        {
          "name": "daily-summary",
          "schedule": "0 9 * * *",
          "prompt": "Summarize what happened yesterday and list today's priorities.",
          "enabled": true,
          "model": "sonnet"
        },
        {
          "name": "one-time-reminder",
          "schedule": "30 14 * * *",
          "prompt": "Remind me about the 3pm meeting.",
          "enabled": true,
          "oneShot": true,
          "runAt": "2026-02-23T14:30:00Z"
        }
      ],
      "webhookTasks": [
        {
          "name": "deploy-notify",
          "slug": "deploy",
          "prompt": "A deploy event occurred. Payload: {{payload}}. Summarize what was deployed.",
          "enabled": true,
          "model": "haiku",
          "connector": "telegram"
        }
      ]
    }
  },

  // --- Providers ---
  "providers": [
    {
      "id": "anthropic",
      "type": "anthropic",
      "apiKeyEnvVar": "ANTHROPIC_API_KEY"
    },
    {
      "id": "openai",
      "type": "openai",
      "apiKeyEnvVar": "OPENAI_API_KEY"
    },
    {
      "id": "local-ollama",
      "type": "openai-compat",
      "apiKeyEnvVar": "OLLAMA_API_KEY",
      "baseUrl": "http://localhost:11434/v1"
    }
  ],

  // --- Models ---
  "models": [
    {
      "name": "opus",
      "provider": "anthropic",
      "model": "claude-opus-4-20250514",
      "temperature": 0.5,
      "maxTokens": 16384
    },
    {
      "name": "sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250514",
      "temperature": 0.7,
      "maxTokens": 8192,
      "fallback": "haiku"
    },
    {
      "name": "haiku",
      "provider": "anthropic",
      "model": "claude-haiku-3-5-20241022",
      "temperature": 0.7,
      "maxTokens": 4096
    },
    {
      "name": "gpt4",
      "provider": "openai",
      "model": "gpt-4o",
      "temperature": 0.7,
      "maxTokens": 4096,
      "fallback": "sonnet"
    }
  ],

  // Model used as initial router model at startup
  "defaultModel": "sonnet"
}
```

> **Note:** JSON does not support comments. The `jsonc` annotations above are for documentation purposes only. Remove all `//` comments before using in production.

---

## Runtime fields

| Field | Type | Default | Description |
|---|---|---|---|
| `runtime.activeModel` | string | `"sonnet"` | Last active model name, persisted by runtime updates |
| `runtime.telegramBotTokenEnvVar` | string | `"TELEGRAM_BOT_TOKEN"` | Legacy runtime field for Telegram env-var name |
| `runtime.memory.enabled` | boolean | `true` | Enable/disable memory subsystem |
| `runtime.memory.directory` | string | `"memory"` | Memory directory path relative to `SA_HOME` |
| `runtime.toolApproval` | object | see below | Per-connector tool approval mode |
| `runtime.webhook` | object | `{ enabled: false }` | Webhook connector settings |
| `runtime.audio` | object | see below | Audio transcription settings |
| `runtime.env` | object | `{}` | Plain (non-secret) env vars injected at engine startup |
| `runtime.modelTiers` | object | `{}` | Map model tiers to configured model names |
| `runtime.taskTierOverrides` | object | `{}` | Override default task-to-tier mapping |
| `runtime.modelAliases` | object | `{}` | Shorthand aliases for model names |
| `runtime.toolPolicy` | object | see below | Per-connector verbosity and per-tool overrides |
| `runtime.heartbeat` | object | see below | Heartbeat configuration |
| `runtime.automation` | object | `{ cronTasks: [] }` | Automation: cron tasks and webhook-triggered tasks |

---

## Tool approval (`runtime.toolApproval`)

Per-connector approval mode for tool execution. Keys are connector types: `tui`, `telegram`, `discord`, `webhook`, `engine`, `cron`.

| Mode | Behavior |
|---|---|
| `"never"` | Auto-approve all tools (default for TUI and webhook) |
| `"ask"` | Prompt the connector user before executing moderate/dangerous tools (default for Telegram and Discord) |
| `"always"` | Prompt for every tool call, including moderate tools |

Safe tools are always auto-approved regardless of mode. The danger level of each tool determines how approval interacts with the mode:

- **safe** tools: always auto-approved (no prompt ever)
- **moderate** tools: auto-approved in `"never"` and `"ask"` modes; prompt in `"always"` mode
- **dangerous** tools: always prompt unless mode is `"never"`

Default:
```json
{
  "tui": "never",
  "telegram": "ask",
  "discord": "ask",
  "webhook": "never"
}
```

---

## Model tiers (`runtime.modelTiers`)

Model tiers let you assign different models to different performance classes. The engine routes tasks to the appropriate tier, so cheap/fast models handle lightweight work while capable models handle complex tasks.

Three tiers are defined:

| Tier | Intended use | Default |
|---|---|---|
| `"performance"` | Complex reasoning, multi-step tool use, interactive chat | Falls back to `defaultModel` |
| `"normal"` | General-purpose tasks | Falls back to `defaultModel` |
| `"eco"` | Classification, summarization, transcription | Falls back to `defaultModel` |

Configure tiers by mapping each tier name to a model name defined in your `models[]` array:

```json
{
  "runtime": {
    "modelTiers": {
      "performance": "opus",
      "normal": "sonnet",
      "eco": "haiku"
    }
  }
}
```

If a tier is not mapped, the engine uses `defaultModel` as the fallback for that tier.

---

## Task-tier mapping (`runtime.taskTierOverrides`)

The engine assigns each internal task type to a model tier. Default assignments are:

| Task type | Default tier | Description |
|---|---|---|
| `"chat"` | `"performance"` | Interactive conversation |
| `"tool_use"` | `"performance"` | Multi-step tool execution |
| `"reasoning"` | `"performance"` | Complex reasoning chains |
| `"classification"` | `"eco"` | Intent classification, routing decisions |
| `"summarization"` | `"eco"` | Summarizing text or conversation |
| `"transcription"` | `"eco"` | Audio transcription post-processing |

Override any mapping with `taskTierOverrides`:

```json
{
  "runtime": {
    "taskTierOverrides": {
      "classification": "normal",
      "summarization": "performance"
    }
  }
}
```

The resolution chain is: `taskTierOverrides[task]` -> `DEFAULT_TASK_TIER[task]` -> `"normal"` -> model lookup via `modelTiers[tier]` -> `defaultModel`.

---

## Model aliases (`runtime.modelAliases`)

Aliases provide shorthand names that resolve to configured model names. They are useful for referencing models by role rather than by provider-specific name.

```json
{
  "runtime": {
    "modelAliases": {
      "fast": "haiku",
      "smart": "opus",
      "default": "sonnet",
      "cheap": "haiku"
    }
  }
}
```

Aliases are resolved anywhere a model name is accepted (e.g., `/model fast` in the TUI, or the `model` field in cron/webhook tasks). If a name is not found in the alias map, it is treated as a literal model name.

---

## Tool policy (`runtime.toolPolicy`)

Tool policy controls two aspects: (1) which tool events are reported to each connector, and (2) per-tool overrides for danger level and reporting behavior.

### Per-connector verbosity (`toolPolicy.verbosity`)

Each connector type can have a different verbosity level that controls how many tool events the user sees:

| Verbosity | `tool_start` shown | `tool_end` shown | Rationale |
|---|---|---|---|
| `"verbose"` | All tools | All tools | Full visibility for debugging |
| `"minimal"` | Moderate + dangerous | Errors + dangerous results | Balanced: user sees important actions |
| `"silent"` | Dangerous + long-running (>10s) | Errors only | Minimal noise for IM connectors |

Default:
```json
{
  "toolPolicy": {
    "verbosity": {
      "tui": "minimal",
      "telegram": "silent",
      "discord": "silent",
      "webhook": "silent"
    }
  }
}
```

### Per-tool overrides (`toolPolicy.overrides`)

Override the danger level or reporting behavior for individual tools by name:

```json
{
  "toolPolicy": {
    "overrides": {
      "exec": {
        "dangerLevel": "dangerous",
        "report": "always"
      },
      "web_fetch": {
        "report": "never"
      },
      "custom_skill_tool": {
        "dangerLevel": "safe",
        "report": "on_error"
      }
    }
  }
}
```

**`dangerLevel`** overrides the built-in classification. Accepted values:

| Level | Built-in tools at this level |
|---|---|
| `"safe"` | `read`, `web_fetch`, `web_search`, `remember`, `set_env_secret`, `set_env_variable`, `exec_status`, `reaction`, `notify` |
| `"moderate"` | `write`, `edit` |
| `"dangerous"` | `exec`, `bash`, `exec_kill` |

**`report`** controls event emission regardless of verbosity:

| Value | Behavior |
|---|---|
| `"always"` | Always emit `tool_start` and `tool_end` events |
| `"never"` | Never emit events (unless error) |
| `"on_error"` | Only emit `tool_end` when the tool errors |

---

## Webhook connector (`runtime.webhook`)

| Field | Type | Default | Description |
|---|---|---|---|
| `webhook.enabled` | boolean | `false` | Enable the `POST /webhook` endpoint |
| `webhook.token` | string | -- | Bearer token for `Authorization: Bearer <token>` header authentication |

Authentication:

1. If `token` is configured, the request must include `Authorization: Bearer <token>` header. Requests without a valid bearer token are rejected with `401`.
2. If `token` is not configured, all requests to the webhook endpoint are accepted (not recommended for production).

Example request with bearer token:
```bash
curl -X POST http://127.0.0.1:7420/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-bearer-token-123" \
  -d '{"message": "Hello from webhook"}'
```

---

## Audio transcription (`runtime.audio`)

| Field | Type | Default | Description |
|---|---|---|---|
| `audio.enabled` | boolean | `true` | Enable/disable audio transcription |
| `audio.preferLocal` | boolean | `true` | Prefer local Whisper over cloud API when both are available |

---

## Heartbeat (`runtime.heartbeat`)

The engine runs a periodic agent-based heartbeat in the main session. Each cycle, it reads a checklist file, runs the agent to evaluate it, and writes a health file.

| Field | Type | Default | Description |
|---|---|---|---|
| `heartbeat.enabled` | boolean | `true` | Enable/disable the heartbeat agent check |
| `heartbeat.intervalMinutes` | number | `30` | Minutes between heartbeat checks |
| `heartbeat.checklistPath` | string | `"HEARTBEAT.md"` | Path to the checklist file, relative to `SA_HOME` |
| `heartbeat.suppressToken` | string | `"HEARTBEAT_OK"` | Token the agent returns to indicate nothing needs attention |

Behavior:

- The heartbeat writes `engine.heartbeat` (JSON with `timestamp`, `pid`, `memory`, `agentRan`, `suppressed`, `response`) every cycle regardless of whether the agent runs.
- If `enabled` is `true` and a main agent session exists, the agent is invoked with the checklist content.
- If the agent responds with exactly the `suppressToken` value, no notification is sent to the user.
- If the agent response is anything else, it is logged and (if configured) forwarded to the user via the `notify` tool.

Default `HEARTBEAT.md` content:
```markdown
# Heartbeat checklist
- Check if any background tasks have completed -- summarize results
- If idle for 8+ hours, send a brief check-in
```

Edit `~/.sa/HEARTBEAT.md` to customize what gets checked on each heartbeat cycle.

---

## Automation (`runtime.automation`)

Automation covers cron-scheduled tasks and webhook-triggered tasks. Both execute agent prompts in isolated sessions.

### Cron tasks (`automation.cronTasks`)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique human-readable task name |
| `schedule` | string | Yes | 5-field cron expression: `minute hour day month weekday` |
| `prompt` | string | Yes | Prompt sent to the agent when the task fires |
| `enabled` | boolean | Yes | Whether the task is active |
| `oneShot` | boolean | No | If `true`, auto-remove after first execution |
| `model` | string | No | Model override for this task (uses `defaultModel` if omitted) |
| `runAt` | string | No | ISO 8601 timestamp for one-shot tasks scheduled at a specific time |

Cron expression format (5 fields, space-separated):

```
*     *     *     *     *
|     |     |     |     |
|     |     |     |     +-- day of week (0-6, Sunday=0)
|     |     |     +-------- month (1-12)
|     |     +-------------- day of month (1-31)
|     +-------------------- hour (0-23)
+-------------------------- minute (0-59)
```

Supported syntax: `*` (any), `*/N` (every N), comma-separated values (`1,15,30`).

Examples:
```json
{
  "automation": {
    "cronTasks": [
      {
        "name": "morning-briefing",
        "schedule": "0 8 * * 1,2,3,4,5",
        "prompt": "Give me a morning briefing: weather, calendar, and top news.",
        "enabled": true
      },
      {
        "name": "weekly-review",
        "schedule": "0 18 * * 5",
        "prompt": "Summarize this week's conversations and notable events.",
        "enabled": true,
        "model": "opus"
      },
      {
        "name": "one-time-alert",
        "schedule": "30 14 23 2 *",
        "prompt": "Remind me: dentist appointment at 3pm.",
        "enabled": true,
        "oneShot": true,
        "runAt": "2026-02-23T14:30:00Z"
      }
    ]
  }
}
```

### Webhook tasks (`automation.webhookTasks`)

Webhook tasks bind a URL slug to an agent prompt template. When an HTTP request hits the slug endpoint, the agent runs with the rendered prompt.

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Human-readable task name |
| `slug` | string | Yes | URL slug: the task is available at `/webhook/tasks/<slug>` |
| `prompt` | string | Yes | Prompt template. Use `{{payload}}` to inject the request body. |
| `enabled` | boolean | Yes | Whether the task is active |
| `model` | string | No | Model override for this task |
| `connector` | string | No | Connector to deliver the response through (e.g. `"telegram"`, `"discord"`) |

Example:
```json
{
  "automation": {
    "webhookTasks": [
      {
        "name": "GitHub Deploy Hook",
        "slug": "github-deploy",
        "prompt": "A GitHub deployment event was received. Payload: {{payload}}. Summarize what was deployed and notify me.",
        "enabled": true,
        "connector": "telegram"
      },
      {
        "name": "Health Alert",
        "slug": "health-alert",
        "prompt": "A health monitoring alert fired. Details: {{payload}}. Assess severity and recommend action.",
        "enabled": true,
        "model": "sonnet",
        "connector": "discord"
      }
    ]
  }
}
```

Triggering a webhook task:
```bash
curl -X POST http://127.0.0.1:7420/webhook/tasks/github-deploy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-bearer-token-123" \
  -d '{"ref": "main", "commit": "abc123", "status": "success"}'
```

---

## Provider fields (`providers[]`)

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique provider ID referenced by models |
| `type` | string | Yes | Provider type: `anthropic`, `openai`, `google`, `openrouter`, `openai-compat`, etc. |
| `apiKeyEnvVar` | string | Yes | Environment variable name that holds the API key |
| `baseUrl` | string | No | Custom endpoint URL (commonly used with `openai-compat` for local models) |

Supported provider types include all those supported by pi-ai: `anthropic`, `openai`, `google`, `openrouter`, `openai-compat`, and others.

Example with a local Ollama instance:
```json
{
  "providers": [
    {
      "id": "local-ollama",
      "type": "openai-compat",
      "apiKeyEnvVar": "OLLAMA_API_KEY",
      "baseUrl": "http://localhost:11434/v1"
    }
  ]
}
```

---

## Model fields (`models[]`)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name used by UI, API, tier/alias references |
| `provider` | string | Yes | Provider ID (must exist in `providers[]`) |
| `model` | string | Yes | Provider-specific model identifier (e.g. `"claude-sonnet-4-5-20250514"`) |
| `temperature` | number | No | Sampling temperature (0--2) |
| `maxTokens` | number | No | Maximum output tokens |
| `fallback` | string | No | Fallback model name to use when this model's provider fails |

### Fallback chains

Models can specify a `fallback` model. If the primary model's provider fails (e.g., API key missing, service down), the engine automatically tries the fallback. Chains are validated at startup:

- The fallback model must exist in `models[]`.
- Circular fallback chains are detected and rejected.

```json
{
  "models": [
    {
      "name": "gpt4",
      "provider": "openai",
      "model": "gpt-4o",
      "fallback": "sonnet"
    },
    {
      "name": "sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250514"
    }
  ]
}
```

---

## Top-level model selector

| Field | Type | Description |
|---|---|---|
| `defaultModel` | string | Model used as the initial router model at startup. Must reference a name in `models[]`. |

---

## Migration note

Legacy setups with a separate `models.json` file are auto-migrated into `config.json` (v3). The `models.json` file is removed after migration. No manual action is needed.

---

## `IDENTITY.md`

Defines agent identity and the base system prompt. The file is parsed into three sections by heading.

```markdown
# Agent Name

## Personality
How the agent should behave. Free-form text describing tone, style, and boundaries.

## System Prompt
Literal prompt text injected into every session. This is the foundational instruction
that shapes all agent responses.
```

The default identity created on first run:
```markdown
# SA (Sasa)

## Personality
You are SA, a helpful personal AI assistant. You are concise, friendly, and proactive. You prefer to get things done rather than ask clarifying questions, but you flag assumptions when they matter.

## System Prompt
You are SA (Sasa), a personal AI agent assistant. You help with tasks, answer questions, and use tools when needed. Keep responses concise and actionable.
```

---

## `USER.md`

Optional user profile loaded into the system prompt. Helps the agent personalize responses.

```markdown
# User Profile

Name: Alice
Timezone: America/Los_Angeles

Short profile text.

## Preferences

Communication style: concise
```

---

## `secrets.enc`

Encrypted JSON payload (AES-256-GCM). The encryption key is derived locally from the machine hostname combined with the `.salt` file in `SA_HOME`.

```json
{
  "apiKeys": {
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "BRAVE_API_KEY": "BSA..."
  },
  "botToken": "123456:ABC...",
  "pairedChatId": 12345678,
  "pairingCode": "A1B2C3",
  "discordToken": "...",
  "discordGuildId": "..."
}
```

| Field | Type | Description |
|---|---|---|
| `apiKeys` | object | Map of env var name to raw API key value |
| `botToken` | string | Raw Telegram bot token |
| `pairedChatId` | number | Telegram chat ID of the paired user (bot ignores all other senders) |
| `pairingCode` | string | One-time pairing code generated by the wizard; user sends `/pair <code>` to activate |
| `discordToken` | string | Raw Discord bot token |
| `discordGuildId` | string | Discord guild (server) ID for bot operation |

Secrets can be managed at runtime using the `set_env_secret` tool, which encrypts and persists values to `secrets.enc` and injects them into `process.env` immediately. Non-secret environment variables should use `set_env_variable` instead, which stores them in `config.json` under `runtime.env`.

---

## Skills directory

User and ClawHub skills live under `~/.sa/skills/`:

```text
~/.sa/skills/
  some-skill/
    SKILL.md
  .registry.json   # ClawHub install metadata
```

Bundled skills ship in `src/engine/skills/bundled/` and are loaded alongside user skills. Skills follow the agentskills.io Markdown spec with YAML frontmatter.
