# Providers

Aria separates execution backends from runtime orchestration.

## Package

- `packages/agents-coding`

## Why Separate Adapters

Each backend adapter still has its own:

- auth and availability checks
- execution command model
- result parsing
- cancellation behavior
- capability matrix

The current provider registry includes Anthropic, OpenAI, Google, OpenRouter, and MiniMax. MiniMax is treated as an OpenAI-compatible provider.

The runtime/jobs layer resolves a backend through the shared coding-agent registry rather than hard-coding one execution path.

## Runtime Integration

`packages/runtime/src/backend-registry.ts` maps backend IDs to runtime adapters.

`packages/runtime/src/dispatch-runner.ts` uses that registry to execute tracked dispatches and map lifecycle updates back into Projects.
