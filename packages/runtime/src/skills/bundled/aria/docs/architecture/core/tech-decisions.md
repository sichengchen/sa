# Technology Decisions

This page records the target technical choices for Aria clients and monorepo tooling.

These are architecture decisions, not implementation notes.

## Decision Summary

| Area                            | Decision                                 |
| ------------------------------- | ---------------------------------------- |
| Desktop app shell               | `Electron + React`                       |
| Mobile app shell                | `React Native + Expo`                    |
| Repo package manager            | `bun`, managed through `Vite+`           |
| Default runtime selection       | `bun` where the host allows it           |
| Client/shared-package toolchain | `Vite+ / Vite / Rolldown / Oxc / Vitest` |
| Monorepo management             | `Vite+`                                  |
| Monorepo task orchestration     | `Vite+` via `vp run`                     |

## 1. Desktop App Decision

### Decision

Use `Electron + React` for `Aria Desktop`.

### Why

- desktop needs deep local-machine integration
- desktop needs local filesystem and process access for local project mode
- desktop needs a mature cross-platform shell
- React fits the thread-first, pane-based UI model well
- shared React-based UI and state patterns can overlap with other surfaces

### Boundary Clarification

`bun` is not the embedded runtime inside the shipped Electron app.

At runtime, Electron provides:

- Chromium for the renderer
- Node-compatible Electron main/preload environments for the desktop shell

For Aria, `bun` remains:

- the selected package manager through Vite+
- the selected runtime where the host allows it
- the main script/runtime layer for development tooling and server-side packages
- the default execution layer for Aria packages that are not constrained by Electron or Expo host runtimes

### Recommended Stack Inside Desktop

- shell: `Electron`
- renderer UI: `React`
- renderer/shared-package toolchain: `Vite+`, `Vite`, `Rolldown`, `Oxc`, `Vitest`
- desktop-local integration layer: `@aria/desktop-bridge`

## 2. Mobile App Decision

### Decision

Use `React Native + Expo` for `Aria Mobile`.

### Why

- mobile needs a native app shell
- Expo shortens time-to-ship for mobile app infrastructure
- React Native preserves conceptual UI overlap with desktop React code
- Expo works well for notification, device capability, and mobile distribution flows

### Boundary Clarification

`bun` is not the embedded runtime inside the shipped mobile app either.

At runtime, the mobile app uses the React Native host environment rather than bun.

For Aria, bun still remains the selected package manager/runtime choice for:

- scripts
- server-side packages
- shared tooling
- workspace package operations through the Vite+ workflow

### Recommended Stack Inside Mobile

- shell: `React Native + Expo`
- shared UI/contracts: React-compatible shared packages where practical
- shared checks/tests/tooling: Oxc, Vitest, and bun-driven scripts where supported

## 3. Bun Decision

### Decision

Use `bun` as the selected package manager and runtime, with `Vite+` as the monorepo-management layer.

### Why

- good fit for Aria’s existing runtime direction
- strong developer ergonomics in a mixed TypeScript monorepo
- aligns with the desire to keep a bun-centered runtime story for server-side Aria code
- still fits inside the Vite+ model, which supports bun as a managed choice

### Important Nuance

“Use bun” should be interpreted precisely:

- yes for package management and runtime in Aria repo workflows
- yes for `Aria Server`, CLI utilities, shared scripts, and many packages
- no as the literal embedded runtime of Electron
- no as the literal embedded runtime of React Native / Expo

So the practical rule is:

`bun is the selected package manager/runtime for Aria workflows where supported, but it is not the physical runtime inside every shipped app shell.`

## 4. Client Toolchain Decision

### Decision

Use the broader VoidZero stack for client and shared-package tooling:

- `Vite+`
- `Vite`
- `Rolldown`
- `Oxc`
- `Vitest`

while explicitly selecting `bun` as the package manager and runtime for Aria.

### Why

- coherent modern TS/JS toolchain
- strong performance characteristics
- good monorepo ergonomics
- aligns well with shared UI packages and AI-assisted workflows

### Scope

This decision applies most strongly to:

- `@aria/desktop`
- `@aria/access-client`
- client-facing slices of `@aria/projects`

It does not require every package in the repo to be a Vite+ surface, but it does make Vite+ the monorepo-management entry point.

## 5. Monorepo Decision

### Decision

Use `Vite+` as the monorepo-management layer while selecting `bun` as the package manager and runtime underneath it.

### Why

This keeps responsibilities clear:

- `Vite+` owns repo-wide task execution, caching, dependency-aware orchestration, and the monorepo command surface
- `bun` provides package installation, workspace linking, and runtime execution where supported

### Recommended Model

- workspace graph: standard workspace package graph declared in `package.json`
- package manager: `bun`
- package manifests: standard `package.json`
- monorepo entrypoint: `Vite+`
- task orchestration: `vp run`
- repo-wide checks: `vp check`, `vp test`, `vp run -r`
- package-specific native commands still exist where needed

### What Vite+ Should Do

- recursive workspace builds and checks
- dependency-aware task ordering
- caching for repo tasks
- package-manager/runtime coordination at the workflow layer
- consistent command surface for client and shared packages

### What Vite+ Should Not Be Forced To Do

- replace Electron itself
- replace Expo itself
- replace the underlying package manager/runtime implementation

The workspace graph should still come from the monorepo’s actual package relationships.

## 6. Recommended Working Setup

### Monorepo foundation

- Vite+ as the monorepo command surface
- bun as package manager/runtime
- shared `package.json` scripts where useful
- `vp run` for workspace-aware orchestration

### Desktop

- Electron shell
- React renderer
- Vite+/Vite-based renderer tooling

### Server

- bun runtime
- bun-driven scripts where appropriate
- standard TypeScript packages inside the same monorepo

## 7. Practical Command Model

Illustrative top-level commands:

```bash
vp install
vp run repo:check
vp run repo:test
vp run repo:build
vp run @aria/server#dev
```

The important point is not the exact script names. It is the split:

- Vite+ manages the monorepo workflow
- bun provides package management and runtime execution under that workflow

## 8. Official References

- [Vite+ official site](https://viteplus.dev/)
- [Vite+ run / workspace guide](https://viteplus.dev/guide/run)
- [VoidZero official site](https://voidzero.dev/)

The official Vite+ docs describe it as a unified toolchain that manages runtime, package manager, and frontend tooling, list bun among supported managed choices, and document `vp run` as a workspace-aware task runner with dependency ordering and caching.
