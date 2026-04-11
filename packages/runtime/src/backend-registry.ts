import { createAppRouter } from "./procedures.js";
import { createContext } from "./context.js";
import type { EngineRuntime } from "./runtime.js";
import {
  createAriaRuntimeBackendAdapter,
  type RuntimeBackendAdapter,
  type RuntimeBackendAvailability,
  type RuntimeBackendCapabilities,
  type RuntimeBackendExecutionObserver,
  type RuntimeBackendExecutionRequest,
  type RuntimeBackendExecutionResult,
} from "../../providers-aria/src/index.js";
import { createCodexRuntimeBackendAdapter } from "../../providers-codex/src/index.js";
import { createClaudeCodeRuntimeBackendAdapter } from "../../providers-claude-code/src/index.js";
import { createOpenCodeRuntimeBackendAdapter } from "../../providers-opencode/src/index.js";

export interface RuntimeBackendSummary {
  backend: string;
  displayName: string;
  capabilities: RuntimeBackendCapabilities;
  availability: RuntimeBackendAvailability;
}

async function executeWithAriaRuntime(
  runtime: EngineRuntime,
  request: RuntimeBackendExecutionRequest,
  observer?: RuntimeBackendExecutionObserver,
): Promise<RuntimeBackendExecutionResult> {
  const session = request.sessionId
    ? runtime.sessions.getSession(request.sessionId) ?? runtime.sessions.create(request.sessionId, "engine")
    : runtime.sessions.create(`dispatch:${request.executionId}`, "engine");
  const caller = createAppRouter(runtime).createCaller(createContext({ rawToken: runtime.auth.getMasterToken() }));

  let stdout = "";
  let stderr = "";
  let status: RuntimeBackendExecutionResult["status"] = "succeeded";
  let summary: string | null = null;

  await observer?.onEvent?.({
    type: "execution.started",
    backend: "aria",
    executionId: session.id,
    timestamp: Date.now(),
    metadata: request.metadata,
  });

  const stream = await caller.chat.stream({
    sessionId: session.id,
    message: request.prompt,
  });

  for await (const event of stream) {
    if (event.type === "text_delta") {
      stdout += event.delta;
      await observer?.onEvent?.({
        type: "execution.stdout",
        backend: "aria",
        executionId: session.id,
        timestamp: Date.now(),
        chunk: event.delta,
        metadata: request.metadata,
      });
    } else if (event.type === "tool_approval_request") {
      await observer?.onEvent?.({
        type: "execution.waiting_approval",
        backend: "aria",
        executionId: session.id,
        timestamp: Date.now(),
        metadata: {
          ...(request.metadata ?? {}),
          toolCallId: event.id,
          toolName: event.name,
        },
      });
    } else if (event.type === "error") {
      status = "failed";
      stderr += event.message;
      await observer?.onEvent?.({
        type: "execution.stderr",
        backend: "aria",
        executionId: session.id,
        timestamp: Date.now(),
        chunk: event.message,
        metadata: request.metadata,
      });
    } else if (event.type === "done") {
      summary = stdout.trim().slice(0, 500) || null;
    }
  }

  await observer?.onEvent?.({
    type: "execution.completed",
    backend: "aria",
    executionId: session.id,
    timestamp: Date.now(),
    status,
    summary,
    metadata: request.metadata,
  });

  return {
    backend: "aria",
    executionId: session.id,
    status,
    exitCode: status === "succeeded" ? 0 : 1,
    stdout,
    stderr,
    summary,
    filesChanged: [],
    metadata: request.metadata,
  };
}

export function createRuntimeBackendRegistry(runtime: EngineRuntime): Map<string, RuntimeBackendAdapter> {
  return new Map<string, RuntimeBackendAdapter>([
    [
      "aria",
      createAriaRuntimeBackendAdapter({
        driver: {
          execute: (request, observer) => executeWithAriaRuntime(runtime, request, observer),
          cancel: async (executionId) => {
            const caller = createAppRouter(runtime).createCaller(createContext({ rawToken: runtime.auth.getMasterToken() }));
            await caller.chat.stop({ sessionId: executionId });
          },
        },
      }),
    ],
    ["codex", createCodexRuntimeBackendAdapter()],
    ["claude-code", createClaudeCodeRuntimeBackendAdapter()],
    ["opencode", createOpenCodeRuntimeBackendAdapter()],
  ]);
}

export async function listRuntimeBackends(runtime: EngineRuntime): Promise<RuntimeBackendSummary[]> {
  const registry = createRuntimeBackendRegistry(runtime);
  const summaries = await Promise.all(
    Array.from(registry.values()).map(async (adapter) => ({
      backend: adapter.backend,
      displayName: adapter.displayName,
      capabilities: adapter.capabilities,
      availability: await adapter.probeAvailability(),
    })),
  );

  return summaries.sort((left, right) => left.backend.localeCompare(right.backend));
}
