# Security Model

SA is a single-user, localhost-only personal agent. Its security model is designed
around three principles: **defense in depth for tool execution**, **encrypted
at-rest secrets**, and **token-based authentication for all Engine access**. This
document covers every security-relevant subsystem.

---

## 1. Tool Danger Classification

Every tool registered with the Engine declares a `dangerLevel` property. This
classification drives the approval flow, system prompt guidance, and event
reporting.

### Levels

| Level | Meaning | Approval behavior |
|-------|---------|-------------------|
| `safe` | Read-only or side-effect-free. Cannot damage state. | Always auto-approved, no user interaction. |
| `moderate` | Writes state but is generally reversible (e.g. file edits, installs). | Auto-approved by default; requires confirmation only when the connector's approval mode is `"always"`. |
| `dangerous` | Destructive, irreversible, or security-sensitive. | Always requires explicit user approval, regardless of connector approval mode. |

### Built-in tool classification

| Tool | Danger level | Rationale |
|------|-------------|-----------|
| `read` | safe | Read-only file access |
| `web_search` | safe | Read-only web search |
| `web_fetch` | safe | Read-only URL fetch |
| `read_skill` | safe | Read-only skill loading |
| `exec_status` | safe | Read-only process status check |
| `remember` | safe | Appends to memory files |
| `reaction` | safe | Sends emoji reactions |
| `set_env_secret` | safe | Stores secrets (encrypted) |
| `set_env_variable` | safe | Stores plain config vars |
| `notify` | safe | Sends notifications to connectors |
| `write` | moderate | Creates or overwrites files |
| `edit` | moderate | Edits files in place |
| `exec` | dangerous | Arbitrary shell command execution |
| `exec_kill` | dangerous | Kills background processes |

The `dangerLevel` declared on each `ToolImpl` is the **built-in default**. It can
be overridden per-tool in `config.json` (see section 5).

---

## 2. Three-Tier Approval Flow

Tool approval combines the tool's effective danger level with the connector's
approval mode to decide whether the user must confirm a tool call.

### Connector approval modes

Each connector type has an approval mode, configured in `config.json` under
`runtime.toolApproval`:

| Mode | Behavior |
|------|----------|
| `"never"` | Default for TUI. Safe and moderate tools auto-approve. Dangerous tools **still require approval** (the mode name is somewhat misleading -- dangerous always asks). |
| `"ask"` | Default for IM connectors (Telegram, Discord). Same as `"never"` in practice -- moderate tools auto-approve, dangerous tools ask. |
| `"always"` | Both moderate and dangerous tools require explicit approval. Only safe tools auto-approve. |

### Decision matrix

| Danger level | Mode `"never"` / `"ask"` | Mode `"always"` |
|-------------|--------------------------|-----------------|
| `safe` | Auto-approve | Auto-approve |
| `moderate` | Auto-approve | **Prompt user** |
| `dangerous` | **Prompt user** | **Prompt user** |

This logic lives in `procedures.ts` inside the `getSessionAgent()` closure. The
approval callback creates a `Promise<boolean>` that blocks the tool execution
until the user responds via `tool.approve` or the 5-minute timeout expires
(auto-rejects on timeout).

### Session-level overrides

When a user approves a dangerous tool call, they can choose "accept for session"
via the `tool.acceptForSession` tRPC procedure. This adds the tool name to a
per-session override set (`sessionToolOverrides`), so subsequent calls to the
same tool in that session auto-approve without prompting.

```ts
// Example: after accepting exec for the session, all future exec calls
// in that session skip the approval prompt.
```

---

## 3. Exec Hybrid Approval

The `exec` tool is the most powerful built-in tool. It runs arbitrary shell
commands via `sh -c`. To avoid constantly prompting the user for obviously safe
commands (`ls`, `git status`), SA uses a **hybrid classification** system that
combines the agent's self-declared danger level with pattern-based overrides.

### How it works

1. The agent calls `exec` with a `command` string and an optional `danger`
   parameter (`"safe"`, `"moderate"`, or `"dangerous"`).
2. The engine runs `classifyExecCommand(command, agentDeclared)` from
   `exec-classifier.ts`.
3. The classifier applies rules in priority order:
   - **Always-dangerous patterns** override everything (see section 4).
   - **Always-safe commands** override the agent's declaration.
   - **Otherwise**, the agent's self-declared level is trusted.

This means even if the agent declares `danger: "safe"` for `rm -rf /`, the
classifier will override it to `"dangerous"`. Conversely, if the agent
conservatively declares `danger: "dangerous"` for `ls -la`, the classifier
recognizes it as safe and auto-approves.

### Environment sanitization

Before running any command, the exec tool strips sensitive environment variables
from the subprocess. The following patterns are removed:

```ts
const SENSITIVE_ENV_PATTERNS = [
  /_KEY$/,         // e.g. ANTHROPIC_API_KEY
  /_TOKEN$/,       // e.g. GITHUB_TOKEN
  /_SECRET$/,      // e.g. WEBHOOK_SECRET
  /^SA_/,          // All SA internal vars
  /^ANTHROPIC_/,   // Anthropic-specific vars
  /^OPENAI_/,      // OpenAI-specific vars
  /^GOOGLE_AI_/,   // Google AI vars
  /^OPENROUTER_/,  // OpenRouter vars
];
```

User-provided env overrides (via the `env` parameter) are merged **after**
sanitization, so the agent can still pass specific variables when needed.

### Resource limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Foreground timeout | 300s (5 min) | Prevents hung commands from blocking the agent |
| Background timeout | 1800s (30 min) | Prevents runaway background processes |
| Output cap | 1 MB | Prevents OOM from chatty commands |
| Yield threshold | 10s (default) | Auto-backgrounds long-running commands |

### What is NOT sandboxed

The exec tool does **not** provide:
- Filesystem isolation (no chroot or restricted directories)
- Network isolation (no firewall rules)
- Process isolation (no cgroup limits)

This is appropriate for a single-user personal agent running on localhost.

---

## 4. Filter Patterns (Exec Classifier)

The exec classifier in `src/engine/tools/exec-classifier.ts` uses two pattern
sets to override the agent's self-declared danger level.

### Always-dangerous patterns

These patterns match against the full command string. If any pattern matches,
the command is classified as `"dangerous"` regardless of what the agent declared:

| Category | Patterns |
|----------|----------|
| Destructive file ops | `rm -rf`, `rm -f`, `rm /...`, `mkfs`, `dd`, `shred` |
| Privilege escalation | `sudo`, `su`, `doas` |
| System control | `shutdown`, `reboot`, `systemctl start/stop/...`, `launchctl load/unload/...` |
| Process killing | `kill`, `killall`, `pkill` |
| Permission changes | `chmod`, `chown` |
| Pipe-to-shell (RCE) | `| sh`, `| bash`, `| zsh`, `| source`, `curl ... |`, `wget ... |` |
| Disk operations | `fdisk`, `parted`, `mount`, `umount` |
| Network danger | `iptables`, `nft` |

### Always-safe commands

These are matched against the base command (first word, path-stripped) for
simple commands (no pipes, semicolons, or `&&`):

```
ls, ll, la, pwd, echo, cat, head, tail, less, more, wc, sort, uniq, tr,
cut, paste, date, cal, whoami, id, hostname, uname, which, where, type,
command, file, stat, tree, du, df, env, printenv, true, false, test, [,
basename, dirname, realpath, readlink, md5, md5sum, shasum, sha256sum,
diff, cmp, jq, yq, man, help, info
```

Git subcommands are handled specially. These read-only git operations are
classified as safe:

```
status, log, diff, show, branch, tag, remote, stash list,
config --list, config --get, ls-files, ls-tree, cat-file,
rev-parse, describe, shortlog, blame, reflog
```

### Classification priority

```
1. ALWAYS_DANGEROUS_PATTERNS match?  --> "dangerous"  (overrides agent)
2. ALWAYS_SAFE_COMMANDS match?       --> "safe"       (overrides agent)
3. Safe git subcommand?              --> "safe"       (overrides agent)
4. None of the above?                --> trust the agent's declaration
```

### Custom patterns

The current classifier uses hardcoded pattern sets. To customize behavior for
specific tools, use per-tool config overrides (section 5) to change the danger
level of the entire `exec` tool, or rely on the agent's self-declaration for
commands not covered by the built-in patterns.

---

## 5. Per-Tool Config Overrides

You can override a tool's danger level and reporting behavior in
`config.json` under `runtime.toolPolicy.overrides`:

```json
{
  "runtime": {
    "toolPolicy": {
      "overrides": {
        "write": {
          "dangerLevel": "dangerous",
          "report": "always"
        },
        "web_fetch": {
          "dangerLevel": "moderate",
          "report": "on_error"
        },
        "exec": {
          "report": "always"
        }
      }
    }
  }
}
```

### Override fields

| Field | Type | Effect |
|-------|------|--------|
| `dangerLevel` | `"safe" \| "moderate" \| "dangerous"` | Overrides the tool's built-in danger level. Affects the approval flow. |
| `report` | `"always" \| "never" \| "on_error"` | Controls when `tool_start` and `tool_end` events are emitted to connectors. |

### Danger level resolution order

```
1. Per-tool override in config.json       (highest priority)
2. Built-in dangerLevel on the ToolImpl   (default)
3. "dangerous"                            (fallback for unknown tools)
```

For the `exec` tool, even after the config override is resolved, the exec
classifier can further refine the level based on the specific command string.
The override sets the **base** level; the classifier can promote it to
`"dangerous"` if a dangerous pattern matches.

### Report modes

| Mode | `tool_start` emitted? | `tool_end` emitted? |
|------|----------------------|---------------------|
| `"always"` | Yes | Yes |
| `"never"` | No | No (unless error) |
| `"on_error"` | No | Only if `isError` is true |

These overrides interact with the per-connector verbosity setting (section 6).
The `report` override takes precedence over the connector's default verbosity.

---

## 6. Tool Policy Verbosity

The system prompt and event reporting are shaped by tool policy to give the agent
and the user appropriate context about tool restrictions.

### System prompt sections

When the engine assembles the system prompt (in `runtime.ts`), it includes:

**Safety Advisory** -- a directive telling the agent to:
- Not pursue self-preservation or capability expansion
- Prioritize safety and human oversight over task completion
- Never bypass safeguards or manipulate the user
- Not modify its own system prompt or safety rules

**Tool Call Style** -- instructions for narrating tool usage by danger level:
- **Safe tools**: call silently, no narration needed
- **Moderate tools**: brief narration only for multi-step work
- **Dangerous tools**: always state what you are about to do and why before calling
- The agent must always set the `danger` parameter on `exec` calls

**Available Tools** -- each tool is listed with its danger level in brackets:

```
## Available Tools
- read [safe]: Read a file from disk...
- write [moderate]: Write content to a file...
- exec [dangerous]: Execute a shell command...
```

This gives the agent awareness of the classification and shapes how it
communicates tool usage to the user.

### Per-connector verbosity

The `ToolPolicyManager` controls which tool events are forwarded to each
connector based on its configured verbosity level:

| Verbosity | Default for | `tool_start` events | `tool_end` events |
|-----------|-------------|--------------------|--------------------|
| `"verbose"` | -- | All tools | All tools |
| `"minimal"` | TUI | Moderate + dangerous | Errors + dangerous |
| `"silent"` | Telegram, Discord, Webhook | Dangerous only (or long-running >10s) | Errors only |

Configured in `config.json`:

```json
{
  "runtime": {
    "toolPolicy": {
      "verbosity": {
        "tui": "minimal",
        "telegram": "silent",
        "discord": "verbose"
      }
    }
  }
}
```

---

## 7. Encrypted Secrets Vault

SA stores sensitive credentials (API keys, bot tokens) encrypted at rest in
`~/.sa/secrets.enc`. The encryption scheme is designed for local-only,
single-machine use.

### Encryption scheme

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | scrypt (N=16384, r=8, p=1) |
| Key length | 32 bytes (256 bits) |
| IV | 16 random bytes per encryption |
| Auth tag | GCM authentication tag (integrity check) |
| Salt | 32 random bytes, stored in `~/.sa/.salt` |

### Key derivation

The encryption key is derived from a **machine fingerprint** combined with the
random salt:

```ts
function machineFingerprint(): string {
  return `${hostname()}:${username}:${homedir}`;
}

// Key = scrypt(machineFingerprint, salt, keyLength=32)
```

This means:
- The secrets file is tied to the specific machine and user account
- It cannot be decrypted on a different machine or by a different user
- No master password is required (the machine identity is the key material)
- If you change your hostname or username, you will need to re-create secrets

### On-disk format

The `secrets.enc` file contains JSON with three hex-encoded fields:

```json
{
  "iv": "aabbccdd...",
  "authTag": "11223344...",
  "data": "encrypted_hex..."
}
```

### File permissions

Both `.salt` and `secrets.enc` are created with `chmod 600` (owner read/write
only). The `.salt` file is never overwritten once created.

### What is stored in secrets

The `SecretsFile` structure contains:

```ts
interface SecretsFile {
  apiKeys: Record<string, string>;   // e.g. { "ANTHROPIC_API_KEY": "sk-..." }
  botToken?: string;                 // Telegram bot token
  pairedChatId?: number;             // Telegram paired chat ID
  pairingCode?: string;              // One-time pairing code
  discordToken?: string;             // Discord bot token
  discordGuildId?: string;           // Discord guild ID
}
```

### Runtime injection

At startup, the engine loads secrets and injects API keys into `process.env`.
Environment variables already set take precedence over secrets (so you can
override with `export ANTHROPIC_API_KEY=...`):

```ts
// In runtime.ts
const secrets = await config.loadSecrets();
if (secrets?.apiKeys) {
  for (const [envVar, value] of Object.entries(secrets.apiKeys)) {
    if (!process.env[envVar] && value) {
      process.env[envVar] = value;
    }
  }
}
```

### Legacy migration

The original key derivation used only the hostname. The current version uses the
full machine fingerprint (`hostname:username:homedir`). If decryption with the
new derivation fails, the engine automatically tries the legacy derivation and
re-encrypts with the new one on success:

```
Load secrets.enc
  --> Try new key derivation (hostname:user:home)
  --> If fail, try legacy derivation (hostname only)
    --> If legacy succeeds, re-encrypt with new derivation
    --> If both fail, warn and fall back to environment variables
```

---

## 8. Auth Model

All tRPC communication between connectors and the engine is authenticated via
bearer tokens managed by the `AuthManager`.

### Master token

On every engine startup, a new 32-byte random master token is generated and
written to `~/.sa/engine.token` with `chmod 600`:

```ts
this.masterToken = randomBytes(32).toString("hex"); // 64-char hex string
await writeFile(this.tokenFilePath, this.masterToken, { mode: 0o600 });
```

Local connectors (TUI) read this file to authenticate with the engine. The
master token is valid for the lifetime of the engine process and deleted on
shutdown.

### Device-flow pairing

Remote connectors (Telegram, Discord) that cannot read the local filesystem use
a pairing code flow:

1. The engine generates a 6-character pairing code using the charset
   `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I` to avoid confusion).
2. The user provides this code to the remote connector (e.g., `/pair ABC123` in
   Telegram).
3. The connector sends the code via `auth.pair` tRPC procedure.
4. If the code matches, the engine issues a session token (32 random bytes, hex).
5. The pairing code is consumed (one-time use).

### Token validation

Every protected tRPC procedure runs through the `authMiddleware`:

```ts
const authMiddleware = middleware(async ({ ctx, next }) => {
  if (!ctx.token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const entry = runtime.auth.validate(ctx.token);
  if (!entry) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, connectorId: entry.connectorId } });
});
```

The master token is always valid. Session tokens are stored in-memory and can
be revoked via `auth.revoke()`.

### Token lifecycle

```
Engine start  -->  Generate master token  -->  Write to engine.token
                                               (chmod 600)

Connector     -->  Read engine.token      -->  Call auth.pair(masterToken)
(local)            or pairing code             -->  Receive session token

Connector     -->  Use session token      -->  Validated on every request
(any)              as Bearer header

Engine stop   -->  Delete engine.token    -->  All tokens invalidated
```

---

## 9. Webhook Authentication

Webhook endpoints (`/webhook/agent`, `/webhook/tasks/:slug`,
`/webhook/heartbeat`) use a separate authentication mechanism from the tRPC
auth system.

### Bearer token auth

Configure a webhook bearer token in `config.json`:

```json
{
  "runtime": {
    "webhook": {
      "enabled": true,
      "token": "your-secret-webhook-token"
    }
  }
}
```

Requests must include the token in the `Authorization` header:

```bash
curl -X POST http://127.0.0.1:7420/webhook/agent \
  -H "Authorization: Bearer your-secret-webhook-token" \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

### Timing-safe comparison

Token comparison uses `crypto.timingSafeEqual` to prevent timing attacks:

```ts
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

### No auth = open

If `token` is not configured, webhook endpoints are open to any request on
localhost. Since the engine binds to `127.0.0.1`, this is acceptable for simple
local setups but not recommended for production use.

### Webhook task routing

Webhook tasks are matched by URL slug (`/webhook/tasks/:slug`). Each task has
its own prompt template and is dispatched to an isolated agent session. The
webhook token authenticates the request, but the individual task's `enabled`
flag provides an additional gate.

---

## 10. Task-Tier Model Routing

SA supports routing different types of work to different model tiers for
cost/capability optimization. This is not a security mechanism per se, but it
affects which model processes tool calls and sensitive operations.

### Model tiers

| Tier | Intended use | Default task types |
|------|-------------|-------------------|
| `performance` | Complex tasks requiring strongest reasoning | `chat`, `tool_use`, `reasoning` |
| `normal` | General-purpose tasks | (none by default) |
| `eco` | Simple, high-volume tasks where cost matters | `classification`, `summarization`, `transcription` |

### Task types

| Task type | Description | Default tier |
|-----------|-------------|-------------|
| `chat` | Conversational responses | `performance` |
| `tool_use` | Tool selection and argument generation | `performance` |
| `reasoning` | Multi-step reasoning and analysis | `performance` |
| `classification` | Categorization and labeling | `eco` |
| `summarization` | Content summarization | `eco` |
| `transcription` | Audio-to-text transcription | `eco` |

### Configuration

Map tiers to specific model configurations:

```json
{
  "runtime": {
    "modelTiers": {
      "performance": "claude-opus",
      "normal": "claude-sonnet",
      "eco": "claude-haiku"
    },
    "taskTierOverrides": {
      "classification": "normal",
      "tool_use": "performance"
    },
    "modelAliases": {
      "fast": "claude-haiku",
      "smart": "claude-opus"
    }
  }
}
```

### Resolution order

```
Task type --> taskTierOverrides (if set) --> DEFAULT_TASK_TIER --> tier
Tier --> modelTiers mapping --> model name --> ModelRouter.getModel()
```

### Security implications

- Tool-use tasks default to the `performance` tier, ensuring the most capable
  model handles tool selection and argument generation. This reduces the risk
  of a weaker model misclassifying command danger levels.
- The agent's self-declared `danger` parameter on exec calls is generated by
  the active model. A more capable model is more likely to correctly classify
  command danger levels, making the hybrid approval system more effective.
- Cron and webhook tasks use the default model unless a per-task `model`
  override is configured.

---

## Threat Model Summary

SA is designed for a **single user on a single machine**. The threat model
assumes:

| Assumed | Not assumed |
|---------|-------------|
| The user trusts themselves to approve dangerous operations | Multi-user isolation |
| The engine is only reachable on 127.0.0.1 | Public network exposure |
| The filesystem is protected by OS-level user permissions | Container/sandbox isolation |
| API keys are either in env vars or encrypted secrets.enc | HSM or remote secret management |

### Key security properties

1. **Dangerous tools always require approval** -- even in `"never"` mode, the
   engine prompts for dangerous operations.
2. **Exec commands are independently classified** -- the engine does not blindly
   trust the agent's danger self-assessment.
3. **Secrets are encrypted at rest** -- API keys are not stored in plaintext on
   disk.
4. **All connector communication is authenticated** -- no unauthenticated access
   to the tRPC API.
5. **Sensitive env vars are stripped from subprocesses** -- exec commands cannot
   trivially exfiltrate API keys.
6. **Timing-safe token comparison** -- webhook auth is resistant to timing
   attacks.
7. **Tool loop detection** -- the agent is circuit-broken after repeated
   identical tool calls (warn at 10, block at 20, hard-stop at 30).

### Known limitations

- No filesystem sandboxing: exec commands can read/write any file the SA process
  user can access.
- No network sandboxing: exec commands can make arbitrary network requests.
- Machine fingerprint as key material: if hostname or username changes, secrets
  become inaccessible (re-run onboarding to re-create).
- In-memory token storage: session tokens are not persisted across engine
  restarts. All connectors must re-authenticate after a restart.
