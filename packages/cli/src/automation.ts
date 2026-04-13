import { ensureEngine } from "@aria/server/daemon";
import { createTuiClient } from "@aria/console/client.js";
import { CLI_NAME } from "@aria/server/brand";

function formatDateTime(value?: string | null): string {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} automation [list|runs [task]]\n`);
  console.log("Commands:");
  console.log("  list          Show durable automation tasks");
  console.log(
    "  runs [task]   Show recent automation runs, optionally filtered by task ID or task name",
  );
}

export async function automationCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "list";
  if (action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  await ensureEngine();
  const client = createTuiClient();

  if (action === "list") {
    const tasks = await client.automation.list.query();
    if (tasks.length === 0) {
      console.log("No automation tasks found.");
      return;
    }

    for (const task of tasks) {
      const status = task.paused ? "paused" : task.enabled ? "active" : "disabled";
      const slug = task.slug ? ` slug=${task.slug}` : "";
      const nextRun = formatDateTime(task.nextRunAt);
      const lastRun = formatDateTime(task.lastRunAt);
      const summary = task.lastSummary ? ` | ${task.lastSummary}` : "";
      console.log(`[${task.taskType}] ${task.name} (${status})${slug}`);
      console.log(
        `  id=${task.taskId} next=${nextRun} last=${lastRun} last_status=${task.lastStatus ?? "n/a"}${summary}`,
      );
    }
    return;
  }

  if (action === "runs") {
    const target = args[1];
    let taskId: string | undefined;

    if (target) {
      const tasks = await client.automation.list.query();
      const match = tasks.find(
        (task) => task.taskId.startsWith(target) || task.name === target || task.slug === target,
      );
      if (!match) {
        console.log(`No automation task matched: ${target}`);
        return;
      }
      taskId = match.taskId;
    }

    const runs = await client.automation.runs.query(taskId ? { taskId, limit: 20 } : { limit: 20 });
    if (runs.length === 0) {
      console.log("No automation runs found.");
      return;
    }

    for (const run of runs) {
      const attempts =
        run.maxAttempts > 1 ? ` attempt=${run.attemptNumber}/${run.maxAttempts}` : "";
      const delivery =
        run.deliveryStatus !== "not_requested"
          ? ` delivery=${run.deliveryStatus}${run.deliveryError ? ` (${run.deliveryError})` : ""}`
          : "";
      console.log(`[${run.taskType}] ${run.taskName} ${run.status}`);
      console.log(
        `  task=${run.taskId} run=${run.runId ?? "n/a"} session=${run.sessionId ?? "n/a"} started=${new Date(run.startedAt).toLocaleString()}${attempts}${delivery}`,
      );
      if (run.summary) {
        console.log(`  ${run.summary}`);
      } else if (run.errorMessage) {
        console.log(`  error: ${run.errorMessage}`);
      }
    }
    return;
  }

  printHelp();
  process.exit(1);
}
