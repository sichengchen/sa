# Relay Specs

## Relay Role

`packages/relay` owns paired-device trust, remote session attachment, and transport envelopes for remote control.

Relay is not a second runtime and does not own durable tracked work state.

## Trust Model

- Devices are explicitly paired and can be revoked.
- Pairing yields a device-scoped trust token.
- Revoked devices cannot attach or send control envelopes.
- Relay permissions are scoped per attachment, not globally.

## Session Attachment

Relay devices attach to existing runtime sessions.

An attachment records:

- device identity
- target session
- whether follow-up messages are allowed
- whether approval responses are allowed
- attach and detach timestamps

## Event Transport

Relay transports normalized envelopes rather than mutating runtime state directly.

Current envelope types:

- follow-up message
- approval response

These envelopes are durable until delivered or explicitly cleared.

## Security Boundaries

- Relay may target active runtime sessions.
- Relay does not own task, dispatch, review, or publish records.
- Relay permissions are separate from local operator permissions.
- Approval forwarding requires both an active attachment and explicit approval-response permission.

## Failure and Recovery

- Paired devices, attachments, and queued envelopes must survive process restart.
- Delivery state must be queryable and markable as complete.

## Current Implementation Notes

- Relay now persists devices, session attachments, and queued control envelopes through `packages/relay`.
- `aria relay` exposes register, revoke, attach, detach, send, approve, list, and delivery bookkeeping commands.
- A future remote transport may replace local polling, but it must preserve this trust and envelope model.
