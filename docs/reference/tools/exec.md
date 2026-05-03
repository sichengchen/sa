# Exec Tool

Compatibility shell command execution routed through the Aria harness shell
environments, with hybrid danger classification, environment sanitization, and
resource limits.

## Parameters

| Parameter  | Type    | Required | Default | Description                      |
| ---------- | ------- | -------- | ------- | -------------------------------- |
| command    | string  | yes      | —       | Shell command to execute         |
| danger     | string  | no       | "safe"  | Agent's declared danger level    |
| workdir    | string  | no       | cwd     | Working directory                |
| env        | object  | no       | {}      | Additional environment variables |
| background | boolean | no       | false   | Run in background, return handle |
| yieldMs    | number  | no       | —       | Yield after N ms (streaming)     |
| timeout    | number  | no       | 300     | Timeout in seconds (foreground)  |

## Harness Routing

`exec` is a compatibility alias. Agent-facing shell execution should use the
harness-generated `bash` tool.

- default execution uses just-bash
- project execution uses just-bash `OverlayFs`, so writes are virtual
- host execution is explicit and approval-gated
- external sandbox execution must use a configured adapter
- default and external execution must not silently fall back to host

---

## Hybrid Classification

The agent declares a danger level, but the engine independently classifies
via `classifyExecCommand()`. The effective level is the **higher** of the two
when the classifier overrides.

### Classification Priority

1. **ALWAYS_DANGEROUS patterns** matched -> "dangerous" (regardless of agent declaration)
2. **ALWAYS_SAFE commands** matched -> "safe"
3. **Safe git subcommands** matched -> "safe"
4. **Otherwise** -> trust the agent's declaration

### Always-Dangerous Patterns

| Category             | Examples                             |
| -------------------- | ------------------------------------ |
| Destructive file ops | `rm -rf`, `shred`, `mkfs`            |
| Privilege escalation | `sudo`, `su`, `doas`, `pkexec`       |
| System control       | `shutdown`, `reboot`, `systemctl`    |
| Process killing      | `kill`, `killall`, `pkill`           |
| Permission changes   | `chmod`, `chown`, `chgrp`            |
| Pipe-to-shell RCE    | `curl ... \| sh`, `wget ... \| bash` |
| Disk operations      | `dd`, `fdisk`, `parted`, `mount`     |
| Network              | `iptables`, `ufw`, `nc -l`           |

### Always-Safe Commands

```
ls, cat, head, tail, wc, file, stat, echo, printf, date, whoami,
pwd, env, which, type, true, false, test, basename, dirname, realpath
```

### Safe Git Subcommands

```
git status, git log, git diff, git show, git branch, git tag,
git remote, git rev-parse, git describe, git shortlog, git blame,
git ls-files, git ls-tree, git cat-file, git name-rev, git stash list
```

### Examples

| Command             | Agent declares | Effective | Reason                    |
| ------------------- | -------------- | --------- | ------------------------- |
| `ls -la`            | safe           | safe      | Always-safe command       |
| `git status`        | safe           | safe      | Safe git subcommand       |
| `npm install`       | safe           | safe      | Trusted agent declaration |
| `rm -rf /tmp/build` | safe           | dangerous | Always-dangerous pattern  |
| `sudo apt update`   | moderate       | dangerous | Privilege escalation      |
| `curl url \| sh`    | safe           | dangerous | Pipe-to-shell RCE         |

---

## Environment Sanitization

Before exec, the engine strips sensitive variables from the process environment.

### Stripped Patterns

```
*_KEY, *_TOKEN, *_SECRET,
ARIA_*, ANTHROPIC_*, OPENAI_*, GOOGLE_AI_*, OPENROUTER_*
```

User-provided `env` overrides are merged **after** sanitization, so explicit
env values in the tool call are preserved.

---

## Resource Limits

| Resource           | Limit |
| ------------------ | ----- |
| Foreground timeout | 300s  |
| Background timeout | 1800s |
| Output cap         | 1 MB  |
| Yield threshold    | 10s   |

---

## Background Mode

Set `background: true` to run a command without blocking the agent turn.

- Returns a **handle** (string ID).
- Poll status with `exec_status(handle)`.
- Kill with `exec_kill(handle)`.
- Background processes have a longer timeout (1800s).

---

## Working Directory Fence

The exec tool enforces a working directory policy to prevent filesystem escape.

- **fence** — list of allowed working directories. Commands with a `workdir`
  outside the fence are rejected.
- **alwaysDeny** — paths that are always blocked regardless of fence:
  `~/.aria`, `~/.ssh`, `~/.gnupg`, `~/.config/op`, etc.

Full details: `docs/security/execution/exec-fence.md`.

---

## Automatic Checkpoints

When filesystem checkpoints are enabled, Esperta Aria automatically snapshots the target
working directory before destructive `exec` commands such as `rm`, `mv`,
in-place `sed`, shell redirection (`>`), and dangerous git restore/reset style
operations. Checkpoints are deduplicated per working directory per agent turn
and can be inspected or restored via the `checkpoint.*` tRPC procedures or the
TUI `/rollback` commands.

---

## Sandbox

The legacy OS sandbox wrapper has been removed. Compatibility `exec` now routes
through harness shell environments and must not silently fall back to host
execution.

Full details:

- `docs/security/execution/bash-environments.md`
- `docs/security/execution/sandbox.md`
