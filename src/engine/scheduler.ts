import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeliveryTarget, HeartbeatConfig, RetryPolicy } from "./config/types.js";
import { DEFAULT_HEARTBEAT } from "./config/defaults.js";
import type { Agent } from "./agent/index.js";
import { computeNextRunAt, isTaskDue } from "./automation-schedule.js";

/** A scheduled task definition */
export interface ScheduledTask {
  name: string;
  /** Cron expression: "minute hour day month weekday" (5 fields) */
  schedule: string;
  /** Parsed schedule kind */
  scheduleKind?: "cron" | "interval" | "once";
  /** Optional fixed interval in minutes for cadence-based scheduling */
  intervalMinutes?: number;
  /** Absolute one-shot run time */
  runAt?: string;
  /** Whether scheduling is paused without deleting the task */
  paused?: boolean;
  /** Handler to execute */
  handler: () => Promise<{ status?: "success" | "error"; summary?: string } | void> | { status?: "success" | "error"; summary?: string } | void;
  /** Whether this is a built-in task (cannot be removed via API) */
  builtin?: boolean;
  /** Optional prompt to send to agent (for user-defined tasks) */
  prompt?: string;
  /** Optional retry policy for agent-backed automation tasks */
  retryPolicy?: RetryPolicy;
  /** Optional delivery target for automation output */
  delivery?: DeliveryTarget;
  /** If true, auto-unregister after first execution */
  oneShot?: boolean;
  /** Callback invoked when a one-shot task completes */
  onComplete?: (name: string) => void;
}

interface RegisteredTask extends ScheduledTask {
  lastRun: number;
  lastRunAt?: string;
  nextRunAt?: string | null;
  lastStatus?: "success" | "error";
  lastSummary?: string;
}

interface HeartbeatTaskOptions {
  runtimeHome: string;
  mainAgent?: Agent | null;
  notify?: (message: string) => Promise<void> | void;
}

/** Parse a cron field value (supports wildcards, numbers, and step syntax) */
function matchesCronField(field: string, value: number): boolean {
  if (field === "*") return true;

  // Step syntax: */5 means every 5
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return value % step === 0;
  }

  // Comma-separated values: 1,15,30
  const parts = field.split(",");
  return parts.some((p) => parseInt(p.trim(), 10) === value);
}

/** Check if a cron expression matches a given date */
export function matchesCron(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minute, hour, day, month, weekday] = fields as [string, string, string, string, string];

  return (
    matchesCronField(minute, date.getMinutes()) &&
    matchesCronField(hour, date.getHours()) &&
    matchesCronField(day, date.getDate()) &&
    matchesCronField(month, date.getMonth() + 1) &&
    matchesCronField(weekday, date.getDay())
  );
}

/** Lightweight interval-based cron scheduler */
export class Scheduler {
  private tasks = new Map<string, RegisteredTask>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly checkIntervalMs: number;

  constructor(checkIntervalMs = 60_000) {
    this.checkIntervalMs = checkIntervalMs;
  }

  /** Register a recurring task */
  register(task: ScheduledTask): void {
    this.tasks.set(task.name, {
      ...task,
      lastRun: 0,
      nextRunAt: computeNextRunAt(task),
    });
  }

  /** Remove a task by name (cannot remove built-in tasks) */
  unregister(name: string): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    if (task.builtin) return false;
    this.tasks.delete(name);
    return true;
  }

  /** List all registered tasks */
  list(): Array<{
    name: string;
    schedule: string;
    builtin: boolean;
    prompt?: string;
    retryPolicy?: RetryPolicy;
    delivery?: DeliveryTarget;
    scheduleKind?: "cron" | "interval" | "once";
    intervalMinutes?: number;
    runAt?: string;
    paused?: boolean;
    lastRunAt?: string;
    nextRunAt?: string | null;
    lastStatus?: "success" | "error";
    lastSummary?: string;
  }> {
    return Array.from(this.tasks.values()).map((t) => ({
      name: t.name,
      schedule: t.schedule,
      builtin: t.builtin ?? false,
      prompt: t.prompt,
      retryPolicy: t.retryPolicy,
      delivery: t.delivery,
      scheduleKind: t.scheduleKind,
      intervalMinutes: t.intervalMinutes,
      runAt: t.runAt,
      paused: t.paused,
      lastRunAt: t.lastRunAt,
      nextRunAt: t.nextRunAt,
      lastStatus: t.lastStatus,
      lastSummary: t.lastSummary,
    }));
  }

  /** Start the scheduler — checks every minute */
  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), this.checkIntervalMs);
  }

  /** Stop the scheduler */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Manual tick — check and run matching tasks */
  async tick(now = new Date()): Promise<void> {
    const nowMinute = Math.floor(now.getTime() / 60_000);
    const toRemove: string[] = [];

    for (const task of this.tasks.values()) {
      // Skip if already ran this minute
      if (task.lastRun === nowMinute) continue;
      if (task.paused) continue;

      if (isTaskDue(task, now)) {
        task.lastRun = nowMinute;
        task.lastRunAt = now.toISOString();
        try {
          const result = await task.handler();
          task.lastStatus = result?.status ?? "success";
          task.lastSummary = result?.summary;
        } catch (err) {
          task.lastStatus = "error";
          task.lastSummary = err instanceof Error ? err.message : String(err);
          console.error(`[scheduler] Task "${task.name}" failed:`, err);
        }
        task.nextRunAt = computeNextRunAt(task, now);
        if (task.oneShot) {
          toRemove.push(task.name);
          task.onComplete?.(task.name);
        }
      }
    }

    // Remove one-shot tasks after iteration
    for (const name of toRemove) {
      this.tasks.delete(name);
    }
  }

  /** Update the cron schedule of an existing task */
  updateSchedule(name: string, schedule: string): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    task.schedule = schedule;
    task.scheduleKind = "cron";
    task.intervalMinutes = undefined;
    task.runAt = undefined;
    task.lastRun = 0; // Reset so the new schedule can fire immediately
    task.nextRunAt = computeNextRunAt(task);
    return true;
  }

  /** Update the fixed interval of an existing task */
  updateInterval(name: string, intervalMinutes: number): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    task.intervalMinutes = intervalMinutes;
    task.scheduleKind = "interval";
    task.schedule = formatIntervalSchedule(intervalMinutes);
    task.runAt = undefined;
    task.lastRun = 0;
    task.nextRunAt = computeNextRunAt(task);
    return true;
  }

  /** Update an existing one-shot task's run time */
  updateRunAt(name: string, runAt: string): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    task.scheduleKind = "once";
    task.runAt = runAt;
    task.intervalMinutes = undefined;
    task.schedule = `@once ${runAt}`;
    task.lastRun = 0;
    task.nextRunAt = computeNextRunAt(task);
    return true;
  }

  /** Pause or resume a task without unregistering it */
  setPaused(name: string, paused: boolean): boolean {
    const task = this.tasks.get(name);
    if (!task) return false;
    task.paused = paused;
    task.nextRunAt = paused ? null : computeNextRunAt(task);
    return true;
  }

  /** Run a single task by name, bypassing cron matching and lastRun guard */
  async runTask(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task) return false;
    try {
      const now = new Date();
      task.lastRunAt = now.toISOString();
      const result = await task.handler();
      task.lastStatus = result?.status ?? "success";
      task.lastSummary = result?.summary;
      task.nextRunAt = computeNextRunAt(task, now);
    } catch (err) {
      task.lastStatus = "error";
      task.lastSummary = err instanceof Error ? err.message : String(err);
      console.error(`[scheduler] Task "${task.name}" failed:`, err);
    }
    if (task.oneShot) {
      this.tasks.delete(name);
      task.onComplete?.(name);
    }
    return true;
  }

  get size(): number {
    return this.tasks.size;
  }
}

// --- Built-in tasks ---

/** Result of the last heartbeat check */
export interface HeartbeatResult {
  timestamp: string;
  pid: number;
  memory: number;
  agentRan: boolean;
  suppressed: boolean;
  response?: string;
}

/** In-memory heartbeat state (accessible by procedures) */
export const heartbeatState = {
  lastResult: null as HeartbeatResult | null,
  config: { ...DEFAULT_HEARTBEAT } as HeartbeatConfig,
};

function formatIntervalSchedule(intervalMinutes: number): string {
  return intervalMinutes <= 59 ? `*/${intervalMinutes} * * * *` : `@every ${intervalMinutes}m`;
}

async function writeHeartbeatLog(runtimeHome: string, healthData: HeartbeatResult): Promise<void> {
  try {
    const autoDir = join(runtimeHome, "automation");
    await mkdir(autoDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const logContent = [
      `# heartbeat - ${healthData.timestamp}`,
      "## Result",
      `- agentRan: ${healthData.agentRan}`,
      `- suppressed: ${healthData.suppressed}`,
      "## Response",
      healthData.response || "(no response)",
    ].join("\n");
    await writeFile(join(autoDir, `heartbeat-${ts}.md`), logContent + "\n");
  } catch {
    // Logging failure is non-fatal
  }
}

/** Create the agent-based heartbeat task.
 *  Writes a health JSON file every cycle AND runs the agent with the HEARTBEAT.md checklist.
 */
export function createHeartbeatTask(
  optionsOrSaHome: string | HeartbeatTaskOptions,
  mainAgent: Agent | null = null,
  config?: Partial<HeartbeatConfig>,
): ScheduledTask {
  const options = typeof optionsOrSaHome === "string"
    ? { runtimeHome: optionsOrSaHome, mainAgent }
    : optionsOrSaHome;
  const hbConfig: HeartbeatConfig = { ...DEFAULT_HEARTBEAT, ...config };
  heartbeatState.config = hbConfig;

  const schedule = formatIntervalSchedule(hbConfig.intervalMinutes);

  return {
    name: "heartbeat",
    schedule,
    intervalMinutes: hbConfig.intervalMinutes,
    builtin: true,
    async handler() {
      // Always write the health file for daemon monitoring
      const heartbeatFile = join(options.runtimeHome, "engine.heartbeat");
      const healthData: HeartbeatResult = {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memory: process.memoryUsage().heapUsed,
        agentRan: false,
        suppressed: false,
      };

      if (!hbConfig.enabled || !options.mainAgent) {
        healthData.agentRan = false;
        await writeFile(heartbeatFile, JSON.stringify(healthData) + "\n");
        heartbeatState.lastResult = healthData;
        await writeHeartbeatLog(options.runtimeHome, healthData);
        return;
      }

      // Read the checklist
      const checklistPath = join(options.runtimeHome, hbConfig.checklistPath ?? "HEARTBEAT.md");
      let checklist = "";
      try {
        checklist = await readFile(checklistPath, "utf-8");
      } catch {
        // No checklist — agent will just report HEARTBEAT_OK
      }

      // Run the agent in the main session
      const preamble = [
        "This is a heartbeat check. Review the checklist below and handle each item.",
        `If nothing needs attention, reply with exactly \`${hbConfig.suppressToken}\`.`,
        "If something needs the user's attention, describe it clearly.",
        "",
        checklist || "(No checklist items configured.)",
      ].join("\n");

      let responseText = "";
      try {
        for await (const event of options.mainAgent.chat(preamble)) {
          if (event.type === "text_delta") {
            responseText += event.delta;
          }
        }
      } catch (err) {
        console.error("[heartbeat] Agent error:", err);
        responseText = `Heartbeat agent error: ${err instanceof Error ? err.message : String(err)}`;
      }

      healthData.agentRan = true;
      healthData.response = responseText.trim();
      healthData.suppressed = responseText.trim() === hbConfig.suppressToken;

      await writeFile(heartbeatFile, JSON.stringify(healthData) + "\n");
      heartbeatState.lastResult = healthData;
      await writeHeartbeatLog(options.runtimeHome, healthData);

      if (!healthData.suppressed && responseText.trim()) {
        if (options.notify) {
          try {
            await options.notify(`Heartbeat\n\n${responseText.trim()}`);
          } catch (err) {
            console.error("[heartbeat] Notification error:", err);
          }
        }
        console.log(`[heartbeat] Agent report: ${responseText.trim().slice(0, 200)}`);
      }
    },
  };
}
