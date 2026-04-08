import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { KnownProvider } from "@mariozechner/pi-ai";
import { ConfigManager } from "./config/index.js";
import { OperationalStore } from "./operational-store.js";
import { PromptEngine } from "./prompt-engine.js";
import { ModelRouter } from "./router/index.js";
import { SkillRegistry } from "./skills/index.js";

let testDir: string;
let previousTerminalCwd: string | undefined;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "aria-prompt-engine-test-"));
  previousTerminalCwd = process.env.TERMINAL_CWD;
  process.env.TERMINAL_CWD = testDir;
  process.env.TEST_API_KEY = "test-api-key";

  await mkdir(join(testDir, "memory"), { recursive: true });
  await writeFile(
    join(testDir, "IDENTITY.md"),
    "# Esperta Aria\n\n## Personality\nPrecise.\n\n## System Prompt\nYou are Esperta Aria.\n",
  );
  await writeFile(
    join(testDir, "USER.md"),
    "Operator profile: prefers direct technical summaries.\n",
  );
  await writeFile(
    join(testDir, ".aria.md"),
    "# Workspace Notes\nUse the local prompt engine.\n",
  );
  await writeFile(
    join(testDir, "config.json"),
    JSON.stringify({
      version: 3,
      runtime: {
        activeModel: "test-model",
        memory: { enabled: true, directory: "memory" },
        contextFiles: { enabled: true, maxFileChars: 20_000, maxHintChars: 8_000 },
      },
      providers: [
        { id: "anthropic", type: "anthropic", apiKeyEnvVar: "TEST_API_KEY" },
      ],
      models: [
        { name: "test-model", provider: "anthropic", model: "claude-sonnet-4-5-20250514", temperature: 0.2, maxTokens: 1024 },
      ],
      defaultModel: "test-model",
    }),
  );
});

afterEach(async () => {
  if (previousTerminalCwd === undefined) {
    delete process.env.TERMINAL_CWD;
  } else {
    process.env.TERMINAL_CWD = previousTerminalCwd;
  }
  delete process.env.TEST_API_KEY;
  await rm(testDir, { recursive: true, force: true });
});

async function createPromptEngine() {
  const config = new ConfigManager(testDir);
  await config.load();

  const router = ModelRouter.fromConfig(
    {
      providers: [{ id: "anthropic", type: "anthropic" as KnownProvider, apiKeyEnvVar: "TEST_API_KEY" }],
      models: [{ name: "test-model", provider: "anthropic", model: "claude-sonnet-4-5-20250514", temperature: 0.2 }],
      defaultModel: "test-model",
    },
    null,
  );

  const store = new OperationalStore(testDir);
  await store.init();
  const skills = new SkillRegistry();
  await skills.loadAll(testDir);

  const tools = [
    {
      name: "read",
      description: "Read files.",
      summary: "Read files from disk.",
      dangerLevel: "safe" as const,
      parameters: Type.Object({}),
      execute: async () => ({ content: "ok" }),
    },
    {
      name: "exec",
      description: "Run shell commands.",
      summary: "Run shell commands locally.",
      dangerLevel: "dangerous" as const,
      parameters: Type.Object({}),
      execute: async () => ({ content: "ok" }),
    },
    {
      name: "ask_user",
      description: "Ask the user a question.",
      summary: "Ask the operator for clarification.",
      dangerLevel: "safe" as const,
      parameters: Type.Object({}),
      execute: async () => ({ content: "ok" }),
    },
  ];

  const promptEngine = new PromptEngine({
    config,
    router,
    memory: {
      loadLayeredContext: async () => "## Project Memory\n- migration: ship the runtime migration.",
    } as any,
    store,
    skills,
    tools,
  });

  return { config, router, store, promptEngine };
}

describe("PromptEngine", () => {
  test("builds and caches the base prompt with tool/runtime context", async () => {
    const { store, promptEngine } = await createPromptEngine();

    const prompt = await promptEngine.buildBasePrompt();
    expect(prompt).toContain("## Tool Runtime");
    expect(prompt).toContain("### files");
    expect(prompt).toContain("### terminal");
    expect(prompt).toContain("## Project Memory");
    expect(prompt).toContain("ship the runtime migration");
    expect(prompt).toContain("## User Profile");
    expect(prompt).toContain("Operator profile: prefers direct technical summaries.");
    expect(prompt).toContain("Workspace Notes");

    await promptEngine.buildBasePrompt();

    const db = new Database(join(testDir, "aria.sqlite"), { readonly: true });
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM prompt_cache")
      .get() as { count: number };
    db.close(false);

    expect(row.count).toBe(1);
    store.close();
  });

  test("builds session prompts with rolling summaries and recent transcript replay", async () => {
    const { store, promptEngine } = await createPromptEngine();

    store.upsertSession({
      id: "tui:prompt-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.syncSessionMessages("tui:prompt-session", Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: index < 8
        ? `older-message-${index}`
        : `recent-message-${index}`,
      timestamp: 100 + index,
    })) as any);

    const prompt = await promptEngine.buildSessionPrompt({
      sessionId: "tui:prompt-session",
      connectorType: "tui",
      trigger: "chat",
      overlay: "Run in durable session mode.",
    });

    expect(prompt).toContain("## Session State");
    expect(prompt).toContain("## Rolling Summary");
    expect(prompt).toContain("older-message-0");
    expect(prompt).toContain("## Recent Transcript");
    expect(prompt).toContain("recent-message-19");
    expect(prompt).toContain("Run in durable session mode.");

    expect(store.getSessionSummary("tui:prompt-session", "rolling")).toMatchObject({
      sessionId: "tui:prompt-session",
      summaryKind: "rolling",
      messageCount: 8,
    });

    store.close();
  });
});
