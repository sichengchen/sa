import {
  SubprocessRuntimeBackendAdapter,
  type RuntimeBackendAvailability,
  type RuntimeBackendCapabilities,
  type RuntimeBackendExecutionRequest,
  type RuntimeBackendExecutionResult,
} from "./subprocess.js";

type ParsedEvent = Record<string, unknown>;

export class OpenCodeRuntimeBackendAdapter extends SubprocessRuntimeBackendAdapter {
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

  async probeAvailability(): Promise<RuntimeBackendAvailability> {
    const version = this.probeBinary("opencode");
    return {
      available: version.available,
      authState: "unknown",
      detectedVersion: version.detectedVersion,
      reason: version.available ? null : "The opencode CLI is not installed or not on PATH.",
    };
  }

  protected buildCommand(request: RuntimeBackendExecutionRequest): string[] {
    return [
      "opencode",
      "run",
      "--format",
      "json",
      "--agent",
      request.approvalMode === "gated" ? "plan" : "build",
      request.prompt,
    ];
  }

  protected buildEnv(request: RuntimeBackendExecutionRequest): Record<string, string> {
    const permission = request.approvalMode === "gated" ? { edit: "deny", bash: "deny" } : "allow";

    return {
      ...super.buildEnv(request),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission }),
    };
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

  private extractSummary(stdout: string): string | null {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return null;
    }

    const direct = this.extractSummaryFromValue(this.tryParseJson(trimmed));
    if (direct) {
      return direct;
    }

    const lines = trimmed.split("\n");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const summary = this.extractSummaryFromValue(this.tryParseJson(lines[index] ?? ""));
      if (summary) {
        return summary;
      }
    }

    return null;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private extractSummaryFromValue(value: unknown): string | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const nested = this.extractSummaryFromValue(value[index]);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    const record = value as ParsedEvent;
    for (const key of ["result", "summary", "content", "text"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    const message = record.message;
    if (message && typeof message === "object" && !Array.isArray(message)) {
      const nested = message as ParsedEvent;
      for (const key of ["content", "text"]) {
        const candidate = nested[key];
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          return candidate.trim();
        }
      }
    }

    if (
      record.type === "message" &&
      record.role === "assistant" &&
      typeof record.content === "string" &&
      record.content.trim().length > 0
    ) {
      return record.content.trim();
    }

    return null;
  }
}

export function createOpenCodeRuntimeBackendAdapter(): OpenCodeRuntimeBackendAdapter {
  return new OpenCodeRuntimeBackendAdapter();
}
