# Runtime Specs

## Runtime Role

`packages/runtime` owns live execution. It is responsible for:

- session lifecycle
- run creation and streaming
- tool execution and approval gating
- checkpoints, archives, and audit
- automation execution
- connector-facing interaction handling

Frontends do not own live execution state.

## Runtime Shape

```text
Frontend or Connector
  -> Interaction Protocol
  -> Aria Runtime
      -> Prompt Engine
      -> Tool Runtime
      -> Automation Runtime
      -> Memory Services
      -> SQLite Operational Store
```

## Session and Run Model

- A session is durable and restart-safe.
- A run belongs to exactly one session.
- A run may emit text, tool activity, approvals, questions, reactions, attachments, and terminal status.
- A run may create child work through delegation.
- Cancelled, failed, and interrupted work remains queryable.

## Prompt Engine

Prompt assembly is structured, not ad hoc. The runtime composes:

- identity and policy
- user profile
- context files
- layered memory
- tool affordances
- active skills
- connector, automation, or task overlays

Prompt assembly must remain explainable and restart-safe.

## Tool Runtime

The runtime exposes structured toolsets, not a flat undifferentiated registry. Policy determines:

- capability scope
- approval requirements
- execution backend
- isolation expectations
- audit requirements

Built-in tools and MCP tools share one runtime-facing interface while retaining different trust metadata.

## Automation Runtime

Automation is not a bolt-on. Cron and webhook tasks create durable work records and execute through the same runtime substrate as operator-initiated runs.

## Operational Store

SQLite is authoritative for:

- sessions
- messages
- runs
- tool calls and results
- approvals
- summaries
- prompt cache
- memory-related operational facts
- automation tasks and runs
- auth token persistence

In-memory caches and coordinators are derivations.

## Recovery

On startup the runtime must:

1. open the operational database
2. run migrations
3. restore incomplete work and pending approvals
4. rebuild ephemeral indexes or registries as needed
5. re-expose resumable state to callers

## Current Implementation Notes

- `packages/runtime` is now the canonical implementation owner for runtime code.
- runtime code is package-owned under `packages/runtime/src`.
- The runtime now contains a provider-backed backend registry and a dispatch runner for Projects-driven execution.
