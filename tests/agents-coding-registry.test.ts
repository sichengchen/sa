import { describe, expect, test } from "bun:test";
import {
  createAriaRuntimeBackendAdapter,
  createCodingAgentBackendRegistry,
} from "@aria/agents-coding";

describe("createCodingAgentBackendRegistry", () => {
  test("registers the target-state coding agent adapters", () => {
    const registry = createCodingAgentBackendRegistry();

    expect(Array.from(registry.keys())).toEqual(["codex", "claude-code", "opencode"]);
    expect(registry.get("codex")?.displayName).toBe("Codex");
    expect(registry.get("claude-code")?.displayName).toBe("Claude Code");
    expect(registry.get("opencode")?.displayName).toBe("OpenCode");
  });
});

describe("Aria runtime adapter export", () => {
  test("re-exports the Aria runtime backend adapter from @aria/agents-coding", async () => {
    const adapter = createAriaRuntimeBackendAdapter({
      driver: {
        execute: async () => ({
          backend: "aria",
          executionId: "1",
          status: "succeeded",
          exitCode: 0,
          stdout: "",
          stderr: "",
          filesChanged: [],
        }),
        cancel: async () => {},
      },
    });
    expect(adapter.backend).toBe("aria");
    expect(adapter.displayName).toBe("Aria Runtime");
  });
});
