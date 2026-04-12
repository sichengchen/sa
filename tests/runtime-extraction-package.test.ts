import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditLogger, queryAuditEntries, readAuditEntries } from "../packages/audit/src/index.js";
import { SecurityModeManager, ToolPolicyManager, buildToolCapabilityCatalog, describeModeEffects, isPathInside, resolveCapabilityPolicyDecision, toRelativeIfInside } from "../packages/policy/src/index.js";
import { PromptEngine } from "../packages/prompt/src/index.js";
import { ConnectorTypeSchema } from "../packages/protocol/src/index.js";
import { OperationalStore } from "../packages/store/src/index.js";
import { buildDynamicToolsets, createSessionToolEnvironment, formatToolsSection, getBuiltinTools, mergeAllowedTools } from "../packages/tools/src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeTool(name: string, dangerLevel: "safe" | "moderate" | "dangerous" = "safe", description = `${name} tool`) {
  return {
    name,
    description,
    dangerLevel,
    parameters: {},
    execute: async () => ({ content: "ok" }),
  } as any;
}

describe("phase-1 extraction package verification", () => {
  test("@aria/audit writes and queries entries through the package barrel", async () => {
    const logDir = await makeTempDir("aria-audit-package-");
    const logger = new AuditLogger(logDir);

    logger.log({
      session: "session-id-abcdefghijklmnopqrstuvwxyz-0123456789",
      connector: "tui",
      event: "tool_call",
      tool: "read",
      summary: "x".repeat(240),
    });

    const logPath = logger.getLogPath();
    const entries = readAuditEntries(logPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.session).toBe("session-id-abcdefghijklmnopqrstuvwxyz-0123456789".slice(0, 36));
    expect(entries[0]?.summary?.endsWith("...")).toBe(true);
    expect(queryAuditEntries(logPath, { tool: "read" })).toHaveLength(1);
  });

  test("@aria/policy exposes path-boundary and security-mode helpers", () => {
    const manager = new SecurityModeManager({ defaultMode: "default" });
    const switched = manager.setMode("session-1", "trusted");
    expect(switched.ok).toBe(true);
    expect(manager.getMode("session-1")).toBe("trusted");
    expect(describeModeEffects("trusted", 3600)).toContain("TRUSTED");
    expect(isPathInside("/tmp/project", "/tmp/project/src/file.ts")).toBe(true);
    expect(toRelativeIfInside("/tmp/project", "/tmp/project/src/file.ts")).toBe("src/file.ts");
  });

  test("@aria/policy preserves capability catalog and approval decisions", () => {
    const tools = [makeTool("read"), makeTool("exec", "dangerous"), makeTool("mcp_docs_search")];
    const mcp = {
      getServerForTool(toolName: string) {
        return toolName.startsWith("mcp_docs_") ? "docs" : undefined;
      },
      listServers() {
        return [{ name: "docs", trust: "trusted", sessionAvailability: "enabled" }];
      },
    } as any;

    const catalog = buildToolCapabilityCatalog(tools, mcp);
    expect(catalog.get("read")?.toolsetName).toBe("files");
    expect(catalog.get("mcp_docs_search")?.source).toBe("mcp");
    expect(catalog.get("mcp_docs_search")?.mcpTrust).toBe("trusted");

    const decision = resolveCapabilityPolicyDecision(catalog.get("exec"), "dangerous", "ask");
    expect(decision.policyDecision).toBe("require_operator_approval");
    expect(decision.approvalRequired).toBe(true);

    const manager = new ToolPolicyManager(
      {
        verbosity: { tui: "minimal" },
        overrides: { exec: { dangerLevel: "moderate", report: "always" } },
      } as any,
      new Map([["exec", "dangerous"]]),
    );
    expect(manager.getDangerLevel("exec")).toBe("moderate");
    expect(manager.shouldEmitToolStart("tui", { toolName: "exec", dangerLevel: "moderate" })).toBe(true);
    expect(manager.shouldEmitToolEnd("telegram", { toolName: "read", dangerLevel: "safe", isError: true })).toBe(true);
  });

  test("@aria/prompt builds and caches the base prompt via package exports", async () => {
    const cache = new Map<string, any>();
    let cacheWrites = 0;

    const engine = new PromptEngine({
      config: {
        getConfigFile: () => ({
          models: [{ name: "gpt-5.4", provider: "openai" }],
          runtime: { activeModel: "gpt-5.4", contextFiles: { enabled: false } },
        }),
        getIdentity: () => ({ systemPrompt: "You are Aria." }),
        loadUserProfile: async () => "Prefers concise verification notes.",
      } as any,
      router: {
        getActiveModelName: () => "gpt-5.4",
      } as any,
      memory: {
        loadLayeredContext: async () => "## Memory\nKnown context",
      } as any,
      store: {
        getPromptCache: (cacheKey: string) => cache.get(cacheKey),
        putPromptCache: (input: any) => {
          cacheWrites += 1;
          cache.set(input.cacheKey, { ...input, updatedAt: input.updatedAt ?? 0 });
        },
        getSessionMessages: () => [],
        getSessionSummary: () => undefined,
        upsertSessionSummary: () => {},
      } as any,
      skills: {
        size: 0,
        getMetadataList: () => [],
        getContent: async () => undefined,
      } as any,
      tools: [makeTool("read"), makeTool("exec", "dangerous")],
    });

    const prompt = await engine.buildBasePrompt();
    expect(prompt).toContain("You are Aria.");
    expect(prompt).toContain("## Tool Runtime");
    expect(prompt).toContain("## Runtime Heartbeat");
    expect(prompt).toContain("Model: gpt-5.4");
    expect(cacheWrites).toBe(1);

    await engine.buildBasePrompt();
    expect(cacheWrites).toBe(1);
  });

  test("@aria/prompt reuses rolling summaries across store-backed session prompts", async () => {
    const homeDir = await makeTempDir("aria-prompt-session-");
    const store = new OperationalStore(homeDir);
    await store.init();

    const sessionId = "session-summary";
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message-${index + 1}`,
      timestamp: index + 1,
    }));

    store.upsertSession({
      id: sessionId,
      connectorType: "tui",
      connectorId: "console",
      createdAt: 1,
      lastActiveAt: 20,
    });
    store.syncSessionMessages(sessionId, messages as any);

    const engine = new PromptEngine({
      config: {
        getConfigFile: () => ({
          models: [{ name: "gpt-5.4", provider: "openai" }],
          runtime: { activeModel: "gpt-5.4", contextFiles: { enabled: false } },
        }),
        getIdentity: () => ({ systemPrompt: "You are Aria." }),
        loadUserProfile: async () => undefined,
      } as any,
      router: {
        getActiveModelName: () => "gpt-5.4",
      } as any,
      memory: {
        loadLayeredContext: async () => "",
      } as any,
      store,
      skills: {
        size: 0,
        getMetadataList: () => [],
        getContent: async () => undefined,
      } as any,
      tools: [makeTool("read")],
    });

    const firstPrompt = await engine.buildSessionPrompt({
      sessionId,
      trigger: "chat",
      connectorType: "tui",
    });
    const cachedSummary = store.getSessionSummary(sessionId, "rolling");

    expect(firstPrompt).toContain("## Rolling Summary");
    expect(cachedSummary?.messageCount).toBe(8);
    expect(cachedSummary?.summaryText).toContain("message-1");
    expect(firstPrompt).toContain("message-20");

    const secondPrompt = await engine.buildSessionPrompt({
      sessionId,
      trigger: "chat",
      connectorType: "tui",
    });
    expect(secondPrompt).toContain(cachedSummary?.summaryText ?? "");

    store.close();
  });

  test("@aria/protocol keeps connector schema validation stable", () => {
    expect(ConnectorTypeSchema.options).toContain("slack");
    expect(ConnectorTypeSchema.parse("github")).toBe("github");
    expect(() => ConnectorTypeSchema.parse("not-a-connector")).toThrow();
  });

  test("@aria/store preserves operational store session and prompt cache behavior", async () => {
    const homeDir = await makeTempDir("aria-store-package-");
    const store = new OperationalStore(homeDir);
    await store.init();

    store.upsertSession({
      id: "session-1",
      connectorType: "tui",
      connectorId: "console",
      createdAt: 1,
      lastActiveAt: 2,
    });
    expect(store.getSession("session-1")).toEqual({
      id: "session-1",
      connectorType: "tui",
      connectorId: "console",
      createdAt: 1,
      lastActiveAt: 2,
    });

    store.putPromptCache({
      cacheKey: "base-cache",
      scope: "base_prompt",
      content: "cached prompt",
      metadata: { phase: 1 },
    });
    expect(store.getPromptCache("base-cache")?.metadata).toEqual({ phase: 1 });

    store.close();
  });

  test("@aria/tools exposes a package-owned session tool environment", async () => {
    const workingDir = await makeTempDir("aria-tools-session-env-");
    const environment = createSessionToolEnvironment({
      baseTools: [makeTool("read")],
      workingDir,
    });

    environment.newTurn();

    expect(environment.workingDir).toBe(workingDir);
    expect(environment.tools).toHaveLength(1);
    const result = await environment.tools[0]?.execute({});
    expect(result?.content).toContain("ok");
  });

  test("@aria/tools exposes builtin and dynamic toolset helpers", () => {
    const builtinToolNames = getBuiltinTools().map((tool) => tool.name);
    expect(builtinToolNames.includes("read")).toBe(true);
    expect(builtinToolNames.includes("exec")).toBe(true);

    const availableTools = [
      makeTool("read"),
      makeTool("mcp_docs_fetch"),
      makeTool("mcp_docs_search"),
      makeTool("mcp_git_status"),
    ];

    const dynamicToolsets = buildDynamicToolsets(availableTools as any)
      .map((toolset) => toolset.name)
      .sort();
    expect(dynamicToolsets).toEqual(["mcp:docs", "mcp:git"]);

    const merged = mergeAllowedTools(availableTools as any, ["read", "missing"], ["MCP:Docs"]);
    expect((merged ?? []).sort()).toEqual(["mcp_docs_fetch", "mcp_docs_search", "read"]);

    const toolsSection = formatToolsSection([makeTool("read"), makeTool("exec", "dangerous")]);
    expect(toolsSection).toContain("- read [safe]: read tool");
    expect(toolsSection).toContain("- exec [dangerous]: exec tool");
  });
});
