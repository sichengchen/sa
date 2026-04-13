---
name: pinchtab
description: Browser automation via Pinchtab's HTTP API: navigate, click, fill forms, scrape, manage tabs. Use when: web scraping, form automation, or any task requiring a browser. NOT for: simple HTTP requests (use bash+curl instead) or tasks that don't need a browser.
homepage: https://pinchtab.com
---

# Pinchtab

Fast, lightweight browser control for AI agents via HTTP + accessibility tree.

## Setup

Start Pinchtab in one of these modes:

```bash
# Headless (default) — no UI, pure automation (lowest token cost when using /text and filtered snapshots)
pinchtab &

# Headed — visible Chrome for human + agent workflows
BRIDGE_HEADLESS=false pinchtab &

# Dashboard/orchestrator — profile manager + launcher, no browser in dashboard process
pinchtab dashboard &
```

Default port: `9867`. Override with `BRIDGE_PORT=9868`.
Auth: set `BRIDGE_TOKEN=<secret>` and pass `Authorization: Bearer <secret>`.

Base URL for all examples: `http://localhost:9867`

Token savings come from the API shape (`/text`, `/snapshot?filter=interactive&format=compact`), not from headless vs headed alone.

### Headed mode definition

Headed mode means a real visible Chrome window managed by Pinchtab.

- Human can open profile(s), log in, pass 2FA/captcha, and validate page state
- Agent then calls Pinchtab HTTP APIs against that same running profile instance
- Session state persists in the profile directory, so follow-up runs reuse cookies/storage

In dashboard workflows, the dashboard process itself does not launch Chrome; it launches profile instances that run Chrome (headed or headless).

To resolve a running profile endpoint from dashboard state:

```bash
pinchtab connect <profile-name>
```

Recommended human + agent flow:

```bash
# human
pinchtab dashboard
# setup profile + launch profile instance

# agent
PINCHTAB_BASE_URL="$(pinchtab connect <profile-name>)"
curl "$PINCHTAB_BASE_URL/health"
```

## Profile Management (Dashboard Mode)

When running `pinchtab dashboard`, profiles are managed via the dashboard API on port 9867.

### List profiles

```bash
curl http://localhost:9867/profiles
```

Returns array of profiles with `id`, `name`, `accountEmail`, `useWhen`, etc.

### Start a profile by ID

```bash
# Auto-allocate port (recommended)
curl -X POST http://localhost:9867/profiles/278be873adeb/start

# With specific port and headless mode
curl -X POST http://localhost:9867/profiles/278be873adeb/start \
  -H 'Content-Type: application/json' \
  -d '{"port": "9868", "headless": true}'

# Short alias (same behavior)
curl -X POST http://localhost:9867/start/278be873adeb
```

Returns the instance info including the allocated `port`. Use that port for all subsequent API calls (navigate, snapshot, action, etc.).

### Stop a profile by ID

```bash
curl -X POST http://localhost:9867/profiles/278be873adeb/stop

# Short alias
curl -X POST http://localhost:9867/stop/278be873adeb
```

### Check profile instance status

```bash
# By profile ID (recommended)
curl http://localhost:9867/profiles/278be873adeb/instance

# By profile name (also works)
curl http://localhost:9867/profiles/Pinchtab%20org/instance
```

### Launch by name (dashboard style)

```bash
curl -X POST http://localhost:9867/instances/launch \
  -H 'Content-Type: application/json' \
  -d '{"name": "work", "port": "9868"}'
```

### Typical agent flow with profiles

```bash
# 1. List profiles to find the right one
PROFILES=$(curl -s http://localhost:9867/profiles)
# Pick the profile ID you need (12-char hex, e.g. "278be873adeb")

# 2. Start the profile (auto-allocates port)
INSTANCE=$(curl -s -X POST http://localhost:9867/profiles/$PROFILE_ID/start)
PORT=$(echo $INSTANCE | jq -r .port)

# 3. Use the instance (all API calls go to the instance port)
curl -X POST http://localhost:$PORT/navigate -H 'Content-Type: application/json' \
  -d '{"url": "https://mail.google.com"}'
curl http://localhost:$PORT/snapshot?maxTokens=4000

# 4. Check instance status
curl http://localhost:9867/profiles/$PROFILE_ID/instance

# 5. Stop when done
curl -s -X POST http://localhost:9867/profiles/$PROFILE_ID/stop
```

### Profile IDs

Each profile gets a stable 12-char hex ID (SHA-256 of name, truncated) stored in `profile.json`. The ID is generated at creation time and never changes. Use IDs instead of names in automation — they're URL-safe and stable.

## Core Workflow

The typical agent loop:

1. **Navigate** to a URL
2. **Snapshot** the accessibility tree (get refs)
3. **Act** on refs (click, type, press)
4. **Snapshot** again to see results

Refs (e.g. `e0`, `e5`, `e12`) are cached per tab after each snapshot — no need to re-snapshot before every action unless the page changed significantly.

## API Reference

### Navigate

```bash
curl -X POST http://localhost:9867/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com"}'

# With options: custom timeout, block images, open in new tab
curl -X POST http://localhost:9867/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "timeout": 60, "blockImages": true, "newTab": true}'
```

### Snapshot (accessibility tree)

```bash
# Full tree
curl http://localhost:9867/snapshot

# Interactive elements only (buttons, links, inputs) — much smaller
curl "http://localhost:9867/snapshot?filter=interactive"

# Limit depth
curl "http://localhost:9867/snapshot?depth=5"

# Smart diff — only changes since last snapshot (massive token savings)
curl "http://localhost:9867/snapshot?diff=true"

# Text format — indented tree, ~40-60% fewer tokens than JSON
curl "http://localhost:9867/snapshot?format=text"

# Compact format — one-line-per-node, 56-64% fewer tokens than JSON (recommended)
curl "http://localhost:9867/snapshot?format=compact"

# YAML format
curl "http://localhost:9867/snapshot?format=yaml"

# Scope to CSS selector (e.g. main content only)
curl "http://localhost:9867/snapshot?selector=main"

# Truncate to ~N tokens
curl "http://localhost:9867/snapshot?maxTokens=2000"

# Combine for maximum efficiency
curl "http://localhost:9867/snapshot?format=compact&selector=main&maxTokens=2000&filter=interactive"

# Disable animations before capture
curl "http://localhost:9867/snapshot?noAnimations=true"

# Write to file
curl "http://localhost:9867/snapshot?output=file&path=/tmp/snapshot.json"
```

Returns flat JSON array of nodes with `ref`, `role`, `name`, `depth`, `value`, `nodeId`.

**Token optimization**: Use `?format=compact` for best token efficiency. Add `?filter=interactive` for action-oriented tasks (~75% fewer nodes). Use `?selector=main` to scope to relevant content. Use `?maxTokens=2000` to cap output. Use `?diff=true` on multi-step workflows to see only changes. Combine all params freely.

### Act on elements

```bash
# Click by ref
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "e5"}'

# Type into focused element (click first, then type)
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "e12"}'
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "type", "ref": "e12", "text": "hello world"}'

# Press a key
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "press", "key": "Enter"}'

# Focus an element
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "focus", "ref": "e3"}'

# Fill (set value directly, no keystrokes)
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "fill", "selector": "#email", "text": "user@example.com"}'

# Hover (trigger dropdowns/tooltips)
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "hover", "ref": "e8"}'

# Select dropdown option (by value or visible text)
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "select", "ref": "e10", "value": "option2"}'

# Scroll to element
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "scroll", "ref": "e20"}'

# Scroll by pixels (infinite scroll pages)
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "scroll", "scrollY": 800}'

# Click and wait for navigation (link clicks)
curl -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "e5", "waitNav": true}'
```

### Extract text

```bash
# Readability mode (default) — strips nav/footer/ads, keeps article/main content
curl http://localhost:9867/text

# Raw innerText (old behavior)
curl "http://localhost:9867/text?mode=raw"
```

Returns `{url, title, text}`. Cheapest option (~1K tokens for most pages).

### Screenshot

```bash
# Raw JPEG bytes
curl "http://localhost:9867/screenshot?raw=true" -o screenshot.jpg

# With quality setting (default 80)
curl "http://localhost:9867/screenshot?raw=true&quality=50" -o screenshot.jpg
```

### Evaluate JavaScript

```bash
curl -X POST http://localhost:9867/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "document.title"}'
```

### Tab management

```bash
# List tabs
curl http://localhost:9867/tabs

# Open new tab
curl -X POST http://localhost:9867/tab \
  -H 'Content-Type: application/json' \
  -d '{"action": "new", "url": "https://example.com"}'

# Close tab
curl -X POST http://localhost:9867/tab \
  -H 'Content-Type: application/json' \
  -d '{"action": "close", "tabId": "TARGET_ID"}'
```

Multi-tab: pass `?tabId=TARGET_ID` to snapshot/screenshot/text, or `"tabId"` in POST body.

### Tab locking (multi-agent)

```bash
# Lock a tab (default 30s timeout, max 5min)
curl -X POST http://localhost:9867/tab/lock \
  -H 'Content-Type: application/json' \
  -d '{"tabId": "TARGET_ID", "owner": "agent-1", "timeoutSec": 60}'

# Unlock
curl -X POST http://localhost:9867/tab/unlock \
  -H 'Content-Type: application/json' \
  -d '{"tabId": "TARGET_ID", "owner": "agent-1"}'
```

Locked tabs show `owner` and `lockedUntil` in `/tabs`. Returns 409 on conflict.

### Batch actions

```bash
# Execute multiple actions in sequence
curl -X POST http://localhost:9867/actions \
  -H 'Content-Type: application/json' \
  -d '{"actions":[{"kind":"click","ref":"e3"},{"kind":"type","ref":"e3","text":"hello"},{"kind":"press","key":"Enter"}]}'

# Stop on first error (default: false, continues through all)
curl -X POST http://localhost:9867/actions \
  -H 'Content-Type: application/json' \
  -d '{"tabId":"TARGET_ID","actions":[...],"stopOnError":true}'
```

### Cookies

```bash
# Get cookies for current page
curl http://localhost:9867/cookies

# Set cookies
curl -X POST http://localhost:9867/cookies \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","cookies":[{"name":"session","value":"abc123"}]}'
```

### Stealth

```bash
# Check stealth status and score
curl http://localhost:9867/stealth/status

# Rotate browser fingerprint
curl -X POST http://localhost:9867/fingerprint/rotate \
  -H 'Content-Type: application/json' \
  -d '{"os":"windows"}'
# os: "windows", "mac", or omit for random
```

### Health check

```bash
curl http://localhost:9867/health
```

## Token Cost Guide

| Method                         | Typical tokens | When to use                              |
| ------------------------------ | -------------- | ---------------------------------------- |
| `/text`                        | ~800           | Reading page content                     |
| `/snapshot?filter=interactive` | ~3,600         | Finding buttons/links to click           |
| `/snapshot?diff=true`          | varies         | Multi-step workflows (only changes)      |
| `/snapshot?format=compact`     | ~56-64% less   | One-line-per-node, best token efficiency |
| `/snapshot?format=text`        | ~40-60% less   | Indented tree, cheaper than JSON         |
| `/snapshot`                    | ~10,500        | Full page understanding                  |
| `/screenshot`                  | ~2K (vision)   | Visual verification                      |

**Strategy**: Start with `/snapshot?filter=interactive`. Use `?diff=true` on subsequent snapshots in multi-step tasks. Use `/text` when you only need the readable content. Use `?format=text` to cut token costs further. Use full `/snapshot` only for complete page understanding.

## Environment Variables

### Core runtime

| Var                     | Default                      | Description                                                                |
| ----------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `BRIDGE_BIND`           | `127.0.0.1`                  | Bind address — localhost only by default. Set `0.0.0.0` for network access |
| `BRIDGE_PORT`           | `9867`                       | HTTP port                                                                  |
| `BRIDGE_HEADLESS`       | `true`                       | Run Chrome headless                                                        |
| `BRIDGE_TOKEN`          | (none)                       | Bearer auth token (recommended when using `BRIDGE_BIND=0.0.0.0`)           |
| `BRIDGE_PROFILE`        | `~/.pinchtab/chrome-profile` | Chrome profile dir                                                         |
| `BRIDGE_STATE_DIR`      | `~/.pinchtab`                | State/session storage                                                      |
| `BRIDGE_NO_RESTORE`     | `false`                      | Skip tab restore on startup                                                |
| `BRIDGE_STEALTH`        | `light`                      | Stealth level: `light` or `full`                                           |
| `BRIDGE_MAX_TABS`       | `20`                         | Max open tabs (0 = unlimited)                                              |
| `BRIDGE_BLOCK_IMAGES`   | `false`                      | Block image loading                                                        |
| `BRIDGE_BLOCK_MEDIA`    | `false`                      | Block all media (images + fonts + CSS + video)                             |
| `BRIDGE_NO_ANIMATIONS`  | `false`                      | Disable CSS animations/transitions                                         |
| `BRIDGE_TIMEZONE`       | (none)                       | Force browser timezone (IANA tz)                                           |
| `BRIDGE_CHROME_VERSION` | `144.0.7559.133`             | Chrome version string used by fingerprint rotation                         |
| `CHROME_BINARY`         | (auto)                       | Path to Chrome/Chromium binary                                             |
| `CHROME_FLAGS`          | (none)                       | Extra Chrome flags (space-separated)                                       |
| `BRIDGE_CONFIG`         | `~/.pinchtab/config.json`    | Path to config JSON file                                                   |
| `BRIDGE_TIMEOUT`        | `15`                         | Action timeout (seconds)                                                   |
| `BRIDGE_NAV_TIMEOUT`    | `30`                         | Navigation timeout (seconds)                                               |
| `CDP_URL`               | (none)                       | Connect to existing Chrome DevTools                                        |
| `BRIDGE_NO_DASHBOARD`   | `false`                      | Disable dashboard/orchestrator endpoints on instance processes             |

### Dashboard mode (`pinchtab dashboard`)

| Var                        | Default                         | Description                                                   |
| -------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `PINCHTAB_AUTO_LAUNCH`     | `false`                         | Auto-launch a default profile at dashboard startup            |
| `PINCHTAB_DEFAULT_PROFILE` | `default`                       | Profile name for auto-launch                                  |
| `PINCHTAB_DEFAULT_PORT`    | `9867`                          | Port for auto-launched profile                                |
| `PINCHTAB_HEADED`          | (unset)                         | If set, auto-launched profile is headed; unset means headless |
| `PINCHTAB_DASHBOARD_URL`   | `http://localhost:$BRIDGE_PORT` | CLI helper base URL for `pinchtab connect`                    |

## Tips

- **Always pass `tabId` explicitly** when working with multiple tabs — active tab tracking can be unreliable
- Refs are stable between snapshot and actions — no need to re-snapshot before clicking
- After navigation or major page changes, take a new snapshot to get fresh refs
- Use `filter=interactive` by default, fall back to full snapshot when needed
- Pinchtab persists sessions — tabs survive restarts (disable with `BRIDGE_NO_RESTORE=true`)
- Chrome profile is persistent — cookies/logins carry over between runs
- Chrome uses its native User-Agent by default — `BRIDGE_CHROME_VERSION` only affects fingerprint rotation
- Use `BRIDGE_BLOCK_IMAGES=true` or `"blockImages": true` on navigate for read-heavy tasks — reduces bandwidth and memory
