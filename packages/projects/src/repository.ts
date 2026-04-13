import type {
  DispatchRecord,
  ExternalRefRecord,
  JobRecord,
  ProjectRecord,
  PublishRunRecord,
  RepoRecord,
  ReviewRecord,
  ServerRecord,
  TaskRecord,
  ThreadRecord,
  ThreadEnvironmentBindingRecord,
  EnvironmentRecord,
  WorkspaceRecord,
  WorktreeRecord,
} from "./types.js";
import { ProjectsEngineStore } from "./store.js";

export class ProjectsEngineRepository {
  constructor(private readonly store: ProjectsEngineStore) {}

  async init(): Promise<void> {
    await this.store.init();
  }

  close(): void {
    this.store.close();
  }

  upsertProject(project: ProjectRecord): void {
    this.store.upsertProject(project);
  }

  listProjects(): ProjectRecord[] {
    return this.store.listProjects();
  }

  getProject(projectId: string): ProjectRecord | undefined {
    return this.store.getProject(projectId);
  }

  upsertServer(server: ServerRecord): void {
    this.store.upsertServer(server);
  }

  listServers(): ServerRecord[] {
    return this.store.listServers();
  }

  getServer(serverId: string): ServerRecord | undefined {
    return this.store.getServer(serverId);
  }

  upsertWorkspace(workspace: WorkspaceRecord): void {
    this.store.upsertWorkspace(workspace);
  }

  listWorkspaces(serverId?: string): WorkspaceRecord[] {
    return this.store.listWorkspaces(serverId);
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | undefined {
    return this.store.getWorkspace(workspaceId);
  }

  upsertEnvironment(environment: EnvironmentRecord): void {
    this.store.upsertEnvironment(environment);
  }

  listEnvironments(projectId?: string, workspaceId?: string): EnvironmentRecord[] {
    return this.store.listEnvironments(projectId, workspaceId);
  }

  getEnvironment(environmentId: string): EnvironmentRecord | undefined {
    return this.store.getEnvironment(environmentId);
  }

  upsertRepo(repo: RepoRecord): void {
    this.store.upsertRepo(repo);
  }

  listRepos(projectId?: string): RepoRecord[] {
    return this.store.listRepos(projectId);
  }

  getRepo(repoId: string): RepoRecord | undefined {
    return this.store.getRepo(repoId);
  }

  upsertTask(task: TaskRecord): void {
    this.store.upsertTask(task);
  }

  listTasks(projectId?: string, repoId?: string): TaskRecord[] {
    return this.store.listTasks(projectId, repoId);
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.store.getTask(taskId);
  }

  upsertThread(thread: ThreadRecord): void {
    this.store.upsertThread(thread);
  }

  listThreads(projectId?: string, taskId?: string): ThreadRecord[] {
    return this.store.listThreads(projectId, taskId);
  }

  getThread(threadId: string): ThreadRecord | undefined {
    return this.store.getThread(threadId);
  }

  upsertThreadEnvironmentBinding(binding: ThreadEnvironmentBindingRecord): void {
    this.store.upsertThreadEnvironmentBinding(binding);
  }

  listThreadEnvironmentBindings(threadId?: string): ThreadEnvironmentBindingRecord[] {
    return this.store.listThreadEnvironmentBindings(threadId);
  }

  getActiveThreadEnvironmentBinding(threadId: string): ThreadEnvironmentBindingRecord | undefined {
    return this.store.getActiveThreadEnvironmentBinding(threadId);
  }

  upsertJob(job: JobRecord): void {
    this.store.upsertJob(job);
  }

  listJobs(threadId?: string): JobRecord[] {
    return this.store.listJobs(threadId);
  }

  upsertExternalRef(externalRef: ExternalRefRecord): void {
    this.store.upsertExternalRef(externalRef);
  }

  listExternalRefs(
    ownerType?: ExternalRefRecord["ownerType"],
    ownerId?: string,
  ): ExternalRefRecord[] {
    return this.store.listExternalRefs(ownerType, ownerId);
  }

  findExternalRefsByExternal(
    system: ExternalRefRecord["system"],
    externalId: string,
    externalKey?: string,
  ): ExternalRefRecord[] {
    return this.store.findExternalRefsByExternal(system, externalId, externalKey);
  }

  upsertDispatch(dispatch: DispatchRecord): void {
    this.store.upsertDispatch(dispatch);
  }

  listDispatches(threadId?: string, taskId?: string): DispatchRecord[] {
    return this.store.listDispatches(threadId, taskId);
  }

  getDispatch(dispatchId: string): DispatchRecord | undefined {
    return this.store.getDispatch(dispatchId);
  }

  upsertWorktree(worktree: WorktreeRecord): void {
    this.store.upsertWorktree(worktree);
  }

  listWorktrees(repoId?: string, threadId?: string): WorktreeRecord[] {
    return this.store.listWorktrees(repoId, threadId);
  }

  getWorktree(worktreeId: string): WorktreeRecord | undefined {
    return this.store.getWorktree(worktreeId);
  }

  upsertReview(review: ReviewRecord): void {
    this.store.upsertReview(review);
  }

  listReviews(threadId?: string, dispatchId?: string): ReviewRecord[] {
    return this.store.listReviews(threadId, dispatchId);
  }

  getReview(reviewId: string): ReviewRecord | undefined {
    return this.store.getReview(reviewId);
  }

  upsertPublishRun(publishRun: PublishRunRecord): void {
    this.store.upsertPublishRun(publishRun);
  }

  listPublishRuns(threadId?: string, dispatchId?: string): PublishRunRecord[] {
    return this.store.listPublishRuns(threadId, dispatchId);
  }

  getPublishRun(publishRunId: string): PublishRunRecord | undefined {
    return this.store.getPublishRun(publishRunId);
  }
}
