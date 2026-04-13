# Secrets Vault

Encrypted at-rest storage for API keys, bot tokens, and pairing credentials.
Stored in `~/.aria/secrets.enc` with a companion salt file `~/.aria/.salt`.

---

## Encryption Scheme

| Property       | Value                                      |
| -------------- | ------------------------------------------ |
| Algorithm      | AES-256-GCM                                |
| Key derivation | scrypt (N=16384, r=8, p=1)                 |
| Key length     | 32 bytes (256 bits)                        |
| IV             | 16 random bytes per encryption             |
| Auth tag       | GCM authentication tag (integrity check)   |
| Salt           | 32 random bytes, stored in `~/.aria/.salt` |

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

| File                  | Permission | Description                                 |
| --------------------- | ---------- | ------------------------------------------- |
| `~/.aria/.salt`       | `0o600`    | Random salt, never overwritten once created |
| `~/.aria/secrets.enc` | `0o600`    | Encrypted secrets, rewritten on every save  |

---

## SecretsFile Structure

```ts
interface SecretsFile {
  apiKeys: Record<string, string>; // e.g. { "ANTHROPIC_API_KEY": "sk-...", "MINIMAX_API_KEY": "sk-..." }
  botToken?: string; // Telegram bot token
  pairedChatId?: number; // Telegram paired chat ID
  pairingCode?: string; // One-time pairing code
  discordToken?: string; // Discord bot token
  discordGuildId?: string; // Discord guild ID
  wechatAccounts?: Array<{
    // Linked WeChat connector accounts
    accountId: string;
    botToken: string;
    apiBaseUrl?: string;
    allowedUserIds?: string[];
  }>;
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

## Unsupported Legacy Vaults

Esperta Aria does not attempt to decrypt or migrate secrets written by older
runtime formats. If `secrets.enc` cannot be decrypted with the current machine
fingerprint scheme, the runtime warns and falls back to environment variables.

If you are moving from an older runtime or a different machine, recreate the
vault with `aria onboard` or re-enter the required secrets through the current
configuration flow.
