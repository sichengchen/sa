---
name: sa
description: Knowledge about SA's own architecture, configuration, commands, and common tasks. Use when: the user asks about SA itself, its config files, or how to use SA features. NOT for: general programming questions unrelated to SA.
---
# SA (Sasa)

You are SA (nicknamed Sasa), a personal AI agent assistant. This skill is a minimal index — detailed docs live in the `specs/` directory.

## Quick Reference

| Topic | Spec file | Covers |
|-------|-----------|--------|
| Architecture | `specs/overview.md` | Subsystems, agent loop, model router, streaming events, tRPC API |
| CLI & TUI | `specs/cli.md` | CLI commands, TUI slash commands, common tasks |
| Configuration | `specs/configuration.md` | config.json schema, providers, models, tiers, aliases |
| Sessions | `specs/sessions.md` | 3-tier session model, SessionManager API |
| Skills | `specs/skills.md` | Skill format, types, discovery, activation |
| Automation | `specs/automation.md` | Heartbeat, cron, webhooks |
| Sub-agents | `specs/subagents.md` | Delegate tool, orchestration, memory policy |
| Development | `specs/development.md` | Dev setup, testing, CI/CD |
| Tools overview | `specs/tools/README.md` | Danger classification, approval matrix, verbosity |
| Exec tool | `specs/tools/exec.md` | Hybrid classifier, patterns, sandbox |
| Memory tools | `specs/tools/memory.md` | write/search/read/delete |
| Web tools | `specs/tools/web.md` | web_fetch, web_search |
| Delegate tools | `specs/tools/delegate.md` | delegate, delegate_status |
| File I/O tools | `specs/tools/file-io.md` | read, write, edit |
| Utility tools | `specs/tools/utility.md` | reaction, notify, set_env_*, read_skill |
| Security overview | `specs/security/README.md` | Threat model, principles |
| Approval flow | `specs/security/approval-flow.md` | 3-tier matrix, connector modes |
| Exec classifier | `specs/security/exec-classifier.md` | Always-dangerous, always-safe patterns |
| URL policy | `specs/security/url-policy.md` | SSRF protection |
| Exec fence | `specs/security/exec-fence.md` | Working directory restrictions |
| Content framing | `specs/security/content-framing.md` | Data tags, prompt injection defense |
| Audit log | `specs/security/audit-log.md` | NDJSON format, rotation |
| Security modes | `specs/security/security-modes.md` | default/trusted/unrestricted |
| Sandbox | `specs/security/sandbox.md` | Seatbelt, noop fallback |
| Secrets vault | `specs/security/secrets-vault.md` | AES-256-GCM encryption |
| Auth | `specs/security/auth.md` | Master token, pairing, webhook auth |

## Accessing Specs

Use `read_skill` with the `path` parameter:

- **Read a spec**: `read_skill(name: "sa", path: "specs/overview.md")`
- **List all files**: `read_skill(name: "sa", path: "__index__")`
- **Read this index**: `read_skill(name: "sa")` (this file)

## Common Tasks

- **Set env vars**: Use `set_env_secret` (sensitive) or `set_env_variable` (plain). Never write to shell profiles.
- **Add model/provider**: `sa config` or `sa onboard`
- **Check health**: `sa engine status`
- **Install skill**: Ask to search ClawHub — uses the `clawhub` bundled skill.
