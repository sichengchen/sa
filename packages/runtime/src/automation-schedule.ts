import type { CronTask } from "./config/types.js";
import { matchesCron } from "./scheduler.js";

export interface ParsedSchedule {
  schedule: string;
  scheduleKind: "cron" | "interval" | "once";
  intervalMinutes?: number;
  runAt?: string;
  oneShot?: boolean;
}

function inferScheduleKind(task: Pick<CronTask, "scheduleKind" | "intervalMinutes" | "runAt">): "cron" | "interval" | "once" {
  if (task.scheduleKind) {
    return task.scheduleKind;
  }
  if (task.intervalMinutes && task.intervalMinutes > 0) {
    return "interval";
  }
  if (task.runAt) {
    return "once";
  }
  return "cron";
}

function parseDurationToMinutes(input: string): number | null {
  const match = input.trim().toLowerCase().match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2]?.[0];
  if (unit === "m") return value;
  if (unit === "h") return value * 60;
  if (unit === "d") return value * 1440;
  return null;
}

export function parseScheduleInput(input: string, now = new Date()): ParsedSchedule {
  const trimmed = input.trim();
  const lowered = trimmed.toLowerCase();

  if (lowered.startsWith("every ")) {
    const minutes = parseDurationToMinutes(trimmed.slice(6));
    if (!minutes) {
      throw new Error(`Invalid recurring schedule: ${input}`);
    }
    return {
      schedule: `@every ${minutes}m`,
      scheduleKind: "interval",
      intervalMinutes: minutes,
    };
  }

  const durationMinutes = parseDurationToMinutes(trimmed);
  if (durationMinutes) {
    return {
      schedule: `@once ${durationMinutes}m`,
      scheduleKind: "once",
      runAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
      oneShot: true,
    };
  }

  if (trimmed.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const runAt = new Date(trimmed);
    if (Number.isNaN(runAt.getTime())) {
      throw new Error(`Invalid timestamp schedule: ${input}`);
    }
    return {
      schedule: `@once ${runAt.toISOString()}`,
      scheduleKind: "once",
      runAt: runAt.toISOString(),
      oneShot: true,
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    return {
      schedule: trimmed,
      scheduleKind: "cron",
    };
  }

  throw new Error(
    `Invalid schedule "${input}". Use a cron expression, "every 2h", "30m", or an ISO timestamp.`,
  );
}

export function computeNextRunAt(task: Pick<CronTask, "schedule" | "scheduleKind" | "intervalMinutes" | "runAt" | "lastRunAt" | "oneShot">, now = new Date()): string | null {
  const scheduleKind = inferScheduleKind(task);

  if (scheduleKind === "once") {
    if (!task.runAt) return null;
    if (task.lastRunAt) return null;
    const runAt = new Date(task.runAt);
    return Number.isNaN(runAt.getTime()) ? null : runAt.toISOString();
  }

  if (scheduleKind === "interval") {
    const interval = task.intervalMinutes ?? 0;
    if (interval <= 0) return null;
    const base = task.lastRunAt ? new Date(task.lastRunAt) : now;
    return new Date(base.getTime() + interval * 60_000).toISOString();
  }

  const cursor = new Date(now.getTime());
  cursor.setSeconds(0, 0);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (matchesCron(task.schedule, cursor)) {
      return cursor.toISOString();
    }
  }
  return null;
}

export function isTaskDue(task: Pick<CronTask, "schedule" | "scheduleKind" | "intervalMinutes" | "runAt" | "lastRunAt" | "paused" | "nextRunAt"> & { enabled?: boolean }, now = new Date()): boolean {
  if (task.enabled === false || task.paused) {
    return false;
  }

  const scheduleKind = inferScheduleKind(task);

  if (scheduleKind === "once") {
    const candidate = task.nextRunAt ?? task.runAt;
    if (!candidate || task.lastRunAt) return false;
    return new Date(candidate).getTime() <= now.getTime();
  }

  if (scheduleKind === "interval") {
    const candidate = task.nextRunAt;
    if (candidate) {
      return new Date(candidate).getTime() <= now.getTime();
    }
    const interval = task.intervalMinutes ?? 0;
    if (interval <= 0 || !task.lastRunAt) return false;
    return now.getTime() - new Date(task.lastRunAt).getTime() >= interval * 60_000;
  }

  return matchesCron(task.schedule, now);
}
