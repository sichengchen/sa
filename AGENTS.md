# AGENTS

Use this file to bootstrap any coding agent into the current Esperta Aria workflow.

## Required Reads

1. Read `README.md` for the public product surface and operator entrypoints.
2. Read this file before making changes.
3. Read the canonical Aria docs in `docs/` that match the area you are changing.
4. Start with these platform docs unless the task is narrowly scoped elsewhere:
   - `docs/product/aria-platform.md`
   - `docs/system/runtime-model.md`
   - `docs/system/prompt-engine.md`
   - `docs/system/tool-runtime.md`
   - `docs/system/automation.md`
   - `docs/interfaces/interaction-protocol.md`

## Source Of Truth

- `docs/` is the authoritative architecture and behavior tree.
- `src/` is the live implementation.
- When docs and implementation diverge, move the code toward the Aria architecture and update the docs as part of the shipped change.

## Working Rules

- Public identity is `Esperta Aria`.
- Runtime identity is `Aria Runtime`.
- CLI identity is `aria`.
- Runtime home is `~/.aria/` or `ARIA_HOME`.
- Do not carry `SA` or `Esperta Base` forward in user-facing names, paths, logs, docs, or connector surfaces.
- Prefer durable runtime state, structured toolsets, shared interaction contracts, and policy-driven execution over legacy compatibility.

## Verification

- Run `bun run typecheck` before closing substantial changes.
- Run `bun test` before closing substantial changes.
- Run `bun run build` before closing substantial changes.
- If a task is docs-only or otherwise exempt, state that explicitly in the handoff.
