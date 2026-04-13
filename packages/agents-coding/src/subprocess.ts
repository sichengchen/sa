import type {
  RuntimeBackendAdapter,
  RuntimeBackendAvailability,
  RuntimeBackendCapabilities,
  RuntimeBackendExecutionObserver,
  RuntimeBackendExecutionRequest,
  RuntimeBackendExecutionResult,
  RuntimeBackendExecutionStatus,
  RuntimeBackendId,
} from "./contracts.js";

export type {
  RuntimeBackendAvailability,
  RuntimeBackendCapabilities,
  RuntimeBackendExecutionObserver,
  RuntimeBackendExecutionRequest,
  RuntimeBackendExecutionResult,
  RuntimeBackendExecutionStatus,
  RuntimeBackendId,
  RuntimeBackendTokenUsage,
} from "./contracts.js";

interface RunningProcess {
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  timedOut: boolean;
  cancelled: boolean;
}

export abstract class SubprocessRuntimeBackendAdapter implements RuntimeBackendAdapter {
  abstract readonly backend: RuntimeBackendId;
  abstract readonly displayName: string;
  abstract readonly capabilities: RuntimeBackendCapabilities;

  private readonly running = new Map<string, RunningProcess>();

  protected abstract buildCommand(request: RuntimeBackendExecutionRequest): string[];

  protected buildEnv(request: RuntimeBackendExecutionRequest): Record<string, string> {
    const env = { ...process.env, ...request.env };
    return Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }

  protected abstract parseExecutionResult(input: {
    request: RuntimeBackendExecutionRequest;
    exitCode: number;
    stdout: string;
    stderr: string;
    filesChanged: string[];
  }): RuntimeBackendExecutionResult;

  protected async beforeExecute(_request: RuntimeBackendExecutionRequest): Promise<void> {}

  protected async afterExecute(
    _request: RuntimeBackendExecutionRequest,
    _result: RuntimeBackendExecutionResult,
  ): Promise<void> {}

  async probeAvailability(): Promise<RuntimeBackendAvailability> {
    return {
      available: false,
      authState: "unknown",
      reason: "Availability probe not implemented.",
    };
  }

  async execute(
    request: RuntimeBackendExecutionRequest,
    observer?: RuntimeBackendExecutionObserver,
  ): Promise<RuntimeBackendExecutionResult> {
    await this.beforeExecute(request);

    const [command, ...args] = this.buildCommand(request);
    const proc = Bun.spawn([command, ...args], {
      cwd: request.workingDirectory,
      env: this.buildEnv(request),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const running: RunningProcess = {
      proc,
      timedOut: false,
      cancelled: false,
    };
    this.running.set(request.executionId, running);

    await observer?.onEvent?.({
      type: "execution.started",
      backend: this.backend,
      executionId: request.executionId,
      timestamp: Date.now(),
      metadata: request.metadata,
    });

    const timeoutId = setTimeout(() => {
      running.timedOut = true;
      proc.kill();
    }, request.timeoutMs);

    try {
      const exitCode = await proc.exited;
      clearTimeout(timeoutId);

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const filesChanged = this.collectChangedFiles(request.workingDirectory);

      if (stdout.length > 0) {
        await observer?.onEvent?.({
          type: "execution.stdout",
          backend: this.backend,
          executionId: request.executionId,
          timestamp: Date.now(),
          chunk: stdout,
        });
      }

      if (stderr.length > 0) {
        await observer?.onEvent?.({
          type: "execution.stderr",
          backend: this.backend,
          executionId: request.executionId,
          timestamp: Date.now(),
          chunk: stderr,
        });
      }

      let result: RuntimeBackendExecutionResult;
      if (running.cancelled || running.timedOut || exitCode === null) {
        const status: RuntimeBackendExecutionStatus = running.cancelled
          ? "cancelled"
          : running.timedOut
            ? "timed_out"
            : "failed";
        result = {
          backend: this.backend,
          executionId: request.executionId,
          status,
          exitCode: exitCode ?? -1,
          stdout,
          stderr,
          filesChanged,
          metadata: request.metadata,
        };
      } else {
        result = this.parseExecutionResult({
          request,
          exitCode,
          stdout,
          stderr,
          filesChanged,
        });
      }

      await observer?.onEvent?.({
        type: "execution.completed",
        backend: this.backend,
        executionId: request.executionId,
        timestamp: Date.now(),
        status: result.status,
        summary: result.summary,
        metadata: result.metadata,
      });

      await this.afterExecute(request, result);
      return result;
    } finally {
      clearTimeout(timeoutId);
      this.running.delete(request.executionId);
    }
  }

  async cancel(executionId: string): Promise<void> {
    const running = this.running.get(executionId);
    if (!running) {
      return;
    }

    running.cancelled = true;
    running.proc.kill();
    this.running.delete(executionId);
  }

  protected probeBinary(
    command: string,
    versionArg = "--version",
  ): {
    available: boolean;
    detectedVersion?: string | null;
  } {
    const result = Bun.spawnSync([command, versionArg], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      return { available: false, detectedVersion: null };
    }

    const stdout = result.stdout.toString().trim();
    const stderr = result.stderr.toString().trim();
    return {
      available: true,
      detectedVersion: stdout || stderr || null,
    };
  }

  protected runCheck(
    command: string[],
    env?: Record<string, string>,
  ): { exitCode: number; stdout: string; stderr: string } {
    const result = Bun.spawnSync(command, {
      stdout: "pipe",
      stderr: "pipe",
      env: env ? { ...process.env, ...env } : process.env,
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  }

  private collectChangedFiles(workingDirectory: string): string[] {
    const result = Bun.spawnSync(["git", "diff", "--name-only", "HEAD"], {
      cwd: workingDirectory,
      stdout: "pipe",
      stderr: "pipe",
    });

    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .toString()
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  }
}
