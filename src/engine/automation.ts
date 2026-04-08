import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Agent } from "./agent/index.js";
import type { EngineRuntime } from "./runtime.js";
import { createSessionToolEnvironment } from "./session-tool-environment.js";
import { computeNextRunAt } from "./automation-schedule.js";
import { mergeAllowedTools } from "./toolsets.js";
import { CRON_DEFAULT_TOOLS, WEBHOOK_DEFAULT_TOOLS } from "./config/defaults.js";
import type { CronTask, DeliveryTarget } from "./config/types.js";

export interface AutomationTaskRunInput {
  sessionPrefix: string;
  connectorType: "cron" | "webhook";
  name: string;
  prompt: string;
  model?: string;
  allowedTools?: string[];
  allowedToolsets?: string[];
  skills?: string[];
}

export interface AutomationTaskRunResult {
  responseText: string;
  toolCalls: Array<{ name: string; content: string }>;
  status: "success" | "error";
  summary: string;
  sessionId: string;
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

export async function runAutomationAgent(
  runtime: EngineRuntime,
  task: AutomationTaskRunInput,
): Promise<AutomationTaskRunResult> {
  const session = runtime.sessions.create(task.sessionPrefix, task.connectorType);
  const defaultTools = task.connectorType === "webhook" ? WEBHOOK_DEFAULT_TOOLS : CRON_DEFAULT_TOOLS;
  const allowedTools = mergeAllowedTools(
    runtime.tools,
    task.allowedTools ?? defaultTools,
    task.allowedToolsets,
  ) ?? defaultTools;
  const toolEnvironment = createSessionToolEnvironment({
    baseTools: runtime.tools.filter((tool) => allowedTools.includes(tool.name)),
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

  try {
    for await (const event of agent.chat(task.prompt)) {
      if (event.type === "text_delta") {
        responseText += event.delta;
      }
      if (event.type === "tool_end") {
        toolCalls.push({ name: event.name, content: event.result.content });
      }
    }
  } catch (error) {
    status = "error";
    responseText = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    runtime.store.syncSessionMessages(session.id, agent.getMessages());
    await runtime.archive.syncSession(session, agent.getMessages());
    runtime.sessions.destroySession(session.id);
  }

  return {
    sessionId: session.id,
    responseText,
    toolCalls,
    status,
    summary: responseText.slice(0, 200) || "(no response)",
  };
}

export async function deliverAutomationResult(
  runtime: EngineRuntime,
  delivery: DeliveryTarget | undefined,
  responseText: string,
  fallbackConnector?: string,
): Promise<void> {
  const connector = delivery?.connector ?? fallbackConnector;
  if (!connector || !responseText.trim()) {
    return;
  }

  const notifyTool = runtime.tools.find((tool) => tool.name === "notify");
  if (!notifyTool) return;

  try {
    await notifyTool.execute({ message: responseText, connector });
  } catch {
    // Delivery failure is non-fatal.
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
  runtime.scheduler.register({
    name: task.name,
    schedule: task.schedule,
    scheduleKind: task.scheduleKind,
    intervalMinutes: task.intervalMinutes,
    runAt: task.runAt,
    paused: task.paused,
    prompt: task.prompt,
    oneShot: task.oneShot,
    async handler() {
      const result = await runAutomationAgent(runtime, {
        sessionPrefix: `cron:${task.name}`,
        connectorType: "cron",
        name: task.name,
        prompt: task.prompt,
        model: task.model,
        allowedTools: task.allowedTools,
        allowedToolsets: task.allowedToolsets,
        skills: task.skills,
      });

      await logAutomationResult(runtime, task.name, task.prompt, result.responseText, result.toolCalls);
      await deliverAutomationResult(runtime, task.delivery, result.responseText);
      const lastRunAt = new Date().toISOString();
      void updateCronTaskState(runtime, task.name, {
        lastRunAt,
        nextRunAt: computeNextRunAt({
          schedule: task.schedule,
          scheduleKind: task.scheduleKind,
          intervalMinutes: task.intervalMinutes,
          runAt: task.runAt,
          lastRunAt,
          oneShot: task.oneShot,
        }),
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
}

export async function removeCronTaskFromConfig(runtime: EngineRuntime, name: string): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  automation.cronTasks = automation.cronTasks.filter((t) => t.name !== name);
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
}

export async function updateCronTaskState(runtime: EngineRuntime, name: string, patch: Partial<CronTask>): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  automation.cronTasks = automation.cronTasks.map((task) => (
    task.name === name ? { ...task, ...patch } : task
  ));
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
}
