import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl, ToolResult } from "@aria/agent";
import type { ProjectsEngineRepository } from "@aria/work";
import type { DispatchRecord, JobAuthor, JobRecord } from "@aria/jobs/types";

export interface ProjectsControlRunResult {
  executionSessionId: string;
  status: string;
  summary?: string | null;
}

export interface CreateProjectsControlToolOptions {
  getRepository: () => ProjectsEngineRepository | Promise<ProjectsEngineRepository>;
  runDispatch?: (
    repository: ProjectsEngineRepository,
    dispatchId: string,
  ) => Promise<ProjectsControlRunResult>;
}

function jsonResult(payload: unknown, isError = false): ToolResult {
  const result: ToolResult = {
    content: JSON.stringify(payload, null, 2),
  };
  if (isError) {
    result.isError = true;
  }
  return result;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveJob(
  repository: ProjectsEngineRepository,
  input: {
    threadId: string;
    jobId?: string | null;
    jobBody?: string | null;
    jobAuthor?: JobAuthor | null;
  },
): JobRecord | null {
  if (input.jobId) {
    const existing = repository.listJobs(input.threadId).find((job) => job.jobId === input.jobId);
    if (!existing) {
      throw new Error(`Project job not found on thread ${input.threadId}: ${input.jobId}`);
    }
    return existing;
  }

  if (!input.jobBody) {
    return null;
  }

  const now = Date.now();
  const job: JobRecord = {
    jobId: `job:${crypto.randomUUID()}`,
    threadId: input.threadId,
    author: input.jobAuthor ?? "agent",
    body: input.jobBody,
    createdAt: now,
  };
  repository.upsertJob(job);
  return job;
}

function buildTargetSummary(repository: ProjectsEngineRepository, threadId: string) {
  const thread = repository.getThread(threadId);
  const activeBinding = repository.getActiveThreadEnvironmentBinding(threadId);
  const workspaceId = activeBinding?.workspaceId ?? thread?.workspaceId ?? null;
  const environmentId = activeBinding?.environmentId ?? thread?.environmentId ?? null;
  const environment = environmentId ? repository.getEnvironment(environmentId) : undefined;
  const workspace = workspaceId ? repository.getWorkspace(workspaceId) : undefined;

  return {
    threadType: thread?.threadType ?? null,
    workspaceId,
    workspaceHost: workspace?.host ?? null,
    environmentId,
    environmentMode: environment?.mode ?? null,
    environmentKind: environment?.kind ?? null,
    environmentBindingId: activeBinding?.bindingId ?? thread?.environmentBindingId ?? null,
    activeBinding: activeBinding
      ? {
          bindingId: activeBinding.bindingId,
          isActive: activeBinding.isActive,
          workspaceId: activeBinding.workspaceId,
          environmentId: activeBinding.environmentId,
        }
      : null,
  };
}

function assertLocalBridgeIfNeeded(
  repository: ProjectsEngineRepository,
  threadId: string,
  target: ReturnType<typeof buildTargetSummary>,
): void {
  const isLocalTarget = target.threadType === "local_project" || target.environmentMode === "local";
  if (!isLocalTarget) {
    return;
  }

  const activeBinding = repository.getActiveThreadEnvironmentBinding(threadId);
  if (!activeBinding?.isActive) {
    throw new Error(
      `Local project execution requires an active environment bridge for thread ${threadId}`,
    );
  }
}

export function createProjectsControlTool(options: CreateProjectsControlToolOptions): ToolImpl {
  return {
    name: "projects_control",
    description:
      "Queue and optionally run Aria-managed project work through the server-owned Projects Control surface.",
    summary:
      "Manage project execution without leaving the Aria orchestration thread. Queues an Aria project dispatch, optionally runs it through the Aria runtime backend, and returns the dispatch, target, and execution summary.",
    dangerLevel: "moderate",
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([Type.Literal("queue_dispatch"), Type.Literal("queue_and_run")], {
          description:
            'Use "queue_dispatch" to create a dispatch or "queue_and_run" to execute it.',
        }),
      ),
      projectId: Type.String({ description: "Project id that owns the target thread." }),
      threadId: Type.String({ description: "Project thread id to dispatch work into." }),
      dispatchId: Type.Optional(
        Type.String({ description: "Optional caller-provided dispatch id." }),
      ),
      taskId: Type.Optional(Type.String({ description: "Optional task id override." })),
      repoId: Type.Optional(Type.String({ description: "Optional repo id override." })),
      worktreeId: Type.Optional(
        Type.String({ description: "Optional worktree id for execution." }),
      ),
      jobId: Type.Optional(Type.String({ description: "Existing project job id to dispatch." })),
      jobBody: Type.Optional(
        Type.String({ description: "Job body to create before dispatching." }),
      ),
      jobAuthor: Type.Optional(
        Type.Union(
          [
            Type.Literal("user"),
            Type.Literal("agent"),
            Type.Literal("system"),
            Type.Literal("external"),
          ],
          { description: "Author for a created job. Defaults to agent." },
        ),
      ),
    }),
    async execute(args) {
      try {
        const repository = await options.getRepository();
        const action =
          args.action === "queue_and_run" || args.action === "queue_dispatch"
            ? args.action
            : "queue_dispatch";
        const projectId = assertString(args.projectId, "projectId");
        const threadId = assertString(args.threadId, "threadId");
        const project = repository.getProject(projectId);
        if (!project) {
          throw new Error(`Project not found: ${projectId}`);
        }

        const thread = repository.getThread(threadId);
        if (!thread || thread.projectId !== projectId) {
          throw new Error(`Project thread not found: ${threadId}`);
        }

        const target = buildTargetSummary(repository, threadId);
        assertLocalBridgeIfNeeded(repository, threadId, target);

        const job = resolveJob(repository, {
          threadId,
          jobId: optionalString(args.jobId),
          jobBody: optionalString(args.jobBody),
          jobAuthor: (optionalString(args.jobAuthor) as JobAuthor | null) ?? null,
        });

        const now = Date.now();
        const dispatch: DispatchRecord = {
          dispatchId: optionalString(args.dispatchId) ?? `dispatch:${crypto.randomUUID()}`,
          projectId,
          taskId: optionalString(args.taskId) ?? thread.taskId ?? null,
          threadId,
          jobId: job?.jobId ?? null,
          repoId: optionalString(args.repoId) ?? thread.repoId ?? null,
          worktreeId: optionalString(args.worktreeId),
          status: "queued",
          requestedBackend: "aria",
          requestedModel: null,
          executionSessionId: null,
          summary: null,
          error: null,
          createdAt: now,
          acceptedAt: null,
          completedAt: null,
        };
        repository.upsertDispatch(dispatch);

        let run: ProjectsControlRunResult | null = null;
        if (action === "queue_and_run") {
          if (!options.runDispatch) {
            throw new Error("Project dispatch execution is not available in this runtime");
          }
          run = await options.runDispatch(repository, dispatch.dispatchId);
        }

        const refreshedDispatch = repository.getDispatch(dispatch.dispatchId) ?? dispatch;
        return jsonResult({
          action,
          projectId,
          threadId,
          jobId: job?.jobId ?? null,
          dispatch: refreshedDispatch,
          target,
          run,
        });
      } catch (error) {
        return jsonResult(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          true,
        );
      }
    },
  };
}
