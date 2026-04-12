import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditLogger, queryAuditEntries, readAuditEntries } from "../packages/audit/src/index.js";
import { MAX_REDIRECTS, SecurityModeManager, ToolPolicyManager, buildToolCapabilityCatalog, classifyExecCommand, describeModeEffects, isPathInside, resolveCapabilityPolicyDecision, toRelativeIfInside, validateExecPaths, validateHeaders, validateUrl } from "../packages/policy/src/index.js";
import { buildContextFilesPrompt, parseContextReferences, preprocessContextReferences, PromptEngine } from "../packages/prompt/src/index.js";
import { ConnectorTypeSchema } from "../packages/protocol/src/index.js";
import { OperationalStore } from "../packages/store/src/index.js";
import { askUserTool, buildDynamicToolsets, createMemoryDeleteTool, createMemoryReadTool, createMemorySearchTool, createMemoryWriteTool, createNotifyTool, createSessionToolEnvironment, createSetEnvSecretTool, createSetEnvVariableTool, createWebFetchTool, editTool, formatToolsSection, getBuiltinTools, mergeAllowedTools, reactionTool, readTool, validateEnvVarName, webSearchTool, writeTool } from "../packages/tools/src/index.js";

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
  test("@aria/runtime composes moved package-owned services from target packages", async () => {
    const runtimeSource = await import("node:fs/promises").then(fs => fs.readFile(new URL("../packages/runtime/src/runtime.ts", import.meta.url), "utf-8"));
    expect(runtimeSource).toContain("../../tools/src/index.js");
    expect(runtimeSource).toContain("../../prompt/src/index.js");
    expect(runtimeSource).toContain("../../store/src/index.js");
    expect(runtimeSource).toContain("../../audit/src/index.js");
    expect(runtimeSource).toContain("../../memory/src/index.js");
    expect(runtimeSource).toContain("../../policy/src/index.js");
  });

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
    expect(validateUrl("https://example.com")).toEqual({ ok: true });
    expect(validateUrl("http://localhost:3000").ok).toBe(false);
    expect(validateHeaders({ Authorization: "nope", Accept: "application/json" })).toEqual({ Accept: "application/json" });
    expect(MAX_REDIRECTS).toBe(5);
    expect(classifyExecCommand("ls -la", "dangerous")).toBe("safe");
    expect(classifyExecCommand("rm -rf /tmp/foo", "safe")).toBe("dangerous");
    expect(validateExecPaths("cat /tmp/test.txt", undefined, { fence: ["/tmp"], alwaysDeny: [] })).toEqual({ ok: true });
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

  test("@aria/prompt exposes package-owned context file and reference helpers", async () => {
    const workingDir = await makeTempDir("aria-prompt-context-");
    await Bun.write(join(workingDir, "AGENTS.md"), "Follow this prompt context.");
    const prompt = await buildContextFilesPrompt(workingDir);
    expect(prompt).toContain("Follow this prompt context.");

    const refs = parseContextReferences("Please inspect @file:AGENTS.md and @staged");
    expect(refs.map((ref) => ref.kind)).toEqual(["file", "staged"]);

    const preprocessed = await preprocessContextReferences("Review @file:AGENTS.md", { cwd: workingDir, allowedRoot: workingDir });
    expect(preprocessed.blocked).toBe(false);
    expect(preprocessed.message).toContain("📄 @file:AGENTS.md");
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

  test("@aria/tools exposes package-owned read/write/edit builtins", async () => {
    const workingDir = await makeTempDir("aria-tools-builtins-");
    const filePath = join(workingDir, "note.txt");

    await expect(writeTool.execute({ file_path: filePath, content: "hello" } as any)).resolves.toMatchObject({ content: `File written: ${filePath}` });
    await expect(readTool.execute({ file_path: filePath } as any)).resolves.toMatchObject({ content: "hello" });
    await expect(editTool.execute({ file_path: filePath, old_string: "hello", new_string: "hi" } as any)).resolves.toMatchObject({ content: `File edited: ${filePath}` });
    await expect(readTool.execute({ file_path: filePath } as any)).resolves.toMatchObject({ content: "hi" });
  });

  test("@aria/tools exposes package-owned web search and fetch helpers", async () => {
    await expect(webSearchTool.execute({ query: "aria", backend: "auto" } as any)).resolves.toMatchObject({ isError: true });
    const webFetch = createWebFetchTool();
    await expect(webFetch.execute({ url: "http://127.0.0.1:1234" } as any)).resolves.toMatchObject({ isError: true });
    expect(webFetch.name).toBe("web_fetch");
  });

  test("@aria/tools exposes package-owned memory helpers", async () => {
    const dir = await makeTempDir("aria-tools-memory-");
    const memory = new (await import("../packages/runtime/src/memory/index.js")).MemoryManager(dir);
    await memory.init();
    const write = createMemoryWriteTool(memory);
    const search = createMemorySearchTool(memory);
    const read = createMemoryReadTool(memory);
    const del = createMemoryDeleteTool(memory);
    await expect(write.execute({ key: "pref", content: "likes concise output" } as any)).resolves.toMatchObject({ content: "Saved memory: pref" });
    await expect(search.execute({ query: "concise" } as any)).resolves.toMatchObject({ content: expect.stringContaining("likes concise output") });
    await expect(read.execute({ key: "pref" } as any)).resolves.toMatchObject({ content: "likes concise output" });
    await expect(del.execute({ key: "pref" } as any)).resolves.toMatchObject({ content: "Deleted memory: pref" });
  });

  test("@aria/tools exposes package-owned env-setting helpers", async () => {
    expect(validateEnvVarName("ARIA_LOG_LEVEL")).toBeNull();
    expect(validateEnvVarName("PATH")).not.toBeNull();
    const config = {
      loadSecrets: async () => ({ apiKeys: {} }),
      saveSecrets: async () => {},
      getConfigFile: () => ({ runtime: { env: {} } }),
      saveConfig: async () => {},
    } as any;
    await expect(createSetEnvSecretTool(config).execute({ name: "TEST_KEY", value: "secret" } as any)).resolves.toMatchObject({ isError: false });
    await expect(createSetEnvVariableTool(config).execute({ name: "ARIA_LOG_LEVEL", value: "debug" } as any)).resolves.toMatchObject({ isError: false });
  });

  test("@aria/tools exposes package-owned notify and ask-user helpers", async () => {
    const notifyTool = createNotifyTool({ apiKeys: {} } as any);
    await expect(notifyTool.execute({ message: "hello" } as any)).resolves.toMatchObject({ content: expect.stringContaining("No connectors configured") });
    expect(askUserTool.name).toBe("ask_user");
    await expect(askUserTool.execute({ question: "Continue?" } as any)).resolves.toMatchObject({ isError: true });
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

    expect(reactionTool.name).toBe("reaction");
    expect(reactionTool.execute({ emoji: "👍" } as any)).resolves.toMatchObject({ content: "__reaction__:👍" });

    const toolsSection = formatToolsSection([makeTool("read"), makeTool("exec", "dangerous")]);
    expect(toolsSection).toContain("- read [safe]: read tool");
    expect(toolsSection).toContain("- exec [dangerous]: exec tool");
  });
});
