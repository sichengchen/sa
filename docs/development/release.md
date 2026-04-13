# Release

## CI

CI runs:

- secret scan
- lint
- typecheck
- tests
- build

## Pre-finalization checks

Before merge/finalization on long-running migration branches:

- `vp run repo:check`
- `vp run repo:test`
- `vp run repo:build`
- `bun run audit:history -- origin/new-aria..HEAD`

The history audit checks that the pending branch-range commits do not contain
system-generated `auto-checkpoint` wording and that they include the required
Lore trailers.

## Release Flow

Tagged releases build the Bun bundle, publish GitHub artifacts, and update the Homebrew formula.

## Artifacts

The current build publishes the CLI bundle under `dist/`.
