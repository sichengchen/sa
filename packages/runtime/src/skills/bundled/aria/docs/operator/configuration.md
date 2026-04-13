# Configuration

Esperta Aria stores operator-local state under `~/.aria/` unless `ARIA_HOME` overrides it.

Only `config.json` version `3` is supported. Legacy config shapes are rejected rather than silently migrated in place.

## Runtime Home

Illustrative layout:

```text
~/.aria/
  aria.db
  config.json
  IDENTITY.md
  USER.md
  HEARTBEAT.md
  secrets.enc
  .salt
  memory/
  skills/
  automation/
  relay-state.json
  engine.url
  engine.pid
  engine.token
  engine.log
  engine.heartbeat
```

Notes:

- runtime, projects, workspaces, jobs, and handoff durable records currently share `aria.db`
- relay persists paired-device state separately in `relay-state.json`
- bundled skills are package-owned in the repo under `packages/runtime/src/skills/bundled/`

## Environment Variables

Common variables:

| Variable | Purpose |
| --- | --- |
| `ARIA_HOME` | Override runtime home |
| `ARIA_ENGINE_PORT` | Override runtime port |
| `ANTHROPIC_API_KEY` | Anthropic provider auth |
| `OPENAI_API_KEY` | OpenAI provider auth |
| `GOOGLE_AI_API_KEY` | Google provider auth |
| `OPENROUTER_API_KEY` | OpenRouter provider auth |
| `MINIMAX_API_KEY` | MiniMax provider auth |
| connector-specific tokens | Telegram, Discord, Slack, Teams, Google Chat, GitHub, Linear, WeChat |

Resolution order remains:

1. process environment
2. `secrets.enc`
3. runtime-managed plain env settings in config

## `config.json`

`config.json` owns:

- runtime defaults and active model
- provider and model registry, including OpenAI-compatible presets such as MiniMax
- tool approval defaults
- tool reporting policy
- heartbeat configuration
- cron task definitions
- webhook task definitions

## Approval Configuration

Per-connector approval defaults live under `runtime.toolApproval`, not under `runtime.toolPolicy`.

`runtime.toolPolicy` controls reporting verbosity and per-tool overrides.

## Skills

User-installed skills live under `~/.aria/skills/`. Bundled skills are shipped with the runtime package and embedded into the build during `bun run build`.

## Operational Notes

- Secrets stay encrypted at rest in `secrets.enc`.
- Runtime-managed non-secret env values are loaded into the process at startup.
- Persisted automation and tracked-work records should be considered durable state, not cache.
- When using `scripts/migrate-legacy-esperta-code.ts`, back up `aria.db` before write mode and keep the dry-run JSON output as the migration manifest. The script does not create a backup or rollback point for you.
- If a write pass needs to be reverted, restore the saved database backup first, then rerun dry-run to confirm the source state before trying again.
