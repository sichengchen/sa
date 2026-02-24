# URL Policy

SSRF (Server-Side Request Forgery) protection for the `web_fetch` tool. Before
fetching any URL, the engine validates it against blocked hosts, schemes, and
ports.

---

## Blocked by Default

| Category | Blocked |
|----------|---------|
| Localhost | `127.0.0.1`, `::1`, `localhost`, `0.0.0.0` |
| Private ranges | `10.*`, `172.16-31.*`, `192.168.*`, `169.254.*` |
| Cloud metadata | `169.254.169.254`, `metadata.google.internal` |
| SA engine ports | `127.0.0.1:7420`, `127.0.0.1:7421` |
| Schemes | Only `http:` and `https:` allowed |

All private and loopback addresses are blocked to prevent the agent from
accessing internal services, cloud instance metadata, or the SA engine itself
via HTTP.

---

## Configuration

```json
{
  "runtime": {
    "urlPolicy": {
      "additionalBlockedHosts": ["internal.corp.example.com"],
      "allowedExceptions": ["10.0.0.5"]
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `additionalBlockedHosts` | `string[]` | Extra hostnames/IPs to block |
| `allowedExceptions` | `string[]` | Specific hosts to allow despite default blocks |

---

## Redirect Following

The URL policy validates redirect targets in addition to the initial URL.
If a fetch redirects to a blocked destination (e.g., a public URL redirects
to `169.254.169.254`), the redirect is rejected even though the initial URL
was allowed.

---

## Security Mode Interaction

- **default** mode: full URL policy enforced.
- **trusted** mode: localhost allowed, other blocks remain.
- **unrestricted** mode: URL policy disabled entirely.

See [`security-modes.md`](security-modes.md) for details.

---

## Inline Security Escalation

When a URL is blocked, the engine triggers an inline security escalation. The
user can choose to:

- **Allow once** -- permit this specific URL for this call only
- **Allow for session** -- add to session-level override set
- **Add persistent exception** -- add to `allowedExceptions` in config
- **Deny** -- reject the tool call
