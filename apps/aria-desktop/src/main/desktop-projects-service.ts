import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import type { BrowserWindow } from "electron";
import { createLocalAccessClient } from "../../../../packages/access-client/src/local.js";
import type { AriaChatClient } from "../../../../packages/access-client/src/aria-thread.js";
import type {
  RuntimeBackendAdapter,
  RuntimeBackendExecutionResult,
} from "../../../../packages/jobs/src/runtime-backend.js";
import { parseFrontmatter } from "../../../../packages/memory/src/skills/loader.js";
import { preprocessContextReferences } from "../../../../packages/prompt/src/context-references.js";
import { getRuntimeHome } from "../../../../packages/server/src/brand.js";
import { ProjectsThreadEnvironmentService } from "../../../../packages/work/src/thread-environments.js";
import type { ProjectsEngineRepository } from "../../../../packages/work/src/repository.js";
import type {
  EnvironmentRecord,
  ProjectRecord,
  RepoRecord,
  ThreadEnvironmentBindingRecord,
  ThreadRecord,
  WorkspaceRecord,
} from "../../../../packages/work/src/types.js";
import { createProjectThreadListItem } from "../../../../packages/work/src/view-models.js";
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
const DEFAULT_THREAD_AGENT_ID = "aria-agent";
const LOCAL_AGENT_TIMEOUT_MS = 20 * 60_000;
const DEFAULT_LOCAL_AGENT_TURNS = 8;
const DEFAULT_MODEL_OPTION_LABEL = "Default";
const PROJECT_PROMPT_SKILL_REFERENCE_PATTERN = /(?<![\w/])\$([a-z][a-z0-9._-]*)\b/g;
const PROJECT_PROMPT_AT_REFERENCE_PATTERN = /(?<![\w/])@([^\s@]+)/g;
const TRAILING_REFERENCE_PUNCTUATION_PATTERN = /[),.;!?]+$/;
const MAX_PROJECT_PROMPT_FILES = 250;
const PROJECT_PROMPT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);

type GitMetadata = {
  defaultBranch: string;
  remoteUrl: string;
  repoName: string;
};

type RunningThreadExecution = {
  backendId: string;
  executionId: string;
};

type ProjectPromptSkillRecord = {
  content: string;
  description: string;
  filePath: string;
  name: string;
};

type DesktopProjectsServiceOptions = {
  backendRegistry?: Map<string, RuntimeBackendAdapter>;
  dbPath?: string;
  localAriaClient?: () => Pick<AriaChatClient, "chat" | "health" | "session">;
  now?: () => number;
  pickDirectory?: (ownerWindow?: BrowserWindow | null) => Promise<string | null>;
  readGitMetadata?: (directoryPath: string) => Promise<GitMetadata | null>;
  runtimeHome?: string;
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

async function listChangedFiles(workingDirectory: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      workingDirectory,
      "status",
      "--porcelain=v1",
    ]);

    return stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const path = line.length > 3 ? line.slice(3).trim() : line.trim();
        const renameSeparator = " -> ";
        const renameIndex = path.indexOf(renameSeparator);
        return renameIndex >= 0 ? path.slice(renameIndex + renameSeparator.length).trim() : path;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function createLocalAriaAgentBackend(options: {
  clientFactory: () => Pick<AriaChatClient, "chat" | "health" | "session">;
}): RuntimeBackendAdapter {
  const runningSessions = new Map<
    string,
    {
      client: Pick<AriaChatClient, "chat">;
      sessionId: string;
      unsubscribe?: () => void;
    }
  >();

  return {
    backend: "aria",
    capabilities: {
      supportsAuthProbe: false,
      supportsBackgroundExecution: true,
      supportsCancellation: true,
      supportsFileEditing: true,
      supportsStreamingEvents: true,
      supportsStructuredOutput: true,
    },
    displayName: "Aria Agent",
    async probeAvailability() {
      try {
        await options.clientFactory().health.ping.query();
        return {
          authState: "unknown" as const,
          available: true,
          detectedVersion: null,
          reason: null,
        };
      } catch (error) {
        return {
          authState: "unknown" as const,
          available: false,
          detectedVersion: null,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async execute(request, observer) {
      const client = options.clientFactory();
      const sessionId =
        request.sessionId ??
        (
          await client.session.create.mutate({
            connectorType: "engine",
            prefix: `project:${request.threadId ?? request.metadata?.threadId ?? request.executionId}`,
          })
        ).session.id;
      let stdout = "";
      let stderr = "";
      let status: RuntimeBackendExecutionResult["status"] = "succeeded";
      let summary: string | null = null;

      await observer?.onEvent?.({
        backend: "aria",
        executionId: request.executionId,
        metadata: {
          ...request.metadata,
          sessionId,
        },
        timestamp: Date.now(),
        type: "execution.started",
      });

      return await new Promise<RuntimeBackendExecutionResult>((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        const finish = async (nextStatus: RuntimeBackendExecutionResult["status"]) => {
          if (settled) {
            return;
          }
          settled = true;
          if (timeout) {
            clearTimeout(timeout);
          }
          const running = runningSessions.get(request.executionId);
          running?.unsubscribe?.();
          runningSessions.delete(request.executionId);
          status = nextStatus;
          summary = stdout.trim().slice(0, 500) || null;
          await observer?.onEvent?.({
            backend: "aria",
            executionId: request.executionId,
            metadata: {
              ...request.metadata,
              sessionId,
            },
            status,
            summary,
            timestamp: Date.now(),
            type: "execution.completed",
          });
          resolve({
            backend: "aria",
            executionId: request.executionId,
            exitCode: status === "succeeded" ? 0 : 1,
            filesChanged: await listChangedFiles(request.workingDirectory),
            metadata: {
              ...request.metadata,
              sessionId,
            },
            status,
            stderr,
            stdout,
            summary,
          });
        };

        timeout = setTimeout(() => {
          void finish("timed_out");
          void client.chat.stop?.mutate({ sessionId });
        }, request.timeoutMs);

        try {
          const subscription = client.chat.stream.subscribe(
            {
              message: request.prompt,
              sessionId,
              workingDirectory: request.workingDirectory,
              suppressMemoryContext: true,
            },
            {
              onComplete() {
                void finish(status);
              },
              onData(event) {
                if (event.type === "text_delta") {
                  stdout += event.delta;
                  void observer?.onEvent?.({
                    backend: "aria",
                    chunk: event.delta,
                    executionId: request.executionId,
                    metadata: request.metadata,
                    timestamp: Date.now(),
                    type: "execution.stdout",
                  });
                } else if (event.type === "tool_approval_request") {
                  void observer?.onEvent?.({
                    backend: "aria",
                    executionId: request.executionId,
                    metadata: {
                      ...request.metadata,
                      toolCallId: event.id,
                      toolName: event.name,
                    },
                    timestamp: Date.now(),
                    type: "execution.waiting_approval",
                  });
                } else if (event.type === "error") {
                  status = "failed";
                  stderr += event.message;
                  void observer?.onEvent?.({
                    backend: "aria",
                    chunk: event.message,
                    executionId: request.executionId,
                    metadata: request.metadata,
                    timestamp: Date.now(),
                    type: "execution.stderr",
                  });
                  void finish("failed");
                } else if (event.type === "done") {
                  void finish(status);
                }
              },
              onError(error) {
                status = "failed";
                stderr += error instanceof Error ? error.message : String(error);
                void finish("failed");
              },
            },
          );

          runningSessions.set(request.executionId, {
            client,
            sessionId,
            unsubscribe:
              subscription && "unsubscribe" in subscription
                ? () => subscription.unsubscribe()
                : undefined,
          });
        } catch (error) {
          status = "failed";
          stderr += error instanceof Error ? error.message : String(error);
          void finish("failed");
        }
      });
    },
    async cancel(executionId) {
      const running = runningSessions.get(executionId);
      if (!running) {
        return;
      }
      running.unsubscribe?.();
      runningSessions.delete(executionId);
      await running.client.chat.stop?.mutate({ sessionId: running.sessionId });
    },
  };
}

function createDefaultDesktopBackendRegistry(
  runtimeHome: string,
  localAriaClient?: () => Pick<AriaChatClient, "chat" | "health" | "session">,
): Map<string, RuntimeBackendAdapter> {
  const createClient =
    localAriaClient ??
    (() =>
      createLocalAccessClient(runtimeHome) as unknown as Pick<
        AriaChatClient,
        "chat" | "health" | "session"
      >);

  return new Map<string, RuntimeBackendAdapter>([
    [
      DEFAULT_THREAD_AGENT_ID,
      createLocalAriaAgentBackend({
        clientFactory: createClient,
      }),
    ],
  ]);
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

async function assertValidBranchName(branchName: string, workingDirectory: string): Promise<void> {
  await execFileAsync("git", ["-C", workingDirectory, "check-ref-format", "--branch", branchName]);
}

function buildBranchEnvironmentLabel(branchName: string): string {
  return `${DESKTOP_LOCAL_WORKSPACE_LABEL} / ${branchName}`;
}

function toggleId(ids: string[], id: string, enabled: boolean): string[] {
  return enabled ? Array.from(new Set([...ids, id])) : ids.filter((entry) => entry !== id);
}

function stripReferencePunctuation(value: string): string {
  return value.replace(TRAILING_REFERENCE_PUNCTUATION_PATTERN, "");
}

function parseReferenceLineRange(target: string): { lineSuffix: string; path: string } {
  const match = target.match(/^(.*?)(:\d+(?:-\d+)?)$/);
  if (!match) {
    return {
      lineSuffix: "",
      path: target,
    };
  }

  return {
    lineSuffix: match[2] ?? "",
    path: match[1] ?? target,
  };
}

function normalizeProjectContextMentions(message: string, cwd: string): string {
  return message.replace(PROJECT_PROMPT_AT_REFERENCE_PATTERN, (raw, tokenValue: string) => {
    if (
      tokenValue === "diff" ||
      tokenValue === "staged" ||
      tokenValue.startsWith("file:") ||
      tokenValue.startsWith("folder:") ||
      tokenValue.startsWith("url:")
    ) {
      return raw;
    }

    const normalizedValue = stripReferencePunctuation(tokenValue);
    if (!normalizedValue) {
      return raw;
    }

    const suffix = tokenValue.slice(normalizedValue.length);
    const parsedTarget = parseReferenceLineRange(normalizedValue);
    const resolvedPath = normalizedValue.startsWith("/")
      ? resolve(parsedTarget.path)
      : resolve(cwd, parsedTarget.path);

    if (!existsSync(resolvedPath)) {
      return raw;
    }

    try {
      const stat = statSync(resolvedPath);
      if (stat.isFile()) {
        return `@file:${parsedTarget.path}${parsedTarget.lineSuffix}${suffix}`;
      }
      if (stat.isDirectory()) {
        return `@folder:${parsedTarget.path}${suffix}`;
      }
    } catch {
      return raw;
    }

    return raw;
  });
}

async function resolveProjectSkillAttachments(
  message: string,
  skillCatalog: Map<string, ProjectPromptSkillRecord>,
): Promise<{ message: string; skillSection: string | null }> {
  const referencedSkillNames = Array.from(
    new Set(
      Array.from(message.matchAll(PROJECT_PROMPT_SKILL_REFERENCE_PATTERN), (match) => match[1]),
    ),
  );

  if (referencedSkillNames.length === 0) {
    return {
      message,
      skillSection: null,
    };
  }

  const resolvedSkillNames = new Set<string>();
  const skillWarnings: string[] = [];
  const skillBlocks: string[] = [];

  for (const skillName of referencedSkillNames) {
    const skill = skillCatalog.get(skillName);
    if (!skill) {
      skillWarnings.push(`$${skillName}: no installed skill named "${skillName}".`);
      continue;
    }

    resolvedSkillNames.add(skillName);
    skillBlocks.push(`<skill name="${skillName}">\n${skill.content.trim()}\n</skill>`);
  }

  const strippedMessage = message
    .replace(PROJECT_PROMPT_SKILL_REFERENCE_PATTERN, (raw, skillName: string) =>
      resolvedSkillNames.has(skillName) ? "" : raw,
    )
    .replace(/\s{2,}/g, " ")
    .trim();

  if (skillBlocks.length === 0 && skillWarnings.length === 0) {
    return {
      message,
      skillSection: null,
    };
  }

  const sections: string[] = [];
  if (skillWarnings.length > 0) {
    sections.push(
      `<skill_warnings>\n${skillWarnings.map((warning) => `- ${warning}`).join("\n")}\n</skill_warnings>`,
    );
  }
  if (skillBlocks.length > 0) {
    sections.push(
      [
        "<attached_skills>",
        "Treat these skills as reusable operating instructions for this request.",
        "",
        skillBlocks.join("\n\n"),
        "</attached_skills>",
      ].join("\n"),
    );
  }

  return {
    message: strippedMessage,
    skillSection: sections.join("\n\n"),
  };
}

function walkProjectSkillFiles(rootDirectory: string): string[] {
  const stack = [rootDirectory];
  const skillFiles: string[] = [];

  while (stack.length > 0) {
    const currentDirectory = stack.pop();
    if (!currentDirectory || !existsSync(currentDirectory)) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(currentDirectory, {
        encoding: "utf8",
        withFileTypes: true,
      }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        if (!PROJECT_PROMPT_IGNORED_DIRECTORIES.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        skillFiles.push(fullPath);
      }
    }
  }

  return skillFiles.sort((left, right) => left.localeCompare(right));
}

function buildProjectSkillSearchRoots(workingDirectory: string): string[] {
  return [
    join(workingDirectory, ".agents", "skills"),
    join(workingDirectory, ".codex", "skills"),
    join(homedir(), ".codex", "skills"),
    join(homedir(), ".agents", "skills"),
  ];
}

function collectProjectPromptSkills(
  workingDirectory: string,
): Map<string, ProjectPromptSkillRecord> {
  const catalog = new Map<string, ProjectPromptSkillRecord>();

  for (const rootDirectory of buildProjectSkillSearchRoots(workingDirectory)) {
    for (const skillFile of walkProjectSkillFiles(rootDirectory)) {
      try {
        const rawContent = readFileSync(skillFile, "utf8");
        const { body, meta } = parseFrontmatter(rawContent);
        if (!meta.name || !meta.description || catalog.has(meta.name)) {
          continue;
        }

        catalog.set(meta.name, {
          content: body.trim(),
          description: meta.description,
          filePath: skillFile,
          name: meta.name,
        });
      } catch {
        // Ignore unreadable skill files and continue with the remaining project skill roots.
      }
    }
  }

  return catalog;
}

function listProjectPromptFiles(rootDirectory: string): string[] {
  const results: string[] = [];
  const queue = [rootDirectory];

  while (queue.length > 0 && results.length < MAX_PROJECT_PROMPT_FILES) {
    const currentDirectory = queue.shift();
    if (!currentDirectory) {
      continue;
    }

    let entries;
    try {
      entries = readdirSync(currentDirectory, {
        encoding: "utf8",
        withFileTypes: true,
      }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= MAX_PROJECT_PROMPT_FILES) {
        break;
      }

      const fullPath = join(currentDirectory, entry.name);
      const relativePath = fullPath.startsWith(`${rootDirectory}/`)
        ? fullPath.slice(rootDirectory.length + 1)
        : entry.name;

      if (entry.isDirectory()) {
        if (!PROJECT_PROMPT_IGNORED_DIRECTORIES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      results.push(relativePath);
    }
  }

  return results;
}

export class DesktopProjectsService {
  private readonly store: DesktopProjectsStore;
  private readonly now: () => number;
  private readonly pickDirectory: (ownerWindow?: BrowserWindow | null) => Promise<string | null>;
  private readonly readGitMetadata: (directoryPath: string) => Promise<GitMetadata | null>;
  private readonly threadEnvironmentService: ProjectsThreadEnvironmentService;
  private readonly backendRegistry: Map<string, RuntimeBackendAdapter>;
  private readonly runtimeHome: string;
  private readonly promptFileCache = new Map<string, string[]>();
  private readonly promptSkillCache = new Map<string, ProjectPromptSkillRecord[]>();
  private readonly listeners = new Set<(state: AriaDesktopProjectShellState) => void>();
  private readonly runningExecutions = new Map<string, RunningThreadExecution>();

  constructor(options: DesktopProjectsServiceOptions = {}) {
    this.runtimeHome = options.runtimeHome ?? getRuntimeHome();
    this.store = new DesktopProjectsStore(
      options.dbPath ?? join(this.runtimeHome, "desktop", "aria-desktop.db"),
    );
    this.now = options.now ?? (() => Date.now());
    this.pickDirectory = options.pickDirectory ?? defaultPickDirectory;
    this.readGitMetadata = options.readGitMetadata ?? defaultReadGitMetadata;
    this.backendRegistry =
      options.backendRegistry ??
      createDefaultDesktopBackendRegistry(this.runtimeHome, options.localAriaClient);
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
      return this.recordThreadFailure(thread, "Unsupported model for Aria Agent.");
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

    try {
      const prompt = await this.buildProjectPrompt(trimmedMessage, environment.locator);
      const result = await backend.execute({
        approvalMode: "auto",
        env: undefined,
        executionId,
        maxTurns: DEFAULT_LOCAL_AGENT_TURNS,
        metadata: {
          projectId: thread.projectId,
          threadId: thread.threadId,
        },
        modelId: existingState?.selectedModelId ?? null,
        prompt,
        sessionId: existingState?.backendSessionId ?? null,
        threadId: thread.threadId,
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
        this.store.upsertThread({
          ...thread,
          status: resolveThreadStatus(result),
          title: thread.title,
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
      this.promptFileCache.delete(environment.locator);
      this.promptSkillCache.delete(environment.locator);
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
    const agentLabel = backend?.displayName ?? formatAgentLabel(thread.agentId) ?? "Aria Agent";
    const projectEnvironments = this.store.listEnvironments(project.projectId);
    const selectedModelId = storedState?.selectedModelId ?? null;
    const cachedModelOptions = this.getThreadModelOptions(thread);
    const promptFiles = environment ? this.getProjectPromptFiles(environment.locator) : [];
    const promptSkills = environment ? this.getPromptSkillSuggestions(environment.locator) : [];
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
      promptSuggestions: {
        files: promptFiles.map((filePath) => ({
          detail: environment?.label ?? null,
          label: filePath,
          value: filePath,
        })),
        skills: promptSkills.map((skill) => ({
          description: skill.description,
          label: skill.name,
          value: skill.name,
        })),
      },
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
    return getAvailableModelOptions(thread.agentId ?? DEFAULT_THREAD_AGENT_ID);
  }

  private getPromptSkillSuggestions(
    workingDirectory: string,
  ): Array<{ description: string; name: string }> {
    const cachedSkills = this.promptSkillCache.get(workingDirectory);
    if (cachedSkills) {
      return cachedSkills.map((skill) => ({
        description: skill.description,
        name: skill.name,
      }));
    }

    const skills = Array.from(collectProjectPromptSkills(workingDirectory).values()).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    this.promptSkillCache.set(workingDirectory, skills);
    return skills.map((skill) => ({
      description: skill.description,
      name: skill.name,
    }));
  }

  private getProjectPromptFiles(environmentLocator: string): string[] {
    const cachedFiles = this.promptFileCache.get(environmentLocator);
    if (cachedFiles) {
      return cachedFiles;
    }

    const files = listProjectPromptFiles(environmentLocator);
    this.promptFileCache.set(environmentLocator, files);
    return files;
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

  private async buildProjectPrompt(message: string, workingDirectory: string): Promise<string> {
    const skillCatalog = collectProjectPromptSkills(workingDirectory);
    const skillAttachments = await resolveProjectSkillAttachments(message, skillCatalog);
    const normalizedMessage = normalizeProjectContextMentions(
      skillAttachments.message,
      workingDirectory,
    );
    const contextReferences = await preprocessContextReferences(normalizedMessage, {
      allowedRoot: workingDirectory,
      cwd: workingDirectory,
    });

    const sections = [skillAttachments.skillSection, contextReferences.message]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    return sections.join("\n\n").trim() || message;
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
