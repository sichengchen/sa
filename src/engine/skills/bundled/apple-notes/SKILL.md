---
name: apple-notes
description: Manage Apple Notes via the `memo` CLI on macOS. Create, view, edit, search, move, and export notes.
---
# Apple Notes

Manage Apple Notes via the `memo` command-line interface on macOS.

## Setup

Install via Homebrew:
```bash
brew tap antoniorodr/memo && brew install antoniorodr/memo/memo
```

## Commands

### List all notes
```bash
memo list
```

### List notes in a specific folder
```bash
memo list --folder "Work"
```

### Search notes
```bash
memo search "query"
```

### Create a note
```bash
# Interactive editor
memo new

# Quick create with title
memo new --title "Meeting Notes"
```

### Edit a note
```bash
memo edit
```
Opens interactive selection prompt.

### Delete a note
```bash
memo delete
```
Opens interactive selection prompt.

### Move a note between folders
```bash
memo move
```
Interactive selection for source and destination.

### Export notes
```bash
# Export to HTML
memo export --format html

# Export to Markdown
memo export --format md
```

## Limitations

- Cannot edit notes containing images or attachments
- Interactive features require terminal access
- macOS only — requires Apple Notes.app

## Notes

- First run may prompt for automation permissions in System Settings
- Supports fuzzy search across note content
- Export converts selected notes to HTML or Markdown format
