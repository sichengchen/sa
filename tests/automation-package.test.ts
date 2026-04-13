import { describe, expect, test } from "bun:test";
import {
  DEFAULT_HEARTBEAT,
  CRON_DEFAULT_TOOLS,
  WEBHOOK_DEFAULT_TOOLS,
  matchesCron,
  parseScheduleInput,
  Scheduler,
} from "../packages/automation/src/index.js";

describe("@aria/automation package entrypoints", () => {
  test("re-exports schedule parsing helpers", () => {
    const parsed = parseScheduleInput("every 2h", new Date("2026-04-11T12:00:00Z"));
    expect(parsed).toEqual({
      schedule: "@every 120m",
      scheduleKind: "interval",
      intervalMinutes: 120,
    });
  });

  test("re-exports scheduler primitives", () => {
    expect(matchesCron("0 8 * * *", new Date(2026, 3, 11, 8, 0, 0))).toBe(true);
    expect(new Scheduler()).toBeInstanceOf(Scheduler);
  });

  test("re-exports automation-owned defaults", () => {
    expect(DEFAULT_HEARTBEAT).toEqual({
      enabled: true,
      intervalMinutes: 30,
      checklistPath: "HEARTBEAT.md",
      suppressToken: "HEARTBEAT_OK",
    });
    expect(CRON_DEFAULT_TOOLS).toContain("memory_write");
    expect(WEBHOOK_DEFAULT_TOOLS).not.toContain("memory_write");
  });
});
