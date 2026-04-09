# Esperta Aria Documentation

This tree is the canonical documentation set for Esperta Aria. It covers product vocabulary, architecture, storage, prompt assembly, memory behavior, tool and MCP runtime design, automation, security controls, CLI and operator surfaces, and the shared interaction protocol.

## Core Platform Docs

| File | Focus |
| --- | --- |
| [`product/aria-platform.md`](product/aria-platform.md) | Product model, naming, compatibility stance, north-star acceptance criteria |
| [`system/runtime-model.md`](system/runtime-model.md) | Durable runtime boundaries, SQLite core, session and run model, storage layout |
| [`system/prompt-engine.md`](system/prompt-engine.md) | Prompt assembly pipeline, memory layers, compression, caching, context file rules |
| [`system/tool-runtime.md`](system/tool-runtime.md) | Toolsets, capability policy, MCP integration, execution backends, audit model |
| [`system/automation.md`](system/automation.md) | Scheduled and event-driven automation runtime, task history, delivery, controls |
| [`interfaces/interaction-protocol.md`](interfaces/interaction-protocol.md) | Shared event contract for TUI, chat connectors, webhooks, automation, and future web UI |

## Design And Operator Docs

| Area | Entry points |
| --- | --- |
| Architecture and runtime behavior | [`overview.md`](overview.md), [`sessions.md`](sessions.md), [`subagents.md`](subagents.md) |
| CLI and configuration | [`cli.md`](cli.md), [`configuration.md`](configuration.md), [`development.md`](development.md) |
| Skills and memory behavior | [`skills.md`](skills.md), [`tools/memory.md`](tools/memory.md) |
| Tool behavior and approvals | [`tools/README.md`](tools/README.md), [`security/approval-flow.md`](security/approval-flow.md) |
| Security surfaces | [`security/README.md`](security/README.md), [`security/url-policy.md`](security/url-policy.md), [`security/sandbox.md`](security/sandbox.md) |

## Documentation Rule

If implementation changes the runtime model, interaction behavior, or user-visible workflow, update the matching file in `docs/` in the same change.
