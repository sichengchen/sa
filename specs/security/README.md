# Security

SA is a single-user, localhost-only personal agent. Its security model is
designed around three principles:

1. **Defense in depth for tool execution** -- layered classification, approval,
   fencing, sandboxing, and audit logging for every tool call.
2. **Encrypted at-rest secrets** -- API keys and bot tokens stored in
   AES-256-GCM encrypted vault, never in plaintext on disk.
3. **Token-based authentication for all Engine access** -- every tRPC call and
   webhook request is authenticated via bearer tokens.

---

## Subsystem Index

| File | Description |
|------|-------------|
| [`approval-flow.md`](approval-flow.md) | 3-tier approval matrix (safe/moderate/dangerous x connector modes) |
| [`exec-classifier.md`](exec-classifier.md) | Hybrid exec command classification (agent + engine) |
| [`url-policy.md`](url-policy.md) | SSRF protection for web_fetch |
| [`exec-fence.md`](exec-fence.md) | Working directory restrictions for exec |
| [`content-framing.md`](content-framing.md) | Data tags for prompt injection defense |
| [`audit-log.md`](audit-log.md) | Security event logging (NDJSON) |
| [`security-modes.md`](security-modes.md) | Session security modes (default/trusted/unrestricted) |
| [`sandbox.md`](sandbox.md) | OS-level exec sandbox (macOS Seatbelt) |
| [`secrets-vault.md`](secrets-vault.md) | Encrypted secrets storage (AES-256-GCM) |
| [`auth.md`](auth.md) | Authentication, master token, device-flow pairing |

---

## Threat Model

| Assumed | Not assumed |
|---------|-------------|
| The user trusts themselves to approve dangerous operations | Multi-user isolation |
| The engine is only reachable on 127.0.0.1 | Public network exposure |
| The filesystem is protected by OS-level user permissions | Container/sandbox isolation |
| API keys are either in env vars or encrypted secrets.enc | HSM or remote secret management |

---

## Key Security Properties

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
6. **Timing-safe token comparison** -- webhook and tRPC auth is resistant to
   timing attacks.
7. **Tool loop detection** -- the agent is circuit-broken after repeated
   identical tool calls (warn at 10, block at 20, hard-stop at 30).

---

## Known Limitations

1. **No filesystem sandboxing** -- exec commands can read/write any file the SA
   process user can access (mitigated by the exec fence and OS sandbox on macOS).
2. **No network sandboxing** -- exec commands can make arbitrary network requests.
3. **Machine fingerprint as key material** -- if hostname or username changes,
   secrets become inaccessible (re-run onboarding to re-create).
4. **In-memory token storage** -- session tokens are not persisted across engine
   restarts. All connectors must re-authenticate after a restart.
