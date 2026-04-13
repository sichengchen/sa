import { describe, test, expect, afterEach } from "bun:test";
import { ToolRegistry } from "@aria/agent-aria";
import { createWebFetchTool, getBuiltinTools } from "@aria/tools";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "aria-integration-agent-" + Date.now());

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Agent flow integration", () => {
  test("ToolRegistry with all built-in tools executes correctly", async () => {
    await mkdir(testDir, { recursive: true });
    const registry = new ToolRegistry();
    for (const tool of [...getBuiltinTools(), createWebFetchTool()]) {
      registry.register(tool);
    }

    // Verify all tools are registered
    expect(registry.listNames()).toEqual([
      "read",
      "write",
      "edit",
      "exec",
      "exec_status",
      "exec_kill",
      "web_search",
      "reaction",
      "web_fetch",
    ]);

    // Tool definitions are valid for LLM context
    const defs = registry.getToolDefinitions();
    expect(defs).toHaveLength(9);
    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.parameters).toBeTruthy();
    }

    // Execute write tool via registry
    const writeResult = await registry.execute("write", {
      file_path: join(testDir, "test.txt"),
      content: "integration test",
    });
    expect(writeResult.isError).toBeUndefined();

    // Execute read tool via registry
    const readResult = await registry.execute("read", {
      file_path: join(testDir, "test.txt"),
    });
    expect(readResult.content).toBe("integration test");

    // Execute exec tool via registry
    const execResult = await registry.execute("exec", {
      command: `cat "${join(testDir, "test.txt")}"`,
    });
    expect(execResult.content).toContain("integration test");
    expect(execResult.content).toContain("<data-exec>");
  });

  test("ToolRegistry handles unknown tools gracefully", async () => {
    const registry = new ToolRegistry();
    for (const tool of getBuiltinTools()) {
      registry.register(tool);
    }

    const result = await registry.execute("nonexistent_tool", { arg: "value" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown tool");
  });
});
