import { spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import {
  createOpencodeClient,
  createOpencodeServer,
  type AssistantMessage,
  type Config as OpencodeConfig,
  type OpencodeClient,
  type Part,
  type Provider,
} from "@opencode-ai/sdk";
import type {
  RuntimeBackendAdapter,
  RuntimeBackendAvailability,
  RuntimeBackendCapabilities,
  RuntimeBackendExecutionObserver,
  RuntimeBackendExecutionRequest,
  RuntimeBackendExecutionResult,
} from "./contracts.js";

type RunningExecution = {
  abortController: AbortController;
  cancelled: boolean;
  client: OpencodeClient;
  closeServer: () => void;
  sessionId: string | null;
  workingDirectory: string;
};

type ParsedModel = {
  providerID: string;
  modelID: string;
};

type PermissionValue = "allow" | "ask" | "deny";

export type OpenCodeModelOption = {
  label: string;
  modelId: string;
};

type OpenCodeTitleSyncInput = {
  env?: Record<string, string>;
  modelId?: string | null;
  sessionId: string;
  timeoutMs?: number;
  workingDirectory: string;
};

function parseModelId(modelId: string | null | undefined): ParsedModel | null {
  const trimmed = modelId?.trim();
  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }

  return {
    modelID: trimmed.slice(separatorIndex + 1),
    providerID: trimmed.slice(0, separatorIndex),
  };
}

function buildPermissionConfig(
  approvalMode: RuntimeBackendExecutionRequest["approvalMode"],
): OpencodeConfig["permission"] {
  const level: PermissionValue = approvalMode === "gated" ? "deny" : "allow";
  return {
    bash: level,
    edit: level,
    webfetch: level,
  };
}

function mapProvidersToModelOptions(providers: Provider[]): OpenCodeModelOption[] {
  return providers
    .flatMap((provider) =>
      Object.values(provider.models)
        .filter((model) => {
          const capabilities = (model as { capabilities?: { toolcall?: boolean } }).capabilities;
          const legacy = (model as { tool_call?: boolean }).tool_call;
          return capabilities?.toolcall ?? legacy ?? true;
        })
        .map((model) => ({
          label: `${provider.name} / ${model.name}`,
          modelId: `${provider.id}/${model.id}`,
        })),
    )
    .sort((left, right) => left.label.localeCompare(right.label));
}

async function reservePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Failed to reserve a local port for OpenCode."));
        });
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function collectChangedFiles(workingDirectory: string): string[] {
  const result = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: workingDirectory,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return [];
  }

  return (result.stdout ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractText(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractToolOutput(parts: Part[]): string {
  const outputs: string[] = [];

  for (const part of parts) {
    if (part.type !== "tool") {
      continue;
    }

    if (part.state.status === "completed") {
      const output = part.state.output;
      if (typeof output === "string" && output.trim().length > 0) {
        outputs.push(output.trim());
      }
    }

    if (part.state.status === "error") {
      const error = part.state.error;
      if (typeof error === "string" && error.trim().length > 0) {
        outputs.push(error.trim());
      }
    }
  }

  return outputs.join("\n\n").trim();
}

function extractErrorMessage(message: AssistantMessage): string | null {
  const error = message.error;
  if (!error) {
    return null;
  }

  if ("data" in error && error.data && typeof error.data === "object") {
    const messageValue = (error.data as { message?: unknown }).message;
    if (typeof messageValue === "string" && messageValue.trim().length > 0) {
      return messageValue.trim();
    }
  }

  return error.name;
}

function isGenericSessionTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim();
  if (!trimmed) {
    return true;
  }

  return /^New session\s+-/i.test(trimmed) || /^Conversation recap so far$/i.test(trimmed);
}

async function resolveSessionId(
  client: OpencodeClient,
  request: RuntimeBackendExecutionRequest,
): Promise<string> {
  if (request.sessionId) {
    try {
      await client.session.get({
        path: { id: request.sessionId },
        query: { directory: request.workingDirectory },
        responseStyle: "data",
        throwOnError: true,
      });
      return request.sessionId;
    } catch {
      // Fall back to creating a new session below.
    }
  }

  const session = await client.session.create({
    query: { directory: request.workingDirectory },
    responseStyle: "data",
    throwOnError: true,
  });

  const resolvedSession = "data" in session ? session.data : session;
  return resolvedSession.id;
}

export class OpenCodeRuntimeBackendAdapter implements RuntimeBackendAdapter {
  readonly backend = "opencode";
  readonly displayName = "OpenCode";
  readonly capabilities: RuntimeBackendCapabilities = {
    supportsStreamingEvents: false,
    supportsCancellation: true,
    supportsStructuredOutput: true,
    supportsFileEditing: true,
    supportsBackgroundExecution: false,
    supportsAuthProbe: false,
  };

  private readonly running = new Map<string, RunningExecution>();
  private envLock: Promise<void> = Promise.resolve();

  async probeAvailability(): Promise<RuntimeBackendAvailability> {
    const result = spawnSync("opencode", ["--version"], { encoding: "utf8" });
    const detectedVersion = (result.stdout ?? result.stderr ?? "").trim() || null;

    return {
      available: result.status === 0,
      authState: "unknown",
      detectedVersion,
      reason: result.status === 0 ? null : "The opencode CLI is not installed or not on PATH.",
    };
  }

  async execute(
    request: RuntimeBackendExecutionRequest,
    observer?: RuntimeBackendExecutionObserver,
  ): Promise<RuntimeBackendExecutionResult> {
    const abortController = new AbortController();
    const config: OpencodeConfig = {
      permission: buildPermissionConfig(request.approvalMode),
      share: "disabled",
      ...(request.modelId ? { model: request.modelId } : {}),
    };

    await observer?.onEvent?.({
      type: "execution.started",
      backend: this.backend,
      executionId: request.executionId,
      timestamp: Date.now(),
      metadata: request.metadata,
    });

    const server = await this.createServerWithEnv(request, config, abortController.signal);
    const client = createOpencodeClient({
      baseUrl: server.url,
    });
    const running: RunningExecution = {
      abortController,
      cancelled: false,
      client,
      closeServer: () => server.close(),
      sessionId: null,
      workingDirectory: request.workingDirectory,
    };
    this.running.set(request.executionId, running);

    try {
      const sessionId = await resolveSessionId(client, request);
      running.sessionId = sessionId;
      const model = parseModelId(request.modelId);

      const promptResult = await client.session.prompt({
        body: {
          agent: request.approvalMode === "gated" ? "plan" : "build",
          ...(model ? { model } : {}),
          parts: [{ text: request.prompt, type: "text" }],
        },
        path: { id: sessionId },
        query: { directory: request.workingDirectory },
        responseStyle: "data",
        throwOnError: true,
      });
      const promptData = "data" in promptResult ? promptResult.data : promptResult;

      const stdout = extractText(promptData.parts) || extractToolOutput(promptData.parts);
      const errorMessage = extractErrorMessage(promptData.info);
      const stderr = errorMessage ?? "";
      const filesChanged = collectChangedFiles(request.workingDirectory);
      const cancelled = running.cancelled || promptData.info.error?.name === "MessageAbortedError";
      const failed = Boolean(promptData.info.error && !cancelled);

      if (stdout.length > 0) {
        await observer?.onEvent?.({
          type: "execution.stdout",
          backend: this.backend,
          executionId: request.executionId,
          timestamp: Date.now(),
          chunk: stdout,
          metadata: request.metadata,
        });
      }

      if (stderr.length > 0) {
        await observer?.onEvent?.({
          type: "execution.stderr",
          backend: this.backend,
          executionId: request.executionId,
          timestamp: Date.now(),
          chunk: stderr,
          metadata: request.metadata,
        });
      }

      const result: RuntimeBackendExecutionResult = {
        backend: this.backend,
        executionId: request.executionId,
        exitCode: cancelled ? -1 : failed ? 1 : 0,
        filesChanged,
        metadata: {
          ...(request.metadata ?? {}),
          modelId: promptData.info.modelID,
          providerId: promptData.info.providerID,
          sessionId,
        },
        status: cancelled ? "cancelled" : failed ? "failed" : "succeeded",
        stderr,
        stdout,
        summary: stdout || null,
      };

      await observer?.onEvent?.({
        type: "execution.completed",
        backend: this.backend,
        executionId: request.executionId,
        timestamp: Date.now(),
        status: result.status,
        summary: result.summary,
        metadata: result.metadata,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: RuntimeBackendExecutionResult = {
        backend: this.backend,
        executionId: request.executionId,
        exitCode: running.cancelled ? -1 : 1,
        filesChanged: collectChangedFiles(request.workingDirectory),
        metadata: {
          ...(request.metadata ?? {}),
          ...(running.sessionId ? { sessionId: running.sessionId } : {}),
        },
        status: running.cancelled ? "cancelled" : "failed",
        stderr: message,
        stdout: "",
        summary: null,
      };

      await observer?.onEvent?.({
        type: "execution.stderr",
        backend: this.backend,
        executionId: request.executionId,
        timestamp: Date.now(),
        chunk: message,
        metadata: request.metadata,
      });
      await observer?.onEvent?.({
        type: "execution.completed",
        backend: this.backend,
        executionId: request.executionId,
        timestamp: Date.now(),
        status: result.status,
        summary: null,
        metadata: result.metadata,
      });

      return result;
    } finally {
      try {
        running.closeServer();
      } finally {
        this.running.delete(request.executionId);
      }
    }
  }

  async listModels(input: {
    env?: Record<string, string>;
    timeoutMs?: number;
    workingDirectory: string;
  }): Promise<OpenCodeModelOption[]> {
    const abortController = new AbortController();
    const server = await this.createServer(
      {
        share: "disabled",
      },
      input.env,
      abortController.signal,
      input.timeoutMs ?? 10_000,
    );

    try {
      const client = createOpencodeClient({
        baseUrl: server.url,
      });
      const providersResponse = await client.config.providers({
        query: { directory: input.workingDirectory },
        responseStyle: "data",
        throwOnError: true,
      });
      const resolvedProviders =
        "data" in providersResponse ? providersResponse.data : providersResponse;

      return mapProvidersToModelOptions(resolvedProviders.providers);
    } finally {
      abortController.abort();
      server.close();
    }
  }

  async syncSessionTitle(input: OpenCodeTitleSyncInput): Promise<string | null> {
    const abortController = new AbortController();
    const server = await this.createServer(
      {
        share: "disabled",
      },
      input.env,
      abortController.signal,
      input.timeoutMs ?? 15_000,
    );

    try {
      const client = createOpencodeClient({
        baseUrl: server.url,
      });
      const sessionResult = await client.session.get({
        path: { id: input.sessionId },
        query: { directory: input.workingDirectory },
        responseStyle: "data",
        throwOnError: true,
      });
      const currentSession = "data" in sessionResult ? sessionResult.data : sessionResult;

      if (!isGenericSessionTitle(currentSession.title)) {
        return currentSession.title;
      }

      const parsedModel = parseModelId(input.modelId);
      if (!parsedModel) {
        return currentSession.title;
      }

      await client.session.summarize({
        body: {
          modelID: parsedModel.modelID,
          providerID: parsedModel.providerID,
        },
        path: { id: input.sessionId },
        query: { directory: input.workingDirectory },
        responseStyle: "data",
        throwOnError: true,
      });

      const updatedResult = await client.session.get({
        path: { id: input.sessionId },
        query: { directory: input.workingDirectory },
        responseStyle: "data",
        throwOnError: true,
      });
      const updatedSession = "data" in updatedResult ? updatedResult.data : updatedResult;

      return updatedSession.title;
    } finally {
      abortController.abort();
      server.close();
    }
  }

  async cancel(executionId: string): Promise<void> {
    const running = this.running.get(executionId);
    if (!running) {
      return;
    }

    running.cancelled = true;
    running.abortController.abort();

    if (running.sessionId) {
      try {
        await running.client.session.abort({
          path: { id: running.sessionId },
          query: { directory: running.workingDirectory },
          responseStyle: "data",
          throwOnError: true,
        });
      } catch {
        // Ignore abort errors during cancellation cleanup.
      }
    }

    try {
      running.closeServer();
    } finally {
      this.running.delete(executionId);
    }
  }

  private async createServerWithEnv(
    request: RuntimeBackendExecutionRequest,
    config: OpencodeConfig,
    signal: AbortSignal,
  ) {
    return this.createServer(config, request.env, signal, Math.min(request.timeoutMs, 15_000));
  }

  private async createServer(
    config: OpencodeConfig,
    env: Record<string, string | undefined> | undefined,
    signal: AbortSignal,
    timeout: number,
  ) {
    const port = await reservePort();

    return this.withSerializedEnv(
      {
        XDG_CACHE_HOME: env?.XDG_CACHE_HOME,
        XDG_DATA_HOME: env?.XDG_DATA_HOME,
        XDG_STATE_HOME: env?.XDG_STATE_HOME,
      },
      () =>
        createOpencodeServer({
          config,
          hostname: "127.0.0.1",
          port,
          signal,
          timeout,
        }),
    );
  }

  private async withSerializedEnv<T>(
    overrides: Record<string, string | undefined>,
    action: () => Promise<T>,
  ): Promise<T> {
    let releaseLock: (() => void) | undefined;
    const waitForTurn = this.envLock;
    this.envLock = new Promise<void>((resolve) => {
      releaseLock = () => resolve();
    });

    await waitForTurn;

    const previousValues = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(overrides)) {
      previousValues.set(key, process.env[key]);
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }

    try {
      return await action();
    } finally {
      for (const [key, value] of previousValues) {
        if (typeof value === "string") {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
      releaseLock?.();
    }
  }
}

export function createOpenCodeRuntimeBackendAdapter(): OpenCodeRuntimeBackendAdapter {
  return new OpenCodeRuntimeBackendAdapter();
}
