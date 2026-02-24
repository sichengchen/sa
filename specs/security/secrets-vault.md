# Secrets Vault

Encrypted at-rest storage for API keys, bot tokens, and pairing credentials.
Stored in `~/.sa/secrets.enc` with a companion salt file `~/.sa/.salt`.

---

## Encryption Scheme

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key derivation | scrypt (N=16384, r=8, p=1) |
| Key length | 32 bytes (256 bits) |
| IV | 16 random bytes per encryption |
| Auth tag | GCM authentication tag (integrity check) |
| Salt | 32 random bytes, stored in `~/.sa/.salt` |

---

## Key Derivation

The encryption key is derived from a **machine fingerprint** combined with the
random salt via scrypt:

```ts
function machineFingerprint(): string {
  return `${hostname()}:${username}:${homedir}`;
}

// Key = scrypt(machineFingerprint, salt, keyLength=32, {N:16384, r:8, p:1})
```

### Implications

- The secrets file is **tied to the specific machine and user account**.
- It cannot be decrypted on a different machine or by a different user.
- **No master password** is required -- the machine identity is the key material.
- If you change your hostname or username, you will need to re-create secrets
  (re-run onboarding).

---

## On-Disk Format

The `secrets.enc` file contains JSON with three hex-encoded fields:

```json
{
  "iv": "aabbccdd...",
  "authTag": "11223344...",
  "data": "encrypted_hex..."
}
```

A fresh IV is generated on every write, so re-encrypting the same data produces
different ciphertext.

---

## File Permissions

| File | Permission | Description |
|------|------------|-------------|
| `~/.sa/.salt` | `0o600` | Random salt, never overwritten once created |
| `~/.sa/secrets.enc` | `0o600` | Encrypted secrets, rewritten on every save |

---

## SecretsFile Structure

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

---

## Runtime Injection

At startup, the engine loads secrets and injects API keys into `process.env`.
Precedence order:

```
1. Environment variables already set (highest priority)
2. Secrets vault (secrets.enc)
3. Plain config values (lowest priority)
```

```ts
const secrets = await config.loadSecrets();
if (secrets?.apiKeys) {
  for (const [envVar, value] of Object.entries(secrets.apiKeys)) {
    if (!process.env[envVar] && value) {
      process.env[envVar] = value;
    }
  }
}
```

---

## Legacy Migration

The original key derivation used only the hostname. The current version uses
the full machine fingerprint (`hostname:username:homedir`).

```
Load secrets.enc
  --> Try new key derivation (hostname:user:home)
  --> If fail, try legacy derivation (hostname only)
    --> If legacy succeeds, re-encrypt with new derivation
    --> If both fail, warn and fall back to environment variables
```

Migration is automatic and transparent -- no user action required.
