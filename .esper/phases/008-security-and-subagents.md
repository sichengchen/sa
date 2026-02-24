---
phase: 008-security-and-subagents
title: "Security & Subagents"
status: completed
---

# Phase 8: Security & Subagents

## Goal

Implement the full SA Security Model v2 — a 6-layer defense architecture addressing the complete AI-agent threat surface (prompt injection, SSRF, credential leakage, tool misuse) — and add subagent spawning so a parent agent can delegate tasks to child agents with full tool access.

Security is the primary deliverable. The current system has strong application-level controls (3-tier danger classification, exec command classifier, env sanitization, approval prompts) but critical gaps: web_fetch has no URL filtering (safe-tier SSRF), the exec classifier trusts the agent as fallback, tool results flow to the LLM unsanitized, and there's no audit trail. This phase closes all identified gaps from exploration 011.

Subagents (from exploration 008) add the ability for a parent agent to spawn child agents for parallel or delegated tasks — synchronous (Approach A) and background with polling (Approach B).

## In Scope

### Security Model v2 (all priorities)
- **P0 — Critical fixes**: URL policy for web_fetch (SSRF protection), exec classifier hardening (default-dangerous, shell indirection detection)
- **P1 — Prompt injection defense**: Content framing for all external data, output sanitizer (key redaction, safe truncation), auth token scope separation (webhook-specific tokens), inline security escalation (per-request overrides for soft layers)
- **P2 — Depth**: Exec working directory fence, append-only audit log with rotation and CLI, session security modes (default/trusted/unrestricted with auto-revert), auth hardening (session TTL, pairing improvements)
- **P3 — Hardening**: Cron/webhook per-connector tool restrictions with per-task profiles, OS sandbox (macOS Seatbelt / Linux Landlock, best-effort)

### Subagents
- **Synchronous spawning (Approach A)**: `delegate` tool, SubAgent class, narrowed tool access, auto-approve child calls, timeout, session naming
- **Background execution (Approach B)**: Background handles, `delegate_status` polling tool, Orchestrator for concurrent execution with configurable limits
- **Memory policy**: Configurable memory write access for subagents, shared memory safeguards

## Out of Scope (deferred)

- Streaming subagents (Approach C — requires core ToolImpl interface refactor)
- Sub-subagent recursion (no recursive delegation in v1)
- Local embedding models for memory (from Phase 7 deferral)
- Session transcript indexing
- Pre-compaction memory flush

## Acceptance Criteria

- [x] web_fetch blocks localhost, private ranges, cloud metadata, SA engine ports; follows redirects safely
- [x] Exec classifier defaults to "dangerous" on unknown commands; detects shell indirection, inline interpreters
- [x] All external content (web, webhook, skill, memory, exec output) wrapped in `<data-*>` framing tags
- [x] Tool results sanitized: API keys redacted, SA paths masked, safe truncation
- [x] Webhook endpoints use dedicated token (not master token); session tokens have configurable TTL
- [x] Inline escalation prompts appear when soft security layers block a tool call; user can allow once/session/persist
- [x] Exec fence restricts working directory; `~/.sa`, `~/.ssh`, `~/.gnupg` always denied
- [x] Audit log records all tool calls, approvals, denials, auth events; NDJSON with rotation
- [x] `/mode default|trusted|unrestricted` switches session security; auto-reverts after configurable TTL
- [x] Cron/webhook agents use restricted tool registries configurable per-task
- [x] OS sandbox wraps exec on supported platforms (best-effort, no-op with warning on unsupported)
- [x] `delegate` tool spawns synchronous subagents with narrowed tools and auto-approve
- [x] `delegate_status` polls background subagents; Orchestrator manages concurrency limits
- [x] Subagent memory write access configurable; disabled by default for background subagents
- [x] `bun run typecheck`, `bun run lint`, and `bun test` all pass

## Phase Notes

Phase 7 shipped cleanly — no carry-forward except the memory integration concern from exploration 008: subagents share the global MemoryManager, so writes from subagents affect all future agents. This phase addresses it with a configurable memory write policy.

Informed by explorations 008 (Subagents Support) and 011 (SA Security Model v2).

## Shipped Plans
- Plan 098 — URL policy for web_fetch — SSRF protection: Create URL policy module with blocked hosts/schemes/ports, integrate into web_fetch with manual redirect following. Files: url-policy.ts, url-policy.test.ts, web-fetch.ts, types.ts, defaults.ts
- Plan 099 — Exec classifier hardening: Default-deny fallback, shell indirection detection, expanded pipe-to-shell, dangerous git ops. Files: exec-classifier.ts, exec-classifier.test.ts
- Plan 100 — Content framing + output sanitizer: frameAsData() wraps all external content in data tags, sanitizeContent() redacts secrets/paths/traces. Files: content-frame.ts, web-fetch.ts, exec.ts, server.ts, runtime.ts, agent.ts
- Plan 101 — Auth overhaul: Webhook token separation, session TTL, 8-char pairing codes with expiry, exponential backoff. Files: auth.ts, server.ts, runtime.ts, types.ts
- Plan 102 — Inline security escalation: SecurityBlock types, escalation events, session security overrides, tRPC procedure. Files: security-types.ts, types.ts, procedures.ts
- Plan 103 — Exec working directory fence: Configurable path fence with validateExecPaths(), always-deny for credential dirs, session overrides. Files: exec-fence.ts, exec-fence.test.ts, types.ts
- Plan 104 — Audit log: Append-only NDJSON AuditLogger with rotation, instrumented tool/auth/session events, `sa audit` CLI. Files: audit.ts, audit.test.ts, runtime.ts, procedures.ts, server.ts, cli/audit.ts, cli/index.ts
- Plan 105 — Session security modes: SecurityModeManager with default/trusted/unrestricted, per-session auto-revert TTL, tRPC procedures. Files: security-mode.ts, security-mode.test.ts, runtime.ts, procedures.ts, config/types.ts, shared/types.ts
- Plan 108 — Subagent core: SubAgent class with filtered tools, auto-approve, delegate tool factory. Files: sub-agent.ts, sub-agent.test.ts, delegate.ts, delegate.test.ts, index.ts, runtime.ts, config/types.ts, shared/types.ts
- Plan 109 — Subagent background execution + Orchestrator: Orchestrator class with concurrency limits/queuing/retention, delegate_status tool, background mode + multi-spawn for delegate. Files: orchestrator.ts, orchestrator.test.ts, delegate-status.ts, delegate-status.test.ts, delegate.ts, index.ts, runtime.ts, config/types.ts
- Plan 110 — Subagent memory policy + documentation: memoryWrite option on SubAgentOptions filters memory_write/memory_delete from background sub-agents. Files: sub-agent.ts, sub-agent.test.ts, delegate.ts, runtime.ts, tools.md, security.md, SKILL.md
- Plan 106 — Cron/webhook tool restrictions: Default tool allowlists for cron and webhook agents, per-task allowedTools config. Files: types.ts, defaults.ts, runtime.ts, procedures.ts, server.ts
- Plan 107 — OS sandbox: Seatbelt sandbox for macOS exec commands, noop fallback for other platforms, integrated with exec fence config. Files: sandbox.ts, sandbox.test.ts, exec.ts, runtime.ts
