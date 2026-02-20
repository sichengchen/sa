---
name: apple-reminders
description: Manage Apple Reminders via the `remindctl` CLI on macOS. List, add, edit, complete, and delete reminders with date filters and JSON output.
---
# Apple Reminders CLI (remindctl)

Use `remindctl` to manage Apple Reminders directly from the terminal.

## Setup

Install via Homebrew:
```bash
brew install steipete/tap/remindctl
```

## Permissions

```bash
# Check permission status
remindctl status

# Request permission
remindctl authorize
```

## View Reminders

```bash
remindctl today         # Due today
remindctl tomorrow      # Due tomorrow
remindctl week          # Due this week
remindctl overdue       # Past due
remindctl upcoming      # All upcoming
remindctl completed     # Completed items
remindctl all           # Everything
remindctl 2026-01-04    # Specific date
```

## Manage Lists

```bash
remindctl list                    # Show all lists
remindctl list create "Shopping"  # Create a list
remindctl list rename "old" "new" # Rename a list
remindctl list delete "Shopping"  # Delete a list
```

## Create Reminders

```bash
# Quick add
remindctl add "Buy milk"

# With list and due date
remindctl add "Buy milk" --list "Shopping" --due "tomorrow"
```

## Edit Reminders

```bash
remindctl edit <id> --title "New title" --due "2026-02-01"
```

## Complete Reminders

```bash
remindctl complete 1 2 3
```

## Delete Reminders

```bash
remindctl delete <id> --force
```

## Output Formats

```bash
remindctl today --json     # JSON output
remindctl today --plain    # TSV output
remindctl today --quiet    # Count only
```

## Date Formats

- Relative: `today`, `tomorrow`, `next week`
- Absolute: `YYYY-MM-DD`
- ISO 8601: `2026-02-20T10:00:00`

## Notes

- macOS only — requires Reminders.app
- First run prompts for permission in System Settings
- If access denied, configure in System Settings > Privacy > Reminders
