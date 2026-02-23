---
id: 94
title: fix: sa --help shows error instead of usage text
status: done
type: fix
priority: 3
phase: 007-memory-redesign
branch: fix/sa-help-output
created: 2026-02-23
shipped_at: 2026-02-23
pr: https://github.com/sichengchen/sa/pull/27
---
# fix: sa --help shows error instead of usage text

## Context

`src/cli/index.ts:131-135` dispatches subcommands via a `COMMANDS` dictionary. When an unknown command is encountered, it prints:
```
Unknown command: --help
Run 'sa help' for usage information.
```
and exits with code 1.

`--help` and `-h` are standard CLI conventions. Users who type `sa --help` or `sa -h` see an error instead of the help text they expect. This makes the CLI feel broken on first contact. `sa help` works correctly (it is in `COMMANDS`) but is non-standard.

## Approach

1. Before the `COMMANDS[subcommand]` lookup in `src/cli/index.ts`, add a special case: if `argv` includes `--help`, `-h`, or `help` (or if `argv` is empty), call the existing `help` handler.
2. Ensure the same flag handling works for subcommand help: `sa engine --help` should show engine-specific usage if that pattern is supported, or fall back to global help.
3. Verify `process.argv` parsing handles the flag in both positions: `sa --help` and `sa help`.

## Files to change

- [src/cli/index.ts](src/cli/index.ts) (modify — add `--help` / `-h` aliasing before COMMANDS dispatch, ~lines 128-135)

## Verification

- Run: `bun run dev -- --help` — must print usage text and exit 0
- Run: `bun run dev -- -h` — same
- Run: `bun run dev -- help` — existing behavior must still work
- Regression check: `bun run dev` (no args) should still trigger first-run detection or show usage; unknown commands should still show the error message

## Progress
- Added `--help` and `-h` flag handling before COMMANDS dispatch in `src/cli/index.ts`
- Updated help text to include a "Flags" section listing --help/-h
- Verified: `bun run dev -- --help`, `-h`, and `help` all show correct output
- Modified: src/cli/index.ts
- Verification: 535 tests pass, lint clean, typecheck clean
