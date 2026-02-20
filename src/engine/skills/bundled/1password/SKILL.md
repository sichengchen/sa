---
name: 1password
description: Set up and use 1Password CLI (op). Sign in, read secrets, and inject credentials via op run.
---
# 1Password CLI

Use the `op` CLI to manage secrets from 1Password.

## Setup

Install via Homebrew:
```bash
brew install 1password-cli
```

## Workflow

1. Check CLI present: `op --version`
2. Confirm desktop app integration is enabled and the app is unlocked
3. Sign in: `op signin`
4. Verify access: `op whoami`
5. If multiple accounts: use `--account` flag

## Common Commands

### List vaults
```bash
op vault list
```

### List items in a vault
```bash
op item list --vault "Personal"
```

### Read a secret
```bash
op item get "Login Name" --fields password
```

### Read a specific field
```bash
op read "op://VaultName/ItemName/FieldName"
```

### Inject secrets into a command
```bash
op run --env-file=.env.tpl -- your-command
```

### Run a command with secrets
```bash
op run -- env | grep SECRET
```

## Guardrails

- Never paste secrets into logs, chat, or code
- Prefer `op run` / `op inject` over writing secrets to disk
- If sign-in fails, re-run `op signin` and authorize in the desktop app
- If a command returns "account is not signed in", re-authenticate first

## Notes

- Requires 1Password desktop app for biometric unlock integration
- Long-lived tokens not recommended — use `op signin` for session auth
- macOS, Linux, and Windows supported
