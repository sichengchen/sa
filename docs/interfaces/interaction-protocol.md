# Interaction Protocol

Aria uses one transport-agnostic interaction protocol across TUI, chat connectors, webhook APIs, automation delivery, and future web UI.

## Protocol Goals

1. One runtime event model for all frontends.
2. Streaming-first delivery with durable run identity.
3. Native support for approvals, questions, actions, interrupts, and attachments.
4. Frontends remain thin surfaces; they do not invent connector-specific execution semantics.

## Core Event Families

### Inbound

- user message
- operator action
- approval response
- question response
- interrupt
- attachment upload
- automation trigger

### Outbound

- text delta
- reasoning delta
- tool started
- tool finished
- approval requested
- question asked
- reaction emitted
- attachment available
- status changed
- run completed
- run failed

## Identity Model

Every protocol event includes sufficient identity to correlate with durable state:

- session ID
- run ID
- task ID when applicable
- parent run ID for delegated work
- actor or frontend metadata

## Frontend Requirements

Each frontend adapts the shared event model to its own UI constraints, but it must not redefine runtime semantics. Approval rules, interrupts, task states, and tool execution meaning come from the runtime protocol.
