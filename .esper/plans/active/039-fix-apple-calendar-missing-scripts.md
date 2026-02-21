---
id: 39
title: fix: create missing shell scripts for apple-calendar bundled skill
status: active
type: fix
priority: 1
phase: phase-2
branch: fix/apple-calendar-scripts
created: 2026-02-20
---
# fix: create missing shell scripts for apple-calendar bundled skill

## Context

The `apple-calendar` bundled skill's SKILL.md references 7 shell scripts (`scripts/cal-*.sh`) that were never created. When the agent reads the skill and tries to run the scripts, it gets "No such file or directory". This is the only Apple skill with this problem — the others use inline osascript or external CLI tools.

Additionally, the `1password` skill references `references/get-started.md` and `references/cli-examples.md` that also don't exist.

## Approach

1. Create `src/engine/skills/bundled/apple-calendar/scripts/` directory with 7 AppleScript wrapper shell scripts:
   - `cal-list.sh` — list all calendars
   - `cal-events.sh [days_ahead] [calendar_name]` — list events
   - `cal-read.sh <event-uid> [calendar_name]` — read event details
   - `cal-create.sh <calendar> <summary> <start> <end> [location] [description] [allday] [recurrence]` — create event
   - `cal-update.sh <event-uid> [--summary X] [--start X] [--end X] [--location X] [--description X]` — update event
   - `cal-delete.sh <event-uid> [calendar_name]` — delete event
   - `cal-search.sh <query> [days_ahead] [calendar_name]` — search events

   Each script wraps `osascript` calls to Calendar.app. Output format matches SKILL.md spec:
   - Events: `UID | Summary | Start | End | AllDay | Location | Calendar`
   - Read: full details with description, URL, recurrence

2. Create `src/engine/skills/bundled/1password/references/` directory with:
   - `get-started.md` — install + app integration + sign-in flow
   - `cli-examples.md` — real `op` CLI usage examples

3. Mark all `.sh` files executable (`chmod +x`).

## Files to change

- `src/engine/skills/bundled/apple-calendar/scripts/cal-list.sh` (create)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-events.sh` (create)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-read.sh` (create)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-create.sh` (create)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-update.sh` (create)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-delete.sh` (create)
- `src/engine/skills/bundled/apple-calendar/scripts/cal-search.sh` (create)
- `src/engine/skills/bundled/1password/references/get-started.md` (create)
- `src/engine/skills/bundled/1password/references/cli-examples.md` (create)

## Verification

- Run: `cd src/engine/skills/bundled/apple-calendar && scripts/cal-list.sh`
- Expected: lists calendars from Calendar.app (pipe-delimited)
- Run: `scripts/cal-events.sh 7` — should list upcoming events
- Regression check: `bun run typecheck` still passes; other skills unaffected

## Progress
- Milestones: 2 commits
- Modified: src/engine/skills/bundled/apple-calendar/scripts/cal-list.sh, cal-events.sh, cal-read.sh, cal-create.sh, cal-update.sh, cal-delete.sh, cal-search.sh, src/engine/skills/bundled/1password/references/get-started.md, cli-examples.md
- Verification: cal-list.sh returns 19 calendars; bun run typecheck passes
- Verification: not yet run — run /esper:finish to verify and archive
