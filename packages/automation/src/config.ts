export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  checklistPath?: string;
  suppressToken: string;
}

export interface RetryPolicy {
  maxAttempts?: number;
  delaySeconds?: number;
}

export interface DeliveryTarget {
  connector?: string;
}

export interface CronTask {
  id?: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  paused?: boolean;
  oneShot?: boolean;
  model?: string;
  runAt?: string;
  allowedTools?: string[];
  allowedToolsets?: string[];
  skills?: string[];
  retryPolicy?: RetryPolicy;
  delivery?: DeliveryTarget;
  scheduleKind?: "cron" | "interval" | "once";
  intervalMinutes?: number;
  lastRunAt?: string;
  nextRunAt?: string | null;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  createdBySessionId?: string;
}

export interface WebhookTask {
  id?: string;
  name: string;
  slug: string;
  prompt: string;
  enabled: boolean;
  model?: string;
  allowedTools?: string[];
  allowedToolsets?: string[];
  skills?: string[];
  retryPolicy?: RetryPolicy;
  delivery?: DeliveryTarget;
  lastRunAt?: string;
  lastStatus?: "success" | "error";
  lastSummary?: string;
  createdBySessionId?: string;
}

export interface AutomationConfig {
  cronTasks: CronTask[];
  webhookTasks?: WebhookTask[];
}

export const CRON_DEFAULT_TOOLS = [
  "read",
  "web_fetch",
  "web_search",
  "memory_search",
  "memory_read",
  "memory_write",
  "notify",
];

export const WEBHOOK_DEFAULT_TOOLS = [
  "read",
  "web_fetch",
  "web_search",
  "memory_search",
  "memory_read",
  "notify",
];

export const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  enabled: true,
  intervalMinutes: 30,
  checklistPath: "HEARTBEAT.md",
  suppressToken: "HEARTBEAT_OK",
};
