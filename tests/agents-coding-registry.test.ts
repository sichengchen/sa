import { describe, expect, test } from "bun:test";
import { createCodingAgentBackendRegistry } from "@aria/agents-coding";

describe("createCodingAgentBackendRegistry", () => {
  test("registers the target-state coding agent adapters", () => {
    const registry = createCodingAgentBackendRegistry();

    expect(Array.from(registry.keys())).toEqual(["codex", "claude-code", "opencode"]);
    expect(registry.get("codex")?.displayName).toBe("Codex");
    expect(registry.get("claude-code")?.displayName).toBe("Claude Code");
    expect(registry.get("opencode")?.displayName).toBe("OpenCode");
  });
});
