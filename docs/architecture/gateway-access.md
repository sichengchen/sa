# Gateway Access

This page defines the secure connection model for `Aria Server`.

The rule is:

`Aria Server Gateway` is the only Aria-owned entrypoint. Reachability is external infrastructure.

## Why

Aria should not bind operators to an Aria-operated network broker or any proprietary network path.

Operators may choose:

- loopback-only access on the same machine
- LAN reachability on a trusted home or office network
- private overlay reachability such as Tailscale
- a published reverse proxy or tunnel such as Cloudflare Tunnel

Those choices change network topology, not assistant semantics.

## Ownership Split

### `Aria Server Gateway` owns

- request authentication
- device/session enrollment
- pairing code validation
- bearer session issuance
- authorization checks
- request and realtime protocol handling
- audit of gateway auth events

### External infrastructure owns

- DNS
- inbound routing
- NAT traversal
- TLS termination if placed in front of Aria
- WAF / IP allowlists / private-network policy
- private mesh connectivity

## Reachability Modes

### 1. Loopback-first

Default mode:

- bind to `127.0.0.1`
- use local console/desktop on the same host
- expose nothing to the LAN by default

### 2. LAN reachability

Operator intentionally binds the gateway to a LAN-facing address.

Use this when:

- all clients are on the same trusted network
- the operator wants mobile/tablet access at home or in the office

Requirements:

- strong gateway auth still applies
- operator accepts LAN exposure explicitly

### 3. Private overlay reachability

Examples:

- Tailscale
- WireGuard-based private mesh
- ZeroTier

Recommended properties:

- only the overlay publishes the route
- Aria still authenticates every client itself
- no Aria-specific access broker is required

### 4. Published gateway reachability

Examples:

- Cloudflare Tunnel
- Caddy / Nginx / Traefik reverse proxy
- cloud load balancer in front of the host

Recommended properties:

- TLS in front of the gateway
- optional IP allowlists, Access policies, or mTLS
- gateway auth remains mandatory even behind the proxy

## Security Rules

### Pairing code issuance

Pairing codes are the bootstrap secret for a new device.

Therefore:

- pairing code generation must be local/admin initiated
- pairing code retrieval must not be a public unauthenticated API
- pairing codes are one-time and short-lived
- pairing success returns a narrower bearer session token

### Session tokens

Session tokens should remain:

- scoped to connector/device identity
- durable only within TTL
- revocable
- auditable

### Network publication

External infra may publish the gateway, but it must not:

- issue Aria session tokens on Aria's behalf
- become the source of truth for thread/run identity
- change approval semantics
- store assistant memory as an access-layer concern

## Recommended Connection Order

Prefer:

1. loopback or same-LAN access
2. private overlay access
3. published tunnel or reverse proxy

This keeps the design simple:

- one gateway
- one auth model
- many possible network paths
