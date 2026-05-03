# Bash Environments

Aria shell execution is routed through explicit harness environments.

## Default

`default` uses `just-bash`.

- plain chat uses `InMemoryFs`
- project threads use `OverlayFs`
- project reads can come from the real project directory
- writes stay in memory and do not mutate host files
- network is disabled unless configured with an allowlist
- `curl` exists only when network is configured
- Python and JavaScript execution are opt-in

Default shell commands usually do not require approval because their filesystem effect is virtual.

## Host

`host` is the real local machine.

Host execution is approval-gated and should be presented as "Dangerously use this Mac" in operator-facing surfaces.
Host writes, process operations, deploys, publishes, pushes, deletes, full network, and secret injection require explicit approval.

## External

`external` is a real isolated execution provider such as Daytona, E2B, Vercel Sandbox, Docker, or a remote Aria node.

When multiple providers are registered, the harness selects the requested adapter by name. If the requested adapter is unavailable, it returns an escalation-required result instead of using another provider.

If no adapter is available, the harness returns an escalation-required result.
It must not silently run the command on host.

## just-bash Boundary

just-bash is not VM isolation. It is the default low-friction bash environment for virtual filesystem work and text processing.
Arbitrary binaries, dependency installs, builds, tests, long-running servers, and untrusted code should run through a host approval or an external sandbox provider.
