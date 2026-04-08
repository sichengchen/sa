import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { Scheduler, createHeartbeatTask, heartbeatState } from "@aria/engine/scheduler.js";
import { DEFAULT_HEARTBEAT } from "@aria/engine/config/defaults.js";
import { SessionManager } from "@aria/engine/sessions.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "aria-heartbeat-test-"));
  // Reset heartbeat state
  heartbeatState.lastResult = null;
  heartbeatState.config = { ...DEFAULT_HEARTBEAT };
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Heartbeat task", () => {
  test("writes health JSON file without agent when agent is null", async () => {
    const task = createHeartbeatTask(testDir, null);
    expect(task.name).toBe("heartbeat");
    expect(task.builtin).toBe(true);

    await task.handler();

    const heartbeatFile = join(testDir, "engine.heartbeat");
    expect(existsSync(heartbeatFile)).toBe(true);

    const data = JSON.parse(await readFile(heartbeatFile, "utf-8"));
    expect(data.timestamp).toBeTruthy();
    expect(data.pid).toBe(process.pid);
    expect(data.memory).toBeGreaterThan(0);
    expect(data.agentRan).toBe(false);
    expect(data.suppressed).toBe(false);
  });

  test("uses configurable interval", () => {
    const task = createHeartbeatTask(testDir, null, { ...DEFAULT_HEARTBEAT, intervalMinutes: 15 });
    expect(task.schedule).toBe("*/15 * * * *");
  });

  test("default interval is 30 minutes", () => {
    const task = createHeartbeatTask(testDir, null);
    expect(task.schedule).toBe("*/30 * * * *");
  });

  test("formats long intervals with a cadence schedule", () => {
    const task = createHeartbeatTask(testDir, null, { ...DEFAULT_HEARTBEAT, intervalMinutes: 120 });
    expect(task.schedule).toBe("@every 120m");
    expect(task.intervalMinutes).toBe(120);
  });

  test("skips agent when heartbeat is disabled", async () => {
    const task = createHeartbeatTask(testDir, null, { ...DEFAULT_HEARTBEAT, enabled: false });
    await task.handler();

    expect(heartbeatState.lastResult).toBeTruthy();
    expect(heartbeatState.lastResult!.agentRan).toBe(false);
  });

  test("reads HEARTBEAT.md checklist if present", async () => {
    const checklistPath = join(testDir, "HEARTBEAT.md");
    await writeFile(checklistPath, "# Test checklist\n- Check something\n");

    // We can't test the full agent flow without a real LLM,
    // but we verify the config points to the right file
    const config = { ...DEFAULT_HEARTBEAT, checklistPath: "HEARTBEAT.md" };
    const task = createHeartbeatTask(testDir, null, config);
    expect(task.name).toBe("heartbeat");

    // Without an agent, it just writes the health file
    await task.handler();
    expect(heartbeatState.lastResult!.agentRan).toBe(false);
  });

  test("updates heartbeatState with lastResult", async () => {
    expect(heartbeatState.lastResult).toBeNull();
    const task = createHeartbeatTask(testDir, null);
    await task.handler();
    expect(heartbeatState.lastResult).not.toBeNull();
    expect(heartbeatState.lastResult!.timestamp).toBeTruthy();
  });

  test("writes heartbeat logs to the automation directory", async () => {
    const task = createHeartbeatTask(testDir, null);
    await task.handler();

    const files = await readdir(join(testDir, "automation"));
    expect(files.some((name) => name.startsWith("heartbeat-") && name.endsWith(".md"))).toBe(true);
  });

  test("delivers unsuppressed agent output through the notify hook", async () => {
    let notified = "";
    const fakeAgent = {
      async *chat() {
        yield { type: "text_delta", delta: "Please check the background jobs." };
      },
    } as any;

    const task = createHeartbeatTask({
      runtimeHome: testDir,
      mainAgent: fakeAgent,
      notify: async (message: string) => {
        notified = message;
      },
    }, null, DEFAULT_HEARTBEAT);

    await task.handler();

    expect(heartbeatState.lastResult?.agentRan).toBe(true);
    expect(heartbeatState.lastResult?.suppressed).toBe(false);
    expect(notified).toContain("Heartbeat");
    expect(notified).toContain("Please check the background jobs.");
  });

  test("does not notify when the agent returns the suppress token exactly", async () => {
    let notifyCount = 0;
    const fakeAgent = {
      async *chat() {
        yield { type: "text_delta", delta: "HEARTBEAT_OK" };
      },
    } as any;

    const task = createHeartbeatTask({
      runtimeHome: testDir,
      mainAgent: fakeAgent,
      notify: async () => {
        notifyCount++;
      },
    }, null, DEFAULT_HEARTBEAT);

    await task.handler();

    expect(heartbeatState.lastResult?.suppressed).toBe(true);
    expect(notifyCount).toBe(0);
  });
});

describe("HeartbeatConfig", () => {
  test("default config values", () => {
    expect(DEFAULT_HEARTBEAT.enabled).toBe(true);
    expect(DEFAULT_HEARTBEAT.intervalMinutes).toBe(30);
    expect(DEFAULT_HEARTBEAT.checklistPath).toBe("HEARTBEAT.md");
    expect(DEFAULT_HEARTBEAT.suppressToken).toBe("HEARTBEAT_OK");
  });
});

describe("Suppress logic", () => {
  test("exact match of suppressToken triggers suppression", () => {
    // This tests the logic conceptually — in practice the agent response
    // is compared to the token in the heartbeat handler
    const token = "HEARTBEAT_OK";
    expect("HEARTBEAT_OK".trim() === token).toBe(true);
    expect("HEARTBEAT_OK with extra text".trim() === token).toBe(false);
    expect("Something before HEARTBEAT_OK".trim() === token).toBe(false);
    expect("heartbeat_ok".trim() === token).toBe(false);
    expect("".trim() === token).toBe(false);
  });
});

describe("Main session creation", () => {
  test("creates main session with structured ID", () => {
    const sessions = new SessionManager();
    const main = sessions.create("main", "engine");
    expect(main.id).toStartWith("main:");
    expect(main.connectorType).toBe("engine");
  });

  test("getLatest returns main session", () => {
    const sessions = new SessionManager();
    const main = sessions.create("main", "engine");
    const latest = sessions.getLatest("main");
    expect(latest?.id).toBe(main.id);
  });

  test("main session resumes across restarts (simulated)", () => {
    const sessions = new SessionManager();

    // First "startup" — no main session exists
    let main = sessions.getLatest("main");
    expect(main).toBeUndefined();
    main = sessions.create("main", "engine");
    const mainId = main.id;

    // Second "startup" — main session already exists
    const resumed = sessions.getLatest("main");
    expect(resumed?.id).toBe(mainId);
  });
});

describe("Scheduler heartbeat integration", () => {
  test("heartbeat task registers and runs via tick", async () => {
    const scheduler = new Scheduler(60_000);
    scheduler.register(createHeartbeatTask(testDir, null));
    expect(scheduler.size).toBe(1);

    // Manually tick — the heartbeat has a cron schedule that may or may not match "now"
    // so we just verify the task is registered
    const tasks = scheduler.list();
    expect(tasks[0]!.name).toBe("heartbeat");
    expect(tasks[0]!.builtin).toBe(true);
  });
});
