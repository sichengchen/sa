/**
 * exec tool — shell command execution
 *
 * Security model:
 * - Commands run as the SA process user (no privilege isolation)
 * - Approval is enforced by the 3-tier danger classification + exec classifier
 * - Sensitive env vars (API keys, tokens, secrets) are stripped by default
 * - Output is capped at 1MB to prevent OOM from chatty commands
 * - Foreground timeout: 300s (5min); background timeout: 1800s (30min)
 * - The user is ultimately responsible for what commands the agent runs
 *
 * What is NOT sandboxed:
 * - Filesystem access (no chroot or restricted directories)
 * - Network access (no firewall rules)
 * - Process spawning (no cgroup limits)
 * - These are appropriate for a single-user, localhost-only personal agent
 */

import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import { generateHandle, registerBackground } from "./exec-background.js";

/** Default timeout for foreground commands (5 minutes) */
const DEFAULT_TIMEOUT_S = 300;
/** Default timeout for background commands (30 minutes) */
const BACKGROUND_TIMEOUT_S = 1800;
const DEFAULT_YIELD_MS = 10_000;
/** Maximum output size in bytes (1MB) */
const MAX_OUTPUT_BYTES = 1_048_576;

/** Patterns for env var names that should be stripped from subprocess environment */
const SENSITIVE_ENV_PATTERNS = [
  /_KEY$/,
  /_TOKEN$/,
  /_SECRET$/,
  /^SA_/,
  /^ANTHROPIC_/,
  /^OPENAI_/,
  /^GOOGLE_AI_/,
  /^OPENROUTER_/,
];

/**
 * Create a sanitized copy of process.env that strips sensitive variables.
 * API keys, tokens, and SA-internal vars are removed to prevent leakage.
 */
export function sanitizeEnv(
  baseEnv: Record<string, string | undefined>,
  overrides?: Record<string, string>,
): Record<string, string | undefined> {
  const clean: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (SENSITIVE_ENV_PATTERNS.some((p) => p.test(key))) continue;
    clean[key] = value;
  }
  if (overrides) {
    Object.assign(clean, overrides);
  }
  return clean;
}

/** Truncate output string to MAX_OUTPUT_BYTES, adding a truncation notice */
export function capOutput(output: string): string {
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) return output;
  // Truncate to approximate byte limit
  let truncated = output;
  while (Buffer.byteLength(truncated) > MAX_OUTPUT_BYTES - 100) {
    truncated = truncated.slice(0, Math.floor(truncated.length * 0.9));
  }
  return truncated + "\n...[output truncated at 1MB]";
}

export const execTool: ToolImpl = {
  name: "exec",
  description:
    "Execute a shell command with advanced options: workdir, env overrides, background mode, yield timeout, and process timeout.",
  summary:
    "Execute a shell command. Supports workdir, env overrides, background mode (returns handle), yieldMs (auto-background after delay, default 10s), and timeout (seconds, default 300 foreground / 1800 background). Sensitive env vars are stripped by default. Use exec_status/exec_kill to manage background processes.",
  dangerLevel: "dangerous",
  parameters: Type.Object({
    command: Type.String({ description: "The shell command to execute" }),
    danger: Type.Optional(
      Type.Union(
        [Type.Literal("safe"), Type.Literal("moderate"), Type.Literal("dangerous")],
        {
          description:
            'Self-declared danger level: "safe" for read-only (ls, cat, git status), "moderate" for reversible writes (git commit, npm install), "dangerous" for destructive ops (rm, sudo, kill). Defaults to "dangerous" if omitted.',
        },
      ),
    ),
    workdir: Type.Optional(Type.String({ description: "Working directory (defaults to cwd)" })),
    env: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: "Environment variable overrides merged with sanitized env",
      }),
    ),
    background: Type.Optional(
      Type.Boolean({ description: "If true, start in background immediately and return a handle" }),
    ),
    yieldMs: Type.Optional(
      Type.Number({
        description:
          "Auto-background after this many ms if still running (default 10000). Set to 0 to wait indefinitely up to timeout.",
      }),
    ),
    timeout: Type.Optional(
      Type.Number({ description: "Kill after this many seconds (default 300 foreground, 1800 background)" }),
    ),
  }),
  async execute(args) {
    const command = args.command as string;
    const workdir = args.workdir as string | undefined;
    const env = args.env as Record<string, string> | undefined;
    const background = args.background as boolean | undefined;
    const yieldMs = args.yieldMs as number | undefined;
    const defaultTimeout = background ? BACKGROUND_TIMEOUT_S : DEFAULT_TIMEOUT_S;
    const timeoutS = (args.timeout as number | undefined) ?? defaultTimeout;

    // Sanitize environment: strip sensitive vars, then apply user overrides
    const mergedEnv = sanitizeEnv(process.env, env);

    try {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd: workdir,
        env: mergedEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Set up process timeout
      const timeoutMs = timeoutS * 1000;
      const killTimer = setTimeout(() => {
        proc.kill();
      }, timeoutMs);

      // Background mode: return immediately with a handle
      if (background) {
        clearTimeout(killTimer);
        const handle = generateHandle();
        registerBackground(handle, command, proc);
        setTimeout(() => {
          try { proc.kill(); } catch {}
        }, timeoutMs);
        return {
          content: JSON.stringify({ handle, status: "running" }),
          isError: false,
        };
      }

      // Yield mode: if still running after yieldMs, background it
      const effectiveYield = yieldMs ?? DEFAULT_YIELD_MS;

      if (effectiveYield > 0) {
        const finished = await Promise.race([
          proc.exited.then(() => true as const),
          new Promise<false>((resolve) => setTimeout(() => resolve(false), effectiveYield)),
        ]);

        if (!finished) {
          clearTimeout(killTimer);
          const handle = generateHandle();
          registerBackground(handle, command, proc);
          setTimeout(() => {
            try { proc.kill(); } catch {}
          }, timeoutMs);
          return {
            content: JSON.stringify({
              handle,
              status: "running",
              message: `Process still running after ${effectiveYield}ms — moved to background. Use exec_status("${handle}") to check.`,
            }),
            isError: false,
          };
        }
      }

      // Wait for completion
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      clearTimeout(killTimer);

      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += (output ? "\n" : "") + `stderr: ${stderr}`;
      if (exitCode !== 0) {
        output += (output ? "\n" : "") + `exit code: ${exitCode}`;
      }

      return {
        content: capOutput(output) || "(no output)",
        isError: exitCode !== 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error: ${msg}`, isError: true };
    }
  },
};
