# Tool Runtime

Aria exposes tools through structured toolsets rather than a flat registry.

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

Each tool belongs to exactly one primary toolset, even if it participates in cross-cutting policies.

## Capability Policy

Every toolset declares:

- capability scope
- approval requirements
- execution backend
- isolation expectations
- audit hooks
- frontend visibility defaults

Policy is resolved before execution. Approval is one part of capability policy, not the whole model.

## Built-In and MCP Tools

Built-in and MCP tools are presented through one unified interface to the agent. They differ in governance:

| Dimension | Built-In Tools | MCP Tools |
| --- | --- | --- |
| Implementation owner | Runtime | External server |
| Trust source | Local code | Server registration and trust policy |
| Availability | Runtime-managed | Session- and policy-scoped |
| Audit | Native | Native plus server identity metadata |

## MCP as Native Extension Layer

MCP support includes:

- local and remote server registration
- trust policy
- capability inspection
- per-session enablement
- resource and prompt discovery
- complete audit trails for calls and results

MCP is not an afterthought. It is the default extension model for Aria.

## Execution Backends

The tool runtime separates policy from execution. A capability may be executed through different backends, including:

- restricted local execution
- sandboxed execution
- remote MCP execution

The approval flow does not hard-code a single backend.

## Audit Requirements

Every tool execution records:

- session and run identity
- toolset and tool name
- capability policy decision
- approval state
- execution backend
- start and end timestamps
- result summary
- failure or cancellation state
