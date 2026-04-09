# Runtime Model

Aria Runtime is the durable local process that owns operational state, model interaction, tool execution, automation, and frontend coordination.

## Core Shape

```text
Frontend Surface -> Interaction Protocol -> Aria Runtime
                                      -> Prompt Engine
                                      -> Tool Runtime
                                      -> Automation Runtime
                                      -> Memory Services
                                      -> SQLite Operational Store
```

Frontends do not own session state. They subscribe to and publish events through the shared interaction protocol.

## Operational Store

SQLite is the primary operational store. The runtime persists at least the following durable entities:

- sessions
- messages
- runs
- tool_calls
- tool_results
- approvals
- tasks
- task_runs
- summaries
- memory_records
- mcp_servers
- audit_events

The operational store is authoritative for restart recovery. In-memory caches are derivations.

## Runtime Responsibilities

1. Accept inbound interaction events from any frontend surface.
2. Resolve or create the target durable session.
3. Start a run record for each model execution.
4. Assemble prompt input through the prompt engine.
5. Execute tool calls through the tool runtime under capability policy.
6. Persist streamed outputs, tool activity, approvals, summaries, and audit events as they occur.
7. Publish outbound events back through the interaction protocol.

## Session and Run Model

- A session is durable and restart-safe.
- A run belongs to exactly one session.
- A run may emit text deltas, reasoning deltas, tool calls, approval requests, questions, reactions, attachments, and terminal status.
- A run may create child runs through delegation. Child runs are linked durably to their parent run.
- A cancelled or interrupted run remains queryable after termination.

## Runtime Home

The runtime home is `~/.aria/` unless `ARIA_HOME` overrides it.

Illustrative layout:

```text
~/.aria/
  aria.db
  config.json
  IDENTITY.md
  USER.md
  .aria.md
  secrets.enc
  .salt
  skills/
  logs/
  cache/
  attachments/
  checkpoints/
```

The operational database is the primary source of runtime state. Flat files remain appropriate for identity, user profile, secrets, installed skills, and selected caches.

## Recovery Rules

On startup, the runtime:

1. Opens the operational database.
2. Runs pending migrations.
3. Rebuilds ephemeral indexes and caches if needed.
4. Restores incomplete sessions, pending approvals, active tasks, and automation schedules.
5. Re-emits resumable status for operators and connected frontends.

Recovery behavior is part of the architecture, not a best-effort convenience.
