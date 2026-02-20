# Configuration

SA stores all configuration in a directory on your machine. By default this is `~/.sa/`. You can override the location with the `SA_HOME` environment variable.

## Environment variables

Set these in your shell or in a `.env` file at the project root (see `.env.example`).

| Variable             | Required | Description                            |
|----------------------|----------|----------------------------------------|
| `ANTHROPIC_API_KEY`  | If using Anthropic | Anthropic API key            |
| `OPENAI_API_KEY`     | If using OpenAI    | OpenAI API key               |
| `GOOGLE_AI_API_KEY`  | If using Google    | Google AI API key            |
| `TELEGRAM_BOT_TOKEN` | No       | Telegram bot token (enables bot)       |
| `DISCORD_TOKEN`      | No       | Discord bot token (enables bot)        |
| `DISCORD_GUILD_ID`   | No       | Discord guild (server) ID              |
| `SA_HOME`            | No       | Override config directory location     |
| `SA_ENGINE_PORT`     | No       | Override Engine HTTP port (default: 7420) |

API keys can also be stored in `secrets.enc` via the setup wizard instead of environment variables.

## Config directory layout

```
~/.sa/
  IDENTITY.md      # agent identity and personality
  USER.md          # user profile (name, timezone, preferences)
  config.json      # runtime settings
  models.json      # model configurations
  secrets.enc      # encrypted API keys and bot tokens
  memory/          # persistent memory (one file per key)
  skills/          # installed skills (one directory per skill)
  engine.url       # Engine HTTP URL (written at startup, cleaned on shutdown)
  engine.pid       # Engine process ID
  engine.token     # Engine master auth token (mode 0600)
  engine.log       # Engine stdout/stderr log
```

## IDENTITY.md

Defines who the agent is. Edited manually or via the onboarding wizard.

```markdown
# Agent Name

## Personality
A short description of how the agent should behave and communicate.

## System Prompt
The literal text injected as the system prompt for every conversation.
```

## USER.md

User profile for personalisation. Created by the wizard, editable manually.

```markdown
# User Profile

Name: Alice
Timezone: America/Los_Angeles

A short bio or description.

## Preferences

Communication style: casual
```

## config.json

Runtime settings. Edited manually or updated by the agent at runtime.

```json
{
  "activeModel": "sonnet",
  "telegramBotTokenEnvVar": "TELEGRAM_BOT_TOKEN",
  "memory": {
    "enabled": true,
    "directory": "memory"
  }
}
```

| Field                    | Type    | Description                                                  |
|--------------------------|---------|--------------------------------------------------------------|
| `activeModel`            | string  | Name of the active model config (must match a name in `models.json`) |
| `telegramBotTokenEnvVar` | string | Name of the env var that holds the Telegram bot token        |
| `memory.enabled`         | boolean | Whether long-term memory is active                           |
| `memory.directory`       | string  | Path to the memory directory, relative to `SA_HOME`          |

## models.json

Defines available LLM model configurations. You can add as many as you like and switch between them at runtime.

```json
{
  "default": "sonnet",
  "models": [
    {
      "name": "sonnet",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250514",
      "apiKeyEnvVar": "ANTHROPIC_API_KEY",
      "temperature": 0.7,
      "maxTokens": 8192
    }
  ]
}
```

| Field         | Type   | Required | Description                                                 |
|---------------|--------|----------|-------------------------------------------------------------|
| `name`        | string | Yes      | Unique display name used to refer to this config            |
| `provider`    | string | Yes      | LLM provider: `"anthropic"`, `"openai"`, `"google"`, etc.  |
| `model`       | string | Yes      | Provider-specific model ID                                  |
| `apiKeyEnvVar`| string | Yes      | Name of the env var that holds the API key for this provider|
| `baseUrl`     | string | No       | Custom API base URL (for proxies or self-hosted models)     |
| `temperature` | number | No       | Sampling temperature (0–2)                                  |
| `maxTokens`   | number | No       | Maximum output tokens per response                          |

The `default` field at the top level sets which model is used on startup if `config.json` doesn't specify one.

## secrets.enc

Encrypted file holding sensitive values so they don't need to be in environment variables. Created by the setup wizard.

```json
{
  "apiKeys": {
    "ANTHROPIC_API_KEY": "sk-ant-..."
  },
  "botToken": "123456:ABC...",
  "pairedChatId": 12345678,
  "pairingCode": "A1B2C3",
  "discordToken": "MTIz...",
  "discordGuildId": "123456789"
}
```

| Field           | Description                                              |
|-----------------|----------------------------------------------------------|
| `apiKeys`       | Map of env var name to raw API key                       |
| `botToken`      | Telegram bot token                                       |
| `pairedChatId`  | Telegram chat ID of the paired user                      |
| `pairingCode`   | One-time pairing code for Telegram                       |
| `discordToken`  | Discord bot token                                        |
| `discordGuildId`| Discord guild (server) ID                                |

## Skills directory

Skills are installed under `~/.sa/skills/`. Each skill lives in its own directory containing a `SKILL.md` file with YAML frontmatter:

```
~/.sa/skills/
  code-review/
    SKILL.md
  writing-assistant/
    SKILL.md
```

See the [agentskills.io](https://agentskills.io) spec for the `SKILL.md` format. Skills can also be installed from ClawHub ([clawhub.ai](https://clawhub.ai)) via the agent's `clawhub_search` tool or the `skill.install` RPC.
