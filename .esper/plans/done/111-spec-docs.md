---
id: 111
title: System spec docs in /specs with embedded access
status: done
type: feature
priority: 2
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
---
# System spec docs in /specs with embedded access

## Context

SA's documentation currently lives in `src/engine/skills/bundled/sa/docs/` as 7 large Markdown files (800+ lines each for security.md, architecture.md, configuration.md). The organization mixes concerns (tools.md covers both tool reference and security model), individual files are too long, and the docs are tightly coupled to the skill system.

The user wants a proper spec/manual for the entire system stored at `specs/` in the project root — the single source of truth. The bundled SA skill should become a minimal index that points agents to the specs. Since SA is distributed via brew as a single binary, specs must be accessible at runtime through the embedded skill system.

### Existing infrastructure

- `scripts/embed-skills.ts` recursively embeds all `.md` files under `src/engine/skills/bundled/` into `embedded-skills.generated.ts`
- `src/engine/skills/loader.ts` already has `loadEmbeddedDoc(skillName, relativePath)` and `listEmbeddedFiles(skillName)` — designed for this exact use case but not yet wired into any tool
- `read_skill` tool only loads SKILL.md content, not sub-files
- The skill registry resolves `{baseDir}` in SKILL.md content to the skill's directory path

### Current docs structure (to be replaced)

| File | Lines | Problem |
|------|-------|---------|
| architecture.md | 826 | Too long, mixes many subsystems |
| configuration.md | 796 | Too long, mixes config schema with usage |
| security.md | 842 | Too long, grew with Phase 8 additions |
| tools.md | 635 | Mixes tool reference with security model |
| automation.md | 354 | Reasonable but could split |
| sessions.md | 273 | OK |
| skills.md | 282 | OK |

## Approach

### 1. Create `specs/` directory with granular docs

Write spec docs at the project root. Each file should be focused and concise (~100-250 lines max). Use subdirectories for complex topics.

```
specs/
  README.md              — Spec index: what each doc covers, how to navigate
  overview.md            — What SA is, architecture diagram, quick start
  cli.md                 — CLI commands reference (sa, sa engine, sa config, sa audit)
  configuration.md       — Config schema reference (config.json fields only)
  sessions.md            — Session model, structured IDs, lifecycle
  skills.md              — Skill system, SKILL.md format, discovery
  automation.md          — Heartbeat, cron dispatch, webhooks
  subagents.md           — Delegate tool, orchestrator, memory policy
  development.md         — Dev setup, testing, CI/CD, contributing
  tools/
    README.md            — Tool system overview, danger classification, approval matrix
    exec.md              — Exec tool: hybrid classifier, patterns, env sanitization, sandbox
    memory.md            — Memory tools: write, search, read, delete
    web.md               — web_fetch (URL policy) + web_search
    delegate.md          — delegate + delegate_status, orchestrator
    file-io.md           — read, write, edit tools
    utility.md           — reaction, notify, set_env_secret, set_env_variable, read_skill
  security/
    README.md            — Threat model, security principles, layer summary
    approval-flow.md     — 3-tier approval, per-tool overrides, session overrides
    exec-classifier.md   — Always-dangerous patterns, always-safe commands, priority
    url-policy.md        — SSRF protection, blocked hosts/schemes, redirect following
    exec-fence.md        — Working directory restrictions, always-deny paths
    content-framing.md   — Data tags, prompt injection defense
    audit-log.md         — NDJSON format, rotation, CLI commands
    security-modes.md    — default/trusted/unrestricted, auto-revert TTL
    sandbox.md           — OS sandbox: macOS Seatbelt, noop fallback
    secrets-vault.md     — Encrypted secrets.enc, key derivation, migration
    auth.md              — Master token, device-flow pairing, webhook auth, token TTL
```

### 2. Build step: copy specs into bundled SA skill

Add a step to `scripts/embed-skills.ts` (or a new `scripts/copy-specs.ts` invoked before embed) that copies `specs/` → `src/engine/skills/bundled/sa/specs/`. This ensures the embed script picks them up and embeds them in the binary.

Add to `package.json` scripts: `"prebuild": "bun scripts/copy-specs.ts"` (or chain with existing embed step).

### 3. Extend `read_skill` to support reading sub-files

Add an optional `path` parameter to `read_skill`:

```typescript
parameters: Type.Object({
  name: Type.String({ description: "Skill name" }),
  path: Type.Optional(Type.String({ description: "Relative path to a doc file within the skill (e.g. 'specs/security/auth.md')" })),
})
```

When `path` is provided:
- Try filesystem first: `join(dirname(skill.filePath), path)`
- Fall back to embedded: `loadEmbeddedDoc(skillName, path)`
- Return the file content (no frontmatter stripping — spec files don't have frontmatter)

When `path` is omitted: existing behavior (load SKILL.md).

Also add a `list` mode: when `name` is provided but `path` is the special value `"_list"`, return the list of available files from `listEmbeddedFiles(skillName)` or filesystem scan.

### 4. Rewrite SA skill SKILL.md

Replace the current ~200-line SKILL.md with a minimal version (~60 lines):
- SA identity and architecture one-liner
- Table of available spec docs with descriptions and paths
- Instructions: "Use `read_skill({ name: 'sa', path: 'specs/<path>' })` to load any spec doc"
- Quick reference: CLI commands, config dir layout

### 5. Delete old docs

Remove `src/engine/skills/bundled/sa/docs/` entirely. The specs in `specs/` (copied to `sa/specs/` at build time) replace them.

### 6. Update CONSTITUTION.md

Add/update principle about specs:

```markdown
9. **`specs/` is the system manual** — `specs/` at the project root is the single source of truth for all SA documentation. It is copied into the bundled SA skill at build time and embedded in the binary for runtime access. When features change, update the relevant spec doc. The bundled SA skill SKILL.md is a concise index — detailed docs live in specs.
```

Replace principle 8 ("Keep documentation current") to reference specs instead of the sa skill docs directory.

### 7. Update CLAUDE.md

Update the Architecture section and doc references in CLAUDE.md to point to `specs/` instead of `src/engine/skills/bundled/sa/docs/`.

## Files to change

- `specs/` (create — ~22 spec doc files organized in subdirectories)
- `scripts/copy-specs.ts` (create — copies specs/ to bundled sa skill directory)
- `package.json` (modify — add copy-specs to build chain)
- `src/engine/tools/read-skill.ts` (modify — add path parameter for sub-file access)
- `src/engine/skills/bundled/sa/SKILL.md` (rewrite — minimal index pointing to specs)
- `src/engine/skills/bundled/sa/docs/` (delete — replaced by specs/)
- `.esper/CONSTITUTION.md` (modify — update docs principle to reference specs/)
- `CLAUDE.md` (modify — update doc references)

## Verification

- Run: `bun run typecheck && bun run lint && bun test`
- Expected: All pass
- Manual: `read_skill({ name: "sa", path: "specs/security/auth.md" })` returns the auth spec content
- Manual: `read_skill({ name: "sa", path: "_list" })` returns all available spec file paths
- Manual: `bun run build` succeeds and embedded-skills.generated.ts includes spec content
- Edge cases: Missing path returns helpful error, paths with `..` are rejected, non-existent files return clear error
