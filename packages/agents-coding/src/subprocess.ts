import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
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
  proc: ChildProcessByStdio<null, Readable, Readable>;
  timedOut: boolean;
  cancelled: boolean;
  stdout: string;
  stderr: string;
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
    const proc = spawn(command, args, {
      cwd: request.workingDirectory,
      env: this.buildEnv(request),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const running: RunningProcess = {
      proc,
      timedOut: false,
      cancelled: false,
      stderr: "",
      stdout: "",
    };
    this.running.set(request.executionId, running);

    proc.stdout.on("data", (chunk) => {
      running.stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      running.stderr += chunk.toString();
    });

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
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        proc.once("error", reject);
        proc.once("close", (code) => {
          resolve(code);
        });
      });
      clearTimeout(timeoutId);

      const stdout = running.stdout;
      const stderr = running.stderr;
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
    const result = spawnSync(command, [versionArg], { encoding: "utf8" });
    if (result.status !== 0) {
      return { available: false, detectedVersion: null };
    }

    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    return {
      available: true,
      detectedVersion: stdout || stderr || null,
    };
  }

  protected runCheck(
    command: string[],
    env?: Record<string, string>,
  ): { exitCode: number; stdout: string; stderr: string } {
    const [bin, ...args] = command;
    const result = spawnSync(bin, args, {
      encoding: "utf8",
      env: env ? { ...process.env, ...env } : process.env,
    });

    return {
      exitCode: result.status ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }

  private collectChangedFiles(workingDirectory: string): string[] {
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
}
