---
id: 99
title: Exec classifier hardening — default-dangerous + shell indirection
status: done
type: feature
priority: 1
phase: 008-security-and-subagents
branch: feature/008-security-and-subagents
created: 2026-02-23
shipped_at: 2026-02-24
---
# Exec classifier hardening — default-dangerous + shell indirection

## Context

The exec classifier (`src/engine/tools/exec-classifier.ts`) classifies commands into danger levels. Current behavior:
- `ALWAYS_DANGEROUS_PATTERNS` → "dangerous" (overrides agent)
- `ALWAYS_SAFE_COMMANDS` → "safe" (overrides agent)
- **Fallback: trusts agent's self-declared danger level** (line 119)

This fallback is the critical gap — a prompt-injected agent can declare any command as "safe." Additionally, the pattern list has bypass vectors: missing `| dash/ksh/zsh`, no detection of `$()` command substitution, `eval`, `source`, `xargs ... sh`, `find -exec`, inline interpreters (`python -c`, `perl -e`, `node -e`), and dangerous git operations (`git config --global core.sshCommand`).

## Approach

### 1. Default to "dangerous" on no match

Change the fallback from trusting the agent to always returning "dangerous":

```typescript
// OLD (line ~119): return agentDeclaredLevel;
// NEW: return "dangerous";
```

This means any command not explicitly in the safe list requires approval. The safe list is already comprehensive (50+ commands) so common operations still pass through.

### 2. Add shell indirection detection (always dangerous)

New pattern set that catches metaprogramming:

```typescript
const SHELL_INDIRECTION = [
  /\$\(/,                           // command substitution $(...)
  /`[^`]+`/,                        // backtick substitution
  /\beval\b/,                       // dynamic execution
  /\bsource\b/,                     // source scripts
  /\bexec\b\s/,                     // process replacement
  /\bxargs\b.*\b(ba|da|k|z|c|tc|fi)?sh\b/, // xargs piping to shell
  /\bfind\b.*-exec/,               // find -exec
  /\bawk\b.*\bsystem\b/,           // awk system()
  /\bperl\b.*-e/,                   // inline Perl
  /\bpython3?\b.*-c/,              // inline Python
  /\bruby\b.*-e/,                   // inline Ruby
  /\bnode\b.*-e/,                   // inline Node
  /\bphp\b.*-r/,                    // inline PHP
];
```

These always classify as "dangerous" regardless of the base command.

### 3. Expand pipe-to-shell detection

```typescript
// OLD: /\|\s*(ba)?sh\b/
// NEW: /\|\s*(ba|da|k|z|c|tc|fi)?sh\b/
```

Catches dash, ksh, zsh, csh, tcsh, fish in addition to bash/sh.

### 4. Add dangerous git operations

```typescript
const DANGEROUS_GIT_SUBCOMMANDS = new Set([
  "push", "push --force", "reset --hard", "clean -fd", "clean -f",
  "config --global",  // can set core.sshCommand, hooks, etc.
  "checkout .",       // discard all changes
  "restore .",        // discard all changes
]);
```

Parse `git <subcommand>` and check against this set. Currently `git` is in safe commands, but these subcommands should be classified as dangerous.

### 5. Judiciously expand safe command set

Review and add truly read-only commands that are missing:
- `file`, `stat`, `wc`, `sort`, `uniq`, `diff`, `comm`, `column`, `jq`, `yq`
- `bun test`, `bun run lint`, `bun run typecheck`, `bun run build` (project-specific but safe)

### 6. Tests

Update existing classifier tests and add new cases:
- Shell indirection patterns all classified as dangerous
- Default fallback returns "dangerous" (not agent-declared level)
- Expanded pipe-to-shell patterns caught
- Dangerous git operations caught even though `git` is in safe commands
- New safe commands pass through

## Files to change

- `src/engine/tools/exec-classifier.ts` (modify — default-dangerous fallback, shell indirection, git ops, expanded patterns)
- `src/engine/tools/exec-classifier.test.ts` (modify — add tests for new patterns, fallback behavior)

## Verification

- Run: `bun test src/engine/tools/exec-classifier.test.ts`
- Expected: All existing tests pass + new pattern tests pass
- Run: `bun run typecheck && bun run lint`
- Expected: No errors
- Edge cases: `git config --global` vs `git config --local` (only global is dangerous), nested substitution `$($(cmd))`, commands with quoted arguments containing patterns (e.g., `echo '$(rm -rf /)'` should be safe — it's a string literal)

## Progress
- Changed fallback from agent-trusted to default-deny ("dangerous")
- Added 14 shell indirection patterns (eval, source, $(), backticks, inline interpreters for python/perl/ruby/node/php)
- Expanded pipe-to-shell to all common shell variants (dash, ksh, zsh, csh, tcsh, fish)
- Added dangerous git subcommands set (push, reset, clean, checkout ., restore ., config --global)
- Added safe commands: grep, rg, ag, ack, sed, awk, find, curl, wget, comm, column
- Rewrote tests: 67 tests covering all categories
- Modified: exec-classifier.ts, exec-classifier.test.ts
- Verification: typecheck, lint, all 624 tests pass
