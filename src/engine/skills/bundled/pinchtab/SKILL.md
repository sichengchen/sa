---
name: pinchtab
description: Control Chrome browser via Pinchtab HTTP API. Fast, lightweight browser automation using accessibility tree snapshots.
---
# Pinchtab

Control Chrome browser via the Pinchtab HTTP API — fast, lightweight browser control for AI agents.

## Setup

Pinchtab runs as a local HTTP server (default port 9867). Ensure it is running before using these endpoints.

## Core Endpoints

### Navigate
```bash
curl -s -X POST "http://localhost:9867/navigate" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

### Get Page Snapshot (Accessibility Tree)
```bash
# Compact format (best token efficiency)
curl -s "http://localhost:9867/snapshot?format=compact"

# Interactive elements only (~75% fewer nodes)
curl -s "http://localhost:9867/snapshot?format=compact&filter=interactive"

# Diff mode for multi-step workflows
curl -s "http://localhost:9867/snapshot?format=compact&diff=true"
```

### Extract Text
```bash
# Readable text (~800 tokens)
curl -s "http://localhost:9867/text"

# Raw text
curl -s "http://localhost:9867/text?mode=raw"
```

### Screenshot
```bash
curl -s "http://localhost:9867/screenshot" -o /tmp/page.png
```

### Interact with Elements
```bash
# Click an element by ref
curl -s -X POST "http://localhost:9867/action" \
  -H "Content-Type: application/json" \
  -d '{"action": "click", "ref": "button-submit"}'

# Type into an element
curl -s -X POST "http://localhost:9867/action" \
  -H "Content-Type: application/json" \
  -d '{"action": "type", "ref": "input-search", "text": "hello world"}'

# Scroll
curl -s -X POST "http://localhost:9867/action" \
  -H "Content-Type: application/json" \
  -d '{"action": "scroll", "direction": "down"}'

# Hover
curl -s -X POST "http://localhost:9867/action" \
  -H "Content-Type: application/json" \
  -d '{"action": "hover", "ref": "menu-item"}'
```

### Tab Management
```bash
# List tabs
curl -s "http://localhost:9867/tabs"

# Switch tab
curl -s -X POST "http://localhost:9867/tabs/switch" \
  -H "Content-Type: application/json" \
  -d '{"tabId": 1}'
```

## Workflow

1. Navigate to the target URL
2. Get a compact snapshot to understand the page structure
3. Use element refs from the snapshot to interact (click, type, etc.)
4. Get a new snapshot after each action to see the updated state
5. Use `?diff=true` for efficiency in multi-step workflows

## Token Optimization Tips

- Use `?format=compact` for best token efficiency
- Add `?filter=interactive` for action-oriented tasks
- Use `/text` endpoint when you only need readable content
- Use `?diff=true` to see only what changed between snapshots

## Notes

- Default port: 9867
- Supports headless and headed modes
- Element refs are stable identifiers from the accessibility tree
- Always get a fresh snapshot after performing actions
