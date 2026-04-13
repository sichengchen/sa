# Sandbox

OS-level exec sandbox. A defense-in-depth layer that restricts filesystem
access for commands run by the `exec` tool.

---

## Platform Support

| Platform | Sandbox                   | Implementation                             |
| -------- | ------------------------- | ------------------------------------------ |
| macOS    | Seatbelt (`sandbox-exec`) | Profile-based file/network restrictions    |
| Other    | Noop fallback             | Commands run normally, warning logged once |

---

## macOS Seatbelt

On macOS, exec commands are wrapped with `sandbox-exec -f <profile>`. The
Seatbelt profile is generated dynamically based on the exec fence configuration.

### Profile Rules

| Action                                   | Policy                                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `deny default`                           | Start from deny-all baseline                                                                                            |
| `process-exec`, `process-fork`, `signal` | Allowed (needed for command execution)                                                                                  |
| `sysctl-read`                            | Allowed (basic process operation)                                                                                       |
| `network*`                               | Allowed (URL policy handles network restrictions)                                                                       |
| `file-read*` system paths                | Allowed: `/usr`, `/bin`, `/sbin`, `/Library`, `/System`, `/private/var`, `/private/etc`, `/etc`, `/var`, `/dev`, `/tmp` |
| `file-write*` temp dirs                  | Allowed: `/tmp`, `/private/tmp`, `/dev`                                                                                 |
| `file-read*` Homebrew                    | Allowed: `/opt/homebrew`, `/usr/local`                                                                                  |
| `file-read*` home dir                    | Allowed: `$HOME` (broad read access)                                                                                    |
| `file-read*` + `file-write*` fence dirs  | Allowed: configured fence paths                                                                                         |
| `file-read*` + `file-write*` deny dirs   | Denied: configured alwaysDeny paths                                                                                     |

### Key Properties

- The profile writes a temp file to disk, passed to `sandbox-exec -f`.
- Deny rules are added before allow rules (deny takes priority in Seatbelt).
- Temp profile files are cleaned up after command execution.

---

## Noop Fallback

On platforms without a supported sandbox, the `NoopSandbox` returns the
command unchanged. A warning is logged once:

> OS sandbox unavailable on this platform. Relying on application-level exec fence.

---

## Configuration

| Field                           | Type      | Default         | Description               |
| ------------------------------- | --------- | --------------- | ------------------------- |
| `runtime.security.exec.sandbox` | `boolean` | `true` on macOS | Enable/disable OS sandbox |

---

## Design Philosophy

The sandbox is a **defense-in-depth layer**, not a security boundary. It
complements the exec fence and approval flow but does not replace them.

### Known Limitations

- **File writes only**: the sandbox primarily restricts file writes outside
  allowed paths. File reads are broadly permitted (home directory).
- **No network sandboxing**: network access is fully allowed; the URL policy
  layer handles network restrictions at the application level.
- **macOS only**: no sandbox enforcement on Linux or other platforms (noop
  fallback).
- **Seatbelt deprecation**: Apple has deprecated `sandbox-exec` but it
  remains functional. Future versions may migrate to a different mechanism.
