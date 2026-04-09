# Esperta Aria

Local-first agent platform with a durable runtime, structured toolsets, native MCP, and one shared interaction protocol across CLI, connectors, webhooks, and automation.

## Public Identity

- Product: `Esperta Aria`
- Runtime: `Aria Runtime`
- CLI: `aria`
- Runtime home: `~/.aria/` or `ARIA_HOME`

## Development

```bash
bun install
bun run dev
```

On first run, the onboarding flow writes runtime state under `~/.aria/`.

## Commands

| Command | Purpose |
| --- | --- |
| `aria` | Start the runtime if needed and open the TUI |
| `aria onboard` | Run onboarding |
| `aria config` | Open the interactive config editor |
| `aria engine start` | Start Aria Runtime in the background |
| `aria engine stop` | Stop the runtime |
| `aria engine status` | Show runtime status |
| `aria engine logs` | Show runtime logs |
| `aria restart` | Restart the runtime via API |
| `aria shutdown` | Shut the runtime down gracefully |
| `aria audit` | Inspect the audit log |

## Documentation

The canonical Aria documentation now lives in [`docs/`](docs/README.md):

- [`docs/product/aria-platform.md`](docs/product/aria-platform.md)
- [`docs/system/runtime-model.md`](docs/system/runtime-model.md)
- [`docs/system/prompt-engine.md`](docs/system/prompt-engine.md)
- [`docs/system/tool-runtime.md`](docs/system/tool-runtime.md)
- [`docs/system/automation.md`](docs/system/automation.md)
- [`docs/interfaces/interaction-protocol.md`](docs/interfaces/interaction-protocol.md)

Supporting design, operator, security, and tool documentation also lives under `docs/`, with the product, system, and interface pages above serving as the primary Aria entry points.
