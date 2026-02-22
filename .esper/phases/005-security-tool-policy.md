---
phase: 005-security-tool-policy
title: "Security & Tool Policy"
status: active
---

# Phase 5: Security & Tool Policy

## Goal
Overhaul SA's tool approval system with a 3-tier danger classification (safe / moderate / dangerous), hybrid exec command classification (agent self-declares + engine pattern override), task-based model routing for utility tasks, configurable per-tool reporting verbosity, and a comprehensive security audit of all trust surfaces. After this phase, SA only prompts the user for genuinely dangerous actions and stays silent for routine tool calls.

## In Scope
- **3-tier tool danger classification**: safe (auto-approve), moderate (context-dependent), dangerous (always ask) — configurable per tool in config.json
- **Hybrid exec classification**: agent declares danger level in exec tool params, engine validates with pattern matching to catch misclassifications
- **Task-based model routing**: allow the router to dispatch utility tasks (e.g., classification) to a fast/cheap model while keeping the main chat model for conversation
- **Configurable tool status reporting**: per-connector verbosity setting (silent / minimal / verbose) — default is silent, report on dangerous/error/long-running
- **Per-tool config in config.json**: let users override danger level and reporting behavior per tool
- **System prompt revision**: update "Tool Call Style" and "Safety" sections to align with the new tier system and instruct the agent to self-declare exec danger
- **Improved model routing**: fallback chains, per-connector model defaults, model aliases, routing metadata query
- **Full security audit**: secrets encryption review, tRPC auth/token hardening, exec tool sandboxing assessment

## Out of Scope (deferred)
- Per-command allowlists/blocklists in config.json (v2 — this phase does pattern matching only)
- Tool-specific rate limiting
- Audit logging / event journal
- Multi-user permission model
- Network-level firewall / iptables rules

## Acceptance Criteria
- [ ] All tools have a `dangerLevel` property: "safe" | "moderate" | "dangerous"
- [ ] `exec` tool accepts a `danger` parameter; engine validates with pattern matching
- [ ] Router supports a `utilityModel` config for cheap/fast classification tasks
- [ ] Config.json supports `runtime.toolPolicy` with per-tool overrides and per-connector verbosity
- [ ] Connectors only show tool status for dangerous tools, errors, and long-running tasks by default
- [ ] TUI shows approval dialog for dangerous tools instead of auto-approving everything
- [ ] System prompt reflects the new policy — agent self-declares danger for exec, no unnecessary narration
- [ ] Model router supports fallback chains, per-connector defaults, and aliases
- [ ] Security audit completed: secrets encryption, tRPC auth, exec safety — findings documented and fixes shipped
- [ ] `bun run typecheck`, `bun run lint`, and `bun test` all pass

## Phase Notes
Phase 4 was clean — no carry-forward items. The current tool system is binary (SAFE_TOOLS set vs everything else) with hard-coded behavior. TUI auto-approves all tools, IM connectors ask for non-safe tools. There's no granular classification, no way for users to customize policy, and the reporting is all-or-nothing. The security surfaces (hostname-based key derivation, unauthenticated tRPC endpoints, unsandboxed exec) have never been audited.

## Shipped Plans
- Plan 053 — 3-tier tool danger classification system: Add dangerLevel (safe/moderate/dangerous) to ToolImpl and replace SAFE_TOOLS with tier-based approval logic. Files: types.ts, registry.ts, procedures.ts, App.tsx, ToolApproval.tsx, + all tool files
- Plan 054 — Hybrid exec command classification: Agent self-declares danger for exec, engine validates with pattern matching. Files: exec.ts, exec-classifier.ts, exec-classifier.test.ts, procedures.ts, runtime.ts
- Plan 055 — Task-tier model routing: 3-tier model routing (performance/normal/eco), task-based dispatch, aliases, fallback chains. Files: task-types.ts, router.ts, types.ts, config/types.ts, runtime.ts, procedures.ts
- Plan 056 — Per-tool config and reporting overhaul: ToolPolicyManager centralizes event filtering with per-connector verbosity and per-tool overrides. Files: config/types.ts, config/defaults.ts, tools/policy.ts, tools/policy.test.ts, procedures.ts
- Plan 057 — System prompt tool guidance revision: Rewrite TOOL_CALL_STYLE with per-tier narration rules, add reactions guide, show danger levels in tool listing. Files: runtime.ts, tools/index.ts
- Plan 058 — Security audit: secrets and encryption: Strengthen key derivation with machine fingerprint, add scrypt params, transparent legacy migration. Files: config/secrets.ts, config/secrets.test.ts
