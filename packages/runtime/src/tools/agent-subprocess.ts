/**
 * AgentSubprocess — shared process manager for coding agent CLIs.
 *
 * Provides lifecycle management, auth probing, structured output parsing,
 * timeout handling, and abort support. Used by both claude_code and codex
 * native tools.
 */

import { spawn, type Subprocess } from "bun";
import { randomBytes } from "node:crypto";
import type {
  AgentSubprocessConfig,
  AgentSubprocessResult,
  AgentAuthStatus,
  AgentSubprocessHandle,
} from "./agent-subprocess-types.js";

/** Default timeout for foreground execution (5 minutes) */
const DEFAULT_FOREGROUND_TIMEOUT_MS = 300_000;
/** Default timeout for background execution (30 minutes) */
const DEFAULT_BACKGROUND_TIMEOUT_MS = 1_800_000;
/** Maximum output size in bytes (2MB) */
const MAX_OUTPUT_BYTES = 2_097_152;

/** Active background handles */
const backgroundHandles = new Map<string, AgentSubprocessHandle>();

/** Generate a short unique handle ID */
function generateHandleId(): string {
  return randomBytes(4).toString("hex");
}

/**
 * Probe whether a coding agent CLI is installed and authenticated.
 *
 * Runs `<cli> --version` to check installation, then checks auth status
 * via CLI-specific methods.
 */
export async function probeAuth(cli: string): Promise<AgentAuthStatus> {
  const result: AgentAuthStatus = { installed: false, authenticated: false };

  // Check installation via --version
  try {
    const proc = spawn([cli, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && stdout.trim()) {
      result.installed = true;
      result.version = stdout.trim().split("\n")[0];
    } else {
      return result; // Not installed
    }
  } catch {
    return result; // Binary not found
  }

  // Check auth status — CLI-specific
  if (cli === "claude") {
    try {
      const proc = spawn(["claude", "auth", "status"], {
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode === 0) {
        result.authenticated = true;
        if (stdout.includes("oauth")) result.authMethod = "oauth";
        else if (stdout.includes("api_key") || stdout.includes("API key"))
          result.authMethod = "api_key";
        else result.authMethod = "oauth"; // Default for Claude
      } else {
        result.authMethod = "none";
      }
    } catch {
      result.authMethod = "none";
    }
  } else if (cli === "codex") {
    // Codex uses OPENAI_API_KEY env var
    if (process.env.OPENAI_API_KEY) {
      result.authenticated = true;
      result.authMethod = "api_key";
    } else {
      result.authMethod = "none";
    }
  }

  return result;
}

/**
 * Run a coding agent CLI subprocess.
 *
 * Spawns the CLI, collects stdout/stderr with size limits, handles
 * timeouts and abort signals. Returns structured results.
 */
export async function runSubprocess(config: AgentSubprocessConfig): Promise<AgentSubprocessResult> {
  const timeout =
    config.timeout ??
    (config.background ? DEFAULT_BACKGROUND_TIMEOUT_MS : DEFAULT_FOREGROUND_TIMEOUT_MS);
  const startedAt = Date.now();
  const abortController = new AbortController();

  // Build environment — inherit process.env + any extras
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (config.env) {
    Object.assign(env, config.env);
  }

  let proc: Subprocess;
  try {
    proc = spawn([config.cli, ...config.args], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: config.workdir,
      env,
    });
  } catch (err) {
    return {
      status: "error",
      exitCode: -1,
      stdout: "",
      stderr: `Failed to spawn ${config.cli}: ${err instanceof Error ? err.message : String(err)}`,
      duration: Date.now() - startedAt,
    };
  }

  // Set up timeout
  const timeoutId = setTimeout(() => {
    abortController.abort();
    try {
      proc.kill("SIGTERM");
    } catch {}
    // Give 5s grace period, then SIGKILL
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 5000);
  }, timeout);

  // Collect output with size limits
  let stdout = "";
  let stderr = "";

  try {
    const [stdoutText, stderrText] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);

    stdout = stdoutText.slice(0, MAX_OUTPUT_BYTES);
    stderr = stderrText.slice(0, MAX_OUTPUT_BYTES);
  } catch {
    // Stream read may fail if process was killed
  }

  const exitCode = await proc.exited;
  clearTimeout(timeoutId);

  const duration = Date.now() - startedAt;

  // Determine status
  let status: AgentSubprocessResult["status"] = "success";
  if (abortController.signal.aborted) {
    status = "timeout";
  } else if (exitCode !== 0) {
    status = "error";
  }

  // Parse structured output
  const filesModified = parseFilesModified(stdout);
  const summary = extractSummary(stdout, config.cli);

  return {
    status,
    exitCode,
    stdout,
    stderr,
    filesModified: filesModified.length > 0 ? filesModified : undefined,
    summary,
    duration,
  };
}

/**
 * Run a coding agent subprocess in the background.
 *
 * Returns a handle immediately. Use `getBackgroundStatus()` to check progress.
 */
export function runBackground(config: AgentSubprocessConfig): AgentSubprocessHandle {
  const id = generateHandleId();
  const startedAt = Date.now();

  const handle: AgentSubprocessHandle = {
    id,
    cli: config.cli,
    running: true,
    startedAt,
    abort: () => {},
  };

  backgroundHandles.set(id, handle);

  // Run in background
  const promise = runSubprocess({ ...config, background: true });
  promise
    .then((result) => {
      handle.running = false;
      handle.result = result;
    })
    .catch((err) => {
      handle.running = false;
      handle.result = {
        status: "error",
        exitCode: -1,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startedAt,
      };
    });

  return handle;
}

/**
 * Get the status of a background subprocess handle.
 */
export function getBackgroundStatus(handleId: string): AgentSubprocessHandle | null {
  return backgroundHandles.get(handleId) ?? null;
}

/**
 * Clean up completed background handles older than maxAge.
 */
export function cleanupBackgroundHandles(maxAgeMs = 1_800_000): void {
  const now = Date.now();
  for (const [id, handle] of backgroundHandles) {
    if (!handle.running && now - handle.startedAt > maxAgeMs) {
      backgroundHandles.delete(id);
    }
  }
}

// --- Output parsing helpers ---

/** Extract file paths from output (common patterns from Claude Code and Codex) */
function parseFilesModified(stdout: string): string[] {
  const files = new Set<string>();

  // Pattern: "Modified: path/to/file" or "Created: path/to/file"
  const modifiedPattern = /(?:Modified|Created|Updated|Deleted|Wrote|Edited):\s+(.+)/gi;
  let match;
  while ((match = modifiedPattern.exec(stdout)) !== null) {
    const path = match[1]!.trim();
    if (path && !path.includes(" ") && path.includes("/")) {
      files.add(path);
    }
  }

  // Pattern: diff --git a/path b/path
  const diffPattern = /diff --git a\/(.+?) b\//g;
  while ((match = diffPattern.exec(stdout)) !== null) {
    files.add(match[1]!);
  }

  return [...files];
}

/** Extract a summary from CLI output */
function extractSummary(stdout: string, cli: string): string | undefined {
  // Look for a summary line at the end of output
  const lines = stdout.trim().split("\n");
  if (lines.length === 0) return undefined;

  // Claude Code often ends with a summary
  const lastLines = lines.slice(-5).join("\n");

  // Look for explicit summary markers
  const summaryMatch = lastLines.match(/(?:Summary|Result|Done|Completed):\s*(.+)/i);
  if (summaryMatch) return summaryMatch[1]!.trim();

  // Fall back to last non-empty line if it's short enough
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line && line.length <= 200 && !line.startsWith("```") && !line.startsWith("diff")) {
      return line;
    }
  }

  return undefined;
}
