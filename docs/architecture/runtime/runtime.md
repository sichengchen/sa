# Aria Runtime

This page defines the target-state runtime kernel for Aria.

`Aria Runtime` is the shared execution substrate for threads, runs, approvals, tool execution, and recovery. It is not the deployable server product. `Aria Server` composes it.

## Responsibilities

- accept protocol-dispatched work from console, gateway, connectors, and automation
- create, resume, and complete sessions and runs
- route execution into prompt, harness, tools compatibility, policy, projects, jobs, and persistence layers
- coordinate approvals, questions, interrupts, and cancellation
- keep run, tool, audit, and checkpoint state durable
- restore incomplete work after restart

## Placement

```text
Client, Console, Connector, or Automation
  -> Interaction Protocol
  -> Aria Runtime
      -> Prompt Engine
      -> Aria Harness
      -> Tool Runtime compatibility surface
      -> Policy + Approvals
      -> Projects Control / Job Orchestrator
      -> Operational Store
```

## Execution Graph

The runtime should keep identity explicit across the full execution path.

- `thread` is the user-visible conversation or job surface
- `session` is the continuity object behind a thread
- `run` is one concrete model or tool execution inside a session
- `job` is a durable long-running execution owned by a thread when needed

One tracked dispatch creates one runtime execution.

## Operational State

The operational store is authoritative for:

- sessions
- messages
- runs
- tool calls and results
- approvals and questions
- summaries and checkpoints
- prompt-cache decisions
- automation specs and runs
- audit records and recovery metadata

Runtime-local state lives under `~/.aria/` by default. Important operator-local files include:

- `aria.db`
- `config.json`
- `IDENTITY.md`
- `USER.md`
- `secrets.enc`
- `memory/`
- `skills/`
- `automation/`

## Recovery

On startup the runtime should:

1. open the operational database
2. run migrations
3. rebuild ephemeral registries as needed
4. restore incomplete work and pending approvals
5. resume automation scheduling and resumable attachments
6. re-expose durable thread and run state to callers

## Boundary Rules

- frontends attach to runtime state; they do not redefine execution semantics
- gateway auth and session attachment live with the node-owned runtime model, not in an external broker layer
- desktop-local execution runs through the Desktop node's `Aria Agent` and native tool runtime
- runtime should coordinate target packages rather than absorbing their ownership back behind compatibility wrappers
- agent-facing file, shell, skill, role, task, and typed-result capabilities live in `@aria/harness`
- trust decisions remain runtime and policy owned through the harness host boundary

## Current Repo Note

The repo is still reducing `@aria/runtime` toward a thinner compatibility-facing shell while target ownership continues moving into `@aria/prompt`, `@aria/harness`, `@aria/policy`, `@aria/memory`, `@aria/work`, `@aria/gateway`, and related packages. `@aria/tools` remains a temporary compatibility export surface and is no longer the architectural owner of agent-facing tools.

## Related Reading

- [interaction-protocol.md](./interaction-protocol.md)
- [prompt-engine.md](./prompt-engine.md)
- [tool-runtime.md](./tool-runtime.md)
- [harness.md](./harness.md)
- [automation.md](./automation.md)
- [../surfaces/server.md](../surfaces/server.md)
- [../core/domain-model.md](../core/domain-model.md)
