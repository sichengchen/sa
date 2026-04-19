import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { BrowserWindow } from "electron";
import {
  createOpenCodeRuntimeBackendAdapter,
  type OpenCodeModelOption,
} from "../../../../packages/agents-coding/src/opencode.js";
import type {
  RuntimeBackendAdapter,
  RuntimeBackendExecutionResult,
} from "../../../../packages/agents-coding/src/contracts.js";
import { getRuntimeHome } from "../../../../packages/server/src/brand.js";
import { ProjectsThreadEnvironmentService } from "../../../../packages/projects/src/thread-environments.js";
import type { ProjectsEngineRepository } from "../../../../packages/projects/src/repository.js";
import type {
  EnvironmentRecord,
  ProjectRecord,
  RepoRecord,
  ThreadEnvironmentBindingRecord,
  ThreadRecord,
  WorkspaceRecord,
} from "../../../../packages/projects/src/types.js";
import { createProjectThreadListItem } from "../../../../packages/projects/src/view-models.js";
import type {
  AriaDesktopChatState,
  AriaDesktopProjectShellState,
  AriaDesktopProjectThreadState,
} from "../shared/api.js";
import {
  buildDesktopProjectShellState,
  DESKTOP_LOCAL_WORKSPACE_ID,
  DESKTOP_LOCAL_WORKSPACE_LABEL,
  DESKTOP_SHELL_STATE_ID,
  type DesktopShellStateRow,
} from "./desktop-projects-shell.js";
import { DesktopProjectsStore } from "./desktop-projects-store.js";

const execFileAsync = promisify(execFile);
const DEFAULT_THREAD_AGENT_ID = "opencode";
const LOCAL_AGENT_TIMEOUT_MS = 20 * 60_000;
const DEFAULT_LOCAL_AGENT_TURNS = 8;
const DEFAULT_MODEL_OPTION_LABEL = "Default";

type GitMetadata = {
  defaultBranch: string;
  remoteUrl: string;
  repoName: string;
};

type RunningThreadExecution = {
  backendId: string;
  executionId: string;
};

type DesktopProjectsServiceOptions = {
  backendRegistry?: Map<string, RuntimeBackendAdapter>;
  dbPath?: string;
  localAgentRuntimeRoot?: string;
  now?: () => number;
  pickDirectory?: (ownerWindow?: BrowserWindow | null) => Promise<string | null>;
  readGitMetadata?: (directoryPath: string) => Promise<GitMetadata | null>;
};

type OpenCodeRuntimePaths = {
  cacheHome: string;
  stateHome: string;
};

type OpenCodeModelDiscoveryBackend = RuntimeBackendAdapter & {
  listModels?: (input: {
    env?: Record<string, string>;
    timeoutMs?: number;
    workingDirectory: string;
  }) => Promise<OpenCodeModelOption[]>;
  syncSessionTitle?: (input: {
    env?: Record<string, string>;
    modelId?: string | null;
    sessionId: string;
    timeoutMs?: number;
    workingDirectory: string;
  }) => Promise<string | null>;
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

async function normalizeDirectoryPath(directoryPath: string): Promise<string> {
  return realpath(directoryPath).catch(() => resolve(directoryPath));
}

async function defaultPickDirectory(ownerWindow?: BrowserWindow | null): Promise<string | null> {
  const { dialog } = await import("electron");
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, {
        properties: ["openDirectory"],
      })
    : await dialog.showOpenDialog({
        properties: ["openDirectory"],
      });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

async function defaultReadGitMetadata(directoryPath: string): Promise<GitMetadata | null> {
  try {
    const [{ stdout: repoRootStdout }, { stdout: remoteUrlStdout }, { stdout: branchStdout }] =
      await Promise.all([
        execFileAsync("git", ["-C", directoryPath, "rev-parse", "--show-toplevel"]),
        execFileAsync("git", ["-C", directoryPath, "config", "--get", "remote.origin.url"]),
        execFileAsync("git", ["-C", directoryPath, "symbolic-ref", "--short", "HEAD"]),
      ]);
    const repoRoot = repoRootStdout.trim();
    const remoteUrl = remoteUrlStdout.trim();
    const defaultBranch = branchStdout.trim();

    if (!repoRoot || !remoteUrl || !defaultBranch) {
      return null;
    }

    return {
      defaultBranch,
      remoteUrl,
      repoName: basename(repoRoot),
    };
  } catch {
    return null;
  }
}

function formatAgentLabel(agentId: string | null | undefined): string | null {
  if (!agentId) {
    return null;
  }

  return agentId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getAvailableModelOptions(agentId: string | null | undefined) {
  void agentId;
  return [{ label: DEFAULT_MODEL_OPTION_LABEL, modelId: null }];
}

function resolveModelLabel(
  options: Array<{ label: string; modelId: string | null }>,
  modelId: string | null,
): string | null {
  if (!modelId) {
    return DEFAULT_MODEL_OPTION_LABEL;
  }

  return options.find((option) => option.modelId === modelId)?.label ?? modelId;
}

function splitModelOptionLabel(label: string): {
  modelLabel: string;
  providerLabel: string | null;
} {
  const separator = " / ";
  const index = label.indexOf(separator);

  if (index < 0) {
    return {
      modelLabel: label,
      providerLabel: null,
    };
  }

  return {
    modelLabel: label.slice(index + separator.length).trim(),
    providerLabel: label.slice(0, index).trim(),
  };
}

function resolveBranchLabel(environmentLabel?: string | null): string {
  const trimmed = environmentLabel?.trim();
  if (!trimmed) {
    return "main";
  }

  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments[segments.length - 1] ?? trimmed;
}

function createProjectChatState(input: {
  agentLabel: string;
  backendSessionId: string | null;
  isStreaming: boolean;
  lastError: string | null;
  messages: AriaDesktopChatState["messages"];
  modelLabel: string | null;
  threadId: string;
}): AriaDesktopChatState {
  return {
    agentName: input.agentLabel,
    approvalMode: "never",
    connected: true,
    isStreaming: input.isStreaming,
    lastError: input.lastError,
    messages: input.messages,
    modelName: input.modelLabel ?? input.agentLabel,
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default",
    securityModeRemainingTTL: null,
    sessionId: input.threadId,
    sessionStatus: input.backendSessionId ? "resumed" : "created",
    streamingText: "",
    streamingPhase: input.isStreaming ? "thinking" : null,
  };
}

function resolveThreadStatus(result: RuntimeBackendExecutionResult): ThreadRecord["status"] {
  switch (result.status) {
    case "cancelled":
      return "cancelled";
    case "failed":
    case "timed_out":
      return "failed";
    default:
      return result.filesChanged.length > 0 ? "dirty" : "idle";
  }
}

function resolveAssistantContent(
  result: RuntimeBackendExecutionResult,
  backendLabel: string,
): string | null {
  const summary = result.summary?.trim();
  if (summary) {
    return summary;
  }

  const stdout = result.stdout.trim();
  if (stdout) {
    return stdout;
  }

  if (result.status === "succeeded") {
    return `${backendLabel} completed without a summary.`;
  }

  return null;
}

function resolveFailureMessage(
  result: RuntimeBackendExecutionResult,
  backendLabel: string,
): string {
  const stderr = result.stderr.trim();
  if (stderr) {
    return stderr;
  }

  const stdout = result.stdout.trim();
  if (stdout) {
    return stdout;
  }

  switch (result.status) {
    case "cancelled":
      return `${backendLabel} cancelled the current run.`;
    case "timed_out":
      return `${backendLabel} timed out before finishing the current run.`;
    default:
      return `${backendLabel} failed to finish the current run.`;
  }
}

function buildOpenCodeRuntimePaths(root: string, threadId: string): OpenCodeRuntimePaths {
  return {
    cacheHome: join(root, "cache"),
    stateHome: join(root, "threads", threadId, "state"),
  };
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

async function assertValidBranchName(branchName: string, workingDirectory: string): Promise<void> {
  await execFileAsync("git", ["-C", workingDirectory, "check-ref-format", "--branch", branchName]);
}

function buildBranchEnvironmentLabel(branchName: string): string {
  return `${DESKTOP_LOCAL_WORKSPACE_LABEL} / ${branchName}`;
}

function toggleId(ids: string[], id: string, enabled: boolean): string[] {
  return enabled ? Array.from(new Set([...ids, id])) : ids.filter((entry) => entry !== id);
}

export class DesktopProjectsService {
  private readonly store: DesktopProjectsStore;
  private readonly now: () => number;
  private readonly pickDirectory: (ownerWindow?: BrowserWindow | null) => Promise<string | null>;
  private readonly readGitMetadata: (directoryPath: string) => Promise<GitMetadata | null>;
  private readonly threadEnvironmentService: ProjectsThreadEnvironmentService;
  private readonly backendRegistry: Map<string, RuntimeBackendAdapter>;
  private readonly localAgentRuntimeRoot: string;
  private readonly modelOptionsCache = new Map<string, OpenCodeModelOption[]>();
  private readonly pendingModelOptionRefreshes = new Set<string>();
  private readonly listeners = new Set<(state: AriaDesktopProjectShellState) => void>();
  private readonly runningExecutions = new Map<string, RunningThreadExecution>();

  constructor(options: DesktopProjectsServiceOptions = {}) {
    this.store = new DesktopProjectsStore(
      options.dbPath ?? join(getRuntimeHome(), "desktop", "aria-desktop.db"),
    );
    this.now = options.now ?? (() => Date.now());
    this.pickDirectory = options.pickDirectory ?? defaultPickDirectory;
    this.readGitMetadata = options.readGitMetadata ?? defaultReadGitMetadata;
    this.backendRegistry =
      options.backendRegistry ??
      new Map<string, RuntimeBackendAdapter>([["opencode", createOpenCodeRuntimeBackendAdapter()]]);
    this.localAgentRuntimeRoot =
      options.localAgentRuntimeRoot ?? join(getRuntimeHome(), "desktop", "opencode");
    this.threadEnvironmentService = new ProjectsThreadEnvironmentService(
      this.createRepositoryAdapter() as unknown as ProjectsEngineRepository,
    );
  }

  init(): void {
    this.store.init();
    this.ensureLocalWorkspace();
  }

  close(): void {
    this.store.close();
  }

  subscribe(listener: (state: AriaDesktopProjectShellState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getProjectShellState(): AriaDesktopProjectShellState {
    const shellState = buildDesktopProjectShellState({
      environments: this.store.listEnvironments(),
      projects: this.store.listProjects(),
      repos: this.store.listRepos(),
      shellState: this.store.getShellState(),
      threads: this.store.listThreads(),
    });

    return {
      ...shellState,
      selectedThreadState: shellState.selectedThreadId
        ? this.buildSelectedThreadState(shellState.selectedThreadId)
        : null,
    };
  }

  async importLocalProjectFromDialog(
    ownerWindow?: BrowserWindow | null,
  ): Promise<AriaDesktopProjectShellState> {
    const directoryPath = await this.pickDirectory(ownerWindow);

    if (!directoryPath) {
      return this.getProjectShellState();
    }

    return this.importLocalProjectFromPath(directoryPath);
  }

  async importLocalProjectFromPath(directoryPath: string): Promise<AriaDesktopProjectShellState> {
    const normalizedPath = await normalizeDirectoryPath(directoryPath);
    const existingEnvironment = this.store.findEnvironmentByLocator(normalizedPath);

    if (existingEnvironment) {
      return this.openProjectAfterImport(existingEnvironment.projectId);
    }

    const now = this.now();
    const projectName = basename(normalizedPath) || normalizedPath;
    const projectId = randomUUID();
    const projectSlug = this.createUniqueProjectSlug(projectName);

    const project: ProjectRecord = {
      createdAt: now,
      description: null,
      name: projectName,
      projectId,
      slug: projectSlug,
      updatedAt: now,
    };

    this.store.upsertProject(project);

    const defaultEnvironment: EnvironmentRecord = {
      createdAt: now,
      environmentId: randomUUID(),
      kind: "main",
      label: `${DESKTOP_LOCAL_WORKSPACE_LABEL} / main`,
      locator: normalizedPath,
      mode: "local",
      projectId,
      updatedAt: now,
      workspaceId: DESKTOP_LOCAL_WORKSPACE_ID,
    };
    this.store.upsertEnvironment(defaultEnvironment);

    const gitMetadata = await this.readGitMetadata(normalizedPath);

    if (gitMetadata) {
      const repo: RepoRecord = {
        createdAt: now,
        defaultBranch: gitMetadata.defaultBranch,
        name: gitMetadata.repoName,
        projectId,
        remoteUrl: gitMetadata.remoteUrl,
        repoId: randomUUID(),
        updatedAt: now,
      };
      this.store.upsertRepo(repo);
    }

    return this.openProjectAfterImport(projectId);
  }

  createThread(projectId: string): AriaDesktopProjectShellState {
    const project = this.store.getProject(projectId);

    if (!project) {
      return this.getProjectShellState();
    }

    const now = this.now();
    const repo = this.store.listRepos(projectId)[0];
    const threadId = randomUUID();

    this.store.upsertThread({
      agentId: DEFAULT_THREAD_AGENT_ID,
      createdAt: now,
      environmentBindingId: null,
      environmentId: null,
      projectId,
      repoId: repo?.repoId ?? null,
      status: "idle",
      taskId: null,
      threadId,
      threadType: "local_project",
      title: "New Thread",
      updatedAt: now,
      workspaceId: null,
    });

    const defaultEnvironment = this.getDefaultEnvironment(projectId);

    this.threadEnvironmentService.switchThreadEnvironment(
      {
        bindingId: randomUUID(),
        environmentId: defaultEnvironment.environmentId,
        reason: "Initial desktop-local environment binding",
        threadId,
      },
      now,
    );

    this.writeShellState((currentState) => ({
      ...currentState,
      collapsedProjectIds: currentState.collapsedProjectIds.filter((id) => id !== projectId),
      selectedProjectId: projectId,
      selectedThreadId: threadId,
    }));

    return this.emitSnapshot();
  }

  selectProject(projectId: string): AriaDesktopProjectShellState {
    if (!this.store.getProject(projectId)) {
      return this.getProjectShellState();
    }

    this.writeShellState((currentState) => ({
      ...currentState,
      selectedProjectId: projectId,
      selectedThreadId: null,
    }));

    return this.emitSnapshot();
  }

  selectThread(projectId: string, threadId: string): AriaDesktopProjectShellState {
    const thread = this.store.getThread(threadId);

    if (!thread || thread.projectId !== projectId) {
      return this.getProjectShellState();
    }

    this.writeShellState((currentState) => ({
      ...currentState,
      selectedProjectId: projectId,
      selectedThreadId: threadId,
    }));

    return this.emitSnapshot();
  }

  setProjectCollapsed(projectId: string, collapsed: boolean): AriaDesktopProjectShellState {
    if (!this.store.getProject(projectId)) {
      return this.getProjectShellState();
    }

    this.writeShellState((currentState) => ({
      ...currentState,
      collapsedProjectIds: collapsed
        ? Array.from(new Set([...currentState.collapsedProjectIds, projectId]))
        : currentState.collapsedProjectIds.filter(
            (currentProjectId) => currentProjectId !== projectId,
          ),
    }));

    return this.emitSnapshot();
  }

  setProjectThreadPinned(threadId: string, pinned: boolean): AriaDesktopProjectShellState {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return this.getProjectShellState();
    }

    this.writeShellState((currentState) => ({
      ...currentState,
      pinnedThreadIds: toggleId(currentState.pinnedThreadIds, threadId, pinned),
    }));

    return this.emitSnapshot();
  }

  archiveProjectThread(threadId: string): AriaDesktopProjectShellState {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return this.getProjectShellState();
    }

    this.writeShellState((currentState) => {
      const archivedThreadIds = toggleId(currentState.archivedThreadIds, threadId, true);
      const pinnedThreadIds = toggleId(currentState.pinnedThreadIds, threadId, false);
      const nextSelectedThreadId =
        currentState.selectedThreadId === threadId
          ? (this.listVisibleThreadIdsForProject(
              thread.projectId,
              pinnedThreadIds,
              archivedThreadIds,
            )[0] ?? null)
          : currentState.selectedThreadId;

      return {
        ...currentState,
        archivedThreadIds,
        pinnedThreadIds,
        selectedProjectId: thread.projectId,
        selectedThreadId: nextSelectedThreadId,
      };
    });

    return this.emitSnapshot();
  }

  switchProjectThreadEnvironment(
    threadId: string,
    environmentId: string,
  ): AriaDesktopProjectShellState {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return this.getProjectShellState();
    }

    if (this.runningExecutions.has(threadId)) {
      return this.recordThreadFailure(
        thread,
        "Stop the current local agent run before switching branches.",
      );
    }

    const now = this.now();
    const currentState = this.store.getProjectThreadState(thread.threadId);

    try {
      this.threadEnvironmentService.switchThreadEnvironment(
        {
          bindingId: randomUUID(),
          environmentId,
          reason: "Desktop project thread branch switch",
          threadId,
        },
        now,
      );
      this.store.upsertProjectThreadState({
        backendSessionId: null,
        lastError: null,
        lastFilesChanged: [],
        selectedModelId: currentState?.selectedModelId ?? null,
        threadId,
        updatedAt: now,
      });
      this.modelOptionsCache.delete(threadId);
      this.refreshThreadModelOptions(threadId);

      return this.emitSnapshot();
    } catch (error) {
      return this.recordThreadFailure(
        thread,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async createProjectThreadBranch(
    threadId: string,
    branchName: string,
  ): Promise<AriaDesktopProjectShellState> {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return this.getProjectShellState();
    }

    if (this.runningExecutions.has(threadId)) {
      return this.recordThreadFailure(
        thread,
        "Stop the current local agent run before creating a branch.",
      );
    }

    const trimmedBranchName = branchName.trim();
    if (!trimmedBranchName) {
      return this.recordThreadFailure(thread, "Enter a branch name before creating it.");
    }

    const environment = this.getThreadEnvironment(thread);
    if (!environment) {
      return this.recordThreadFailure(thread, "This thread does not have an active environment.");
    }

    if (environment.mode !== "local") {
      return this.recordThreadFailure(
        thread,
        "Create-and-checkout branch is only available for local project environments.",
      );
    }

    if (!this.store.getProject(thread.projectId)) {
      return this.recordThreadFailure(thread, "Project not found for the selected thread.");
    }

    try {
      await assertValidBranchName(trimmedBranchName, environment.locator);
      const baseEnvironment = this.getDefaultEnvironment(thread.projectId);
      const branchEnvironmentPath = this.resolveBranchEnvironmentPath(
        baseEnvironment.locator,
        trimmedBranchName,
      );

      await execFileAsync("git", [
        "-C",
        environment.locator,
        "worktree",
        "add",
        "-b",
        trimmedBranchName,
        branchEnvironmentPath,
      ]);

      const normalizedBranchPath = await normalizeDirectoryPath(branchEnvironmentPath);
      const now = this.now();
      const branchEnvironment: EnvironmentRecord = {
        createdAt: now,
        environmentId: randomUUID(),
        kind: "worktree",
        label: buildBranchEnvironmentLabel(trimmedBranchName),
        locator: normalizedBranchPath,
        mode: "local",
        projectId: thread.projectId,
        updatedAt: now,
        workspaceId: DESKTOP_LOCAL_WORKSPACE_ID,
      };

      this.store.upsertEnvironment(branchEnvironment);
      return this.switchProjectThreadEnvironment(thread.threadId, branchEnvironment.environmentId);
    } catch (error) {
      return this.recordThreadFailure(
        thread,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  setProjectThreadModel(threadId: string, modelId: string | null): AriaDesktopProjectShellState {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return this.getProjectShellState();
    }

    if (this.runningExecutions.has(threadId)) {
      return this.recordThreadFailure(
        thread,
        "Stop the current local agent run before switching models.",
      );
    }

    const normalizedModelId = modelId && modelId.trim().length > 0 ? modelId : null;
    const allowedModels = new Set(
      this.getThreadModelOptions(thread).map((option) => option.modelId),
    );

    if (!allowedModels.has(normalizedModelId)) {
      return this.recordThreadFailure(thread, "Unsupported model for the selected coding agent.");
    }

    const now = this.now();
    this.store.upsertProjectThreadState({
      backendSessionId: null,
      lastError: null,
      lastFilesChanged: [],
      selectedModelId: normalizedModelId,
      threadId,
      updatedAt: now,
    });
    this.store.upsertThread({
      ...thread,
      status: "idle",
      updatedAt: now,
    });

    return this.emitSnapshot();
  }

  async sendProjectThreadMessage(
    threadId: string,
    message: string,
  ): Promise<AriaDesktopProjectShellState> {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return this.getProjectShellState();
    }

    const thread = this.store.getThread(threadId);
    if (!thread) {
      return this.getProjectShellState();
    }

    if (this.runningExecutions.has(threadId)) {
      return this.recordThreadFailure(thread, "A local agent run is already in progress.");
    }

    const environment = this.getThreadEnvironment(thread);
    if (!environment) {
      return this.recordThreadFailure(thread, "This thread does not have an active environment.");
    }

    const backendId = thread.agentId ?? DEFAULT_THREAD_AGENT_ID;
    const backend = this.backendRegistry.get(backendId);
    if (!backend) {
      return this.recordThreadFailure(thread, `Unsupported local agent: ${backendId}.`);
    }

    const availability = await backend.probeAvailability();
    if (!availability.available) {
      return this.recordThreadFailure(
        thread,
        availability.reason ?? `${backend.displayName} is not available on this device.`,
      );
    }

    const existingState = this.store.getProjectThreadState(thread.threadId);
    const executionId = randomUUID();
    const now = this.now();

    this.store.appendProjectThreadMessage({
      content: trimmedMessage,
      createdAt: now,
      messageId: randomUUID(),
      role: "user",
      threadId: thread.threadId,
      toolName: null,
    });
    this.store.upsertThread({
      ...thread,
      status: "running",
      updatedAt: now,
    });
    this.store.upsertProjectThreadState({
      backendSessionId: existingState?.backendSessionId ?? null,
      lastError: null,
      lastFilesChanged: existingState?.lastFilesChanged ?? [],
      selectedModelId: existingState?.selectedModelId ?? null,
      threadId: thread.threadId,
      updatedAt: now,
    });
    this.runningExecutions.set(thread.threadId, {
      backendId,
      executionId,
    });
    this.notify();

    const requestEnv =
      backendId === "opencode" ? this.buildOpenCodeRequestEnv(thread.threadId) : undefined;

    try {
      const result = await backend.execute({
        approvalMode: "auto",
        env: requestEnv,
        executionId,
        maxTurns: DEFAULT_LOCAL_AGENT_TURNS,
        metadata: {
          projectId: thread.projectId,
          threadId: thread.threadId,
        },
        modelId: existingState?.selectedModelId ?? null,
        prompt: trimmedMessage,
        sessionId: existingState?.backendSessionId ?? null,
        timeoutMs: LOCAL_AGENT_TIMEOUT_MS,
        workingDirectory: environment.locator,
      });

      const completedAt = this.now();
      const nextSessionId = result.metadata?.sessionId ?? existingState?.backendSessionId ?? null;

      if (result.status === "succeeded") {
        const content = resolveAssistantContent(result, backend.displayName);
        if (content) {
          this.store.appendProjectThreadMessage({
            content,
            createdAt: completedAt,
            messageId: randomUUID(),
            role: "assistant",
            threadId: thread.threadId,
            toolName: null,
          });
        }
        const nextTitle =
          backendId === "opencode"
            ? await this.resolveOpenCodeThreadTitle({
                backend,
                modelId:
                  (result.metadata?.providerId as string | undefined) &&
                  (result.metadata?.modelId as string | undefined)
                    ? `${String(result.metadata?.providerId)}/${String(result.metadata?.modelId)}`
                    : (existingState?.selectedModelId ?? null),
                env: requestEnv,
                sessionId: nextSessionId,
                workingDirectory: environment.locator,
              })
            : null;
        this.store.upsertThread({
          ...thread,
          status: resolveThreadStatus(result),
          title: nextTitle ?? thread.title,
          updatedAt: completedAt,
        });
        this.store.upsertProjectThreadState({
          backendSessionId: nextSessionId,
          lastError: null,
          lastFilesChanged: result.filesChanged,
          selectedModelId: existingState?.selectedModelId ?? null,
          threadId: thread.threadId,
          updatedAt: completedAt,
        });
      } else {
        const failureMessage = resolveFailureMessage(result, backend.displayName);
        this.store.appendProjectThreadMessage({
          content: failureMessage,
          createdAt: completedAt,
          messageId: randomUUID(),
          role: "error",
          threadId: thread.threadId,
          toolName: null,
        });
        this.store.upsertThread({
          ...thread,
          status: resolveThreadStatus(result),
          updatedAt: completedAt,
        });
        this.store.upsertProjectThreadState({
          backendSessionId: nextSessionId,
          lastError: failureMessage,
          lastFilesChanged: result.filesChanged,
          selectedModelId: existingState?.selectedModelId ?? null,
          threadId: thread.threadId,
          updatedAt: completedAt,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedAt = this.now();

      this.store.appendProjectThreadMessage({
        content: errorMessage,
        createdAt: failedAt,
        messageId: randomUUID(),
        role: "error",
        threadId: thread.threadId,
        toolName: null,
      });
      this.store.upsertThread({
        ...thread,
        status: "failed",
        updatedAt: failedAt,
      });
      this.store.upsertProjectThreadState({
        backendSessionId: existingState?.backendSessionId ?? null,
        lastError: errorMessage,
        lastFilesChanged: existingState?.lastFilesChanged ?? [],
        selectedModelId: existingState?.selectedModelId ?? null,
        threadId: thread.threadId,
        updatedAt: failedAt,
      });
    } finally {
      this.runningExecutions.delete(thread.threadId);
      this.notify();
    }

    return this.getProjectShellState();
  }

  private notify(): void {
    const snapshot = this.getProjectShellState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private emitSnapshot(): AriaDesktopProjectShellState {
    const snapshot = this.getProjectShellState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  private buildSelectedThreadState(threadId: string): AriaDesktopProjectThreadState | null {
    const thread = this.store.getThread(threadId);
    if (!thread) {
      return null;
    }

    const project = this.store.getProject(thread.projectId);
    if (!project) {
      return null;
    }

    const environment = this.getThreadEnvironment(thread);
    const storedState = this.store.getProjectThreadState(thread.threadId);
    const threadItem = createProjectThreadListItem(project, thread);
    const backend = thread.agentId ? this.backendRegistry.get(thread.agentId) : null;
    const agentLabel =
      backend?.displayName ?? formatAgentLabel(thread.agentId) ?? "Local Coding Agent";
    const projectEnvironments = this.store.listEnvironments(project.projectId);
    const selectedModelId = storedState?.selectedModelId ?? null;
    const cachedModelOptions = this.getThreadModelOptions(thread);
    const selectedModelOption =
      cachedModelOptions.find((option) => option.modelId === selectedModelId) ??
      (selectedModelId
        ? {
            label: selectedModelId,
            modelId: selectedModelId,
          }
        : null);
    const normalizedModelOptions = selectedModelOption
      ? cachedModelOptions.some((option) => option.modelId === selectedModelOption.modelId)
        ? cachedModelOptions
        : [selectedModelOption, ...cachedModelOptions]
      : cachedModelOptions;
    const resolvedSelectedModelLabel = resolveModelLabel(normalizedModelOptions, selectedModelId);
    const selectedModelParts = resolvedSelectedModelLabel
      ? splitModelOptionLabel(resolvedSelectedModelLabel)
      : { modelLabel: DEFAULT_MODEL_OPTION_LABEL, providerLabel: null };
    const chatMessages = this.store.listProjectThreadMessages(thread.threadId).map((message) => ({
      content: message.content,
      id: message.messageId,
      role: message.role,
      toolName: message.toolName,
    }));

    return {
      agentId: thread.agentId ?? null,
      agentLabel,
      availableBranches: projectEnvironments.map((candidateEnvironment) => ({
        environmentId: candidateEnvironment.environmentId,
        label: candidateEnvironment.label,
        locator: candidateEnvironment.locator,
        selected: candidateEnvironment.environmentId === environment?.environmentId,
        value: resolveBranchLabel(candidateEnvironment.label),
      })),
      availableModels: normalizedModelOptions.map((option) => ({
        label: option.label,
        modelLabel: splitModelOptionLabel(option.label).modelLabel,
        modelId: option.modelId,
        providerLabel: splitModelOptionLabel(option.label).providerLabel,
        selected: option.modelId === selectedModelId,
      })),
      backendSessionId: storedState?.backendSessionId ?? null,
      changedFiles: storedState?.lastFilesChanged ?? [],
      chat: createProjectChatState({
        agentLabel,
        backendSessionId: storedState?.backendSessionId ?? null,
        isStreaming: this.runningExecutions.has(thread.threadId),
        lastError: storedState?.lastError ?? null,
        messages: chatMessages,
        modelLabel: selectedModelParts.modelLabel,
        threadId: thread.threadId,
      }),
      environmentId: environment?.environmentId ?? null,
      environmentLabel: environment?.label ?? null,
      environmentLocator: environment?.locator ?? null,
      modelId: selectedModelId,
      modelLabel: selectedModelParts.modelLabel,
      projectId: project.projectId,
      projectName: project.name,
      status: thread.status,
      statusLabel: threadItem.status,
      threadId: thread.threadId,
      threadType: threadItem.threadType,
      threadTypeLabel: threadItem.threadTypeLabel,
      title: thread.title,
    };
  }

  private getThreadEnvironment(thread: ThreadRecord): EnvironmentRecord | undefined {
    if (thread.environmentId) {
      return this.store.getEnvironment(thread.environmentId);
    }

    const activeBinding = this.store.getActiveThreadEnvironmentBinding(thread.threadId);
    return activeBinding ? this.store.getEnvironment(activeBinding.environmentId) : undefined;
  }

  private async resolveOpenCodeThreadTitle(input: {
    backend: RuntimeBackendAdapter;
    env?: Record<string, string>;
    modelId?: string | null;
    sessionId: string | null;
    workingDirectory: string;
  }): Promise<string | null> {
    if (!input.sessionId) {
      return null;
    }

    const backend = input.backend as OpenCodeModelDiscoveryBackend;
    if (!backend.syncSessionTitle) {
      return null;
    }

    try {
      return await backend.syncSessionTitle({
        env: input.env,
        modelId: input.modelId ?? null,
        sessionId: input.sessionId,
        timeoutMs: 15_000,
        workingDirectory: input.workingDirectory,
      });
    } catch {
      return null;
    }
  }

  private listVisibleThreadIdsForProject(
    projectId: string,
    pinnedThreadIds: string[],
    archivedThreadIds: string[],
  ): string[] {
    const pinnedThreadIdSet = new Set(pinnedThreadIds);
    const archivedThreadIdSet = new Set(archivedThreadIds);

    return this.store
      .listThreads(projectId)
      .filter((thread) => !archivedThreadIdSet.has(thread.threadId))
      .sort((left, right) => {
        const leftPinned = pinnedThreadIdSet.has(left.threadId);
        const rightPinned = pinnedThreadIdSet.has(right.threadId);

        if (leftPinned !== rightPinned) {
          return leftPinned ? -1 : 1;
        }

        return right.updatedAt - left.updatedAt;
      })
      .map((thread) => thread.threadId);
  }

  private getThreadModelOptions(
    thread: ThreadRecord,
  ): Array<{ label: string; modelId: string | null }> {
    const cachedOptions = this.modelOptionsCache.get(thread.threadId);
    if (cachedOptions) {
      return [{ label: DEFAULT_MODEL_OPTION_LABEL, modelId: null }, ...cachedOptions];
    }

    this.refreshThreadModelOptions(thread.threadId);
    return getAvailableModelOptions(thread.agentId ?? DEFAULT_THREAD_AGENT_ID);
  }

  private refreshThreadModelOptions(threadId: string): void {
    if (this.pendingModelOptionRefreshes.has(threadId)) {
      return;
    }

    const thread = this.store.getThread(threadId);
    if (!thread) {
      return;
    }

    const backend = this.backendRegistry.get(thread.agentId ?? DEFAULT_THREAD_AGENT_ID) as
      | OpenCodeModelDiscoveryBackend
      | undefined;
    const environment = this.getThreadEnvironment(thread);
    if (!backend?.listModels || !environment) {
      return;
    }

    this.pendingModelOptionRefreshes.add(threadId);

    let env: Record<string, string>;
    try {
      env = this.buildOpenCodeRequestEnv(thread.threadId);
    } catch {
      this.pendingModelOptionRefreshes.delete(threadId);
      return;
    }

    void backend
      .listModels({
        env,
        timeoutMs: 10_000,
        workingDirectory: environment.locator,
      })
      .then((options) => {
        if (options.length === 0) {
          return;
        }

        this.modelOptionsCache.set(threadId, options);
        this.notify();
      })
      .catch(() => {
        // Fall back to bundled defaults when discovery fails.
      })
      .finally(() => {
        this.pendingModelOptionRefreshes.delete(threadId);
      });
  }

  private recordThreadFailure(thread: ThreadRecord, message: string): AriaDesktopProjectShellState {
    const now = this.now();
    const currentState = this.store.getProjectThreadState(thread.threadId);

    this.store.appendProjectThreadMessage({
      content: message,
      createdAt: now,
      messageId: randomUUID(),
      role: "error",
      threadId: thread.threadId,
      toolName: null,
    });
    this.store.upsertThread({
      ...thread,
      status: "failed",
      updatedAt: now,
    });
    this.store.upsertProjectThreadState({
      backendSessionId: currentState?.backendSessionId ?? null,
      lastError: message,
      lastFilesChanged: currentState?.lastFilesChanged ?? [],
      selectedModelId: currentState?.selectedModelId ?? null,
      threadId: thread.threadId,
      updatedAt: now,
    });

    return this.emitSnapshot();
  }

  private buildOpenCodeRequestEnv(threadId: string): Record<string, string> {
    const runtimePaths = buildOpenCodeRuntimePaths(this.localAgentRuntimeRoot, threadId);
    ensureDirectory(runtimePaths.cacheHome);
    ensureDirectory(runtimePaths.stateHome);

    return {
      XDG_CACHE_HOME: runtimePaths.cacheHome,
      XDG_STATE_HOME: runtimePaths.stateHome,
    };
  }

  private createRepositoryAdapter() {
    return {
      getActiveThreadEnvironmentBinding: (threadId: string) =>
        this.store.getActiveThreadEnvironmentBinding(threadId),
      getEnvironment: (environmentId: string) => this.store.getEnvironment(environmentId),
      getThread: (threadId: string) => this.store.getThread(threadId),
      listThreadEnvironmentBindings: (threadId?: string) =>
        this.store.listThreadEnvironmentBindings(threadId),
      upsertThread: (thread: ThreadRecord) => this.store.upsertThread(thread),
      upsertThreadEnvironmentBinding: (binding: ThreadEnvironmentBindingRecord) =>
        this.store.upsertThreadEnvironmentBinding(binding),
    };
  }

  private createUniqueProjectSlug(projectName: string): string {
    const baseSlug = slugify(projectName);
    let candidate = baseSlug;
    let suffix = 2;

    while (this.store.getProjectBySlug(candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private ensureLocalWorkspace(): void {
    const existingWorkspace = this.store.getWorkspace(DESKTOP_LOCAL_WORKSPACE_ID);

    if (existingWorkspace) {
      return;
    }

    const now = this.now();

    const workspace: WorkspaceRecord = {
      createdAt: now,
      host: "desktop_local",
      label: DESKTOP_LOCAL_WORKSPACE_LABEL,
      serverId: null,
      updatedAt: now,
      workspaceId: DESKTOP_LOCAL_WORKSPACE_ID,
    };

    this.store.upsertWorkspace(workspace);
  }

  private getDefaultEnvironment(projectId: string): EnvironmentRecord {
    const environments = this.store.listEnvironments(projectId);
    const preferredEnvironment =
      environments.find(
        (environment) =>
          environment.workspaceId === DESKTOP_LOCAL_WORKSPACE_ID &&
          environment.kind === "main" &&
          environment.mode === "local",
      ) ?? environments[0];

    if (!preferredEnvironment) {
      throw new Error(`No environment found for project ${projectId}`);
    }

    return preferredEnvironment;
  }

  private resolveBranchEnvironmentPath(baseLocator: string, branchName: string): string {
    const baseDirectory = dirname(baseLocator);
    const baseName = basename(baseLocator);
    const branchSlug = slugify(branchName);
    let candidatePath = join(baseDirectory, `${baseName}-${branchSlug}`);
    let suffix = 2;

    while (existsSync(candidatePath)) {
      candidatePath = join(baseDirectory, `${baseName}-${branchSlug}-${suffix}`);
      suffix += 1;
    }

    return candidatePath;
  }

  private openProjectAfterImport(projectId: string): AriaDesktopProjectShellState {
    const existingThread = this.store.listThreads(projectId)[0];
    const nextShellState = existingThread
      ? this.selectThread(projectId, existingThread.threadId)
      : this.createThread(projectId);

    this.writeShellState((currentState) => ({
      ...currentState,
      collapsedProjectIds: currentState.collapsedProjectIds.filter((id) => id !== projectId),
      selectedProjectId: projectId,
      selectedThreadId: nextShellState.selectedThreadId,
    }));

    return this.emitSnapshot();
  }

  private writeShellState(
    updater: (currentState: DesktopShellStateRow) => DesktopShellStateRow,
  ): void {
    const currentState = this.store.getShellState() ?? {
      archivedThreadIds: [],
      collapsedProjectIds: [],
      pinnedThreadIds: [],
      selectedProjectId: null,
      selectedThreadId: null,
      shellId: DESKTOP_SHELL_STATE_ID,
      updatedAt: this.now(),
    };

    const nextState = updater(currentState);

    this.store.upsertShellState({
      ...nextState,
      shellId: DESKTOP_SHELL_STATE_ID,
      updatedAt: this.now(),
    });
  }
}
