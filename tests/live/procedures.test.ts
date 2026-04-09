import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "@aria/engine/procedures.js";
import { createContext } from "@aria/engine/context.js";
import { SessionManager } from "@aria/engine/sessions.js";
import { AuthManager } from "@aria/engine/auth.js";
import { ConfigManager } from "@aria/engine/config/index.js";
import { Agent } from "@aria/engine/agent/index.js";
import { SkillRegistry } from "@aria/engine/skills/index.js";
import { Scheduler, createHeartbeatTask } from "@aria/engine/scheduler.js";
import type { EngineRuntime } from "@aria/engine/runtime.js";
import type { EngineEvent } from "@aria/shared/types.js";
import { makeLiveRouter, describeLive } from "../helpers/live-model.js";
import { echoTool } from "../helpers/test-tools.js";
import { SessionArchiveManager } from "@aria/engine/session-archive.js";
import { AuditLogger } from "@aria/engine/audit.js";
import { SecurityModeManager } from "@aria/engine/security-mode.js";
import { CheckpointManager } from "@aria/engine/checkpoints.js";
import { MCPManager } from "@aria/engine/mcp.js";
import { OperationalStore } from "@aria/engine/operational-store.js";

let testDir: string;
let runtime: EngineRuntime;
let masterToken: string;

async function createLiveTestRuntime(runtimeHome: string): Promise<EngineRuntime> {
  await mkdir(join(runtimeHome, "memory"), { recursive: true });
  await writeFile(
    join(runtimeHome, "IDENTITY.md"),
    "# Test Agent\n\n## Personality\nTest\n\n## System Prompt\nYou are a test agent.\n",
  );
  await writeFile(
    join(runtimeHome, "config.json"),
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

  const config = new ConfigManager(runtimeHome);
  await config.load();

  const router = makeLiveRouter();
  const store = new OperationalStore(runtimeHome);
  await store.init();
  const sessions = new SessionManager(store);
  const auth = new AuthManager(runtimeHome);
  await auth.init();
  const archive = new SessionArchiveManager(runtimeHome);
  await archive.init();
  const checkpoints = new CheckpointManager(runtimeHome, { enabled: true, maxSnapshots: 10 });
  const mcp = new MCPManager(undefined, runtimeHome);
  await mcp.init();

  const mainSession = sessions.create("main", "engine");
  const skills = new SkillRegistry();
  const scheduler = new Scheduler();
  scheduler.register(createHeartbeatTask(runtimeHome, null));

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
    audit: new AuditLogger(runtimeHome),
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
    testDir = await mkdtemp(join(tmpdir(), "aria-live-procedures-test-"));
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
