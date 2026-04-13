import type { TaskRecord, TaskStatus, ThreadRecord, ThreadStatus } from "./types.js";
import type { DispatchRecord, DispatchStatus } from "@aria/jobs/types";

export type ProjectBlockerKind =
  | "task_not_ready"
  | "task_blocked"
  | "task_terminal"
  | "task_has_active_dispatch"
  | "thread_blocked"
  | "thread_terminal"
  | "thread_has_active_dispatch"
  | "thread_task_not_ready"
  | "dispatch_not_queued"
  | "dispatch_thread_blocked"
  | "dispatch_thread_terminal"
  | "dispatch_thread_has_active_dispatch"
  | "dispatch_task_not_ready"
  | "dispatch_terminal";

export interface ProjectBlocker {
  kind: ProjectBlockerKind;
  entityType: "task" | "thread" | "dispatch";
  entityId: string;
  message: string;
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === "done" || status === "cancelled";
}

export function isRunnableTaskStatus(status: TaskStatus): boolean {
  return status === "ready";
}

export function isTerminalThreadStatus(status: ThreadStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

export function isRunnableThreadStatus(status: ThreadStatus): boolean {
  return status === "idle" || status === "dirty";
}

export function isActiveDispatchStatus(status: DispatchStatus): boolean {
  return (
    status === "queued" ||
    status === "accepted" ||
    status === "running" ||
    status === "waiting_approval"
  );
}

export function isTerminalDispatchStatus(status: DispatchStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function hasActiveDispatch(dispatches: ReadonlyArray<DispatchRecord>): boolean {
  return dispatches.some((dispatch) => isActiveDispatchStatus(dispatch.status));
}

export function getTaskBlockers(
  task: TaskRecord,
  dispatches: ReadonlyArray<DispatchRecord> = [],
): ProjectBlocker[] {
  const blockers: ProjectBlocker[] = [];

  if (task.status === "blocked") {
    blockers.push({
      kind: "task_blocked",
      entityType: "task",
      entityId: task.taskId,
      message: "Task is blocked.",
    });
  } else if (!isRunnableTaskStatus(task.status)) {
    blockers.push({
      kind: isTerminalTaskStatus(task.status) ? "task_terminal" : "task_not_ready",
      entityType: "task",
      entityId: task.taskId,
      message:
        task.status === "in_progress"
          ? "Task is already in progress."
          : "Task is not ready to run.",
    });
  }

  if (hasActiveDispatch(dispatches)) {
    blockers.push({
      kind: "task_has_active_dispatch",
      entityType: "task",
      entityId: task.taskId,
      message: "Task already has an active dispatch.",
    });
  }

  return blockers;
}

export function getThreadBlockers(
  thread: ThreadRecord,
  task?: TaskRecord,
  dispatches: ReadonlyArray<DispatchRecord> = [],
): ProjectBlocker[] {
  const blockers: ProjectBlocker[] = [];

  if (thread.status === "blocked") {
    blockers.push({
      kind: "thread_blocked",
      entityType: "thread",
      entityId: thread.threadId,
      message: "Thread is blocked.",
    });
  } else if (!isRunnableThreadStatus(thread.status)) {
    blockers.push({
      kind: "thread_terminal",
      entityType: "thread",
      entityId: thread.threadId,
      message:
        thread.status === "running" || thread.status === "queued"
          ? "Thread is already active."
          : "Thread is finished and cannot be scheduled.",
    });
  }

  if (task && !isRunnableTaskStatus(task.status)) {
    blockers.push({
      kind: "thread_task_not_ready",
      entityType: "thread",
      entityId: thread.threadId,
      message: `Task is ${task.status}.`,
    });
  }

  if (hasActiveDispatch(dispatches)) {
    blockers.push({
      kind: "thread_has_active_dispatch",
      entityType: "thread",
      entityId: thread.threadId,
      message: "Thread already has an active dispatch.",
    });
  }

  return blockers;
}

export function getDispatchBlockers(
  dispatch: DispatchRecord,
  thread?: ThreadRecord,
  task?: TaskRecord,
  siblingDispatches: ReadonlyArray<DispatchRecord> = [],
): ProjectBlocker[] {
  const blockers: ProjectBlocker[] = [];

  if (dispatch.status !== "queued") {
    blockers.push({
      kind: "dispatch_not_queued",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: "Dispatch is not queued.",
    });
  }

  if (
    dispatch.status === "completed" ||
    dispatch.status === "failed" ||
    dispatch.status === "cancelled"
  ) {
    blockers.push({
      kind: "dispatch_terminal",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: "Dispatch is finished.",
    });
  }

  if (thread && thread.status === "blocked") {
    blockers.push({
      kind: "dispatch_thread_blocked",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: "Thread is blocked.",
    });
  } else if (thread && isTerminalThreadStatus(thread.status)) {
    blockers.push({
      kind: "dispatch_thread_terminal",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: "Thread is finished.",
    });
  } else if (
    thread &&
    !isRunnableThreadStatus(thread.status) &&
    thread.status !== "queued" &&
    thread.status !== "running"
  ) {
    blockers.push({
      kind: "dispatch_thread_has_active_dispatch",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: "Thread is not in a runnable state.",
    });
  }

  if (task && !isRunnableTaskStatus(task.status)) {
    blockers.push({
      kind: "dispatch_task_not_ready",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: `Task is ${task.status}.`,
    });
  }

  if (
    siblingDispatches.some(
      (item) => item.dispatchId !== dispatch.dispatchId && isActiveDispatchStatus(item.status),
    )
  ) {
    blockers.push({
      kind: "dispatch_thread_has_active_dispatch",
      entityType: "dispatch",
      entityId: dispatch.dispatchId,
      message: "Thread already has another active dispatch.",
    });
  }

  return blockers;
}
