import { describe, test, expect, beforeEach } from "bun:test";
import { Scheduler, matchesCron, createHeartbeatTask } from "@sa/engine/scheduler.js";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

describe("matchesCron", () => {
  test("matches wildcard expression", () => {
    const date = new Date(2026, 1, 19, 10, 30); // Feb 19, 2026, 10:30
    expect(matchesCron("* * * * *", date)).toBe(true);
  });

  test("matches exact minute and hour", () => {
    const date = new Date(2026, 1, 19, 8, 0); // 08:00
    expect(matchesCron("0 8 * * *", date)).toBe(true);
    expect(matchesCron("0 9 * * *", date)).toBe(false);
    expect(matchesCron("30 8 * * *", date)).toBe(false);
  });

  test("matches step syntax */5", () => {
    const date0 = new Date(2026, 1, 19, 10, 0); // :00
    const date5 = new Date(2026, 1, 19, 10, 5); // :05
    const date3 = new Date(2026, 1, 19, 10, 3); // :03

    expect(matchesCron("*/5 * * * *", date0)).toBe(true);
    expect(matchesCron("*/5 * * * *", date5)).toBe(true);
    expect(matchesCron("*/5 * * * *", date3)).toBe(false);
  });

  test("matches day of week", () => {
    // Feb 19, 2026 is a Thursday (day 4)
    const date = new Date(2026, 1, 19, 10, 0);
    expect(matchesCron("0 10 * * 4", date)).toBe(true);
    expect(matchesCron("0 10 * * 1", date)).toBe(false);
  });

  test("matches comma-separated values", () => {
    const date15 = new Date(2026, 1, 19, 10, 15);
    const date30 = new Date(2026, 1, 19, 10, 30);
    const date20 = new Date(2026, 1, 19, 10, 20);

    expect(matchesCron("15,30 * * * *", date15)).toBe(true);
    expect(matchesCron("15,30 * * * *", date30)).toBe(true);
    expect(matchesCron("15,30 * * * *", date20)).toBe(false);
  });

  test("matches specific month", () => {
    const feb = new Date(2026, 1, 19, 10, 0); // month=1 → February
    expect(matchesCron("0 10 * 2 *", feb)).toBe(true);
    expect(matchesCron("0 10 * 3 *", feb)).toBe(false);
  });

  test("rejects invalid expression", () => {
    const date = new Date();
    expect(matchesCron("bad", date)).toBe(false);
    expect(matchesCron("* * *", date)).toBe(false);
  });
});

describe("Scheduler", () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  test("registers and lists tasks", () => {
    scheduler.register({
      name: "test-task",
      schedule: "* * * * *",
      handler: () => {},
    });

    const tasks = scheduler.list();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.name).toBe("test-task");
    expect(tasks[0]!.schedule).toBe("* * * * *");
  });

  test("unregisters user tasks", () => {
    scheduler.register({ name: "removable", schedule: "* * * * *", handler: () => {} });
    expect(scheduler.size).toBe(1);

    const removed = scheduler.unregister("removable");
    expect(removed).toBe(true);
    expect(scheduler.size).toBe(0);
  });

  test("cannot unregister built-in tasks", () => {
    scheduler.register({ name: "builtin-task", schedule: "* * * * *", handler: () => {}, builtin: true });

    const removed = scheduler.unregister("builtin-task");
    expect(removed).toBe(false);
    expect(scheduler.size).toBe(1);
  });

  test("returns false when unregistering nonexistent task", () => {
    expect(scheduler.unregister("nope")).toBe(false);
  });

  test("tick executes matching tasks", async () => {
    let ran = false;
    scheduler.register({
      name: "always",
      schedule: "* * * * *",
      handler: () => { ran = true; },
    });

    await scheduler.tick();
    expect(ran).toBe(true);
  });

  test("tick does not re-execute in same minute", async () => {
    let count = 0;
    scheduler.register({
      name: "counter",
      schedule: "* * * * *",
      handler: () => { count++; },
    });

    await scheduler.tick();
    await scheduler.tick();
    expect(count).toBe(1);
  });

  test("tick catches handler errors without crashing", async () => {
    scheduler.register({
      name: "failing",
      schedule: "* * * * *",
      handler: () => { throw new Error("boom"); },
    });

    // Should not throw
    await scheduler.tick();
  });

  test("registers task with prompt field", () => {
    scheduler.register({
      name: "morning",
      schedule: "0 8 * * *",
      prompt: "Good morning briefing",
      handler: () => {},
    });

    const tasks = scheduler.list();
    expect(tasks[0]!.prompt).toBe("Good morning briefing");
  });

  test("runTask runs only the named task", async () => {
    let heartbeatRan = false;
    let cronRan = false;

    scheduler.register({
      name: "heartbeat",
      schedule: "* * * * *",
      handler: () => { heartbeatRan = true; },
      builtin: true,
    });
    scheduler.register({
      name: "user-cron",
      schedule: "* * * * *",
      handler: () => { cronRan = true; },
    });

    await scheduler.runTask("heartbeat");

    expect(heartbeatRan).toBe(true);
    expect(cronRan).toBe(false);
  });

  test("runTask returns false for nonexistent task", async () => {
    const result = await scheduler.runTask("nonexistent");
    expect(result).toBe(false);
  });

  test("runTask catches handler errors", async () => {
    scheduler.register({
      name: "failing",
      schedule: "* * * * *",
      handler: () => { throw new Error("boom"); },
    });

    const result = await scheduler.runTask("failing");
    expect(result).toBe(true);
  });

  test("runTask removes one-shot tasks after execution", async () => {
    let completed = false;
    scheduler.register({
      name: "one-time",
      schedule: "* * * * *",
      handler: () => {},
      oneShot: true,
      onComplete: () => { completed = true; },
    });

    expect(scheduler.size).toBe(1);
    await scheduler.runTask("one-time");
    expect(scheduler.size).toBe(0);
    expect(completed).toBe(true);
  });

  test("tick removes one-shot tasks and calls onComplete after execution", async () => {
    let removedName = "";
    scheduler.register({
      name: "one-shot-tick",
      schedule: "* * * * *",
      handler: () => {},
      oneShot: true,
      onComplete: (name) => { removedName = name; },
    });

    expect(scheduler.size).toBe(1);
    await scheduler.tick();
    expect(scheduler.size).toBe(0);
    expect(removedName).toBe("one-shot-tick");
  });

  test("updateSchedule changes the cron expression of a task", () => {
    scheduler.register({
      name: "heartbeat",
      schedule: "*/30 * * * *",
      handler: () => {},
      builtin: true,
    });

    const updated = scheduler.updateSchedule("heartbeat", "*/5 * * * *");
    expect(updated).toBe(true);

    const tasks = scheduler.list();
    expect(tasks[0]!.schedule).toBe("*/5 * * * *");
  });

  test("updateSchedule returns false for nonexistent task", () => {
    const updated = scheduler.updateSchedule("nope", "*/5 * * * *");
    expect(updated).toBe(false);
  });

  test("tick respects intervalMinutes for cadence-based tasks", async () => {
    let runs = 0;
    const registeredAt = new Date();
    scheduler.register({
      name: "heartbeat",
      schedule: "@every 120m",
      intervalMinutes: 120,
      handler: () => { runs++; },
      builtin: true,
    });

    await scheduler.tick(new Date(registeredAt.getTime()));
    expect(runs).toBe(0);

    await scheduler.tick(new Date(registeredAt.getTime() + 119 * 60_000));
    expect(runs).toBe(0);

    await scheduler.tick(new Date(registeredAt.getTime() + 121 * 60_000));
    expect(runs).toBe(1);
  });

  test("updateInterval changes cadence tasks without switching back to cron", () => {
    scheduler.register({
      name: "heartbeat",
      schedule: "*/30 * * * *",
      intervalMinutes: 30,
      handler: () => {},
      builtin: true,
    });

    const updated = scheduler.updateInterval("heartbeat", 120);
    expect(updated).toBe(true);

    const tasks = scheduler.list();
    expect(tasks[0]!.schedule).toBe("@every 120m");
  });

  test("updateSchedule resets lastRun so task can fire immediately", async () => {
    let ran = false;
    scheduler.register({
      name: "test",
      schedule: "* * * * *",
      handler: () => { ran = true; },
    });

    // First tick runs it
    await scheduler.tick();
    expect(ran).toBe(true);
    ran = false;

    // Second tick in same minute skips it
    await scheduler.tick();
    expect(ran).toBe(false);

    // Update schedule resets lastRun, so next tick runs it again
    scheduler.updateSchedule("test", "* * * * *");
    await scheduler.tick();
    expect(ran).toBe(true);
  });

  test("restored one-shot task with onComplete simulates config cleanup", async () => {
    // Simulates runtime.ts restore pattern: one-shot tasks get onComplete that removes from config
    const configStore = { cronTasks: [{ name: "reminder", oneShot: true }] };

    scheduler.register({
      name: "reminder",
      schedule: "* * * * *",
      handler: () => {},
      oneShot: true,
      onComplete: async (taskName) => {
        configStore.cronTasks = configStore.cronTasks.filter((t) => t.name !== taskName);
      },
    });

    expect(configStore.cronTasks).toHaveLength(1);
    await scheduler.tick();
    expect(configStore.cronTasks).toHaveLength(0);
    expect(scheduler.size).toBe(0);
  });
});

describe("createHeartbeatTask", () => {
  const testHome = join(tmpdir(), "sa-test-heartbeat-" + Date.now());

  beforeEach(async () => {
    await mkdir(testHome, { recursive: true });
  });

  test("writes heartbeat file", async () => {
    const task = createHeartbeatTask(testHome);
    expect(task.name).toBe("heartbeat");
    expect(task.builtin).toBe(true);

    await task.handler();

    const heartbeatFile = join(testHome, "engine.heartbeat");
    expect(existsSync(heartbeatFile)).toBe(true);

    const data = JSON.parse(await readFile(heartbeatFile, "utf-8"));
    expect(data.timestamp).toBeDefined();
    expect(data.pid).toBe(process.pid);
    expect(typeof data.memory).toBe("number");

    await rm(testHome, { recursive: true, force: true });
  });
});
