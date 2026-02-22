---
id: 61
title: Replace apple-calendar skill with apple-calendar-cli
status: done
type: feature
priority: 2
phase: 005-security-tool-policy
branch: feature/005-security-tool-policy
created: 2026-02-22
shipped_at: 2026-02-22
---
# Replace apple-calendar skill with apple-calendar-cli

## Context
The bundled `apple-calendar` skill currently uses 7 bash scripts wrapping `osascript` (AppleScript) to interact with Calendar.app. These scripts are fragile, hard to maintain, and produce pipe-delimited text output that requires manual parsing.

A new dedicated CLI tool, `apple-calendar-cli`, is available via Homebrew (`brew install sichengchen/tap/apple-calendar-cli`). It uses EventKit directly (not AppleScript), supports structured JSON output via `--json`, and provides a cleaner command interface with proper flags.

### Current skill structure
```
src/engine/skills/bundled/apple-calendar/
├── SKILL.md               (frontmatter + command reference)
└── scripts/               (7 bash/AppleScript wrappers)
    ├── cal-list.sh
    ├── cal-events.sh
    ├── cal-read.sh
    ├── cal-create.sh
    ├── cal-update.sh
    ├── cal-delete.sh
    └── cal-search.sh
```

### Relevant patterns
- Other bundled skills with binary prerequisites use `metadata.openclaw.requires.bins` in SKILL.md frontmatter (see `homeassistant-skill`)
- `{baseDir}` template interpolation is no longer needed since the new CLI is a global binary
- Skill registry auto-discovers SKILL.md — no code changes needed beyond the skill itself

### Reference skill document
The upstream skill spec is at: https://raw.githubusercontent.com/sichengchen/apple-calendar-cli/refs/heads/main/skills/apple-calendar-cli.md

## Approach

1. **Rewrite `SKILL.md`** — Replace the entire content with the apple-calendar-cli skill document from the reference URL. Update the frontmatter to:
   - Keep `name: apple-calendar` (preserve the skill identity)
   - Update `description` to mention apple-calendar-cli instead of AppleScript
   - Add `homepage`, `metadata` (with `requires.bins: ["apple-calendar-cli"]`), and `compatibility` fields following the homeassistant-skill pattern

2. **Delete `scripts/` directory** — Remove all 7 bash/AppleScript wrapper scripts since apple-calendar-cli completely replaces them.

3. **Verify** — Confirm skill loads correctly and content renders properly.

## Files to change
- `src/engine/skills/bundled/apple-calendar/SKILL.md` (modify — complete rewrite with apple-calendar-cli reference)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-list.sh` (delete)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-events.sh` (delete)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-read.sh` (delete)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-create.sh` (delete)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-update.sh` (delete)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-delete.sh` (delete)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-search.sh` (delete)

## Verification
- Run: `bun run typecheck && bun run lint`
- Expected: No regressions — skill changes are pure Markdown, no TS impact
- Manual: `bun run dev` → activate the apple-calendar skill → confirm the content references `apple-calendar-cli` commands instead of bash scripts
- Edge cases:
  - Confirm no other files reference the deleted `scripts/` directory or `{baseDir}` for this skill
  - Confirm skill name stays `apple-calendar` so any existing activation state is preserved

## Progress
- [x] Milestone 1: Rewrite SKILL.md with apple-calendar-cli content and updated frontmatter
- [x] Milestone 2: Delete all 7 scripts and scripts/ directory
- [x] Milestone 3: Verification — typecheck, lint, no stale references
