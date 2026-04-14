# Interaction Protocol

This page defines the transport-agnostic interaction contract used across console, desktop, mobile, connectors, relay, and automation.

## Protocol Goals

1. One runtime event model for all frontends.
2. Streaming-first delivery with durable run identity.
3. Native support for approvals, questions, actions, interrupts, and attachments.
4. Frontends stay thin and do not invent connector-specific execution semantics.
5. Direct and relay-assisted connections preserve the same protocol shape.

## Event Families

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

Every protocol envelope should carry as much canonical identity as is available:

- `serverId`
- `workspaceId`
- `projectId`
- `environmentId`
- `threadId`
- `sessionId`
- `runId`
- `jobId`
- `taskId`
- `agentId`
- `actorId`

At minimum, server-hosted streaming events should make `threadId`, `sessionId`, and `runId` explicit so correlation never depends on transport state.

## Delivery Rules

- the same event semantics apply over console, gateway, connector adapters, and relay transport
- reconnect must resume against canonical server-owned thread and run identity
- attachments and long-running jobs should be reclaimable without inventing shadow state on the client or relay

## Frontend Rules

Each frontend adapts the protocol to its own UI constraints, but it must not redefine:

- approval meaning
- interrupt behavior
- task and run status semantics
- tool execution meaning
- thread and run correlation

## Ownership

`@aria/protocol` owns request, event, identity, and streaming contracts. Gateway, runtime, relay, and client packages should consume those contracts instead of re-declaring near-duplicates.

## Related Reading

- [runtime.md](./runtime.md)
- [domain-model.md](./domain-model.md)
- [relay.md](./relay.md)
- [server.md](./server.md)
