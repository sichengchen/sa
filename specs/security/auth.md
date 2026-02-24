# Authentication

All tRPC communication between connectors and the engine is authenticated via
bearer tokens managed by the `AuthManager`. Webhook endpoints use a separate
but related token mechanism.

---

## Master Token

On every engine startup, a new 32-byte random master token is generated:

```ts
this.masterToken = randomBytes(32).toString("hex"); // 64-char hex string
await writeFile(this.tokenFilePath, this.masterToken, { mode: 0o600 });
```

- Written to `~/.sa/engine.token` with `chmod 600`.
- Valid for the lifetime of the engine process.
- Deleted on engine shutdown.
- Local connectors (TUI) read this file to authenticate with the engine.

---

## Device-Flow Pairing

Remote connectors (Telegram, Discord) that cannot read the local filesystem
use a pairing code flow:

1. Engine generates a pairing code using charset
   `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I` to avoid confusion).
   Default length: 8 characters.
2. User provides code to remote connector (e.g., `/pair ABC123XY` in Telegram).
3. Connector calls `auth.pair` tRPC procedure with the code.
4. If the code matches and is not expired, the engine issues a session token
   (32 random bytes, hex-encoded).
5. The pairing code is consumed (one-time use).

### Pairing Security

| Property | Value |
|----------|-------|
| Code charset | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (28 chars) |
| Code length | 8 characters (default, configurable) |
| Code TTL | 10 minutes (default, configurable) |
| Rate limiting | Per-connector exponential backoff (1s, 2s, 4s, ... 60s cap) |

---

## Token Validation

Every protected tRPC procedure runs through the `authMiddleware`:

```ts
const authMiddleware = middleware(async ({ ctx, next }) => {
  if (!ctx.token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const entry = runtime.auth.validate(ctx.token);
  if (!entry) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, connectorId: entry.connectorId } });
});
```

- **Master token**: always valid (engine lifetime).
- **Session tokens**: stored in-memory, checked for TTL expiry on every call.
- **Comparison**: timing-safe (`crypto.timingSafeEqual`) to prevent timing
  side-channel attacks.

### Session Token TTL

Session tokens expire after 24 hours by default (configurable via
`securityConfig.sessionTTL`). Expired tokens are silently removed on
validation.

---

## Token Lifecycle

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

## Webhook Authentication

Webhook endpoints use a dedicated webhook token, separate from the master token.

### Bearer Token

A webhook token is auto-generated on engine startup and written to
`~/.sa/engine.webhook-token` (chmod 600). Requests must include it:

```bash
curl -X POST http://127.0.0.1:7420/webhook/agent \
  -H "Authorization: Bearer <webhook-token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

### Timing-Safe Comparison

```ts
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

---

## In-Memory Only

All session tokens are stored in-memory only. They do not survive engine
restarts. After a restart, all connectors must re-authenticate (local
connectors re-read `engine.token`, remote connectors re-pair).

---

## Configuration

```json
{
  "runtime": {
    "auth": {
      "sessionTTL": 86400,
      "pairingTTL": 600,
      "pairingCodeLength": 8
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sessionTTL` | `number` (seconds) | `86400` (24h) | Session token TTL |
| `pairingTTL` | `number` (seconds) | `600` (10min) | Pairing code TTL |
| `pairingCodeLength` | `number` | `8` | Pairing code length |
