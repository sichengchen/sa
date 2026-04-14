# Tool Runtime

This page defines the target-state tool runtime for Aria.

Aria exposes tools through structured toolsets rather than a flat registry. Policy is resolved before execution, and built-in plus MCP tools share one runtime-facing contract.

## Toolsets

The baseline toolsets are:

- `files`
- `terminal`
- `web`
- `memory`
- `automation`
- `communication`
- `coding`
- `delegation`
- `mcp`

Each tool belongs to exactly one primary toolset even when policy spans multiple concerns.

## Capability Policy

Every toolset declares:

- capability scope
- approval requirements
- execution backend
- isolation expectations
- audit hooks
- frontend visibility defaults

Approval is one policy outcome, not the whole model.

## Built-In And MCP Tools

Built-in and MCP tools should look uniform to the runtime and agent, but their governance differs:

| Dimension            | Built-In Tools  | MCP Tools                            |
| -------------------- | --------------- | ------------------------------------ |
| Implementation owner | Runtime         | External server                      |
| Trust source         | Local code      | Server registration and trust policy |
| Availability         | Runtime-managed | Session- and policy-scoped           |
| Audit                | Native          | Native plus server identity metadata |

## MCP As Native Extension Layer

MCP support includes:

- local and remote server registration
- trust policy and capability inspection
- per-session enablement
- resource and prompt discovery
- full audit trails for calls and results

MCP is Aria's default extension path, not an afterthought.

## Execution Backends

The tool runtime separates policy from execution. A capability may run through different backends, including:

- restricted local execution
- sandboxed execution
- remote MCP execution
- desktop-local bridge execution for local project work

The approval flow must not hard-code one backend.

## Audit Requirements

Every tool execution records:

- thread, session, and run identity
- toolset and tool name
- capability policy decision
- approval state
- execution backend
- start and end timestamps
- result summary
- failure or cancellation state

## Current Inventory

The current built-in tool catalog and danger-level rules live in the reference docs:

- [../reference/tools/README.md](../reference/tools/README.md)
- [../security/approval-flow.md](../security/approval-flow.md)

This page defines the architecture contract; the reference pages define today's concrete surface.
