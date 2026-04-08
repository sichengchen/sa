import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRouter } from "@sa/engine/procedures.js";
import { createContext } from "@sa/engine/context.js";
import { SessionManager } from "@sa/engine/sessions.js";
import { AuthManager } from "@sa/engine/auth.js";
import { ConfigManager } from "@sa/engine/config/index.js";
import { ModelRouter } from "@sa/engine/router/index.js";
import { Agent } from "@sa/engine/agent/index.js";
import { SkillRegistry } from "@sa/engine/skills/index.js";
import { Scheduler, createHeartbeatTask } from "@sa/engine/scheduler.js";
import { AuditLogger } from "@sa/engine/audit.js";
import { SecurityModeManager } from "@sa/engine/security-mode.js";
import type { EngineRuntime } from "@sa/engine/runtime.js";
import type { KnownProvider } from "@mariozechner/pi-ai";
import { SessionArchiveManager } from "@sa/engine/session-archive.js";
import { CheckpointManager } from "@sa/engine/checkpoints.js";
import { MCPManager } from "@sa/engine/mcp.js";
import { OperationalStore } from "@sa/engine/operational-store.js";

let testDir: string;
let runtime: EngineRuntime;
let masterToken: string;

/** Create a minimal EngineRuntime for testing (no LLM needed) */
async function createTestRuntime(saHome: string): Promise<EngineRuntime> {
  // Write minimal config files
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
        activeModel: "test-model",
        telegramBotTokenEnvVar: "TEST_BOT_TOKEN",
        memory: { enabled: true, directory: "memory" },
      },
      providers: [
        { id: "anthropic", type: "anthropic", apiKeyEnvVar: "TEST_API_KEY" },
      ],
      models: [
        { name: "test-model", provider: "anthropic", model: "claude-sonnet-4-5-20250514", temperature: 0.7, maxTokens: 1024 },
      ],
      defaultModel: "test-model",
    }),
  );

  process.env.TEST_API_KEY = "test-key-for-router-init";

  const config = new ConfigManager(saHome);
  await config.load();

  const router = ModelRouter.fromConfig(
    {
      providers: [{ id: "anthropic", type: "anthropic" as KnownProvider, apiKeyEnvVar: "TEST_API_KEY" }],
      models: [{ name: "test-model", provider: "anthropic", model: "claude-sonnet-4-5-20250514", temperature: 0.7 }],
      defaultModel: "test-model",
    },
    null,
  );

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

  return {
    config,
    router,
    memory: { init: async () => {}, loadContext: async () => "", persist: async () => {} } as any,
    store,
    archive,
    checkpoints,
    mcp,
    tools: [],
    promptEngine: {
      buildBasePrompt: async () => "Test agent.",
      buildSessionPrompt: async () => "Test agent.",
    } as any,
    systemPrompt: "Test agent.",
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
      return "Test agent.";
    },
    async close() {
      scheduler.stop();
      store.close();
      archive.close();
      await auth.cleanup();
    },
    createAgent(_onToolApproval?: any, modelOverride?: string) {
      return new Agent({ router, tools: [], getSystemPrompt: () => "Test", modelOverride });
    },
  };
}

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "sa-procedures-test-"));
  runtime = await createTestRuntime(testDir);
  masterToken = runtime.auth.getMasterToken();
});

afterEach(async () => {
  delete process.env.TEST_API_KEY;
  await rm(testDir, { recursive: true, force: true });
});

/** Create an authenticated tRPC caller */
function createCaller() {
  const appRouter = createAppRouter(runtime);
  return appRouter.createCaller(createContext({ rawToken: masterToken }));
}

function createSessionCaller(connectorId = "telegram:123", connectorType = "telegram") {
  const paired = runtime.auth.pair(masterToken, connectorId, connectorType);
  if (!paired.success || !paired.token) {
    throw new Error("Failed to create a session token for tests");
  }
  const appRouter = createAppRouter(runtime);
  return appRouter.createCaller(createContext({ rawToken: paired.token }));
}

describe("tRPC procedures (non-live)", () => {
  describe("health.ping", () => {
    test("returns status ok", async () => {
      const appRouter = createAppRouter(runtime);
      // health.ping is public — no auth needed
      const caller = appRouter.createCaller(createContext());
      const result = await caller.health.ping();
      expect(result.status).toBe("ok");
      expect(result.agentName).toBe("Test");
    });
  });

  describe("session.create", () => {
    test("creates a session with structured ID", async () => {
      const caller = createCaller();
      const { session } = await caller.session.create({
        connectorType: "tui",
        prefix: "tui",
      });
      expect(session.id).toStartWith("tui:");
      expect(session.connectorType).toBe("tui");
    });
  });

  describe("session.list", () => {
    test("lists all sessions including main", async () => {
      const caller = createCaller();
      const sessions = await caller.session.list();
      // At least the main session exists
      expect(sessions.length).toBeGreaterThanOrEqual(1);
    });

    test("includes newly created sessions", async () => {
      const caller = createCaller();
      await caller.session.create({ connectorType: "tui", prefix: "tui" });
      await caller.session.create({ connectorType: "telegram", prefix: "telegram:123" });
      const sessions = await caller.session.list();
      // main + 2 new ones
      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("session token authorization", () => {
    test("session tokens can only create sessions for their own connector scope", async () => {
      const caller = createSessionCaller("telegram:123", "telegram");

      const created = await caller.session.create({
        connectorType: "telegram",
        prefix: "telegram:123",
      });
      expect(created.session.id).toStartWith("telegram:123:");

      await expect(caller.session.create({
        connectorType: "telegram",
        prefix: "telegram:999",
      })).rejects.toThrow("own connector prefix");

      await expect(caller.session.create({
        connectorType: "tui",
        prefix: "telegram:123",
      })).rejects.toThrow("Connector type mismatch");
    });

    test("session tokens cannot access sessions owned by another connector", async () => {
      const masterCaller = createCaller();
      const ownCaller = createSessionCaller("telegram:123", "telegram");

      const owned = await ownCaller.session.create({
        connectorType: "telegram",
        prefix: "telegram:123",
      });
      const other = await masterCaller.session.create({
        connectorType: "telegram",
        prefix: "telegram:999",
      });

      const visibleSessions = await ownCaller.session.list();
      expect(visibleSessions.some((session) => session.id === owned.session.id)).toBe(true);
      expect(visibleSessions.some((session) => session.id === other.session.id)).toBe(false);

      await expect(ownCaller.chat.history({ sessionId: other.session.id })).rejects.toThrow("do not own this session");
    });

    test("session tokens cannot call admin-only procedures", async () => {
      const caller = createSessionCaller("telegram:123", "telegram");

      await expect(caller.cron.list()).rejects.toThrow("requires the master token");
      await expect(caller.engine.shutdown()).rejects.toThrow("requires the master token");
    });
  });

  describe("session.search / chat.history archive fallback", () => {
    test("searches persisted session transcripts and reads archived history after destroy", async () => {
      const caller = createCaller();
      const { session } = await caller.session.create({ connectorType: "tui", prefix: "tui" });

      await runtime.archive.syncSession(session, [
        { role: "user", content: "Debug the failing cron task", timestamp: 100 } as any,
        { role: "assistant", content: "The cron task is failing because CONFIG_PATH is missing.", timestamp: 101 } as any,
      ]);

      const results = await caller.session.search({ query: "cron task", limit: 5 });
      expect(results.some((entry) => entry.sessionId === session.id)).toBe(true);

      const destroyed = await caller.session.destroy({ sessionId: session.id });
      expect(destroyed.destroyed).toBe(true);

      const history = await caller.chat.history({ sessionId: session.id });
      expect(history.archived).toBe(true);
      expect(history.messages).toHaveLength(2);
      expect((history.messages[0] as any).content).toContain("Debug the failing cron task");
    });

    test("reads durable live history when no in-memory agent is attached", async () => {
      const caller = createCaller();
      const { session } = await caller.session.create({ connectorType: "tui", prefix: "tui" });

      runtime.store.syncSessionMessages(session.id, [
        { role: "user", content: "Persist this", timestamp: 100 } as any,
        { role: "assistant", content: "Stored in the live runtime.", timestamp: 101 } as any,
      ]);

      const history = await caller.chat.history({ sessionId: session.id });
      expect(history.archived).toBe(false);
      expect(history.messages).toHaveLength(2);
      expect((history.messages[1] as any).content).toContain("Stored in the live runtime.");
    });
  });

  describe("session.destroy", () => {
    test("destroys a session", async () => {
      const caller = createCaller();
      const { session } = await caller.session.create({ connectorType: "tui", prefix: "tui" });
      const result = await caller.session.destroy({ sessionId: session.id });
      expect(result.destroyed).toBe(true);

      // Verify it's gone from the list
      const sessions = await caller.session.list();
      expect(sessions.find((s) => s.id === session.id)).toBeUndefined();
    });

    test("returns false for non-existent session", async () => {
      const caller = createCaller();
      const result = await caller.session.destroy({ sessionId: "nonexistent" });
      expect(result.destroyed).toBe(false);
    });
  });

  describe("checkpoint procedures", () => {
    test("lists checkpoints for a working directory", async () => {
      const currentRuntime = runtime;
      const currentHome = currentRuntime.config.homeDir;
      const caller = createAppRouter(currentRuntime).createCaller(createContext({ rawToken: masterToken }));
      const workdir = join(currentHome, "workspace");
      await mkdir(workdir, { recursive: true });

      const listed = await caller.checkpoint.list({ workingDir: workdir });
      expect(listed.workingDir).toBe(workdir);
      expect(Array.isArray(listed.checkpoints)).toBe(true);
    });
  });

  describe("toolset / mcp procedures", () => {
    test("lists builtin toolsets and empty MCP state in the minimal runtime", async () => {
      const caller = createCaller();

      const toolsets = await caller.toolset.list();
      expect(toolsets.some((toolset) => toolset.name === "files")).toBe(true);
      expect(toolsets.some((toolset) => toolset.name === "delegation")).toBe(true);

      const servers = await caller.mcp.listServers();
      expect(servers).toEqual([]);

      const tools = await caller.mcp.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe("cron.list", () => {
    test("returns at least the heartbeat task", async () => {
      const caller = createCaller();
      const tasks = await caller.cron.list();
      expect(tasks.length).toBeGreaterThanOrEqual(1);
      const heartbeat = tasks.find((t) => t.name === "heartbeat");
      expect(heartbeat).toBeDefined();
      expect(heartbeat!.builtin).toBe(true);
    });
  });

  describe("cron.add / cron.remove", () => {
    test("adds and removes a user task", async () => {
      const caller = createCaller();
      const result = await caller.cron.add({
        name: "test-task",
        schedule: "0 9 * * *",
        prompt: "Good morning",
      });
      expect(result.added).toBe(true);

      const tasks = await caller.cron.list();
      expect(tasks.find((t) => t.name === "test-task")).toBeDefined();

      const removed = await caller.cron.remove({ name: "test-task" });
      expect(removed.removed).toBe(true);

      const afterRemove = await caller.cron.list();
      expect(afterRemove.find((t) => t.name === "test-task")).toBeUndefined();
    });

    test("cannot remove builtin tasks", async () => {
      const caller = createCaller();
      const result = await caller.cron.remove({ name: "heartbeat" });
      expect(result.removed).toBe(false);
    });
  });

  describe("model.list", () => {
    test("returns configured models", async () => {
      const caller = createCaller();
      const models = await caller.model.list();
      expect(models.length).toBeGreaterThanOrEqual(1);
      expect(models[0]!.name).toBe("test-model");
    });
  });

  describe("model.active", () => {
    test("returns the active model name", async () => {
      const caller = createCaller();
      const result = await caller.model.active();
      expect(result.name).toBe("test-model");
    });
  });

  describe("heartbeat.status", () => {
    test("returns heartbeat status with main session ID", async () => {
      const caller = createCaller();
      const status = await caller.heartbeat.status();
      expect(status.mainSessionId).toStartWith("main:");
      expect(status.config.enabled).toBe(true);
    });

    test("configure updates long heartbeat intervals via the scheduler cadence path", async () => {
      const caller = createCaller();
      const result = await caller.heartbeat.configure({ intervalMinutes: 120 });

      expect(result.config.intervalMinutes).toBe(120);

      const tasks = runtime.scheduler.list();
      const heartbeat = tasks.find((task) => task.name === "heartbeat");
      expect(heartbeat?.schedule).toBe("@every 120m");
    });
  });

  describe("mainSession.info", () => {
    test("returns main session metadata", async () => {
      const caller = createCaller();
      const info = await caller.mainSession.info();
      expect(info.sessionId).toStartWith("main:");
      expect(info.session).toBeDefined();
      expect(info.session!.connectorType).toBe("engine");
    });
  });
});
