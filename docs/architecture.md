# Architecture

SA is a single-process agent with loosely coupled subsystems. All subsystems live under `src/`.

## Subsystems

| Subsystem  | Path              | Responsibility                                              |
|------------|-------------------|-------------------------------------------------------------|
| **config** | `src/config/`     | Loads and writes `identity.md`, `config.json`, `models.json` from `SA_HOME` |
| **router** | `src/router/`     | Wraps `@mariozechner/pi-ai` to manage multiple model configs and switch between them |
| **agent**  | `src/agent/`      | Conversation loop: sends messages to the router, dispatches tool calls, streams events |
| **tools**  | `src/tools/`      | Built-in tool implementations (read, write, edit, bash, remember) |
| **memory** | `src/memory/`     | Persists key/value entries to `~/.sa/memory/`; loads them into the system prompt on startup |
| **tui**    | `src/tui/`        | React/Ink terminal UI — chat view, input box, model picker, status bar |
| **telegram**| `src/telegram/`  | GrammY-based Telegram bot transport — relays messages to/from the agent |
| **wizard** | `src/wizard/`     | First-run onboarding wizard (Ink) — writes initial config files |

## Startup flow

```
bun run dev
    │
    ├─ ~/.sa/config.json missing? ──► Wizard (identity, model, Telegram setup)
    │                                      │
    │                                      ▼ writes identity.md, config.json, models.json
    │
    └─ Config exists ──► ConfigManager.load()
                             │
                             ├─ MemoryManager.init() + loadContext()
                             ├─ ModelRouter.load(models.json)
                             └─ Agent({ router, tools, systemPrompt })
                                    │
                                    ├─ TelegramTransport.start()   (if token env var set)
                                    └─ render(<App agent router />)  (unless --telegram-only)
```

## Message flow

```
User input (TUI or Telegram)
    │
    ▼
Agent.chat(message)
    │
    ├─ ModelRouter → LLM (streaming response)
    │
    └─ Tool call in response?
           │
           ├─ Dispatch to ToolImpl.execute()
           ├─ Append tool result to conversation
           └─ Loop (up to maxToolRounds)
    │
    ▼
AgentEvents stream to transport (TUI or Telegram)
    (text_delta, tool_start, tool_end, done, error)
```

## Key design decisions

- **Single process** — all subsystems run in one Bun process. No inter-process communication.
- **Transport abstraction** — TUI and Telegram both consume the same `AgentEvent` stream from the agent; neither knows about the other.
- **Configuration as files** — `identity.md`, `config.json`, and `models.json` are the source of truth. No database.
- **Memory in system prompt** — long-term memory is injected into the system prompt on startup, not retrieved dynamically at query time.
- **Provider abstraction via pi-ai** — `@mariozechner/pi-ai` normalises API differences across Anthropic, OpenAI, Google, etc.; the router builds on top of it.
