# Esperta Aria Specs

These files define the canonical Aria platform architecture and supersede the earlier Esperta Aria-oriented spec set.

## Canonical Aria Specs

| File | Purpose |
| --- | --- |
| [`product/aria-platform.md`](product/aria-platform.md) | Product model, naming, compatibility stance, north-star acceptance criteria |
| [`system/runtime-model.md`](system/runtime-model.md) | Durable runtime boundaries, SQLite core, session and run model, storage layout |
| [`system/prompt-engine.md`](system/prompt-engine.md) | Prompt assembly pipeline, memory layers, compression, caching, context file rules |
| [`system/tool-runtime.md`](system/tool-runtime.md) | Toolsets, capability policy, MCP integration, execution backends, audit model |
| [`system/automation.md`](system/automation.md) | Scheduled and event-driven automation runtime, task history, delivery, controls |
| [`interfaces/interaction-protocol.md`](interfaces/interaction-protocol.md) | Shared event contract for TUI, chat connectors, webhooks, and future web UI |

## Migration Reference

The older root-level docs in `specs/*.md`, `specs/tools/`, and `specs/security/` remain in the repository as migration reference until their subsystem rewrites are complete. They are no longer the preferred entry point.
