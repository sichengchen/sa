# Security Modes

Each session can operate in one of three security modes that control the
approval flow and security layer behavior.

---

## Modes

| Mode | Effect | Default TTL |
|------|--------|-------------|
| `default` | Standard approval flow -- all security layers active | Permanent |
| `trusted` | Moderate tools auto-approve, URL policy relaxed, exec fence widened | 1 hour |
| `unrestricted` | All tools auto-approve, URL policy off, exec fence off | 30 minutes |

### default

All security layers are fully active. Dangerous tools always require approval.
This is the standard operating mode.

### trusted

- Approval gate: only always-dangerous exec patterns prompt the user
- URL policy: localhost allowed
- Exec fence: widened to `~`, deny only `~/.aria`
- Content framing: still active
- Audit log: still active

### unrestricted

- Approval gate: off (all tools auto-approve, including dangerous)
- URL policy: off
- Exec fence: off
- Content framing: still active
- Audit log: still active

---

## Auto-Revert

Elevated modes (`trusted`, `unrestricted`) automatically revert to `default`
after their TTL expires. The `SecurityModeManager` checks expiry on every
`getMode()` call and transparently reverts expired modes.

---

## Configuration

```json
{
  "runtime": {
    "security": {
      "defaultMode": "default",
      "modeTTL": {
        "trusted": 3600,
        "unrestricted": 1800
      },
      "allowUnrestrictedFromIM": false
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultMode` | `SecurityMode` | `"default"` | Mode for new sessions |
| `modeTTL.trusted` | `number` (seconds) | `3600` | Trusted mode TTL |
| `modeTTL.unrestricted` | `number` (seconds) | `1800` | Unrestricted mode TTL |
| `allowUnrestrictedFromIM` | `boolean` | `false` | Allow unrestricted from IM connectors |

---

## IM Restriction

By default, `unrestricted` mode **cannot** be activated from IM connectors
(Telegram, Discord). This prevents remote privilege escalation -- a compromised
IM account cannot disable all security layers.

Set `allowUnrestrictedFromIM: true` to override this restriction.

---

## Hard Layers

The following security layers remain active in **all** modes, including
`unrestricted`:

- Content framing (`<data-*>` tags)
- Output redaction (sensitive env stripping)
- Audit log
- Environment sanitization for exec
