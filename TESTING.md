# Esperta Aria Testing Guide

## Quick Reference

| Command | Purpose |
|---------|---------|
| `bun test` | Run all tests (live tests skip without API key) |
| `bun test src/engine/tools/policy.test.ts` | Run one file |
| `bun test tests/live/` | Run only live LLM tests |
| `ANTHROPIC_API_KEY=sk-... bun test` | Run all tests including live |

## Rules

1. **Every new file gets a test file.** If you create `src/engine/foo.ts`, create `src/engine/foo.test.ts` (co-located) or `tests/foo.test.ts`.
2. **Every bug fix gets a regression test.** Write the failing test first, then fix.
3. **Test behavior, not implementation.** Test what a function does, not how it does it.
4. **Pure unit tests where possible.** No I/O, no network, no temp dirs when the logic is pure.
5. **Live LLM tests for agent behavior.** Anything involving the agent chat loop, tool dispatch, or streaming events should be tested with a real (cheap) model. Do NOT mock pi-ai.
6. **Use the shared helpers.** See `tests/helpers/` for temp dirs, live model setup, and test tools.

## Where to put tests

| Test type | Location | When to use |
|-----------|----------|-------------|
| Co-located unit test | `src/**/*.test.ts` | Testing a single module's pure logic (no I/O, no LLM) |
| External unit test | `tests/*.test.ts` | Testing a subsystem with I/O or cross-module deps |
| Live LLM test | `tests/live/*.test.ts` | Testing agent chat, tool dispatch, tRPC chat.stream |
| Integration test | `tests/integration/*.test.ts` | Testing two+ subsystems without LLM |
| E2E test | `tests/e2e/*.test.ts` | Testing full system initialization or user flows |

## Live LLM test patterns

### Basic agent chat test

```ts
import { describe, test, expect } from "bun:test";
import { Agent } from "../../src/engine/agent/index.js";
import { makeLiveRouter, describeLive } from "../helpers/live-model.js";

describeLive("Agent chat", () => {
  test("responds to a simple prompt", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [],
      systemPrompt: "Reply with exactly one word.",
    });

    const events: string[] = [];
    for await (const event of agent.chat("Say hello")) {
      events.push(event.type);
    }

    expect(events).toContain("text_delta");
    expect(events.at(-1)).toBe("done");
  }, 15_000);
});
```

### Testing tool dispatch with real LLM

```ts
import { echoTool } from "../helpers/test-tools.js";

describeLive("Agent tool use", () => {
  test("agent calls a tool and gets result", async () => {
    const agent = new Agent({
      router: makeLiveRouter(),
      tools: [echoTool],
      systemPrompt: "When asked to echo, use the echo tool. Nothing else.",
    });

    const events = [];
    for await (const event of agent.chat('Use the echo tool with message "test123"')) {
      events.push(event);
    }

    const toolStart = events.find(e => e.type === "tool_start");
    expect(toolStart).toBeDefined();
    expect(events.at(-1).type).toBe("done");
  }, 30_000);
});
```

### Key rules for live test assertions

- **Assert event types, not text content.** LLMs are non-deterministic. Check that `text_delta` events were emitted, not what they say.
- **Assert tool names, not arguments.** Check that the agent called `echo`, not the exact arguments.
- **Assert structural properties.** Event ordering (text_delta before done), event presence (tool_start exists), result shape (tool_end has content).
- **Use generous timeouts.** `15_000` for simple prompts, `30_000` for tool use. API latency varies.
- **Keep prompts directive.** "Use the echo tool" is better than "Can you please echo something?" — reduces non-determinism.
- **Use low maxTokens.** `64-256` is enough for test assertions. Saves cost and time.

## Unit test patterns

### Temp directories

```ts
import { withTempDir } from "../helpers/temp-dir.js";

describe("MyFeature", () => {
  withTempDir((getDir) => {
    test("writes a file", async () => {
      const dir = getDir();
      // use dir for file I/O
    });
  });
});
```

### Testing tools (without LLM)

```ts
import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../src/engine/agent/types.js";

const tool: ToolImpl = {
  name: "my_tool",
  description: "...",
  dangerLevel: "safe",
  parameters: Type.Object({ input: Type.String() }),
  execute: async (args) => ({ content: String(args.input) }),
};

test("my_tool returns input", async () => {
  const result = await tool.execute({ input: "hello" });
  expect(result.content).toBe("hello");
});
```

## What NOT to test

- Type definitions (`types.ts`) — no runtime behavior
- Re-export barrels (`index.ts`) — unless they contain logic
- Third-party library behavior — test YOUR code's usage of it
- Exact LLM response text — always non-deterministic
- TUI visual layout — no good Ink testing story with Bun yet

## Danger level testing

When adding or modifying a tool:
- Test that `dangerLevel` is set correctly
- For `exec`-adjacent tools, test command classification
- For dangerous tools, write a live test verifying the approval flow

## CI expectations

- `bun test` must pass on every PR (live tests skip without API key)
- `bun run typecheck` must pass
- `bun run lint` must pass
- Live tests run in CI when `ANTHROPIC_API_KEY` secret is configured
