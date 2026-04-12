import {
  SubprocessRuntimeBackendAdapter,
  type RuntimeBackendAvailability,
  type RuntimeBackendCapabilities,
  type RuntimeBackendExecutionRequest,
  type RuntimeBackendExecutionResult,
  type RuntimeBackendTokenUsage,
} from "@aria/agents-coding/subprocess";

interface ClaudeJsonResult {
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export class ClaudeCodeRuntimeBackendAdapter extends SubprocessRuntimeBackendAdapter {
  readonly backend = "claude-code";
  readonly displayName = "Claude Code";
  readonly capabilities: RuntimeBackendCapabilities = {
    supportsStreamingEvents: false,
    supportsCancellation: true,
    supportsStructuredOutput: true,
    supportsFileEditing: true,
    supportsBackgroundExecution: false,
    supportsAuthProbe: true,
  };

  async probeAvailability(): Promise<RuntimeBackendAvailability> {
    const version = this.probeBinary("claude");
    if (!version.available) {
      return {
        available: false,
        authState: "missing",
        detectedVersion: version.detectedVersion,
        reason: "The claude CLI is not installed or not on PATH.",
      };
    }

    if (process.env.ANTHROPIC_API_KEY) {
      return {
        available: true,
        authState: "configured",
        detectedVersion: version.detectedVersion,
      };
    }

    const auth = this.runCheck(["claude", "auth", "status"], { CLAUDECODE: "" });
    if (auth.exitCode !== 0) {
      return {
        available: false,
        authState: "missing",
        detectedVersion: version.detectedVersion,
        reason: "Claude Code auth is not configured and ANTHROPIC_API_KEY is missing.",
      };
    }

    try {
      const parsed = JSON.parse(auth.stdout) as { loggedIn?: boolean };
      return {
        available: parsed.loggedIn === true,
        authState: parsed.loggedIn === true ? "configured" : "missing",
        detectedVersion: version.detectedVersion,
        reason:
          parsed.loggedIn === true
            ? null
            : "Claude Code auth is not configured and ANTHROPIC_API_KEY is missing.",
      };
    } catch {
      return {
        available: true,
        authState: "unknown",
        detectedVersion: version.detectedVersion,
      };
    }
  }

  protected buildCommand(request: RuntimeBackendExecutionRequest): string[] {
    return [
      "claude",
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
      "--max-turns",
      String(request.maxTurns ?? 8),
      "--print",
      "-p",
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

    const parsed = this.tryParseJson(input.stdout);
    return {
      backend: this.backend,
      executionId: input.request.executionId,
      status: "succeeded",
      exitCode: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr,
      filesChanged: input.filesChanged,
      summary: parsed?.result ?? null,
      tokenUsage: this.extractTokenUsage(parsed),
      metadata: input.request.metadata,
    };
  }

  private tryParseJson(value: string): ClaudeJsonResult | null {
    try {
      return JSON.parse(value) as ClaudeJsonResult;
    } catch {
      return null;
    }
  }

  private extractTokenUsage(
    parsed: ClaudeJsonResult | null
  ): RuntimeBackendTokenUsage | undefined {
    if (!parsed?.usage) {
      return undefined;
    }

    return {
      inputTokens: parsed.usage.input_tokens ?? 0,
      outputTokens: parsed.usage.output_tokens ?? 0,
      cacheCreationInputTokens: parsed.usage.cache_creation_input_tokens,
      cacheReadInputTokens: parsed.usage.cache_read_input_tokens,
    };
  }
}

export function createClaudeCodeRuntimeBackendAdapter(): ClaudeCodeRuntimeBackendAdapter {
  return new ClaudeCodeRuntimeBackendAdapter();
}
