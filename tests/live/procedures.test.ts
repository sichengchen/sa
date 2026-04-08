import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "@sa/engine/procedures.js";
import { createContext } from "@sa/engine/context.js";
import { SessionManager } from "@sa/engine/sessions.js";
import { AuthManager } from "@sa/engine/auth.js";
import { ConfigManager } from "@sa/engine/config/index.js";
import { Agent } from "@sa/engine/agent/index.js";
import { SkillRegistry } from "@sa/engine/skills/index.js";
import { Scheduler, createHeartbeatTask } from "@sa/engine/scheduler.js";
import type { EngineRuntime } from "@sa/engine/runtime.js";
import type { EngineEvent } from "@sa/shared/types.js";
import { makeLiveRouter, describeLive } from "../helpers/live-model.js";
import { echoTool } from "../helpers/test-tools.js";
import { SessionArchiveManager } from "@sa/engine/session-archive.js";
import { AuditLogger } from "@sa/engine/audit.js";
import { SecurityModeManager } from "@sa/engine/security-mode.js";
import { CheckpointManager } from "@sa/engine/checkpoints.js";
import { MCPManager } from "@sa/engine/mcp.js";
import { OperationalStore } from "@sa/engine/operational-store.js";

let testDir: string;
let runtime: EngineRuntime;
let masterToken: string;

async function createLiveTestRuntime(saHome: string): Promise<EngineRuntime> {
  await mkdir(join(saHome, "memory"), { recursive: true });
  await writeFile(
    join(saHome, "IDENTITY.md"),
    "# Test Agent\n\n## Personality\nTest\n\n## System Prompt\nYou are a test agent.\n",
  );
  await writeFile(
    join(saHome, "config.json"),
    JSON.stringify({
      version: 3,
      runtime: {
        activeModel: "haiku",
        telegramBotTokenEnvVar: "TEST_BOT_TOKEN",
        memory: { enabled: true, directory: "memory" },
      },
      providers: [
        { id: "anthropic", type: "anthropic", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
      ],
      models: [
        { name: "haiku", provider: "anthropic", model: "claude-3-5-haiku-20241022", temperature: 0, maxTokens: 128 },
      ],
      defaultModel: "haiku",
    }),
  );

  const config = new ConfigManager(saHome);
  await config.load();

  const router = makeLiveRouter();
  const store = new OperationalStore(saHome);
  await store.init();
  const sessions = new SessionManager(store);
  const auth = new AuthManager(saHome);
  await auth.init();
  const archive = new SessionArchiveManager(saHome);
  await archive.init();
  const checkpoints = new CheckpointManager(saHome, { enabled: true, maxSnapshots: 10 });
  const mcp = new MCPManager(undefined, saHome);
  await mcp.init();

  const mainSession = sessions.create("main", "engine");
  const skills = new SkillRegistry();
  const scheduler = new Scheduler();
  scheduler.register(createHeartbeatTask(saHome, null));

  const tools = [echoTool];

  return {
    config,
    router,
    memory: { init: async () => {}, loadContext: async () => "", persist: async () => {} } as any,
    store,
    archive,
    checkpoints,
    mcp,
    tools,
    promptEngine: {
      buildBasePrompt: async () => "Reply briefly. When asked to use a tool, use it without explanation.",
      buildSessionPrompt: async () => "Reply briefly. When asked to use a tool, use it without explanation.",
    } as any,
    systemPrompt: "Reply briefly. When asked to use a tool, use it without explanation.",
    sessions,
    auth,
    skills,
    scheduler,
    transcriber: { transcribe: async () => "", backend: null } as any,
    audit: new AuditLogger(saHome),
    securityMode: new SecurityModeManager(),
    agentName: "Test",
    mainSessionId: mainSession.id,
    async refreshSystemPrompt() {
      return "Reply briefly. When asked to use a tool, use it without explanation.";
    },
    async close() {
      scheduler.stop();
      store.close();
      archive.close();
      await auth.cleanup();
    },
    createAgent(onToolApproval, modelOverride?: string) {
      return new Agent({
        router,
        tools,
        getSystemPrompt: () => "Reply briefly. Use tools when asked.",
        onToolApproval,
        modelOverride,
      });
    },
  };
}

describeLive("tRPC procedures — live LLM tests", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "sa-live-procedures-test-"));
    runtime = await createLiveTestRuntime(testDir);
    masterToken = runtime.auth.getMasterToken();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  function createCaller() {
    const appRouter = createAppRouter(runtime);
    return appRouter.createCaller(createContext({ rawToken: masterToken }));
  }

  test("chat.stream returns text_delta and done events", async () => {
    const caller = createCaller();
    const session = await caller.session.create({ connectorType: "tui", prefix: "tui" });

    const events: EngineEvent[] = [];
    const gen = await caller.chat.stream({ sessionId: session.id, message: "Say hello" });
    for await (const event of gen) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    expect(types).toContain("text_delta");
    expect(types.at(-1)).toBe("done");
    expect(types).not.toContain("error");
  }, 15_000);

  test("chat.stream with tool use emits tool events for TUI", async () => {
    const caller = createCaller();
    const session = await caller.session.create({ connectorType: "tui", prefix: "tui" });

    const events: EngineEvent[] = [];
    const gen = await caller.chat.stream({
      sessionId: session.id,
      message: 'Use the echo tool with message "hello from tRPC"',
    });
    for await (const event of gen) {
      events.push(event);
    }

    const types = events.map((e) => e.type);
    // TUI connector should get tool_start events (not IM-filtered)
    expect(types).toContain("tool_start");
    expect(types).toContain("tool_end");
    expect(types.at(-1)).toBe("done");
  }, 30_000);
});
