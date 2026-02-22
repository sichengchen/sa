import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HeartbeatConfig } from "./config/types.js";
import { DEFAULT_HEARTBEAT } from "./config/defaults.js";
import type { Agent } from "./agent/index.js";

/** A scheduled task definition */
export interface ScheduledTask {
  name: string;
  /** Cron expression: "minute hour day month weekday" (5 fields) */
  schedule: string;
  /** Handler to execute */
  handler: () => Promise<void> | void;
  /** Whether this is a built-in task (cannot be removed via API) */
  builtin?: boolean;
  /** Optional prompt to send to agent (for user-defined tasks) */
  prompt?: string;
  /** If true, auto-unregister after first execution */
  oneShot?: boolean;
  /** Callback invoked when a one-shot task completes */
  onComplete?: (name: string) => void;
}

interface RegisteredTask extends ScheduledTask {
  lastRun: number;
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
    this.tasks.set(task.name, { ...task, lastRun: 0 });
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
  list(): Array<{ name: string; schedule: string; builtin: boolean; prompt?: string }> {
    return Array.from(this.tasks.values()).map((t) => ({
      name: t.name,
      schedule: t.schedule,
      builtin: t.builtin ?? false,
      prompt: t.prompt,
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
  async tick(): Promise<void> {
    const now = new Date();
    const nowMinute = Math.floor(now.getTime() / 60_000);
    const toRemove: string[] = [];

    for (const task of this.tasks.values()) {
      // Skip if already ran this minute
      if (task.lastRun === nowMinute) continue;

      if (matchesCron(task.schedule, now)) {
        task.lastRun = nowMinute;
        try {
          await task.handler();
        } catch (err) {
          console.error(`[scheduler] Task "${task.name}" failed:`, err);
        }
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
    task.lastRun = 0; // Reset so the new schedule can fire immediately
    return true;
  }

  /** Run a single task by name, bypassing cron matching and lastRun guard */
  async runTask(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task) return false;
    try {
      await task.handler();
    } catch (err) {
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

/** Create the agent-based heartbeat task.
 *  Writes a health JSON file every cycle AND runs the agent with the HEARTBEAT.md checklist.
 */
export function createHeartbeatTask(
  saHome: string,
  mainAgent: Agent | null,
  config?: Partial<HeartbeatConfig>,
): ScheduledTask {
  const hbConfig: HeartbeatConfig = { ...DEFAULT_HEARTBEAT, ...config };
  heartbeatState.config = hbConfig;

  const schedule = `*/${hbConfig.intervalMinutes} * * * *`;

  return {
    name: "heartbeat",
    schedule,
    builtin: true,
    async handler() {
      // Always write the health file for daemon monitoring
      const heartbeatFile = join(saHome, "engine.heartbeat");
      const healthData: HeartbeatResult = {
        timestamp: new Date().toISOString(),
        pid: process.pid,
        memory: process.memoryUsage().heapUsed,
        agentRan: false,
        suppressed: false,
      };

      if (!hbConfig.enabled || !mainAgent) {
        healthData.agentRan = false;
        await writeFile(heartbeatFile, JSON.stringify(healthData) + "\n");
        heartbeatState.lastResult = healthData;
        return;
      }

      // Read the checklist
      const checklistPath = join(saHome, hbConfig.checklistPath ?? "HEARTBEAT.md");
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
        for await (const event of mainAgent.chat(preamble)) {
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

      if (!healthData.suppressed && responseText.trim()) {
        console.log(`[heartbeat] Agent report: ${responseText.trim().slice(0, 200)}`);
      }
    },
  };
}
