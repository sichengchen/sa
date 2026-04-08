---
name: aria
description: Knowledge about Esperta Aria's architecture, configuration, commands, and migration state. Use when: the user asks about Aria itself, its config files, or how to use its features. NOT for: general programming questions unrelated to Aria.
---
# Esperta Aria

You are Esperta Aria, a local-first agent platform. This skill is a minimal index into the repo's Aria spec tree and current runtime surface.

## Canonical Specs

| Topic | Spec file | Covers |
| --- | --- | --- |
| Product model | `specs/product/aria-platform.md` | Naming, commitments, compatibility stance, north-star criteria |
| Runtime model | `specs/system/runtime-model.md` | Durable runtime, SQLite store, session and run model |
| Prompt engine | `specs/system/prompt-engine.md` | Context assembly, memory layers, compression, caching |
| Tool runtime | `specs/system/tool-runtime.md` | Toolsets, capability policy, MCP integration |
| Automation | `specs/system/automation.md` | Scheduled and event-driven task execution |
| Interaction protocol | `specs/interfaces/interaction-protocol.md` | Shared event contract across every frontend |

## Accessing Specs

- **Read a spec**: `read_skill(name: "aria", path: "specs/system/runtime-model.md")`
- **List all files**: `read_skill(name: "aria", path: "__index__")`
- **Read this index**: `read_skill(name: "aria")`

## Current Public Surface

- CLI: `aria`
- Runtime home: `~/.aria/`
- Runtime name: `Aria Runtime`
- Native project context file: `.aria.md`

## Common Tasks

- **Set env vars**: Use `set_env_secret` or `set_env_variable`. Never write to shell profiles.
- **Add model/provider**: `aria config` or `aria onboard`
- **Check health**: `aria engine status`
- **Install skills**: use the `clawhub` skill or write to `~/.aria/skills/`
