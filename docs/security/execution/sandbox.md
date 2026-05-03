# Sandbox

Execution sandboxing is owned by harness bash environments and external
sandbox providers.

See [bash-environments.md](./bash-environments.md).

---

## Current Boundary

| Environment | Filesystem behavior                                | Isolation model                                 |
| ----------- | -------------------------------------------------- | ----------------------------------------------- |
| `default`   | just-bash with `InMemoryFs` or project `OverlayFs` | No host writes; project writes stay virtual     |
| `host`      | Real local machine                                 | Explicit operator approval required             |
| `external`  | Provider-backed sandbox                            | Adapter-selected isolated execution environment |

The removed legacy OS sandbox compatibility layer is not an architectural
boundary. Aria now routes shell execution through `AriaSessionEnv`, classifies
each request with `ToolIntent`, and delegates trust decisions to runtime and
policy.

---

## Removed Compatibility APIs

The old direct exec sandbox shims have been removed:

- `SeatbeltSandbox`
- `NoopSandbox`
- `configureSandbox`
- `@aria/tools/sandbox`
- `@aria/runtime/tools/sandbox`

Code must request the appropriate harness environment instead of wrapping host
commands after selection. If a command cannot run in `default` or `external`,
the result must require escalation; it must not silently fall back to `host`.

---

## Design Philosophy

The durable trust boundary is:

- `@aria/harness` owns agent-facing capabilities and environment routing.
- `@aria/policy` owns risk classification, path, URL, and network checks.
- `@aria/runtime` owns approvals, audit, recovery, and gateway dispatch.
- External sandbox providers are preferred for arbitrary binaries, dependency
  installs, builds, tests, long-running servers, or untrusted code.
