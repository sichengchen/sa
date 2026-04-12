import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CLI_NAME, getRuntimeHome } from "@aria/server/brand";
import { ProjectsDispatchService, listRuntimeBackends, runDispatchExecution } from "@aria/jobs";
import {
  THREAD_TYPES,
  describeThreadType,
  ProjectsEngineRepository,
  ProjectsEngineStore,
  ProjectsPlanningService,
  ProjectsPublishService,
  ProjectsReviewService,
  resolveThreadType,
  type ThreadEnvironmentBindingRecord,
  type ThreadStatus,
  type ThreadType,
  type ThreadRecord,
} from "@aria/projects";
import { ProjectsWorktreeService } from "@aria/workspaces";
import { HandoffService, HandoffStore } from "@aria/handoff";
import { createRuntime } from "@aria/runtime";

const THREAD_TYPE_SET = new Set<ThreadType>(THREAD_TYPES);

interface ThreadCreateOptions {
  threadId: string;
  projectId: string;
  title: string;
  status?: ThreadStatus;
  threadType?: ThreadType;
  taskId?: string | null;
  repoId?: string | null;
  workspaceId?: string | null;
  environmentId?: string | null;
  environmentBindingId?: string | null;
  agentId?: string | null;
}

function isThreadType(value: string | undefined): value is ThreadType {
  return Boolean(value && THREAD_TYPE_SET.has(value as ThreadType));
}

function formatThreadSummary(
  thread: ThreadRecord,
  activeBinding?: ThreadEnvironmentBindingRecord,
): string {
  const details = [
    thread.threadId,
    `[${thread.status}]`,
    `[${describeThreadType(resolveThreadType(thread))}]`,
    thread.title,
  ];
  const metadata: string[] = [];
  if (thread.projectId) metadata.push(`project=${thread.projectId}`);
  if (thread.taskId) metadata.push(`task=${thread.taskId}`);
  if (thread.repoId) metadata.push(`repo=${thread.repoId}`);
  if (thread.workspaceId) metadata.push(`workspace=${thread.workspaceId}`);
  if (thread.environmentId) metadata.push(`environment=${thread.environmentId}`);
  if (thread.environmentBindingId) metadata.push(`binding=${thread.environmentBindingId}`);
  if (thread.agentId) metadata.push(`agent=${thread.agentId}`);
  if (activeBinding?.bindingId && activeBinding.bindingId !== thread.environmentBindingId) {
    metadata.push(`active-binding=${activeBinding.bindingId}`);
  }
  return metadata.length > 0 ? `${details.join("  ")}  ${metadata.join("  ")}` : details.join("  ");
}

function formatBindingSummary(binding: ThreadEnvironmentBindingRecord): string {
  const metadata = [
    `thread=${binding.threadId}`,
    `project=${binding.projectId}`,
    `workspace=${binding.workspaceId}`,
    `environment=${binding.environmentId}`,
    `attached=${binding.attachedAt}`,
    `detached=${binding.detachedAt ?? "n/a"}`,
  ];
  if (binding.reason) {
    metadata.push(`reason=${binding.reason}`);
  }
  return `${binding.bindingId}  [${binding.isActive ? "active" : "inactive"}]  ${metadata.join("  ")}`;
}

function parseThreadCreateOptions(args: string[]): ThreadCreateOptions | null {
  const [threadId, projectId, ...rest] = args;
  if (!threadId || !projectId) {
    return null;
  }

  const titleParts: string[] = [];
  const options: Partial<ThreadCreateOptions> = {};
  let parsingOptions = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!parsingOptions && !arg.startsWith("--")) {
      titleParts.push(arg);
      continue;
    }

    parsingOptions = true;
    switch (arg) {
      case "--status": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.status = value as ThreadStatus;
        break;
      }
      case "--type": {
        const threadType = rest[++index];
        if (!isThreadType(threadType)) {
          return null;
        }
        options.threadType = threadType;
        break;
      }
      case "--task": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.taskId = value;
        break;
      }
      case "--repo": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.repoId = value;
        break;
      }
      case "--workspace": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.workspaceId = value;
        break;
      }
      case "--environment": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.environmentId = value;
        break;
      }
      case "--binding": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.environmentBindingId = value;
        break;
      }
      case "--agent": {
        const value = rest[++index];
        if (!value) {
          return null;
        }
        options.agentId = value;
        break;
      }
      default:
        return null;
    }
  }

  const title = titleParts.join(" ").trim();
  if (!title) {
    return null;
  }

  return {
    threadId,
    projectId,
    title,
    status: options.status,
    threadType: options.threadType,
    taskId: options.taskId ?? undefined,
    repoId: options.repoId ?? undefined,
    workspaceId: options.workspaceId ?? undefined,
    environmentId: options.environmentId ?? undefined,
    environmentBindingId: options.environmentBindingId ?? undefined,
    agentId: options.agentId ?? undefined,
  };
}

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} projects <subcommand>\n`);
  console.log("Subcommands:");
  console.log("  projects               List tracked projects");
  console.log("  project-create <projectId> <slug> <name>  Create or update a tracked project");
  console.log("  repos [projectId]      List tracked repos, optionally filtered by project");
  console.log("  repo-register <repoId> <projectId> <name> <remoteUrl> [branch]  Register a repo");
  console.log("  tasks [projectId]      List tracked tasks, optionally filtered by project");
  console.log("  task-create <taskId> <projectId> <title>  Create or update a task");
  console.log("  task-status <taskId> <status>  Update a task status");
  console.log("  threads [projectId]    List tracked threads, optionally filtered by project");
  console.log("  thread-create <threadId> <projectId> <title...> [--type <threadType>] [--status <status>] [--workspace <workspaceId>] [--environment <environmentId>] [--binding <bindingId>] [--agent <agentId>]  Create or update a thread");
  console.log("  thread-bind <bindingId> <threadId> <projectId> <workspaceId> <environmentId> [reason]  Create or update an environment binding");
  console.log("  thread-bindings [threadId]  List tracked thread environment bindings");
  console.log("  job-add <threadId> <author> <body>  Append a job/event to a thread");
  console.log("  dispatches [threadId]  List dispatch records, optionally filtered by thread");
  console.log("  dispatch-create <dispatchId> <projectId> <threadId> [backend]  Create a queued dispatch");
  console.log("  worktrees [repoId]     List tracked worktrees, optionally filtered by repo");
  console.log("  worktree-register <worktreeId> <repoId> <path> <branch> [threadId]  Register a worktree");
  console.log("  worktree-retain <worktreeId> [expiresAtMs]  Mark a worktree retained");
  console.log("  worktree-prune <worktreeId>  Mark a worktree pruned");
  console.log("  reviews [threadId]     List review records, optionally filtered by thread");
  console.log("  review-create <dispatchId> <threadId> <type> [summary]  Create a review record");
  console.log("  review-resolve <reviewId> <status> [summary]  Resolve a review record");
  console.log("  publish-runs [threadId]  List publish runs, optionally filtered by thread");
  console.log("  publish-create <dispatchId> <threadId> <repoId> <branch> [remote]  Create a publish run");
  console.log("  publish-complete <publishRunId> <status> [commitSha] [prUrl]  Complete a publish run");
  console.log("  refs [ownerId]         List external refs, optionally filtered by owner");
  console.log("  handoffs [projectId]   List handoff records, optionally filtered by project");
  console.log("  handoff-process <handoffId>  Materialize a handoff into thread/job/dispatch records");
  console.log("  runnable [projectId]   Show runnable threads and dispatches");
  console.log("  queue [projectId] [n]  Queue up to n runnable dispatches");
  console.log("  backends              List runtime backend availability and capabilities");
  console.log("  run-dispatch <id>      Execute a queued dispatch through Runtime");
  console.log("  handoff-submit <projectId> <key> <payload>  Create an idempotent handoff record");
}

async function withRepository<T>(fn: (repository: ProjectsEngineRepository) => Promise<T> | T): Promise<T> {
  const dbPath = join(getRuntimeHome(), "aria.db");
  const store = new ProjectsEngineStore(dbPath);
  await store.init();
  const repository = new ProjectsEngineRepository(store);
  try {
    return await fn(repository);
  } finally {
    repository.close();
  }
}

export async function projectsCommand(args: string[]): Promise<void> {
  const action = args[0] ?? "projects";
  if (action === "--help" || action === "-h" || action === "help") {
    printHelp();
    return;
  }

  await withRepository(async (repository) => {
    if (action === "project-create") {
      const [projectId, slug, ...nameParts] = args.slice(1);
      const name = nameParts.join(" ").trim();
      if (!projectId || !slug || !name) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const existing = repository.getProject(projectId);
      const now = Date.now();
      repository.upsertProject({
        projectId,
        slug,
        name,
        description: existing?.description ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      console.log(`Saved project ${projectId}.`);
      return;
    }

    if (action === "repos") {
      const projectId = args[1];
      const repos = repository.listRepos(projectId);
      if (repos.length === 0) {
        console.log("No tracked repos found.");
        return;
      }
      for (const repo of repos) {
        console.log(`${repo.repoId}  ${repo.name}  branch=${repo.defaultBranch}`);
      }
      return;
    }

    if (action === "repo-register") {
      const [repoId, projectId, name, remoteUrl, defaultBranch = "main"] = args.slice(1);
      if (!repoId || !projectId || !name || !remoteUrl) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const now = Date.now();
      const existing = repository.getRepo(repoId);
      repository.upsertRepo({
        repoId,
        projectId,
        name,
        remoteUrl,
        defaultBranch,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      console.log(`Registered repo ${repoId}.`);
      return;
    }

    if (action === "projects") {
      const projects = repository.listProjects();
      if (projects.length === 0) {
        console.log("No tracked projects found.");
        return;
      }
      for (const project of projects) {
        console.log(`${project.projectId}  ${project.slug}  ${project.name}`);
      }
      return;
    }

    if (action === "tasks") {
      const projectId = args[1];
      const tasks = repository.listTasks(projectId);
      if (tasks.length === 0) {
        console.log("No tracked tasks found.");
        return;
      }
      for (const task of tasks) {
        console.log(`${task.taskId}  [${task.status}]  ${task.title}`);
      }
      return;
    }

    if (action === "task-create") {
      const [taskId, projectId, ...titleParts] = args.slice(1);
      const title = titleParts.join(" ").trim();
      if (!taskId || !projectId || !title) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const existing = repository.getTask(taskId);
      const now = Date.now();
      repository.upsertTask({
        taskId,
        projectId,
        repoId: existing?.repoId ?? null,
        title,
        description: existing?.description ?? null,
        status: existing?.status ?? "backlog",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      console.log(`Saved task ${taskId}.`);
      return;
    }

    if (action === "task-status") {
      const [taskId, status] = args.slice(1);
      const existing = taskId ? repository.getTask(taskId) : undefined;
      if (!existing || !status) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      repository.upsertTask({
        ...existing,
        status: status as typeof existing.status,
        updatedAt: Date.now(),
      });
      console.log(`Updated task ${taskId} to ${status}.`);
      return;
    }

    if (action === "threads") {
      const projectId = args[1];
      const threads = repository.listThreads(projectId);
      if (threads.length === 0) {
        console.log("No tracked threads found.");
        return;
      }
      for (const thread of threads) {
        const activeBinding = repository.getActiveThreadEnvironmentBinding(thread.threadId);
        console.log(formatThreadSummary(thread, activeBinding));
      }
      return;
    }

    if (action === "thread-create") {
      const parsed = parseThreadCreateOptions(args.slice(1));
      if (!parsed) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const existing = repository.getThread(parsed.threadId);
      const now = Date.now();
      repository.upsertThread({
        threadId: parsed.threadId,
        projectId: parsed.projectId,
        taskId: parsed.taskId ?? existing?.taskId ?? null,
        repoId: parsed.repoId ?? existing?.repoId ?? null,
        title: parsed.title,
        status: parsed.status ?? existing?.status ?? "idle",
        threadType: parsed.threadType ?? existing?.threadType ?? null,
        workspaceId: parsed.workspaceId ?? existing?.workspaceId ?? null,
        environmentId: parsed.environmentId ?? existing?.environmentId ?? null,
        environmentBindingId: parsed.environmentBindingId ?? existing?.environmentBindingId ?? null,
        agentId: parsed.agentId ?? existing?.agentId ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      console.log(`Saved thread ${parsed.threadId}.`);
      return;
    }

    if (action === "thread-bind") {
      const [bindingId, threadId, projectId, workspaceId, environmentId, ...reasonParts] = args.slice(1);
      const reason = reasonParts.join(" ").trim() || null;
      if (!bindingId || !threadId || !projectId || !workspaceId || !environmentId) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const thread = repository.getThread(threadId);
      if (!thread) {
        console.log(`Thread not found: ${threadId}`);
        process.exitCode = 1;
        return;
      }
      const now = Date.now();
      repository.upsertThreadEnvironmentBinding({
        bindingId,
        threadId,
        projectId,
        workspaceId,
        environmentId,
        attachedAt: now,
        detachedAt: null,
        isActive: true,
        reason,
      });
      repository.upsertThread({
        ...thread,
        projectId: projectId ?? thread.projectId,
        workspaceId,
        environmentId,
        environmentBindingId: bindingId,
        updatedAt: now,
      });
      console.log(`Saved environment binding ${bindingId}.`);
      return;
    }

    if (action === "thread-bindings") {
      const threadId = args[1];
      const bindings = repository.listThreadEnvironmentBindings(threadId);
      if (bindings.length === 0) {
        console.log("No tracked thread environment bindings found.");
        return;
      }
      for (const binding of bindings) {
        console.log(formatBindingSummary(binding));
      }
      return;
    }

    if (action === "job-add") {
      const [threadId, author, ...bodyParts] = args.slice(1);
      const body = bodyParts.join(" ").trim();
      if (!threadId || !author || !body) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      repository.upsertJob({
        jobId: randomUUID(),
        threadId,
        author: author as "user" | "agent" | "system" | "external",
        body,
        createdAt: Date.now(),
      });
      console.log(`Added job to ${threadId}.`);
      return;
    }

    if (action === "dispatches") {
      const threadId = args[1];
      const dispatches = repository.listDispatches(threadId);
      if (dispatches.length === 0) {
        console.log("No dispatch records found.");
        return;
      }
      for (const dispatch of dispatches) {
        console.log(`${dispatch.dispatchId}  [${dispatch.status}]  thread=${dispatch.threadId} execution=${dispatch.executionSessionId ?? "n/a"}`);
      }
      return;
    }

    if (action === "dispatch-create") {
      const [dispatchId, projectId, threadId, requestedBackend] = args.slice(1);
      if (!dispatchId || !projectId || !threadId) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const thread = repository.getThread(threadId);
      const dispatchService = new ProjectsDispatchService(repository);
      dispatchService.queueDispatch({
        dispatchId,
        projectId,
        taskId: thread?.taskId ?? null,
        threadId,
        jobId: null,
        repoId: thread?.repoId ?? null,
        worktreeId: null,
        status: "queued",
        requestedBackend: requestedBackend ?? null,
        requestedModel: null,
        executionSessionId: null,
        summary: null,
        error: null,
        createdAt: Date.now(),
        acceptedAt: null,
        completedAt: null,
      });
      console.log(`Created dispatch ${dispatchId}.`);
      return;
    }

    if (action === "worktrees") {
      const repoId = args[1];
      const worktrees = repository.listWorktrees(repoId);
      if (worktrees.length === 0) {
        console.log("No tracked worktrees found.");
        return;
      }
      for (const worktree of worktrees) {
        console.log(`${worktree.worktreeId}  [${worktree.status}]  ${worktree.branchName}  ${worktree.path}`);
      }
      return;
    }

    if (action === "worktree-register") {
      const [worktreeId, repoId, path, branchName, threadId] = args.slice(1);
      if (!worktreeId || !repoId || !path || !branchName) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const service = new ProjectsWorktreeService(repository);
      service.registerWorktree({
        worktreeId,
        repoId,
        threadId: threadId ?? null,
        dispatchId: null,
        path,
        branchName,
        baseRef: repository.getRepo(repoId)?.defaultBranch ?? "main",
        status: "active",
        createdAt: Date.now(),
        expiresAt: null,
        prunedAt: null,
      });
      console.log(`Registered worktree ${worktreeId}.`);
      return;
    }

    if (action === "worktree-retain") {
      const worktreeId = args[1];
      const expiresAt = args[2] ? Number(args[2]) : null;
      if (!worktreeId) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      new ProjectsWorktreeService(repository).markRetained(worktreeId, Number.isFinite(expiresAt) ? expiresAt : null);
      console.log(`Retained worktree ${worktreeId}.`);
      return;
    }

    if (action === "worktree-prune") {
      const worktreeId = args[1];
      if (!worktreeId) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      new ProjectsWorktreeService(repository).markPruned(worktreeId);
      console.log(`Pruned worktree ${worktreeId}.`);
      return;
    }

    if (action === "reviews") {
      const threadId = args[1];
      const reviews = repository.listReviews(threadId);
      if (reviews.length === 0) {
        console.log("No review records found.");
        return;
      }
      for (const review of reviews) {
        console.log(`${review.reviewId}  [${review.status}]  dispatch=${review.dispatchId}  type=${review.reviewType}`);
      }
      return;
    }

    if (action === "review-create") {
      const [dispatchId, threadId, reviewType, ...summaryParts] = args.slice(1);
      if (!dispatchId || !threadId || !reviewType) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const review = new ProjectsReviewService(repository).createReview({
        dispatchId,
        threadId,
        reviewType: reviewType as "self" | "human" | "external",
        summary: summaryParts.join(" ").trim() || null,
      });
      console.log(`Created review ${review.reviewId}.`);
      return;
    }

    if (action === "review-resolve") {
      const [reviewId, status, ...summaryParts] = args.slice(1);
      if (!reviewId || !status) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const review = new ProjectsReviewService(repository).resolveReview({
        reviewId,
        status: status as "pending" | "changes_requested" | "approved" | "dismissed",
        summary: summaryParts.join(" ").trim() || null,
      });
      console.log(`Resolved review ${review.reviewId} as ${review.status}.`);
      return;
    }

    if (action === "publish-runs") {
      const threadId = args[1];
      const publishRuns = repository.listPublishRuns(threadId);
      if (publishRuns.length === 0) {
        console.log("No publish runs found.");
        return;
      }
      for (const publishRun of publishRuns) {
        console.log(`${publishRun.publishRunId}  [${publishRun.status}]  branch=${publishRun.branchName}  pr=${publishRun.prUrl ?? "n/a"}`);
      }
      return;
    }

    if (action === "publish-create") {
      const [dispatchId, threadId, repoId, branchName, remoteName = "origin"] = args.slice(1);
      if (!dispatchId || !threadId || !repoId || !branchName) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const publishRun = new ProjectsPublishService(repository).createPublishRun({
        dispatchId,
        threadId,
        repoId,
        branchName,
        remoteName,
      });
      console.log(`Created publish run ${publishRun.publishRunId}.`);
      return;
    }

    if (action === "publish-complete") {
      const [publishRunId, status, commitSha, prUrl] = args.slice(1);
      if (!publishRunId || !status) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const publishRun = new ProjectsPublishService(repository).completePublishRun({
        publishRunId,
        status: status as "pending" | "pushed" | "pr_created" | "merged" | "failed" | "cancelled",
        commitSha: commitSha ?? null,
        prUrl: prUrl ?? null,
      });
      console.log(`Completed publish run ${publishRun.publishRunId} as ${publishRun.status}.`);
      return;
    }

    if (action === "refs") {
      const ownerId = args[1];
      const refs = repository.listExternalRefs(undefined, ownerId);
      if (refs.length === 0) {
        console.log("No external refs found.");
        return;
      }
      for (const ref of refs) {
        console.log(`${ref.externalRefId}  ${ref.system}  owner=${ref.ownerType}:${ref.ownerId}  external=${ref.externalId}`);
      }
      return;
    }

    if (action === "handoffs") {
      const projectId = args[1];
      const dbPath = join(getRuntimeHome(), "aria.db");
      const store = new HandoffStore(dbPath);
      await store.init();
      try {
        const records = store.list(projectId);
        if (records.length === 0) {
          console.log("No handoff records found.");
          return;
        }
        for (const record of records) {
          console.log(`${record.handoffId}  [${record.status}]  project=${record.projectId} dispatch=${record.createdDispatchId ?? "n/a"}`);
        }
      } finally {
        store.close();
      }
      return;
    }

    if (action === "handoff-submit") {
      const [projectId, idempotencyKey, ...payloadParts] = args.slice(1);
      const payload = payloadParts.join(" ").trim();
      if (!projectId || !idempotencyKey) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const dbPath = join(getRuntimeHome(), "aria.db");
      const store = new HandoffStore(dbPath);
      const service = new HandoffService(store);
      await service.init();
      try {
        const record = service.submit(`handoff:${idempotencyKey}`, {
          idempotencyKey,
          sourceKind: "local_session",
          projectId,
          payloadJson: payload || null,
        });
        console.log(`Created handoff ${record.handoffId} [${record.status}]`);
      } finally {
        service.close();
      }
      return;
    }

    if (action === "handoff-process") {
      const handoffId = args[1];
      if (!handoffId) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const dbPath = join(getRuntimeHome(), "aria.db");
      const store = new HandoffStore(dbPath);
      const service = new HandoffService(store);
      await service.init();
      try {
        const result = service.materialize(handoffId, repository);
        console.log(`Materialized ${handoffId} into dispatch ${result.dispatchId}.`);
      } finally {
        service.close();
      }
      return;
    }

    if (action === "runnable") {
      const projectId = args[1];
      const planning = new ProjectsPlanningService(repository);
      const summary = planning.getProjectRunnableSummary({ projectId });
      console.log(`Runnable tasks: ${summary.tasks.length}`);
      console.log(`Runnable threads: ${summary.threads.length}`);
      console.log(`Runnable dispatches: ${summary.dispatches.length}`);
      for (const plan of summary.threads) {
        console.log(`thread ${plan.thread.threadId}  [${plan.thread.status}]  ${plan.thread.title}`);
      }
      return;
    }

    if (action === "queue") {
      const projectId = args[1];
      const limit = args[2] ? Number(args[2]) : 10;
      const planning = new ProjectsPlanningService(repository);
      const result = planning.queueNextRunnableDispatches({ projectId, limit });
      console.log(`Queued ${result.queued.length} dispatch(es).`);
      for (const dispatch of result.queued) {
        console.log(`${dispatch.dispatchId}  thread=${dispatch.threadId}  status=${dispatch.status}`);
      }
      return;
    }

    if (action === "backends") {
      const runtime = await createRuntime();
      try {
        const backends = await listRuntimeBackends(runtime);
        for (const backend of backends) {
          console.log(
            `${backend.backend}  ${backend.availability.available ? "available" : "unavailable"}  auth=${backend.availability.authState ?? "unknown"}  streaming=${backend.capabilities.supportsStreamingEvents ? "yes" : "no"}  files=${backend.capabilities.supportsFileEditing ? "yes" : "no"}`,
          );
          if (backend.availability.reason) {
            console.log(`  reason: ${backend.availability.reason}`);
          }
        }
      } finally {
        await runtime.close();
      }
      return;
    }

    if (action === "run-dispatch") {
      const dispatchId = args[1];
      if (!dispatchId) {
        printHelp();
        process.exitCode = 1;
        return;
      }
      const runtime = await createRuntime();
      try {
        const result = await runDispatchExecution(runtime, repository, dispatchId);
        console.log(`Dispatch ${dispatchId} executed as ${result.executionSessionId} [${result.status}]`);
        if (result.summary) {
          console.log(result.summary);
        }
      } finally {
        await runtime.close();
      }
      return;
    }

    printHelp();
    process.exitCode = 1;
  });
}
