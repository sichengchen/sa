import { join } from "node:path";
import { CLI_NAME, getRuntimeHome } from "@aria/shared/brand.js";
import { ProjectsEngineStore } from "../../packages/projects-engine/src/store.js";
import { ProjectsEngineRepository } from "../../packages/projects-engine/src/repository.js";
import { ProjectsPlanningService } from "../../packages/projects-engine/src/planning.js";
import { HandoffStore } from "../../packages/handoff/src/store.js";

function printHelp(): void {
  console.log(`Usage: ${CLI_NAME} projects <subcommand>\n`);
  console.log("Subcommands:");
  console.log("  projects               List tracked projects");
  console.log("  repos [projectId]      List tracked repos, optionally filtered by project");
  console.log("  tasks [projectId]      List tracked tasks, optionally filtered by project");
  console.log("  threads [projectId]    List tracked threads, optionally filtered by project");
  console.log("  dispatches [threadId]  List dispatch records, optionally filtered by thread");
  console.log("  worktrees [repoId]     List tracked worktrees, optionally filtered by repo");
  console.log("  refs [ownerId]         List external refs, optionally filtered by owner");
  console.log("  handoffs [projectId]   List handoff records, optionally filtered by project");
  console.log("  runnable [projectId]   Show runnable threads and dispatches");
  console.log("  queue [projectId] [n]  Queue up to n runnable dispatches");
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

    if (action === "threads") {
      const projectId = args[1];
      const threads = repository.listThreads(projectId);
      if (threads.length === 0) {
        console.log("No tracked threads found.");
        return;
      }
      for (const thread of threads) {
        console.log(`${thread.threadId}  [${thread.status}]  ${thread.title}`);
      }
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

    printHelp();
    process.exitCode = 1;
  });
}
