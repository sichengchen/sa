# Esperta Aria Platform

Esperta Aria is a local-first agent platform. It is a durable, policy-governed system with one runtime, one prompt engine, one tool runtime, one interaction protocol, and one automation subsystem.

## Canonical Names

| Surface | Canonical Name |
| --- | --- |
| Product | `Esperta Aria` |
| Runtime | `Aria Runtime` |
| CLI | `aria` |
| Runtime home | `~/.aria/` |
| Native project context file | `.aria.md` |

Earlier identities, paths, and package names are retired. The canonical public surface is `Esperta Aria`, `Aria Runtime`, `aria`, and `~/.aria/`.

## Product Commitments

1. Aria is local-first. The primary operational state lives on the operator's machine.
2. Aria is durable. Restarting the runtime preserves sessions, runs, approvals, tasks, automation state, summaries, and audit records.
3. Aria is protocol-first. TUI, chat connectors, webhook APIs, automation delivery, and future web UI are surfaces on one shared runtime contract.
4. Aria is policy-driven. Tool access, approvals, execution backends, and MCP trust are governed by explicit capability policy rather than ad hoc danger tags.
5. Aria is extensible. Built-in tools and MCP tools appear in one coherent tool runtime, while remaining distinguishable for trust and audit.

## Platform Vocabulary

| Term | Meaning |
| --- | --- |
| Session | Durable conversation container spanning one operator or integration context |
| Run | A single agent execution inside a session, with streamed output, tool calls, approvals, and summaries |
| Task | A durable unit of work, optionally automated or delegated |
| Toolset | A named group of tools with shared capability boundaries and execution policy |
| Capability Policy | The rules governing availability, approval, isolation, and audit for a tool or toolset |
| Prompt Engine | The subsystem that assembles identity, policy, memory, project context, and session overlays into model input |
| Memory Layer | A specific class of memory with its own retention and policy behavior |
| Interaction Protocol | The shared event contract between the runtime and every frontend |

## Compatibility Stance

Aria breaks compatibility freely when compatibility preserves the wrong architecture. Migration support is optional and temporary. The source of truth is the Aria platform model, not the shape of prior CLI commands, config keys, or in-memory runtime behavior.

## North-Star Acceptance Criteria

- `aria` is the only public CLI identity.
- `~/.aria/` is the only runtime home.
- The runtime is restart-safe by design.
- Project context is loaded intentionally and summarized efficiently.
- Long sessions remain usable through built-in compression and caching.
- Built-in tools and MCP tools coexist under one policy framework.
- Automation is a native runtime feature, not a bolt-on.
- Every frontend is a surface on one runtime protocol.
- The system presents as one product with one vocabulary.

## Implementation Note

When supporting docs or older implementation details diverge, prefer this platform guide and the canonical Aria subsystem docs. New work should make the runtime more coherent, more durable, and more policy-driven, not preserve outdated shapes.
