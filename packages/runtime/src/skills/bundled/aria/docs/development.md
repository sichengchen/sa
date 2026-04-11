# Development

## Prerequisites

- [Bun](https://bun.sh) for package management, runtime, build, and test execution
- Git with working GPG signing if you sign commits locally
- Provider API keys for any live-model testing

## Setup

```bash
git clone <repo-url> aria
cd aria
bun install
```

Use `ARIA_HOME=/tmp/aria-dev` when you want an isolated runtime home for local testing.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Start Aria and open the TUI |
| `bun run typecheck` | Run TypeScript with no emit |
| `bun test` | Run unit, integration, and live-gated tests |
| `bun run build` | Copy docs, embed bundled skills, and build the CLI bundle |
| `bun run lint` | Run ESLint across `src/` and `packages/` |

## Repo Layout

```text
docs/                operator and architecture docs
specs/               package-level engineering contracts
packages/
  cli/               package wrapper for the CLI surface
  runtime/           runtime implementation owner
  projects-engine/   durable tracked-work services and schema
  handoff/           tracked-work submission boundary
  relay/             paired-device trust and transport state
  connectors/        TUI and chat connector surfaces
  shared-types/      shared brand and client/types
  providers-*/       runtime backend adapters
scripts/             build, embedding, and migration helpers
src/                 compatibility tree and remaining legacy entrypoints
tests/               package- and workflow-level tests
```

## Path Resolution

The repo is in a package-first transition.

| Alias | Resolves to |
| --- | --- |
| `@aria/engine/*` | `packages/runtime/src/*` |
| `@aria/connectors/*` | `packages/connectors/src/*` |
| `@aria/shared/*` | `packages/shared-types/src/*` |
| `@aria/cli/*` | `packages/cli/src/*` |

Within the repo, prefer package-owned implementations over deep relative imports into `src/`.

## Testing

Three test layers are active:

- co-located unit tests under `packages/runtime/src/**` and `packages/connectors/src/**`
- repo-level integration and workflow tests under `tests/`
- live-model tests under `tests/live/`, which skip when credentials are absent

Useful commands:

```bash
bun test
bun test tests/projects-workflows.test.ts
bun test tests/relay.test.ts
bun test tests/legacy-migration.test.ts
```

## Change Discipline

- Prefer package-owned edits before compatibility wrappers.
- Update matching docs and specs when architecture changes.
- Run `bun run typecheck`, `bun test`, and `bun run build` before closing substantial changes.
- Keep commits small and use conventional commit messages.
