# Security Specs

## Security Model

Aria is local-first and primarily operator-controlled, but still enforces explicit trust boundaries across runtime, relay, connectors, automation, and projects.

## Authentication

- Runtime master token: full runtime control
- Session token: scoped connector/session access
- Webhook token: webhook-only access
- Relay pairing token: device-scoped remote trust

These tokens are distinct and are not interchangeable.

## Authorization

- Session ownership matters for non-master callers.
- Tool approvals depend on tool danger level and connector mode.
- Relay attachments grant only the permissions explicitly attached to that session binding.
- Projects mutations are durable state mutations and must remain attributable.

## Approval Flow

Tool approval is governed by capability policy, not just one-off prompts. Approval-requiring work must record:

- the run
- the tool call
- the approval record
- the final approval resolution

## Security Modes

Runtime session modes may move between default, trusted, and unrestricted behavior with TTL-backed reversion.

## Exec and Content Protection

- exec classification determines baseline risk
- exec fence constrains accessible paths
- sandbox support is additive where available
- content framing and secret redaction reduce prompt/tool exfiltration risk

## Secrets

Secrets are encrypted at rest and must not be treated as ordinary config.

## Audit

Audit is always on. Tool calls, denials, auth failures, approvals, and security blocks are durable records.

## Relay and Projects Boundaries

- Relay never owns execution or project state.
- Projects never owns live process lifecycle.
- Runtime never delegates durable tracked-work ownership to relay surfaces.
