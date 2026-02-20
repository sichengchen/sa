import { describe, test, expect, beforeEach } from "bun:test";
import { Scheduler, matchesCron, createHeartbeatTask } from "../src/engine/scheduler.js";
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
