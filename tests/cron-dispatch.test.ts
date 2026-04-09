import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Scheduler, matchesCron } from "@aria/engine/scheduler.js";
import { SessionManager } from "@aria/engine/sessions.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "aria-cron-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Cron dispatch", () => {
  test("one-shot task auto-removes after execution", async () => {
    const scheduler = new Scheduler(60_000);
    let ran = false;
    let completed = false;

    scheduler.register({
      name: "once",
      schedule: "* * * * *", // matches every minute
      oneShot: true,
      handler: async () => {
        ran = true;
      },
      onComplete: () => {
        completed = true;
      },
    });

    expect(scheduler.size).toBe(1);
    await scheduler.tick();

    expect(ran).toBe(true);
    expect(completed).toBe(true);
    // Task should be auto-removed
    expect(scheduler.size).toBe(0);
  });

  test("regular task stays after execution", async () => {
    const scheduler = new Scheduler(60_000);
    let runCount = 0;

    scheduler.register({
      name: "recurring",
      schedule: "* * * * *",
      handler: () => { runCount++; },
    });

    await scheduler.tick();
    expect(runCount).toBe(1);
    expect(scheduler.size).toBe(1); // Still registered
  });

  test("cron sessions use structured IDs", () => {
    const sessions = new SessionManager();
    const session = sessions.create("cron:daily-report", "cron");
    expect(session.id).toStartWith("cron:daily-report:");
    expect(session.connectorType).toBe("cron");

    // Static helpers parse correctly
    expect(SessionManager.getType(session.id)).toBe("cron");
    expect(SessionManager.getPrefix(session.id)).toBe("cron:daily-report");
  });

  test("multiple cron sessions are isolated per task", () => {
    const sessions = new SessionManager();
    const s1 = sessions.create("cron:task-a", "cron");
    const s2 = sessions.create("cron:task-b", "cron");

    expect(sessions.listByPrefix("cron:task-a")).toHaveLength(1);
    expect(sessions.listByPrefix("cron:task-b")).toHaveLength(1);
    expect(s1.id).not.toBe(s2.id);
  });
});

describe("CronTask config types", () => {
  test("CronTask shape is valid", () => {
    // Verify the config shape works (type-level test mostly)
    const task = {
      name: "test",
      schedule: "0 9 * * *",
      prompt: "Good morning",
      enabled: true,
      oneShot: false,
      model: "haiku",
    };
    expect(task.name).toBe("test");
    expect(task.oneShot).toBe(false);
  });
});

describe("Cron persistence roundtrip", () => {
  test("config.automation.cronTasks can serialize and deserialize", async () => {
    const config = {
      version: 3,
      runtime: {
        activeModel: "sonnet",
        telegramBotTokenEnvVar: "TEST",
        memory: { enabled: true, directory: "memory" },
        automation: {
          cronTasks: [
            { name: "daily", schedule: "0 9 * * *", prompt: "Morning report", enabled: true },
            {
              name: "once",
              schedule: "30 14 * * *",
              prompt: "Reminder",
              enabled: true,
              oneShot: true,
              retryPolicy: { maxAttempts: 2, delaySeconds: 30 },
            },
          ],
        },
      },
      providers: [],
      models: [],
      defaultModel: "sonnet",
    };

    const path = join(testDir, "config.json");
    await writeFile(path, JSON.stringify(config, null, 2));
    const loaded = JSON.parse(await readFile(path, "utf-8"));

      expect(loaded.runtime.automation.cronTasks).toHaveLength(2);
      expect(loaded.runtime.automation.cronTasks[0].name).toBe("daily");
      expect(loaded.runtime.automation.cronTasks[1].oneShot).toBe(true);
      expect(loaded.runtime.automation.cronTasks[1].retryPolicy.maxAttempts).toBe(2);
    });
  });

describe("Result logging", () => {
  test("automation directory and log files can be created", async () => {
    const autoDir = join(testDir, "automation");
    await mkdir(autoDir, { recursive: true });

    const logContent = [
      "# test-task — 2026-02-22T10:00:00Z",
      "## Prompt",
      "Test prompt",
      "## Response",
      "Test response",
    ].join("\n");

    const logPath = join(autoDir, "test-task-2026-02-22T10-00-00-000Z.md");
    await writeFile(logPath, logContent + "\n");

    const files = await readdir(autoDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toStartWith("test-task");

    const content = await readFile(logPath, "utf-8");
    expect(content).toContain("Test response");
  });
});

describe("Scheduler with one-shot matching", () => {
  test("matchesCron validates 5-field expressions", () => {
    const now = new Date();
    // "* * * * *" always matches
    expect(matchesCron("* * * * *", now)).toBe(true);
    // Invalid expression
    expect(matchesCron("invalid", now)).toBe(false);
    // Too few fields
    expect(matchesCron("* * *", now)).toBe(false);
  });
});
