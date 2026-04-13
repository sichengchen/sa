/**
 * exec tool — shell command execution
 *
 * Security model:
 * - Commands run as the Aria Runtime process user (no privilege isolation)
 * - Approval is enforced by the 3-tier danger classification + exec classifier
 * - Sensitive env vars (API keys, tokens, secrets) are stripped by default
 * - Output is capped at 1MB to prevent OOM from chatty commands
 * - Foreground timeout: 300s (5min); background timeout: 1800s (30min)
 * - The user is ultimately responsible for what commands the agent runs
 */

import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";
import { frameAsData, sanitizeContent } from "@aria/agent-aria/content-frame";
import { generateHandle, registerBackground } from "./exec-background.js";
import { detectSandbox, type Sandbox, type SandboxOptions } from "./sandbox.js";

const DEFAULT_TIMEOUT_S = 300;
const BACKGROUND_TIMEOUT_S = 1800;
const DEFAULT_YIELD_MS = 10_000;
const MAX_OUTPUT_BYTES = 1_048_576;

let _sandbox: Sandbox | null = null;
function getSandbox(): Sandbox {
  if (!_sandbox) _sandbox = detectSandbox();
  return _sandbox;
}

let _sandboxOpts: SandboxOptions = { fence: [], deny: [] };

export function configureSandbox(opts: SandboxOptions): void {
  _sandboxOpts = opts;
}

const SENSITIVE_ENV_PATTERNS = [
  /_KEY$/,
  /_TOKEN$/,
  /_SECRET$/,
  /^ARIA_/,
  /^ANTHROPIC_/,
  /^OPENAI_/,
  /^GOOGLE_AI_/,
  /^OPENROUTER_/,
];

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

export function capOutput(output: string): string {
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) return output;
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
      Type.Union([Type.Literal("safe"), Type.Literal("moderate"), Type.Literal("dangerous")], {
        description:
          'Self-declared danger level: "safe" for read-only (ls, cat, git status), "moderate" for reversible writes (git commit, npm install), "dangerous" for destructive ops (rm, sudo, kill). Defaults to "dangerous" if omitted.',
      }),
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
      Type.Number({
        description: "Kill after this many seconds (default 300 foreground, 1800 background)",
      }),
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

    const mergedEnv = sanitizeEnv(process.env, env);

    try {
      let spawnCmd: string[] = ["sh", "-c", command];
      const sandbox = getSandbox();
      if (sandbox.available() && (_sandboxOpts.fence.length > 0 || _sandboxOpts.deny.length > 0)) {
        spawnCmd = sandbox.wrap(spawnCmd, _sandboxOpts);
      }

      const proc = Bun.spawn(spawnCmd, {
        cwd: workdir,
        env: mergedEnv,
        stdout: "pipe",
        stderr: "pipe",
      });

      const timeoutMs = timeoutS * 1000;
      const killTimer = setTimeout(() => {
        proc.kill();
      }, timeoutMs);

      if (background) {
        clearTimeout(killTimer);
        const handle = generateHandle();
        registerBackground(handle, command, proc);
        setTimeout(() => {
          try {
            proc.kill();
          } catch {}
        }, timeoutMs);
        return {
          content: JSON.stringify({ handle, status: "running" }),
          isError: false,
        };
      }

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
            try {
              proc.kill();
            } catch {}
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

      if (sandbox.cleanup) sandbox.cleanup();

      const sanitized = sanitizeContent(capOutput(output) || "(no output)");
      return {
        content: frameAsData(sanitized, "exec"),
        isError: exitCode !== 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: `Error executing command: ${msg}`,
        isError: true,
      };
    }
  },
};
