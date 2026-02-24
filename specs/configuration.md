# Configuration

SA stores all configuration in a local directory (default: `~/.sa/`). Override with `SA_HOME`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic provider API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI provider API key |
| `GOOGLE_AI_API_KEY` | If using Google | Google AI provider API key |
| `OPENROUTER_API_KEY` | If using OpenRouter | OpenRouter provider API key |
| `BRAVE_API_KEY` | Optional | Brave Search API key (enables `web_search`) |
| `PERPLEXITY_API_KEY` | Optional | Perplexity API key (fallback for `web_search`) |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram bot token |
| `DISCORD_TOKEN` | Optional | Discord bot token |
| `DISCORD_GUILD_ID` | Optional | Restrict Discord bot to a specific guild |
| `SA_HOME` | Optional | Override config directory (default: `~/.sa/`) |
| `SA_ENGINE_PORT` | Optional | Override Engine HTTP port (default `7420`; WS `7421`) |

Resolution order: environment variable > `secrets.enc` > `runtime.env`.

---

## Config directory layout

```text
~/.sa/
  config.json        # v3 config (runtime + providers + models + automation)
  IDENTITY.md        # agent name, personality, system prompt
  USER.md            # user profile and preferences
  HEARTBEAT.md       # heartbeat checklist
  secrets.enc        # encrypted secrets (AES-256-GCM)
  .salt              # encryption salt
  memory/            # memory files
    MEMORY.md
    topics/
    journal/
  skills/            # user-installed skills
    .registry.json   # ClawHub install metadata
  automation/        # cron and webhook task logs
  engine.url         # daemon discovery URL
  engine.pid         # daemon PID
  engine.token       # daemon auth token
  engine.log         # daemon logs
  engine.heartbeat   # heartbeat metadata JSON
```

---

## config.json (v3)

```jsonc
{
  "version": 3,

  "runtime": {
    "activeModel": "sonnet",
    "telegramBotTokenEnvVar": "TELEGRAM_BOT_TOKEN",

    "memory": {
      "enabled": true,
      "directory": "memory",
      "search": {
        "maxResults": 10,
        "vectorWeight": 0.6,
        "textWeight": 0.4,
        "temporalDecay": { "enabled": true, "halfLifeDays": 30 }
      },
      "journal": { "enabled": true }
    },

    // Per-connector tool approval mode -> security/approval-flow.md
    "toolApproval": {
      "tui": "never", "telegram": "ask", "discord": "ask", "webhook": "never"
    },

    "webhook": {
      "enabled": true,
      "token": "my-bearer-token-123"
    },

    "audio": { "enabled": true, "preferLocal": true },

    // Plain (non-secret) env vars injected at startup
    "env": { "SA_LOG_LEVEL": "info" },

    // Model routing
    "modelTiers": { "performance": "opus", "normal": "sonnet", "eco": "haiku" },
    "taskTierOverrides": { "chat": "performance", "classification": "eco" },
    "modelAliases": { "fast": "haiku", "smart": "opus", "default": "sonnet" },

    // Tool policy -> tools/README.md
    "toolPolicy": {
      "verbosity": { "tui": "minimal", "telegram": "silent", "discord": "silent", "webhook": "silent" },
      "overrides": {
        "exec": { "dangerLevel": "dangerous", "report": "always" },
        "web_fetch": { "report": "never" }
      }
    },

    "heartbeat": {
      "enabled": true,
      "intervalMinutes": 30,
      "checklistPath": "HEARTBEAT.md",
      "suppressToken": "HEARTBEAT_OK"
    },

    "automation": {
      "cronTasks": [
        { "name": "daily-summary", "schedule": "0 9 * * *",
          "prompt": "Summarize yesterday and list today's priorities.",
          "enabled": true, "model": "sonnet" },
        { "name": "one-time-reminder", "schedule": "30 14 * * *",
          "prompt": "Remind me about the 3pm meeting.",
          "enabled": true, "oneShot": true }
      ],
      "webhookTasks": [
        { "name": "deploy-notify", "slug": "deploy",
          "prompt": "Deploy event: {{payload}}. Summarize.",
          "enabled": true, "model": "haiku", "connector": "telegram" }
      ]
    }
  },

  "providers": [
    { "id": "anthropic", "type": "anthropic", "apiKeyEnvVar": "ANTHROPIC_API_KEY" },
    { "id": "openai", "type": "openai", "apiKeyEnvVar": "OPENAI_API_KEY" },
    { "id": "local-ollama", "type": "openai-compat", "apiKeyEnvVar": "OLLAMA_API_KEY",
      "baseUrl": "http://localhost:11434/v1" }
  ],

  "models": [
    { "name": "opus", "provider": "anthropic", "model": "claude-opus-4-20250514",
      "temperature": 0.5, "maxTokens": 16384 },
    { "name": "sonnet", "provider": "anthropic", "model": "claude-sonnet-4-5-20250514",
      "temperature": 0.7, "maxTokens": 8192, "fallback": "haiku" },
    { "name": "haiku", "provider": "anthropic", "model": "claude-haiku-3-5-20241022",
      "temperature": 0.7, "maxTokens": 4096 },
    { "name": "gpt4", "provider": "openai", "model": "gpt-4o",
      "temperature": 0.7, "maxTokens": 4096, "fallback": "sonnet" }
  ],

  "defaultModel": "sonnet"
}
```

> Remove `//` comments before use -- JSON does not support them.

---

## Runtime fields

| Field | Type | Default | Description |
|---|---|---|---|
| `runtime.activeModel` | string | `"sonnet"` | Last active model name |
| `runtime.telegramBotTokenEnvVar` | string | `"TELEGRAM_BOT_TOKEN"` | Legacy Telegram env-var name |
| `runtime.memory.enabled` | boolean | `true` | Enable memory subsystem |
| `runtime.memory.directory` | string | `"memory"` | Memory dir relative to `SA_HOME` |
| `runtime.memory.search.maxResults` | number | `10` | Max search results |
| `runtime.memory.search.vectorWeight` | number | `0.6` | Hybrid search vector weight |
| `runtime.memory.search.textWeight` | number | `0.4` | Hybrid search BM25 weight |
| `runtime.memory.search.temporalDecay.enabled` | boolean | `true` | Decay journal scores by age |
| `runtime.memory.search.temporalDecay.halfLifeDays` | number | `30` | Score halves every N days |
| `runtime.memory.journal.enabled` | boolean | `true` | Enable daily journal |
| `runtime.toolApproval` | object | see below | Per-connector approval mode (-> `security/approval-flow.md`) |
| `runtime.webhook` | object | `{ enabled: false }` | Webhook connector settings |
| `runtime.audio` | object | see below | Audio transcription settings |
| `runtime.env` | object | `{}` | Non-secret env vars injected at startup |
| `runtime.modelTiers` | object | `{}` | Tier-to-model mapping |
| `runtime.taskTierOverrides` | object | `{}` | Task-to-tier overrides |
| `runtime.modelAliases` | object | `{}` | Shorthand model aliases |
| `runtime.toolPolicy` | object | see below | Verbosity and per-tool overrides (-> `tools/README.md`) |
| `runtime.heartbeat` | object | see below | Heartbeat configuration |
| `runtime.automation` | object | `{ cronTasks: [] }` | Cron + webhook tasks |

---

## Provider fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique provider ID |
| `type` | string | Yes | `anthropic`, `openai`, `google`, `openrouter`, `openai-compat`, etc. |
| `apiKeyEnvVar` | string | Yes | Env var name holding the API key |
| `baseUrl` | string | No | Custom endpoint (for `openai-compat`, local models) |

---

## Model fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Display name for UI, API, tier/alias references |
| `provider` | string | Yes | Provider ID (must exist in `providers[]`) |
| `model` | string | Yes | Provider-specific model identifier |
| `temperature` | number | No | Sampling temperature (0-2) |
| `maxTokens` | number | No | Maximum output tokens |
| `fallback` | string | No | Fallback model name on provider failure |

### Fallback chains

Models can specify a `fallback` model. On provider failure, the engine tries the fallback. Validated at startup: fallback must exist, circular chains rejected.

---

## defaultModel

Top-level field. Model used as the initial router model at startup. Must reference a name in `models[]`.

---

## Model tiers

Three tiers map to configured model names. If a tier is unmapped, `defaultModel` is used.

| Tier | Intended use |
|---|---|
| `performance` | Complex reasoning, interactive chat |
| `normal` | General-purpose |
| `eco` | Classification, summarization, transcription |

```json
{ "runtime": { "modelTiers": { "performance": "opus", "normal": "sonnet", "eco": "haiku" } } }
```

---

## Task-tier mapping

Default assignments:

| Task type | Default tier |
|---|---|
| `chat` | `performance` |
| `tool_use` | `performance` |
| `reasoning` | `performance` |
| `classification` | `eco` |
| `summarization` | `eco` |
| `transcription` | `eco` |

Override with `taskTierOverrides`:

```json
{ "runtime": { "taskTierOverrides": { "classification": "normal" } } }
```

Resolution: `taskTierOverrides[task]` -> `DEFAULT_TASK_TIER[task]` -> `"normal"` -> `modelTiers[tier]` -> `defaultModel`.

---

## Model aliases

Short names resolving to configured model names. Used in `/model <alias>`, cron/webhook `model` fields, and `model.switch`.

```json
{ "runtime": { "modelAliases": { "fast": "haiku", "smart": "opus" } } }
```

---

## IDENTITY.md

Defines agent identity. Three sections parsed by heading:

```markdown
# Agent Name

## Personality
How the agent should behave. Tone, style, boundaries.

## System Prompt
Literal prompt text injected into every session.
```

---

## USER.md

Optional user profile loaded into system prompt.

```markdown
# User Profile

Name: Alice
Timezone: America/Los_Angeles

## Preferences
Communication style: concise
```

---

## secrets.enc

Encrypted JSON payload (AES-256-GCM). Key derived from machine fingerprint + `.salt`. Details in `security/secrets-vault.md`.

Structure:

| Field | Type | Description |
|---|---|---|
| `apiKeys` | object | Map of env var name to raw API key |
| `botToken` | string | Telegram bot token |
| `pairedChatId` | number | Telegram paired chat ID |
| `pairingCode` | string | One-time pairing code |
| `discordToken` | string | Discord bot token |
| `discordGuildId` | string | Discord guild ID |

Managed at runtime via `set_env_secret` tool.

---

## Skills directory

```text
~/.sa/skills/
  some-skill/
    SKILL.md
  .registry.json   # ClawHub install metadata
```

Bundled skills ship in `src/engine/skills/bundled/`. Both follow the agentskills.io Markdown spec.
