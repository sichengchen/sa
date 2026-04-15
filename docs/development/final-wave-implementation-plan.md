# Final Wave Implementation Plan

This plan continues `docs/development/new-architecture-implementation-plan.md` and uses `docs/new-architecture/*` as the source of truth.

## Current Status

### Completed

- Repo toolchain is effectively aligned around `Vite+`, `Vitest`, and `bun`.
- Major ownership moves are already in place across:
  - `@aria/server`
  - `@aria/protocol`
  - `@aria/memory`
  - `@aria/projects`
  - `@aria/workspaces`
  - `@aria/access-client`
- `@aria/runtime` has been reduced toward a compatibility shell instead of remaining the primary owner.
- `apps/aria-server` and `services/aria-relay` now exist as real app/service seams.
- `Aria Desktop` now has:
  - Electron scaffold
  - connected Aria thread bootstrap
  - send/stop
  - session restore/search
  - approvals/questions
  - server switching
  - local project thread selection
  - active-thread environment selection in the UI/controller
- `Aria Mobile` now has:
  - Expo/native scaffold
  - connected Aria thread bootstrap
  - send/stop
  - session restore/search
  - approvals/questions
  - server switching
  - editable draft input
- Old architecture retirement has started. These old pages are already retired:
  - `docs/architecture/projects-engine.md`
  - `docs/architecture/relay.md`
  - `docs/architecture/monorepo.md`
  - `docs/architecture/providers.md`
- Prompt-engine guidance now lives in:
  - `docs/new-architecture/prompt-engine.md`
- Contributor and bundled-skill doc entrypoints now point at the current canonical docs tree.
- The remaining `docs/architecture/*` pages have been retired after their target-state content was moved into `docs/new-architecture/*` and current development docs.
- `@aria/projects` now exposes a dedicated thread-environment switch service, `@aria/desktop-bridge` exposes it at the desktop-local boundary, and the CLI plus desktop shell can route environment changes through that durable mutation path.
- `apps/aria-mobile` now includes Expo app identifiers plus EAS build and submit profiles for preview and production release flows.
- `apps/aria-server` now owns the daemon process-spec and spawn helper used by both runtime startup and restart, while the CLI hidden host command remains only as a packaged fallback path.
- Relay resumed attachments now preserve `jobId` correlation into queued follow-up and approval events after reconnect.
- Protocol and gateway tests now prove durable identity on normal streamed chat events, not only streamed errors.
- Connector runtime coverage now includes the shared stream handler plus Chat SDK adapter question, approval, and session-command fallbacks.
- Console workflow coverage now includes a dedicated command-layer helper with direct tests for session, engine, model, provider, and session-switch flows.
- The pack build now externalizes Bun-native modules explicitly, removing the prior `bun` and `bun:sqlite` unresolved-import warning noise from the green build.
- The platform-complete gate currently runs green end-to-end through `bun run verify`.
- Desktop host composition now injects a real bridge-backed project environment-switch callback by default when a desktop bridge or projects repository is supplied, instead of relying on the shell's in-memory fallback path.
- Desktop shell models can now derive and display tracked repo/worktree state for the active local project thread through the desktop-local boundary.
- Relay host tests now prove persisted server, device, grant, attachment, and queued-event state reloads across service restarts.
- Server daemon restart, stale-discovery cleanup, and health-status behavior now run through an injectable controller with direct restart/recovery tests.

### Not Completed

- Legacy boot surfaces are still on the critical path.
- Protocol/gateway/runtime ownership is still partially split in places.
- Server/relay reconnect, recovery, and e2e proof are not yet complete enough.
- Console still needs deeper end-to-end UI coverage, and connector runtime proof still needs broader end-to-end recovery and audit coverage beyond the current focused adapter tests.
- Desktop and mobile exist, but they are not yet complete as real product apps.

## Final Wave Goals

1. Get the platform-complete gate green first.
2. Finish desktop and mobile as real apps without violating the server-owned Aria boundary.
3. Delete remaining legacy wrappers, docs, and compatibility-only surfaces.

## Final Wave Execution Order

### 1. Fix Documentation Entrypoints

Repair broken contributor and agent entrypoints before further work.

#### Main tasks

- update `AGENTS.md` to point at current canonical docs
- update bundled Aria skill doc entrypoints
- remove dead references to deleted architecture pages
- keep `docs/new-architecture/*` as the default architecture path

#### Why first

Broken docs cause future implementation work to start from the wrong source of truth.

### 2. Finish Retiring Old Architecture Docs

This slice is now complete.

#### Retired pages

- `docs/architecture/runtime.md`
- `docs/architecture/storage-and-recovery.md`
- `docs/architecture/tool-runtime.md`
- `docs/architecture/handoff.md`
- `docs/architecture/interaction-protocol.md`
- `docs/architecture/README.md`

#### Rule

- keep target-state material in `docs/new-architecture/*`
- keep operator and workflow notes in `docs/operator/*` or `docs/development/*`
- do not reintroduce `docs/architecture/*` as a second source of truth
- regenerate bundled docs after each docs slice

### 3. Remove Legacy Boot Surfaces From The Critical Path

Make target owners the real live path for server startup and local access.

#### Main tasks

- cut over CLI/server boot flow away from engine-era seams
- stop relying on legacy daemon/discovery file naming as the primary path
- move root app startup to `@aria/server` and `apps/aria-server`
- reduce remaining `@aria/runtime` boot/re-export responsibility

#### Likely areas

- `packages/cli/src/index.ts`
- `package.json`
- `apps/aria-server/src/*`
- `packages/server/src/*`
- `packages/runtime/src/*`

### 4. Finish Protocol, Gateway, And Runtime Contract Ownership

Complete the target ownership cutover for request/event/identity/streaming contracts.

#### Main tasks

- finish moving real contract ownership into `@aria/protocol`
- reduce request/procedure/stream coupling across runtime/gateway compatibility seams
- strengthen protocol contract tests
- make thread/run correlation explicit everywhere

#### Likely areas

- `packages/protocol/src/*`
- `packages/gateway/src/*`
- `packages/runtime/src/*`
- protocol and procedure tests

### 5. Complete Server, Relay, Console, Connector, And Recovery Semantics

Strengthen the platform until the platform-complete gate is credible.

#### Main tasks

- deepen server restart/recovery coverage
- deepen relay reconnect/attachment resume/routing coverage
- complete console workflow coverage
- complete connector runtime, approvals, audit, and recovery coverage
- extend e2e server+relay flow tests

#### Likely areas

- `packages/server/src/*`
- `packages/relay/src/*`
- `services/aria-relay/*`
- `packages/console/src/*`
- `packages/connectors-im/src/*`
- `tests/server-host.test.ts`
- `tests/relay*.test.ts`
- `tests/e2e/smoke.test.ts`

### 6. Complete Projects, Workspaces, Jobs, Coding Adapters, And Desktop-Local Boundaries

Finish the project execution plane as defined by the new architecture.

#### Main tasks

- make project-thread environment switching durable
- record environment-switch history explicitly
- prove job lifecycle and recovery
- keep coding-agent contracts in `@aria/agents-coding`
- keep local execution behind `@aria/desktop-bridge` and `@aria/desktop-git`

#### Likely areas

- `packages/projects/src/*`
- `packages/workspaces/src/*`
- `packages/jobs/src/*`
- `packages/agents-coding/src/*`
- `packages/desktop-bridge/src/*`
- `packages/desktop-git/src/*`

### 7. Run The Platform-Complete Gate Until Green

This is the blocking closeout for everything except desktop/mobile.

#### Blocking commands

```bash
vp run -r typecheck
vp run -r test
vp run -r build
```

#### Platform-complete definition

- server, runtime, protocol, projects, relay, connectors, automation, memory, and console align to the target architecture
- obsolete compatibility layers are removed from the critical path
- the full platform gate is green

### 8. Finish Aria Desktop As A Real App

Desktop work continues after the platform gate is green.

#### Best next desktop slice

Implement real local project mode.

#### Main tasks

- connect desktop shell flows to local bridge sessions
- surface local repo/worktree/git state
- connect local coding-agent execution flows
- improve desktop shell into a real three-pane workbench
- add desktop IPC/bridge tests
- add boot and packaging smoke coverage
- add distribution flow in `apps/aria-desktop`

#### Constraints

- `Aria Agent`, memory, connectors, approvals truth, and automation remain server-owned
- desktop may host local project execution only through desktop-local boundaries

### 9. Finish Aria Mobile As A Real App

Mobile remains remote-first and must not grow local execution ownership.

#### Main tasks

- build a real mobile navigation shell
- add inbox, approvals, automation, and project review flows
- improve reconnect-safe session handling
- add notification/push and attachment handling
- add mobile boot and packaging smoke coverage
- add release/build config in `apps/aria-mobile`

#### Constraints

- no local repo ownership
- no local coding-agent execution
- no memory, connector, or automation hosting on device

### 10. Delete Remaining Legacy Surfaces

After platform and app completion, remove remaining compatibility-only surfaces.

#### Main tasks

- delete remaining `@aria/runtime` wrapper paths once no longer needed
- remove engine-era naming/files from live use
- remove compatibility-only tests that preserve obsolete behavior
- keep final docs limited to current package/app surfaces

## Validation Strategy

### Per-slice validation

- run focused tests after each implementation slice
- regenerate bundled docs after each docs slice
- keep commits small and conventional

### Platform-complete gate

```bash
vp run -r typecheck
vp run -r test
vp run -r build
```

### Desktop validation track

- desktop renderer tests
- desktop bridge and IPC contract tests
- desktop boot smoke tests
- desktop packaging smoke tests

### Mobile validation track

- mobile navigation and shell tests
- mobile reconnect tests
- mobile notification tests
- mobile boot smoke tests
- mobile packaging smoke tests

## Risks

### Highest risk

- engine-era daemon/discovery files are still on the live boot path
- deleting remaining architecture docs too early could remove useful current-state notes
- desktop local-project mode could accidentally blur the server-owned Aria boundary
- mobile reconnect/push work can sprawl unless kept strictly remote-first

### Mitigation

- cut legacy boot paths over in small commits
- migrate docs before deletion when content is still useful
- keep desktop work confined to `@aria/desktop`, `@aria/desktop-bridge`, `@aria/desktop-git`, and related app code
- keep mobile work confined to access, presentation, reconnect, and notification layers

## Recommended Commit Sequence

1. `docs(...)` repair remaining doc entrypoints
2. `docs(...)` retire remaining old architecture pages in small slices
3. `refactor(server)` or `refactor(cli)` remove legacy boot path from critical path
4. `refactor(protocol)` complete protocol/gateway/runtime contract ownership
5. `test(server)` and `test(relay)` deepen recovery/reconnect/e2e proof
6. `feat(projects)` make environment switching durable and queryable
7. `test(repo)` run and fix the full platform-complete gate
8. `feat(desktop)` implement real local project mode
9. `feat(desktop)` add packaging/distribution smoke path
10. `feat(mobile)` implement real mobile navigation/reconnect/review flows
11. `feat(mobile)` add packaging/release smoke path
12. `refactor(runtime)` remove final compatibility wrappers
13. `docs(...)` remove final legacy architecture/doc references

## Exit Criteria

### Platform Complete

- platform-complete gate is green
- target owners are the real live path
- legacy compatibility layers are off the critical path
- `docs/new-architecture/*` is the architecture source of truth

### Product Complete

- platform-complete criteria are met
- `Aria Desktop` is a real `Electron + React` app
- `Aria Mobile` is a real `React Native + Expo` app
- both apps preserve the server-owned Aria boundary
