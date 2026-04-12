import type { EngineRuntime } from "@aria/runtime";
import type { CronTask, WebhookTask } from "@aria/runtime/config/types";
import { registerCronTask, upsertCronTaskRecord, upsertHeartbeatTaskRecord, upsertWebhookTaskRecord } from "./automation.js";

export class AutomationRegistry {
  constructor(private readonly runtime: EngineRuntime) {}

  syncHeartbeatDefinition(input: {
    enabled: boolean;
    intervalMinutes: number;
    nextRunAt?: string | null;
    lastRunAt?: string | null;
    lastStatus?: "success" | "error" | null;
    lastSummary?: string | null;
  }): void {
    upsertHeartbeatTaskRecord(this.runtime, input);
  }

  syncCronDefinition(task: CronTask): void {
    upsertCronTaskRecord(this.runtime, task);
    if (task.enabled) {
      registerCronTask(this.runtime, task);
    }
  }

  syncWebhookDefinition(task: WebhookTask): void {
    upsertWebhookTaskRecord(this.runtime, task);
  }

  restoreFromRuntimeConfig(): void {
    const config = this.runtime.config.getConfigFile();
    const heartbeatTask = this.runtime.scheduler.list().find((task) => task.name === "heartbeat");
    this.syncHeartbeatDefinition({
      enabled: config.runtime.heartbeat?.enabled ?? true,
      intervalMinutes: config.runtime.heartbeat?.intervalMinutes ?? 30,
      nextRunAt: heartbeatTask?.nextRunAt ?? null,
    });

    for (const task of config.runtime.automation?.cronTasks ?? []) {
      this.syncCronDefinition(task);
    }

    for (const task of config.runtime.automation?.webhookTasks ?? []) {
      this.syncWebhookDefinition(task);
    }
  }
}
