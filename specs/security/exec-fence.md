# Exec Fence

Working directory restrictions for the `exec` tool. Prevents the agent from
running commands in sensitive directories.

---

## Configuration

```json
{
  "runtime": {
    "security": {
      "exec": {
        "fence": ["~/projects", "/tmp"],
        "alwaysDeny": ["~/.aria", "~/.ssh", "~/.gnupg", "~/.aws", "~/.config/gcloud"]
      }
    }
  }
}
```

---

## fence

List of allowed working directories. Commands requesting a `workdir` outside
these paths trigger an **inline security escalation** -- the user is prompted
to allow or deny.

- Paths support `~` expansion (resolved to `$HOME`).
- Subdirectories of fenced paths are allowed.
- If `fence` is empty or unset, no directory restriction is enforced (all
  directories are allowed by default).

---

## alwaysDeny

Paths that are always denied, even if they fall within a fenced area. These
protect credential and configuration directories from agent access.

Default deny list:

| Path | Rationale |
|------|-----------|
| `~/.aria` | Esperta Aria config, secrets, tokens |
| `~/.ssh` | SSH keys |
| `~/.gnupg` | GPG keys |
| `~/.aws` | AWS credentials |
| `~/.config/gcloud` | GCP credentials |

---

## Inline Security Escalation

When a directory is outside the fence (or in the deny list), the user can:

- **Allow once** -- permit for this call only
- **Allow for session** -- add path to session-level override set
- **Add persistent exception** -- add to `fence` in config
- **Deny** -- reject the tool call

---

## Security Mode Interaction

- **default** mode: full fence enforced.
- **trusted** mode: fence widened to `~`, deny only `~/.aria`.
- **unrestricted** mode: fence disabled entirely.

See [`security-modes.md`](security-modes.md) for details.
