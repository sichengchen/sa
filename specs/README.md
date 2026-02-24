# SA Specs

SA system manual -- single source of truth for architecture, tools, security, and operations.

Access at runtime: `read_skill(name: "sa", path: "specs/README.md")`

---

## Core

| File | Description |
|------|-------------|
| [`overview.md`](overview.md) | Architecture, subsystems, tech stack |
| [`cli.md`](cli.md) | CLI commands, TUI slash commands, common tasks |
| [`configuration.md`](configuration.md) | Config schema, providers, models, runtime settings |
| [`sessions.md`](sessions.md) | Session model, 3-tier IDs, SessionManager API |

## Features

| File | Description |
|------|-------------|
| `skills.md` | Skill format, types, discovery, activation |
| `automation.md` | Heartbeat, cron, webhooks |
| `subagents.md` | Delegate tool, orchestration, memory policy |
| `development.md` | Dev setup, testing, CI/CD |

## Tools

| File | Description |
|------|-------------|
| [`tools/README.md`](tools/README.md) | Danger classification, approval matrix, per-tool config |
| [`tools/exec.md`](tools/exec.md) | Hybrid classifier, patterns, sandbox |
| [`tools/memory.md`](tools/memory.md) | Memory tools (write/search/read/delete) |
| [`tools/web.md`](tools/web.md) | web_fetch + web_search |
| [`tools/delegate.md`](tools/delegate.md) | delegate + delegate_status |
| [`tools/file-io.md`](tools/file-io.md) | read, write, edit |
| [`tools/utility.md`](tools/utility.md) | reaction, notify, set_env_*, read_skill |

## Security

| File | Description |
|------|-------------|
| [`security/README.md`](security/README.md) | Threat model, principles |
| [`security/approval-flow.md`](security/approval-flow.md) | 3-tier matrix, connector modes |
| [`security/exec-classifier.md`](security/exec-classifier.md) | Always-dangerous, always-safe patterns |
| [`security/url-policy.md`](security/url-policy.md) | SSRF protection |
| [`security/exec-fence.md`](security/exec-fence.md) | Working dir restrictions |
| [`security/content-framing.md`](security/content-framing.md) | Data tags, prompt injection defense |
| [`security/audit-log.md`](security/audit-log.md) | NDJSON format, rotation |
| [`security/security-modes.md`](security/security-modes.md) | default/trusted/unrestricted |
| [`security/sandbox.md`](security/sandbox.md) | Seatbelt, noop fallback |
| [`security/secrets-vault.md`](security/secrets-vault.md) | AES-256-GCM encryption |
| [`security/auth.md`](security/auth.md) | Master token, pairing, webhook auth |
