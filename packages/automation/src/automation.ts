import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Agent } from "@aria/agent-aria";
import type { EngineRuntime } from "@aria/runtime";
import {
  createSessionToolEnvironment,
  mergeAllowedTools,
} from "@aria/tools";
import type {
  AutomationDeliveryStatus,
  AutomationTaskType,
  AutomationRunStatus,
} from "@aria/store/operational-store";
import {
  CRON_DEFAULT_TOOLS,
  WEBHOOK_DEFAULT_TOOLS,
} from "@aria/runtime/config/defaults";
import type {
  CronTask,
  DeliveryTarget,
  RetryPolicy,
  WebhookTask,
} from "@aria/runtime/config/types";
import { computeNextRunAt } from "./automation-schedule.js";

export interface AutomationTaskRunInput {
  taskId?: string;
  taskType?: AutomationTaskType;
  sessionPrefix: string;
  connectorType: "cron" | "webhook";
  name: string;
  prompt: string;
  model?: string;
  allowedTools?: string[];
  allowedToolsets?: string[];
  skills?: string[];
  retryPolicy?: RetryPolicy;
  delivery?: DeliveryTarget;
}

export interface AutomationTaskRunResult {
  responseText: string;
  toolCalls: Array<{ name: string; content: string }>;
  status: "success" | "error";
  summary: string;
  sessionId: string;
  attemptNumber: number;
  maxAttempts: number;
  deliveryStatus: AutomationDeliveryStatus;
  deliveryError?: string | null;
}

interface AutomationDeliveryResult {
  status: AutomationDeliveryStatus;
  attemptedAt?: number | null;
  error?: string | null;
}

interface AutomationAttemptResult {
  taskRunId?: string;
  responseText: string;
  toolCalls: Array<{ name: string; content: string }>;
  status: "success" | "error";
  summary: string;
  sessionId: string;
  attemptNumber: number;
  maxAttempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRetryPolicy(policy?: RetryPolicy): Required<RetryPolicy> {
  const rawMaxAttempts = policy?.maxAttempts ?? 1;
  const rawDelaySeconds = policy?.delaySeconds ?? 0;
  return {
    maxAttempts: Math.max(1, Math.min(10, Math.floor(rawMaxAttempts))),
    delaySeconds: Math.max(0, Math.min(3600, Math.floor(rawDelaySeconds))),
  };
}

export function buildDelegationOptions(runtime: EngineRuntime) {
  const orchestration = runtime.config.getConfigFile().runtime.orchestration;
  return {
    router: runtime.router,
    defaultTimeoutMs: orchestration?.defaultTimeoutMs,
    memoryWriteDefault: orchestration?.memoryWriteDefault,
    maxConcurrent: orchestration?.maxConcurrent,
    maxSubAgentsPerTurn: orchestration?.maxSubAgentsPerTurn,
    resultRetentionMs: orchestration?.resultRetentionMs,
  };
}

async function runAutomationAttempt(
  runtime: EngineRuntime,
  task: AutomationTaskRunInput,
  attemptNumber: number,
  maxAttempts: number,
): Promise<AutomationAttemptResult> {
  const session = runtime.sessions.create(task.sessionPrefix, task.connectorType);
  const defaultTools = task.connectorType === "webhook" ? WEBHOOK_DEFAULT_TOOLS : CRON_DEFAULT_TOOLS;
  const sessionScopedTools = runtime.mcp.filterToolsForSession(runtime.tools, session.id);
  const allowedTools = mergeAllowedTools(
    sessionScopedTools,
    task.allowedTools ?? defaultTools,
    task.allowedToolsets,
  ) ?? defaultTools;
  const toolEnvironment = createSessionToolEnvironment({
    baseTools: sessionScopedTools.filter((tool) => allowedTools.includes(tool.name)),
    checkpointManager: runtime.checkpoints,
    maxContextHintChars: runtime.config.getConfigFile().runtime.contextFiles?.maxHintChars,
    delegation: buildDelegationOptions(runtime),
  });
  toolEnvironment.newTurn();

  const systemPrompt = await runtime.promptEngine.buildSessionPrompt({
    sessionId: session.id,
    connectorType: task.connectorType,
    trigger: "automation",
    attachedSkills: task.skills,
    tools: toolEnvironment.tools,
    overlay: [
      `Automation task: ${task.name}`,
      `Delivery mode: ${task.connectorType}`,
      "Complete the requested task directly. Assume the operator will review the archived transcript and result summary after completion.",
    ].join("\n"),
  });
  const agent = new Agent({
    router: runtime.router,
    tools: toolEnvironment.tools,
    getSystemPrompt: () => systemPrompt,
    modelOverride: task.model,
  });

  let responseText = "";
  const toolCalls: Array<{ name: string; content: string }> = [];
  let status: "success" | "error" = "success";
  const runId = crypto.randomUUID();
  const taskRunId = task.taskId ? crypto.randomUUID() : undefined;
  const startedAt = Date.now();
  runtime.store.createRun({
    runId,
    sessionId: session.id,
    trigger: "automation",
    status: "running",
    inputText: task.prompt,
    startedAt,
  });
  if (taskRunId && task.taskType) {
    runtime.store.recordAutomationRunStart({
      taskRunId,
      taskId: task.taskId!,
      taskType: task.taskType,
      taskName: task.name,
      sessionId: session.id,
      runId,
      trigger: task.connectorType,
      promptText: task.prompt,
      deliveryTarget: task.delivery as unknown as Record<string, unknown> | undefined,
      attemptNumber,
      maxAttempts,
      startedAt,
    });
  }

  try {
    for await (const event of agent.chat(task.prompt)) {
      if (event.type === "text_delta") {
        responseText += event.delta;
      }
      if (event.type === "tool_start") {
        runtime.store.recordToolCallStart({
          toolCallId: event.id,
          runId,
          sessionId: session.id,
          toolName: event.name,
          args: event.args,
        });
      }
      if (event.type === "tool_end") {
        runtime.store.recordToolCallEnd({
          toolCallId: event.id,
          status: event.result.isError ? "failed" : "completed",
          result: event.result,
        });
        toolCalls.push({ name: event.name, content: event.result.content });
      }
    }
  } catch (error) {
    status = "error";
    responseText = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    const completedAt = Date.now();
    const finalSummary = responseText.slice(0, 200) || "(no response)";
    const finalRunStatus: AutomationRunStatus = status === "success" ? "success" : "error";
    runtime.store.finishRun(runId, {
      status: status === "success" ? "completed" : "failed",
      completedAt,
      stopReason: status === "success" ? "automation_complete" : undefined,
      errorMessage: status === "error" ? responseText : undefined,
    });
    if (taskRunId) {
      runtime.store.finishAutomationRun({
        taskRunId,
        status: finalRunStatus === "success" ? "success" : "error",
        responseText,
        summary: finalSummary,
        completedAt,
        errorMessage: status === "error" ? responseText : undefined,
      });
    }
    runtime.store.syncSessionMessages(session.id, agent.getMessages());
    await runtime.archive.syncSession(session, agent.getMessages());
    runtime.sessions.destroySession(session.id);
  }

  return {
    taskRunId,
    sessionId: session.id,
    responseText,
    toolCalls,
    status,
    summary: responseText.slice(0, 200) || "(no response)",
    attemptNumber,
    maxAttempts,
  };
}

export async function runAutomationAgent(
  runtime: EngineRuntime,
  task: AutomationTaskRunInput,
): Promise<AutomationTaskRunResult> {
  const retryPolicy = normalizeRetryPolicy(task.retryPolicy);
  let finalResult: AutomationAttemptResult | null = null;

  for (let attemptNumber = 1; attemptNumber <= retryPolicy.maxAttempts; attemptNumber++) {
    finalResult = await runAutomationAttempt(runtime, task, attemptNumber, retryPolicy.maxAttempts);
    if (finalResult.status === "success") {
      break;
    }
    if (attemptNumber < retryPolicy.maxAttempts && retryPolicy.delaySeconds > 0) {
      await sleep(retryPolicy.delaySeconds * 1000);
    }
  }

  if (!finalResult) {
    throw new Error("Automation run did not produce a result");
  }

  const delivery = await deliverAutomationResult(runtime, task.delivery, finalResult.responseText);
  if (finalResult.taskRunId) {
    runtime.store.recordAutomationDelivery({
      taskRunId: finalResult.taskRunId,
      deliveryStatus: delivery.status,
      deliveryAttemptedAt: delivery.attemptedAt ?? undefined,
      deliveryError: delivery.error ?? null,
    });
  }

  return {
    sessionId: finalResult.sessionId,
    responseText: finalResult.responseText,
    toolCalls: finalResult.toolCalls,
    status: finalResult.status,
    summary: finalResult.summary,
    attemptNumber: finalResult.attemptNumber,
    maxAttempts: finalResult.maxAttempts,
    deliveryStatus: delivery.status,
    deliveryError: delivery.error ?? null,
  };
}

function resolveTaskId(task: Pick<CronTask, "id" | "name"> | Pick<WebhookTask, "id" | "name">, prefix: string): string {
  return task.id ?? `${prefix}:${task.name}`;
}

export function upsertCronTaskRecord(runtime: EngineRuntime, task: CronTask): void {
  const existing = runtime.store.getAutomationTaskByName("cron", task.name);
  runtime.store.upsertAutomationTask({
    taskId: resolveTaskId(task, "cron"),
    taskType: "cron",
    name: task.name,
    enabled: task.enabled,
    paused: task.paused ?? false,
    config: task as unknown as Record<string, unknown>,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    lastRunAt: task.lastRunAt ?? null,
    nextRunAt: task.nextRunAt ?? null,
    lastStatus: task.lastStatus ?? null,
    lastSummary: task.lastSummary ?? null,
  });
}

export function upsertWebhookTaskRecord(runtime: EngineRuntime, task: WebhookTask): void {
  const existing = runtime.store.getAutomationTaskBySlug(task.slug);
  runtime.store.upsertAutomationTask({
    taskId: resolveTaskId(task, "webhook"),
    taskType: "webhook",
    name: task.name,
    slug: task.slug,
    enabled: task.enabled,
    paused: false,
    config: task as unknown as Record<string, unknown>,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    lastRunAt: task.lastRunAt ?? null,
    nextRunAt: null,
    lastStatus: task.lastStatus ?? null,
    lastSummary: task.lastSummary ?? null,
  });
}

export function upsertHeartbeatTaskRecord(
  runtime: EngineRuntime,
  input: {
    enabled: boolean;
    intervalMinutes: number;
    nextRunAt?: string | null;
    lastRunAt?: string | null;
    lastStatus?: AutomationRunStatus | null;
    lastSummary?: string | null;
  },
): void {
  const existing = runtime.store.getAutomationTaskByName("heartbeat", "heartbeat");
  runtime.store.upsertAutomationTask({
    taskId: "heartbeat",
    taskType: "heartbeat",
    name: "heartbeat",
    enabled: input.enabled,
    paused: !input.enabled,
    config: {
      name: "heartbeat",
      intervalMinutes: input.intervalMinutes,
      enabled: input.enabled,
    },
    createdAt: existing?.createdAt ?? 0,
    updatedAt: Date.now(),
    lastRunAt: input.lastRunAt ?? null,
    nextRunAt: input.nextRunAt ?? null,
    lastStatus: input.lastStatus ?? null,
    lastSummary: input.lastSummary ?? null,
  });
}

export function deleteCronTaskRecord(runtime: EngineRuntime, name: string): boolean {
  const record = runtime.store.getAutomationTaskByName("cron", name);
  if (!record) return false;
  return runtime.store.deleteAutomationTask(record.taskId);
}

export function deleteWebhookTaskRecord(runtime: EngineRuntime, slug: string): boolean {
  const record = runtime.store.getAutomationTaskBySlug(slug);
  if (!record) return false;
  return runtime.store.deleteAutomationTask(record.taskId);
}

export async function deliverAutomationResult(
  runtime: EngineRuntime,
  delivery: DeliveryTarget | undefined,
  responseText: string,
): Promise<AutomationDeliveryResult> {
  const connector = delivery?.connector;
  if (!connector || !responseText.trim()) {
    return { status: "not_requested", attemptedAt: null, error: null };
  }

  const notifyTool = runtime.tools.find((tool) => tool.name === "notify");
  if (!notifyTool) {
    return {
      status: "failed",
      attemptedAt: Date.now(),
      error: "notify tool is not available",
    };
  }

  try {
    const result = await notifyTool.execute({ message: responseText, connector });
    if (result.isError) {
      return {
        status: "failed",
        attemptedAt: Date.now(),
        error: result.content,
      };
    }
    return {
      status: "delivered",
      attemptedAt: Date.now(),
      error: null,
    };
  } catch {
    return {
      status: "failed",
      attemptedAt: Date.now(),
      error: "delivery failed",
    };
  }
}

export async function logAutomationResult(
  runtime: EngineRuntime,
  name: string,
  prompt: string,
  responseText: string,
  toolCalls: Array<{ name: string; content: string }>,
): Promise<void> {
  try {
    const autoDir = join(runtime.config.homeDir, "automation");
    await mkdir(autoDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const logContent = [
      `# ${name} — ${new Date().toISOString()}`,
      "## Prompt",
      prompt,
      "## Response",
      responseText || "(no response)",
      toolCalls.length > 0 ? "## Tool calls" : "",
      ...toolCalls.map((toolCall) => `- ${toolCall.name}: ${toolCall.content.slice(0, 200)}`),
    ].filter(Boolean).join("\n");
    await writeFile(join(autoDir, `${name}-${ts}.md`), logContent + "\n");
  } catch {
    // Log failure is non-fatal.
  }
}

export function registerCronTask(
  runtime: EngineRuntime,
  task: CronTask,
): void {
  upsertCronTaskRecord(runtime, task);
  runtime.scheduler.register({
    name: task.name,
    schedule: task.schedule,
    scheduleKind: task.scheduleKind,
    intervalMinutes: task.intervalMinutes,
    runAt: task.runAt,
    paused: task.paused,
    prompt: task.prompt,
    retryPolicy: task.retryPolicy,
    delivery: task.delivery,
    oneShot: task.oneShot,
    async handler() {
      const result = await runAutomationAgent(runtime, {
        taskId: resolveTaskId(task, "cron"),
        taskType: "cron",
        sessionPrefix: `cron:${task.name}`,
        connectorType: "cron",
        name: task.name,
        prompt: task.prompt,
        model: task.model,
        allowedTools: task.allowedTools,
        allowedToolsets: task.allowedToolsets,
        skills: task.skills,
        retryPolicy: task.retryPolicy,
        delivery: task.delivery,
      });

      await logAutomationResult(runtime, task.name, task.prompt, result.responseText, result.toolCalls);
      const lastRunAt = new Date().toISOString();
      const nextRunAt = computeNextRunAt({
        schedule: task.schedule,
        scheduleKind: task.scheduleKind,
        intervalMinutes: task.intervalMinutes,
        runAt: task.runAt,
        lastRunAt,
        oneShot: task.oneShot,
      });
      void updateCronTaskState(runtime, task.name, {
        lastRunAt,
        nextRunAt,
        lastStatus: result.status,
        lastSummary: result.summary,
      });
      upsertCronTaskRecord(runtime, {
        ...task,
        lastRunAt,
        nextRunAt,
        lastStatus: result.status,
        lastSummary: result.summary,
      });

      console.log(`[cron] Task "${task.name}" completed: ${result.summary}`);
      return { status: result.status, summary: result.summary };
    },
    onComplete: task.oneShot ? async (taskName) => {
      await removeCronTaskFromConfig(runtime, taskName);
    } : undefined,
  });
}

export async function persistCronTask(
  runtime: EngineRuntime,
  task: CronTask,
): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  automation.cronTasks = automation.cronTasks.filter((t) => t.name !== task.name);
  automation.cronTasks.push(task);
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
  upsertCronTaskRecord(runtime, task);
}

export async function removeCronTaskFromConfig(runtime: EngineRuntime, name: string): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  automation.cronTasks = automation.cronTasks.filter((t) => t.name !== name);
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
  deleteCronTaskRecord(runtime, name);
}

export async function updateCronTaskState(runtime: EngineRuntime, name: string, patch: Partial<CronTask>): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  let updatedTask: CronTask | undefined;
  automation.cronTasks = automation.cronTasks.map((task) => {
    if (task.name !== name) return task;
    updatedTask = { ...task, ...patch };
    return updatedTask;
  });
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
  if (updatedTask) {
    upsertCronTaskRecord(runtime, updatedTask);
  }
}
