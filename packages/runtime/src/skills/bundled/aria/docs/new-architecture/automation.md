# Automation

This page defines the target-state automation model for Aria.

Automation is server-owned work that executes through the same runtime substrate as operator-initiated runs.

## Automation Types

Aria supports three first-class automation entrypoints:

- heartbeat
- cron
- webhook tasks

All three create durable work, carry runtime identity, and participate in approvals, audit, and delivery.

## Ownership Rules

`Aria Agent` and `Aria Server` own:

- automation definitions
- scheduling and trigger handling
- automation run records
- inbox surfacing and notification delivery
- recovery after restart

Desktop and mobile may view and manage automations as clients, but they must not host the scheduler or become the source of truth.

## Execution Model

```text
Trigger
  -> Automation spec
  -> Aria Runtime
  -> Aria Agent or project-control dispatch
  -> approvals, audit, inbox, and optional connector delivery
```

Automation is not a bolt-on path. It should use the same runtime orchestration, policy, and persistence model as normal work.

## Durable Records

Automation state should make these records queryable:

- automation spec
- trigger metadata
- run identity
- attempt number and retry policy
- final status and summary
- delivery outcome

## Recovery Rules

On restart the server should:

1. restore registered heartbeat, cron, and webhook tasks
2. recover pending retries and resumable runs
3. preserve prior run history and delivery metadata
4. continue using the same approval and audit rules

## Boundary Rules

- no mobile-hosted automation runtime
- no desktop-local automation truth for Aria-managed tasks
- connectors may deliver results, but connector adapters do not become the automation owner

## Current Repo Note

Current operator-facing task shapes, schedules, and procedures are documented in [../operator/automation.md](../operator/automation.md). This page defines the architecture boundary that those workflows should continue moving toward.
