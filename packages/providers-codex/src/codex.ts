import {
  SubprocessRuntimeBackendAdapter,
  type RuntimeBackendAvailability,
  type RuntimeBackendCapabilities,
  type RuntimeBackendExecutionRequest,
  type RuntimeBackendExecutionResult,
} from "@aria/agents-coding/subprocess";

export class CodexRuntimeBackendAdapter extends SubprocessRuntimeBackendAdapter {
  readonly backend = "codex";
  readonly displayName = "Codex";
  readonly capabilities: RuntimeBackendCapabilities = {
    supportsStreamingEvents: false,
    supportsCancellation: true,
    supportsStructuredOutput: true,
    supportsFileEditing: true,
    supportsBackgroundExecution: false,
    supportsAuthProbe: true,
  };

  async probeAvailability(): Promise<RuntimeBackendAvailability> {
    const version = this.probeBinary("codex");
    if (!version.available) {
      return {
        available: false,
        authState: "missing",
        detectedVersion: version.detectedVersion,
        reason: "The codex CLI is not installed or not on PATH.",
      };
    }

    if (process.env.OPENAI_API_KEY) {
      return {
        available: true,
        authState: "configured",
        detectedVersion: version.detectedVersion,
      };
    }

    const auth = this.runCheck(["codex", "login", "status"]);
    return {
      available: auth.exitCode === 0,
      authState: auth.exitCode === 0 ? "configured" : "missing",
      detectedVersion: version.detectedVersion,
      reason:
        auth.exitCode === 0
          ? null
          : "Codex auth is not configured and OPENAI_API_KEY is missing.",
    };
  }

  protected buildCommand(request: RuntimeBackendExecutionRequest): string[] {
    return [
      "codex",
      "exec",
      "--json",
      "-s",
      this.resolveSandbox(request.approvalMode),
      request.prompt,
    ];
  }

  protected parseExecutionResult(input: {
    request: RuntimeBackendExecutionRequest;
    exitCode: number;
    stdout: string;
    stderr: string;
    filesChanged: string[];
  }): RuntimeBackendExecutionResult {
    if (input.exitCode !== 0) {
      return {
        backend: this.backend,
        executionId: input.request.executionId,
        status: "failed",
        exitCode: input.exitCode,
        stdout: input.stdout,
        stderr: input.stderr,
        filesChanged: input.filesChanged,
        metadata: input.request.metadata,
      };
    }

    return {
      backend: this.backend,
      executionId: input.request.executionId,
      status: "succeeded",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr,
      filesChanged: input.filesChanged,
      summary: this.extractSummary(input.stdout),
      metadata: input.request.metadata,
    };
  }

  private resolveSandbox(approvalMode: RuntimeBackendExecutionRequest["approvalMode"]): string {
    switch (approvalMode) {
      case "gated":
        return "read-only";
      case "suggest":
        return "workspace-write";
      default:
        return "danger-full-access";
    }
  }

  private extractSummary(stdout: string): string | null {
    const lines = stdout.trim().split("\n").filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        const parsed = JSON.parse(lines[index] ?? "null") as {
          type?: string;
          content?: string;
        };
        if (parsed.type === "message" && typeof parsed.content === "string") {
          return parsed.content;
        }
      } catch {
        // Ignore non-JSON lines.
      }
    }

    return null;
  }
}

export function createCodexRuntimeBackendAdapter(): CodexRuntimeBackendAdapter {
  return new CodexRuntimeBackendAdapter();
}
