# Testing

## Main Checks

```bash
vp run repo:check
vp run repo:test
vp run repo:build
vp run repo:verify
```

Convenience wrappers are also available through `bun run`.

`vp run repo:check` uses `Vite+` with `Oxc` for format and lint checks, then runs `tsc --noEmit` for TypeScript validation.

`vp run repo:test` uses `Vitest` with the shared `vite.config.ts` configuration under the Bun runtime.

## Test Layout

- co-located runtime and connector tests under `packages/**`
- repo-level workflow and integration tests under `tests/`
- live-gated tests under `tests/live/`

## Expectations

- every bug fix gets a regression test
- workflow surfaces should have service-level or command-level tests
- live-model tests should assert structure and events, not exact prose
