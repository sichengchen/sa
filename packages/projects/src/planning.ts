import { randomUUID } from "node:crypto";
import type { ProjectsEngineRepository } from "./repository.js";
import type { ProjectRecord, TaskRecord, ThreadRecord } from "./types.js";
import type { DispatchRecord } from "@aria/jobs/types";
import type { RepoRecord } from "@aria/workspaces/types";
import {
  getDispatchBlockers,
  getTaskBlockers,
  getThreadBlockers,
  hasActiveDispatch,
  isActiveDispatchStatus,
  isRunnableThreadStatus,
} from "./blockers.js";

export interface PlanningFilter {
  projectId?: string;
  repoId?: string;
  limit?: number;
}

export interface RunnableTaskPlan {
  task: TaskRecord;
  blockers: ReturnType<typeof getTaskBlockers>;
}

export interface RunnableThreadPlan {
  thread: ThreadRecord;
  task?: TaskRecord;
  dispatches: DispatchRecord[];
  blockers: ReturnType<typeof getThreadBlockers>;
}

export interface RunnableDispatchPlan {
  dispatch: DispatchRecord;
  thread?: ThreadRecord;
  task?: TaskRecord;
  blockers: ReturnType<typeof getDispatchBlockers>;
}

export interface QueueDispatchResult {
  queued: DispatchRecord[];
  selectedThreads: RunnableThreadPlan[];
  selectedDispatches: RunnableDispatchPlan[];
}

export interface PlanningClock {
  now(): number;
}

function pickLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(limit);
}

function compareByWorkPriority(
  left: { thread: ThreadRecord; task?: TaskRecord },
  right: { thread: ThreadRecord; task?: TaskRecord },
): number {
  const leftThreadPriority = left.thread.status === "dirty" ? 0 : 1;
  const rightThreadPriority = right.thread.status === "dirty" ? 0 : 1;
  if (leftThreadPriority !== rightThreadPriority) {
    return leftThreadPriority - rightThreadPriority;
  }

  const leftTaskPriority = left.task?.status === "ready" ? 0 : 1;
  const rightTaskPriority = right.task?.status === "ready" ? 0 : 1;
  if (leftTaskPriority !== rightTaskPriority) {
    return leftTaskPriority - rightTaskPriority;
  }

  if (left.thread.createdAt !== right.thread.createdAt) {
    return left.thread.createdAt - right.thread.createdAt;
  }

  return left.thread.threadId.localeCompare(right.thread.threadId);
}

function compareQueuedDispatches(left: DispatchRecord, right: DispatchRecord): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt - right.createdAt;
  }
  return left.dispatchId.localeCompare(right.dispatchId);
}

function resolveThreadForPlanning(
  repository: ProjectsEngineRepository,
  thread: ThreadRecord,
): ThreadRecord {
  const activeBinding = repository.getActiveThreadEnvironmentBinding(thread.threadId);
  if (!activeBinding) {
    return thread;
  }

  return {
    ...thread,
    workspaceId: activeBinding.workspaceId,
    environmentId: activeBinding.environmentId,
    environmentBindingId: activeBinding.bindingId,
  };
}

export class ProjectsPlanningService {
  constructor(
    private readonly repository: ProjectsEngineRepository,
    private readonly clock: PlanningClock = { now: () => Date.now() },
  ) {}

  listRunnableTasks(filter: PlanningFilter = {}): RunnableTaskPlan[] {
    const tasks = this.repository.listTasks(filter.projectId, filter.repoId);
    const plans = tasks
      .map((task) => ({
        task,
        blockers: getTaskBlockers(task, this.repository.listDispatches(undefined, task.taskId)),
      }))
      .filter((plan) => plan.blockers.length === 0)
      .sort((left, right) => {
        if (left.task.updatedAt !== right.task.updatedAt) {
          return left.task.updatedAt - right.task.updatedAt;
        }
        return left.task.taskId.localeCompare(right.task.taskId);
      });

    return plans.slice(0, pickLimit(filter.limit));
  }

  listRunnableThreads(filter: PlanningFilter = {}): RunnableThreadPlan[] {
    const threads = this.repository.listThreads(filter.projectId);
    const plans = threads
      .filter((thread) => !filter.repoId || thread.repoId === filter.repoId)
      .map((thread) => {
        const resolvedThread = resolveThreadForPlanning(this.repository, thread);
        const task = resolvedThread.taskId
          ? this.repository.getTask(resolvedThread.taskId)
          : undefined;
        const dispatches = this.repository.listDispatches(
          resolvedThread.threadId,
          resolvedThread.taskId ?? undefined,
        );
        return {
          thread: resolvedThread,
          task,
          dispatches,
          blockers: getThreadBlockers(resolvedThread, task, dispatches),
        };
      })
      .filter((plan) => plan.blockers.length === 0 && isRunnableThreadStatus(plan.thread.status));

    plans.sort(compareByWorkPriority);
    return plans.slice(0, pickLimit(filter.limit));
  }

  listRunnableDispatches(filter: PlanningFilter = {}): RunnableDispatchPlan[] {
    const dispatches = this.repository
      .listDispatches()
      .filter((dispatch) => isActiveDispatchStatus(dispatch.status))
      .filter((dispatch) => {
        if (filter.projectId && dispatch.projectId !== filter.projectId) {
          return false;
        }
        if (filter.repoId && dispatch.repoId !== filter.repoId) {
          return false;
        }
        return true;
      });

    const plans = dispatches
      .map((dispatch) => {
        const thread = this.repository.getThread(dispatch.threadId);
        const resolvedThread = thread
          ? resolveThreadForPlanning(this.repository, thread)
          : undefined;
        const task = dispatch.taskId
          ? this.repository.getTask(dispatch.taskId)
          : resolvedThread?.taskId
            ? this.repository.getTask(resolvedThread.taskId)
            : undefined;
        const siblingDispatches = this.repository.listDispatches(
          dispatch.threadId,
          dispatch.taskId ?? resolvedThread?.taskId ?? undefined,
        );
        return {
          dispatch,
          thread: resolvedThread,
          task,
          blockers: getDispatchBlockers(dispatch, resolvedThread, task, siblingDispatches),
        };
      })
      .filter((plan) => plan.blockers.length === 0)
      .sort((left, right) => compareQueuedDispatches(left.dispatch, right.dispatch));

    return plans.slice(0, pickLimit(filter.limit));
  }

  queueNextRunnableDispatches(filter: PlanningFilter = {}): QueueDispatchResult {
    const limit = pickLimit(filter.limit);
    const queued: DispatchRecord[] = [];
    const selectedThreads: RunnableThreadPlan[] = [];
    const selectedDispatches: RunnableDispatchPlan[] = [];

    for (const plan of this.listRunnableDispatches(filter)) {
      if (queued.length >= limit) break;
      queued.push(plan.dispatch);
      selectedDispatches.push(plan);
    }

    if (queued.length >= limit) {
      return { queued, selectedThreads, selectedDispatches };
    }

    const runnableThreads = this.listRunnableThreads(filter);
    for (const plan of runnableThreads) {
      if (queued.length >= limit) break;

      const hasQueuedOrActiveDispatch = plan.dispatches.some((dispatch) =>
        isActiveDispatchStatus(dispatch.status),
      );
      if (hasQueuedOrActiveDispatch || hasActiveDispatch(plan.dispatches)) {
        continue;
      }

      const dispatch: DispatchRecord = {
        dispatchId: randomUUID(),
        projectId: plan.thread.projectId,
        taskId: plan.thread.taskId ?? null,
        threadId: plan.thread.threadId,
        jobId: null,
        repoId: plan.thread.repoId ?? plan.task?.repoId ?? null,
        worktreeId: null,
        status: "queued",
        requestedBackend: null,
        requestedModel: null,
        executionSessionId: null,
        summary: null,
        error: null,
        createdAt: this.clock.now(),
        acceptedAt: null,
        completedAt: null,
      };

      this.repository.upsertDispatch(dispatch);
      this.repository.upsertThread({
        ...plan.thread,
        status: "queued",
        updatedAt: this.clock.now(),
      });

      queued.push(dispatch);
      selectedThreads.push(plan);
    }

    return { queued, selectedThreads, selectedDispatches };
  }

  getProjectRunnableSummary(filter: PlanningFilter = {}): {
    project?: ProjectRecord;
    repos: RepoRecord[];
    tasks: RunnableTaskPlan[];
    threads: RunnableThreadPlan[];
    dispatches: RunnableDispatchPlan[];
  } {
    const project = filter.projectId ? this.repository.getProject(filter.projectId) : undefined;
    return {
      project,
      repos: this.repository.listRepos(filter.projectId),
      tasks: this.listRunnableTasks(filter),
      threads: this.listRunnableThreads(filter),
      dispatches: this.listRunnableDispatches(filter),
    };
  }
}

export {
  getDispatchBlockers,
  getTaskBlockers,
  getThreadBlockers,
  hasActiveDispatch,
  isActiveDispatchStatus,
  isRunnableTaskStatus,
  isRunnableThreadStatus,
  isTerminalDispatchStatus,
  isTerminalTaskStatus,
  isTerminalThreadStatus,
  type ProjectBlocker,
  type ProjectBlockerKind,
} from "./blockers.js";
