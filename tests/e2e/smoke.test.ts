import { describe, test, expect, afterEach } from "bun:test";
import { ConfigManager } from "@sa/engine/config/index.js";
import { ModelRouter } from "@sa/engine/router/index.js";
import { Agent } from "@sa/engine/agent/index.js";
import { MemoryManager } from "@sa/engine/memory/index.js";
import { getBuiltinTools, createWebFetchTool } from "@sa/engine/tools/index.js";
import { createMemoryWriteTool } from "@sa/engine/tools/memory-write.js";
import { createMemorySearchTool } from "@sa/engine/tools/memory-search.js";
import { createMemoryReadTool } from "@sa/engine/tools/memory-read.js";
import { createMemoryDeleteTool } from "@sa/engine/tools/memory-delete.js";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testHome = join(tmpdir(), "sa-e2e-smoke-" + Date.now());

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

describe("E2E smoke test", () => {
  test("full system initialization — config, router, memory, agent", async () => {
    // 1. Config initializes with defaults
    const config = new ConfigManager(testHome);
    const saConfig = await config.load();
    expect(saConfig.identity.name).toBe("SA (Sasa)");

    // 2. Memory initializes
    const memoryDir = join(testHome, saConfig.runtime.memory.directory);
    const memory = new MemoryManager(memoryDir);
    await memory.init();

    const memoryContext = await memory.loadContext();

    // 3. Router loads from config data (v3 merged schema)
    const router = ModelRouter.fromConfig({
      providers: saConfig.providers,
      models: saConfig.models,
      defaultModel: saConfig.defaultModel,
    });
    expect(router.listModels().length).toBeGreaterThan(0);

    // 4. Agent initializes with all components
    const tools = [
      ...getBuiltinTools(),
      createWebFetchTool(),
      createMemoryWriteTool(memory),
      createMemorySearchTool(memory),
      createMemoryReadTool(memory),
      createMemoryDeleteTool(memory),
    ];
    const agent = new Agent({
      router,
      tools,
      systemPrompt: saConfig.identity.systemPrompt,
    });

    expect(agent.getMessages()).toHaveLength(0);

    // 5. Verify tool definitions are available for LLM
    // (We can't call agent.chat() without a real LLM, but we can verify the setup is correct)
    expect(tools).toHaveLength(13); // read, write, edit, exec, exec_status, exec_kill, web_search, reaction, web_fetch, memory_write, memory_search, memory_read, memory_delete
    expect(tools.map((t) => t.name)).toEqual([
      "read",
      "write",
      "edit",
      "exec",
      "exec_status",
      "exec_kill",
      "web_search",
      "reaction",
      "web_fetch",
      "memory_write",
      "memory_search",
      "memory_read",
      "memory_delete",
    ]);
  });

  test("memory round-trip through the memory_write tool", async () => {
    const config = new ConfigManager(testHome);
    await config.load();

    const memoryDir = join(testHome, "memory");
    const memory = new MemoryManager(memoryDir);
    await memory.init();

    const writeTool = createMemoryWriteTool(memory);

    // Save via tool
    const saveResult = await writeTool.execute({
      key: "test-fact",
      content: "The user prefers concise answers.",
    });
    expect(saveResult.isError).toBeUndefined();
    expect(saveResult.content).toContain("Saved");

    // Verify via memory manager
    const stored = await memory.get("test-fact");
    expect(stored).toBe("The user prefers concise answers.");

    // Search works
    const results = await memory.search("concise");
    expect(results).toHaveLength(1);
  });

  test("config persistence across manager instances", async () => {
    // First instance creates defaults
    const config1 = new ConfigManager(testHome);
    const saConfig1 = await config1.load();
    await config1.setConfig("activeModel", "custom-model");

    // Second instance loads persisted config
    const config2 = new ConfigManager(testHome);
    const saConfig2 = await config2.load();
    expect(saConfig2.runtime.activeModel).toBe("custom-model");
  });
});
