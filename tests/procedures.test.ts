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

  const sessions = new SessionManager();
  const auth = new AuthManager(saHome);
  await auth.init();

  const mainSession = sessions.create("main", "engine");
  const skills = new SkillRegistry();
  const scheduler = new Scheduler();
  scheduler.register(createHeartbeatTask(saHome, null));

  return {
    config,
    router,
    memory: { init: async () => {}, loadContext: async () => "", persist: async () => {} } as any,
    tools: [],
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
    createAgent(_onToolApproval?: any, modelOverride?: string) {
      return new Agent({ router, tools: [], systemPrompt: "Test", modelOverride });
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
