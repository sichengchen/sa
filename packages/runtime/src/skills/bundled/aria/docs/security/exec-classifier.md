# Exec Classifier

Hybrid classification system for the `exec` tool. Combines the agent's
self-declared danger level with engine-side pattern matching to determine
the effective danger level.

---

## How It Works

1. The agent calls `exec` with a `command` string and an optional `danger`
   parameter (`"safe"`, `"moderate"`, or `"dangerous"`).
2. The engine runs `classifyExecCommand(command, agentDeclared)`.
3. The classifier applies rules in priority order (see below).

The engine never blindly trusts the agent. Even if the agent declares
`danger: "safe"` for `rm -rf /`, the classifier overrides to `"dangerous"`.

---

## Classification Priority

```
1. ALWAYS_DANGEROUS patterns match?  --> "dangerous"  (overrides agent)
2. ALWAYS_SAFE commands match?       --> "safe"       (overrides agent)
3. Safe git subcommand?              --> "safe"       (overrides agent)
4. None of the above?                --> trust the agent's declaration
```

---

## Always-Dangerous Patterns

Matched against the full command string. Any match forces `"dangerous"`:

| Category | Patterns |
|----------|----------|
| Destructive file ops | `rm -rf`, `rm -f`, `rm /...`, `mkfs`, `dd`, `shred` |
| Privilege escalation | `sudo`, `su`, `doas`, `pkexec` |
| System control | `shutdown`, `reboot`, `systemctl start/stop/...`, `launchctl load/unload/...` |
| Process killing | `kill`, `killall`, `pkill` |
| Permission changes | `chmod`, `chown`, `chgrp` |
| Pipe-to-shell (RCE) | `\| sh`, `\| bash`, `\| zsh`, `\| source`, `curl ... \|`, `wget ... \|` |
| Disk operations | `fdisk`, `parted`, `mount`, `umount` |
| Network danger | `iptables`, `nft`, `ufw`, `nc -l` |

---

## Always-Safe Commands

Matched against the base command (first word, path-stripped) for simple
commands (no pipes, semicolons, or `&&`):

```
ls, ll, la, pwd, echo, cat, head, tail, less, more, wc, sort, uniq, tr,
cut, paste, date, cal, whoami, id, hostname, uname, which, where, type,
command, file, stat, tree, du, df, env, printenv, true, false, test, [,
basename, dirname, realpath, readlink, md5, md5sum, shasum, sha256sum,
diff, cmp, jq, yq, man, help, info
```

---

## Safe Git Subcommands

Read-only git operations classified as safe:

```
status, log, diff, show, branch, tag, remote, stash list,
config --list, config --get, ls-files, ls-tree, cat-file,
rev-parse, describe, shortlog, blame, reflog
```

---

## Examples

| Command | Agent declares | Effective | Reason |
|---------|----------------|-----------|--------|
| `ls -la` | safe | safe | Always-safe command |
| `git status` | safe | safe | Safe git subcommand |
| `npm install` | safe | safe | Trusted agent declaration |
| `rm -rf /tmp/build` | safe | dangerous | Always-dangerous pattern |
| `sudo apt update` | moderate | dangerous | Privilege escalation |
| `curl url \| sh` | safe | dangerous | Pipe-to-shell RCE |
| `git push --force` | moderate | moderate | Not in safe-git list, trust agent |
| `python script.py` | moderate | moderate | No pattern match, trust agent |

---

## Custom Patterns

The classifier uses hardcoded pattern sets. To customize behavior:

- Use **per-tool config overrides** (`runtime.toolPolicy.overrides.exec`) to
  change the base danger level of the entire `exec` tool.
- For individual commands, rely on the agent's self-declaration for commands
  not covered by built-in patterns.
- Future: configurable pattern extensions may be added.
