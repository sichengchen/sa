# New Architecture Implementation Plan

This plan defines how to finish Aria against the target architecture in `docs/new-architecture/*`.

## Goal

Ship the target-state Aria platform with:

- `Aria Server` as the canonical server-hosted product
- `Aria Runtime` as the shared execution kernel
- `Aria Relay` as the transport and access layer
- `Aria Desktop` as a real desktop app
- `Aria Mobile` as a real mobile app
- `Vite+`, `Vitest`, and `bun` as the repo toolchain baseline

## Working Assumptions

- Breaking changes are allowed.
- Compatibility shims are not required.
- Legacy command, import, config, schema, and package compatibility should not constrain the design unless a migration is explicitly chosen later.
- `docs/new-architecture/*` is the source of truth for package boundaries, deployment model, and client/server responsibilities.
- Desktop and mobile are fully in scope.
- Desktop and mobile are encouraged to reuse external open-source projects when that is faster and cleaner than building from scratch.

## Delivery Principles

- Prefer replacement over incremental compatibility layering.
- Delete obsolete wrappers once the new owner is live.
- Keep server-owned capabilities on `Aria Server`.
- Keep `Aria Relay` transport-only.
- Keep desktop-local execution behind desktop-only packages.
- Reuse external open-source foundations where they accelerate delivery without fighting the architecture.

## Commit Discipline

- Commit frequently.
- Prefer small commits that each contain one logical change.
- Use conventional commits for every commit.
- Prefer commit scopes that match the package, app, or service being changed.

Illustrative commit shapes:

- `feat(server): rebuild server bootstrap around @aria/server`
- `refactor(protocol): move event contracts into target package`
- `test(relay): cover reconnect and routing flows`
- `docs(development): add new architecture implementation plan`

## Workstream 1: Toolchain Reset

Adopt the target repo toolchain and remove migration-era build assumptions.

### Required outcomes

- `Vite+` is the monorepo management and task orchestration layer.
- `Oxc` is the repo-wide linting and formatting stack.
- `bun` is the package manager and default runtime where the host allows it.
- `Vitest` is the primary test runner.
- `Rolldown` is the default packaging and production bundling path through `vp build` and `vp pack`.
- Workspace scripts, package scripts, and CI use the same command model.

### Main tasks

- add `Vite+` workspace and task orchestration config
- move repo checks to `vp check` with `Oxlint`, `Oxfmt`, and type-aware checking
- move repo tests to `Vitest`
- move library and CLI packaging onto `Rolldown` through `vp pack`
- standardize `check`, `test`, `build`, and package-level `dev` scripts
- align client and shared-package toolchains with `Vite+`, `Vite`, `Rolldown`, `Oxc`, and `Vitest`

### Target commands

```bash
vp install
vp run -r typecheck
vp run -r test
vp run -r build
```

## Workstream 2: Core Platform Rewrite

Make the target packages the real implementation owners without preserving compatibility seams.

### Required owners

- `@aria/protocol`
- `@aria/store`
- `@aria/audit`
- `@aria/prompt`
- `@aria/tools`
- `@aria/policy`
- `@aria/memory`
- `@aria/automation`
- `@aria/agent-aria`
- `@aria/runtime`
- `@aria/gateway`

### Main tasks

- move request, event, identity, and streaming contracts fully into `@aria/protocol`
- make the store and database schema match the canonical domain model
- rebuild prompt, tools, and policy around the target package boundaries
- keep runtime responsible for execution, persistence coordination, policy resolution, approvals, and orchestration
- remove old engine-first naming where it conflicts with `runtime`, `server`, and `thread`

## Workstream 3: Canonical Domain Model

Make one durable domain model across protocol, persistence, runtime, server, relay, and client read models.

### Canonical entities

- `server`
- `workspace`
- `project`
- `environment`
- `thread`
- `thread_environment_binding`
- `session`
- `run`
- `job`
- `automation`
- `memory_record`
- `connector_account`
- `approval`
- `audit_event`
- `checkpoint`

### Main tasks

- align event identity, persistence, and read models to the same entity set
- make thread and run correlation explicit everywhere
- make environment binding durable and queryable
- ensure audit and approval records reference the canonical execution graph

## Workstream 4: Server, Console, Connectors, And Relay

Complete the server-hosted Aria stack as the canonical product surface.

### Required owners

- `@aria/server`
- `apps/aria-server`
- `@aria/console`
- `@aria/connectors-im`
- `@aria/relay`
- `services/aria-relay`

### Main tasks

- rebuild `Aria Server` bootstrap around `@aria/server`
- make `apps/aria-server` the actual deployable server app surface
- rebuild `Aria Console` as the server-local operator client
- complete auth, approvals, audit, memory, automation, connector hosting, and recovery semantics
- complete `Aria Relay` registration, routing, access grants, reconnect, attachment resume, and push/wakeup behavior

### Boundary rules

- `Aria Server` owns Aria Agent, memory, automation, approvals, connectors, and project control
- `Aria Relay` owns transport and access only
- `Aria Relay` must not own assistant logic, memory, automation semantics, or project truth

## Workstream 5: Projects, Workspaces, Jobs, And Coding Adapters

Complete the project execution plane with explicit package ownership.

### Required owners

- `@aria/projects`
- `@aria/workspaces`
- `@aria/jobs`
- `@aria/agents-coding`
- `@aria/desktop-bridge`
- `@aria/desktop-git`

### Main tasks

- make project threads and environment switching durable
- make workspace and worktree ownership explicit in `@aria/workspaces`
- make job lifecycle and remote execution explicit in `@aria/jobs`
- keep coding-agent contracts and adapters in `@aria/agents-coding`
- keep local-machine execution behind `@aria/desktop-bridge` and `@aria/desktop-git`

## Workstream 6: Aria Desktop App

Implement `Aria Desktop` as a real `Electron + React` application.

### OSS reuse policy

Desktop implementation is encouraged to reuse external open-source projects for:

- Electron app scaffolding
- workbench and pane layout primitives
- terminal and process UI
- diff and code-review surfaces
- command palette and notification infrastructure
- local persistence and cache helpers

Prefer projects that are:

- actively maintained
- MIT, Apache-2.0, or similarly permissive
- compatible with the Aria architecture and package boundaries
- composable enough to avoid forcing Aria into another product's runtime model

### Required outcomes

- real app bootstrap, packaging, and distribution flow
- `Aria` and `Projects` top-level spaces
- multi-server switcher
- unified project-thread navigation
- thread workspace with context panels
- local project mode through desktop-local bridge sessions
- no server-owned Aria capabilities moved into the desktop app

### Architectural rule

`Aria Desktop` may host local project execution, but `Aria Agent`, Aria-managed memory, connectors, approvals truth, and automation truth stay server-owned.

## Workstream 7: Aria Mobile App

Implement `Aria Mobile` as a real `React Native + Expo` application.

### OSS reuse policy

Mobile implementation is encouraged to reuse external open-source projects for:

- Expo app scaffolding
- navigation shells
- chat and thread presentation
- inbox and feed views
- notification handling
- reconnect and session-restore helpers
- attachment viewing and upload primitives

Prefer projects that are:

- actively maintained
- MIT, Apache-2.0, or similarly permissive
- Expo-compatible
- narrow enough to compose into Aria rather than redefine it

### Required outcomes

- real app bootstrap, packaging, and release flow
- server and relay connectivity
- Aria chat, inbox, approvals, automations, and project-thread review
- reconnect-safe session and attachment handling
- remote-first behavior with no local repo or coding-agent ownership

### Architectural rule

`Aria Mobile` is a remote-first client. It does not own local execution, local repos, local worktrees, Aria memory, or connector hosting.

## Workstream 8: Delete Legacy Surfaces

Once the new owners are live, remove obsolete wrappers and migration-only surfaces instead of preserving them.

### Main tasks

- delete re-export paths that only existed for compatibility
- remove packages and files that no longer fit the target architecture
- remove tests that only assert legacy compatibility behavior
- update docs to describe the final package and app surfaces only

## Testing Strategy

The blocking completion gate is: everything except desktop and mobile is complete and working.

Desktop and mobile are still part of the implementation plan, but they do not block that platform-complete gate.

### Platform-complete gate

The following must be covered and green:

- protocol contract tests
- store and persistence tests
- runtime and gateway execution tests
- server bootstrap and recovery tests
- relay routing and reconnect tests
- auth and approvals tests
- memory tests
- automation tests
- connector runtime tests
- projects, workspaces, jobs, and coding-adapter tests
- console and CLI workflow tests
- end-to-end server and relay flow tests

### Desktop and mobile validation track

The following are required for the app workstreams but are not part of the platform-complete blocker:

- desktop renderer tests
- desktop bridge and IPC contract tests
- desktop boot and packaging smoke tests
- mobile navigation and shell tests
- mobile reconnect and notification tests
- mobile boot and packaging smoke tests

### Blocking commands

```bash
vp run -r typecheck
vp run -r test
vp run -r build
```

## Recommended Execution Order

1. reset the repo to `Vite+`, `Vitest`, and `bun`
2. remove compatibility constraints and legacy-only tests
3. rebuild protocol, store, runtime, prompt, tools, policy, and gateway around target ownership
4. complete server, console, connectors, relay, and recovery
5. complete projects, workspaces, jobs, coding adapters, and desktop-local bridge boundaries
6. get the platform-complete gate fully green
7. implement the real desktop app with OSS reuse where it helps
8. implement the real mobile app with OSS reuse where it helps
9. delete leftover legacy surfaces and docs

## Exit Criteria

### Platform complete

- server, runtime, protocol, projects, relay, connectors, automation, memory, and console are aligned to the target architecture
- the platform-complete test gate is green
- obsolete compatibility layers are removed from the critical path

### Product complete

- platform-complete criteria are met
- `Aria Desktop` is a real `Electron + React` app
- `Aria Mobile` is a real `React Native + Expo` app
- both client apps respect the server-owned Aria boundary defined in `docs/new-architecture/*`
