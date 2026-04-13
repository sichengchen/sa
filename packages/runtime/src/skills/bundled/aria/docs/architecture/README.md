# Architecture

This section contains remaining current-state implementation notes while the repo continues moving to the target architecture.

`docs/new-architecture/*` is the source of truth for package boundaries, deployment model, and client/server responsibilities.

## Overall Diagram

```mermaid
flowchart TD
    subgraph Surfaces["User Surfaces"]
        CLI["CLI (`aria`)"]
        TUI["TUI Connector"]
        CHAT["Chat Connectors"]
        WEBHOOK["Webhook Triggers"]
        REMOTE["Paired Remote Devices"]
    end

    CLI --> PROTOCOL["Shared Interaction Protocol"]
    TUI --> PROTOCOL
    CHAT --> PROTOCOL
    WEBHOOK --> PROTOCOL
    REMOTE --> RELAY["Relay"]
    RELAY --> PROTOCOL

    PROTOCOL --> RUNTIME["Aria Runtime"]

    subgraph RuntimeInternals["Runtime Internals"]
        PROMPT["Prompt Engine"]
        TOOLS["Tool Runtime + MCP"]
        AUTOMATION["Automation Runtime"]
        STORE["Operational Store (`aria.db`)"]
        PROVIDERS["Provider Adapters"]
    end

    RUNTIME --> PROMPT
    RUNTIME --> TOOLS
    RUNTIME --> AUTOMATION
    RUNTIME --> STORE
    RUNTIME --> PROVIDERS

    subgraph DurableWork["Aria Projects"]
        PROJECTS["Projects Engine"]
        HANDOFF["Handoff"]
        REPOS["Repos + Worktrees"]
        REVIEWS["Reviews + Publish Runs"]
    end

    CLI --> HANDOFF
    HANDOFF --> PROJECTS
    PROJECTS --> REPOS
    PROJECTS --> REVIEWS
    PROJECTS --> DISPATCH["Dispatch"]
    DISPATCH --> RUNTIME
    RUNTIME --> DISPATCH

    STORE -.persists live state.-> PROJECTS
```

- [runtime.md](./runtime.md)
- [storage-and-recovery.md](./storage-and-recovery.md)
- [tool-runtime.md](./tool-runtime.md)
- [handoff.md](./handoff.md)
- [providers.md](./providers.md)
- [interaction-protocol.md](./interaction-protocol.md)
