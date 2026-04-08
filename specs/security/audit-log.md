# Audit Log

Append-only security event log recording tool calls, approval decisions,
authentication events, and security blocks.

---

## Event Types

| Event | Description |
|-------|-------------|
| `tool_call` | Tool invocation started |
| `tool_result` | Tool returned a result |
| `tool_approval` | User approved a tool call |
| `tool_denial` | User denied a tool call (or timeout) |
| `security_block` | Security layer blocked a tool call |
| `security_escalation` | Security layer triggered an escalation prompt |
| `auth_success` | Successful authentication (pairing, token validation) |
| `auth_failure` | Failed authentication attempt |
| `mode_change` | Session security mode changed |
| `session_create` | New session created |
| `session_destroy` | Session destroyed |
| `error` | Internal error |

---

## Format

NDJSON (newline-delimited JSON) -- one JSON object per line.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `ts` | string | ISO 8601 timestamp |
| `session` | string | Session ID |
| `connector` | string | Connector type (tui, telegram, etc.) |
| `event` | string | Event type (see above) |
| `tool` | string | Tool name (if applicable) |
| `danger` | string | Effective danger level (if applicable) |
| `command` | string | Exec command (if applicable) |
| `detail` | string | Additional context |

### Example

```json
{"ts":"2026-02-23T10:00:00.000Z","session":"tui:abc","connector":"tui","event":"tool_call","tool":"exec","danger":"safe","command":"ls -la"}
```

---

## Rotation

| Property | Value |
|----------|-------|
| Max file size | 10 MB |
| Generations | 3 (`.1`, `.2`, `.3`) |
| File permissions | `0o600` (owner read/write only) |

When the log file reaches 10 MB, it rotates to `.1`, the previous `.1` becomes
`.2`, and `.2` becomes `.3`. The oldest generation is discarded.

---

## CLI Commands

```bash
aria audit                       # Show recent entries (table format)
aria audit --tail 20             # Last 20 entries
aria audit --tool exec           # Filter by tool
aria audit --event auth_failure  # Filter by event type
aria audit --since 1h            # Entries from the last hour
aria audit --json                # Raw JSON output
```

---

## Always Active

The audit log remains active in all security modes, including `trusted` and
`unrestricted`. It cannot be disabled by mode changes.
