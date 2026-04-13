import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ToolImpl } from "./agent/types.js";
import { MCPManager } from "@aria/server/mcp";
import { OperationalStore } from "./operational-store.js";

let testDir: string;
let store: OperationalStore;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "aria-mcp-test-"));
  store = new OperationalStore(testDir);
  await store.init();
  store.upsertSession({
    id: "tui:mcp-session",
    connectorType: "tui",
    connectorId: "tui",
    createdAt: 100,
    lastActiveAt: 200,
  });
});

afterEach(async () => {
  store.close();
  await rm(testDir, { recursive: true, force: true });
});

function createStubTool(name: string): ToolImpl {
  return {
    name,
    description: `${name} tool`,
    dangerLevel: "moderate",
    parameters: Type.Object({}),
    execute: async () => ({ content: "ok" }),
  };
}

describe("MCPManager session availability", () => {
  test("requires explicit opt-in for session_opt_in servers", () => {
    const manager = new MCPManager(undefined, testDir, store);
    (manager as any).statuses.set("docs", {
      name: "docs",
      enabled: true,
      connected: true,
      transport: "stdio",
      trust: "prompt",
      sessionAvailability: "session_opt_in",
      defaultSessionEnabled: false,
      toolCount: 1,
      promptCount: 0,
      resourceCount: 0,
    });
    (manager as any).toolToServer.set("mcp_docs_search", "docs");

    const filteredBefore = manager.filterToolsForSession(
      [createStubTool("read"), createStubTool("mcp_docs_search")],
      "tui:mcp-session",
    );
    expect(filteredBefore.map((tool) => tool.name)).toEqual(["read"]);

    manager.setSessionServerEnabled("tui:mcp-session", "docs", true);
    expect(manager.isServerEnabledForSession("docs", "tui:mcp-session")).toBe(true);

    const filteredAfter = manager.filterToolsForSession(
      [createStubTool("read"), createStubTool("mcp_docs_search")],
      "tui:mcp-session",
    );
    expect(filteredAfter.map((tool) => tool.name)).toEqual(["read", "mcp_docs_search"]);
  });

  test("allows default-all servers unless explicitly disabled", () => {
    const manager = new MCPManager(undefined, testDir, store);
    (manager as any).statuses.set("filesystem", {
      name: "filesystem",
      enabled: true,
      connected: true,
      transport: "stdio",
      trust: "trusted",
      sessionAvailability: "all",
      defaultSessionEnabled: true,
      toolCount: 1,
      promptCount: 0,
      resourceCount: 0,
    });
    (manager as any).toolToServer.set("mcp_filesystem_read", "filesystem");

    expect(manager.isServerEnabledForSession("filesystem", "tui:mcp-session")).toBe(true);
    manager.setSessionServerEnabled("tui:mcp-session", "filesystem", false);
    expect(manager.isServerEnabledForSession("filesystem", "tui:mcp-session")).toBe(false);
  });
});
