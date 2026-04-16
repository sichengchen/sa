# Gateway

`aria gateway` is the operator surface for secure access to `Aria Server`.

## Recommended Use

1. Keep the gateway loopback-only by default.
2. If you need another device to connect, choose your own reachability layer:
   - LAN
   - Tailscale
   - Cloudflare Tunnel
   - reverse proxy or load balancer
3. Issue a pairing code locally with `aria gateway pair-code`.
4. Enter that one-time code on the target device.

## Why This Model

Aria should not require an Aria-operated network broker to become reachable.

The built-in gateway owns:

- auth
- session issuance
- approvals and protocol semantics

Your chosen network infrastructure owns:

- routing
- TLS
- NAT traversal
- private-network policy

## Current Commands

- `aria gateway status`
- `aria gateway pair-code`

## Safety Rules

- do not expose pairing code generation as a public unauthenticated endpoint
- treat pairing codes as one-time bootstrap secrets
- prefer private reachability like LAN or Tailscale before publishing a public URL
- if you publish a public URL, put TLS and network controls in front of the gateway
