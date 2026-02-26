# Utility Tools

Miscellaneous tools for reactions, notifications, secrets, skills, and
process management.

---

## reaction

Send an emoji reaction. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Description          |
|-----------|--------|----------|----------------------|
| emoji     | string | yes      | Emoji to react with  |

Sends an emoji reaction to IM connectors (Telegram, Slack, Teams, Google Chat,
Discord, GitHub, Linear). No-op for TUI connector.

---

## notify

Push notification to connectors. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Default | Description                              |
|-----------|--------|----------|---------|------------------------------------------|
| message   | string | yes      | —       | Notification content (supports Markdown) |
| connector | string | no       | "all"   | Connector type or `"all"`                |

### Requirements

| Connector | Required config                                         |
|-----------|---------------------------------------------------------|
| Telegram  | `botToken` + `pairedChatId` in secrets.enc              |
| Discord   | `discordToken` + `SA_DISCORD_NOTIFY_CHANNEL` configured |

### Use Cases

- Heartbeat check results
- Cron job reports
- Proactive alerts from background tasks

---

## set_env_secret

Store an encrypted secret. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Description         |
|-----------|--------|----------|---------------------|
| name      | string | yes      | Secret name         |
| value     | string | yes      | Secret value        |

Stores the key-value pair in encrypted `secrets.enc`. The secret is
injected into the engine's environment immediately (no restart required).

---

## set_env_variable

Set a plain environment variable. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Description            |
|-----------|--------|----------|------------------------|
| name      | string | yes      | Variable name          |
| value     | string | yes      | Variable value         |

Stores in `config.json` under `runtime.env`. The variable is injected into
the engine's environment immediately (no restart required).

Unlike `set_env_secret`, these values are stored in plaintext and visible
in config.

---

## read_skill

Load and activate a skill. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Default | Description                              |
|-----------|--------|----------|---------|------------------------------------------|
| name      | string | yes      | —       | Skill name                               |
| path      | string | no       | —       | Sub-file path or `"__index__"` to list   |

### Behavior

| Call                              | Action                              |
|-----------------------------------|-------------------------------------|
| `read_skill("my-skill")`         | Loads SKILL.md and activates skill  |
| `read_skill("my-skill", "__index__")` | Lists files in skill directory |
| `read_skill("my-skill", "prompts/plan.md")` | Reads sub-file without activation |

### Security

Path traversal is blocked: `".."` segments in `path` are rejected.

---

## exec_status

Check background process status. Danger level: **safe**.

### Parameters

| Parameter | Type   | Required | Description                      |
|-----------|--------|----------|----------------------------------|
| handle    | string | yes      | Handle from background exec call |

Returns:
- **status** — "running", "completed", or "error"
- **output** — stdout/stderr captured so far
- **exitCode** — process exit code (if completed)
- **elapsed** — runtime in milliseconds

---

## exec_kill

Kill a background process. Danger level: **dangerous**.

### Parameters

| Parameter | Type   | Required | Description                      |
|-----------|--------|----------|----------------------------------|
| handle    | string | yes      | Handle from background exec call |

Sends SIGTERM to the process. If it does not exit within a grace period,
sends SIGKILL. Classified as dangerous because it forcefully terminates
a running process.
