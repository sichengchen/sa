/**
 * exec tool — compatibility shell command execution routed through harness environments.
 */

import { Type } from "@mariozechner/pi-ai";
import { dirname, relative } from "node:path";
import type { ToolImpl } from "@aria/agent";
import { frameAsData, sanitizeContent } from "@aria/agent/content-frame";
import { generateHandle, registerBackgroundTask } from "./exec-background.js";
import { createDefaultAriaSessionEnv, createLegacyExecTool } from "@aria/harness";

const DEFAULT_TIMEOUT_S = 300;
const BACKGROUND_TIMEOUT_S = 1800;
const DEFAULT_YIELD_MS = 10_000;
const MAX_OUTPUT_BYTES = 1_048_576;

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
      const execTask = runHarnessExec(command, workdir, mergedEnv, timeoutS);

      if (background) {
        const handle = generateHandle();
        registerBackgroundTask(handle, command, execTask);
        return {
          content: JSON.stringify({ handle, status: "running" }),
          isError: false,
        };
      }

      const effectiveYield = yieldMs ?? DEFAULT_YIELD_MS;
      let result: { stdout: string; stderr: string; exitCode: number };
      if (effectiveYield > 0) {
        const settled = await Promise.race([
          execTask.then((value) => ({ status: "done" as const, value })),
          new Promise<{ status: "pending" }>((resolve) =>
            setTimeout(() => resolve({ status: "pending" }), effectiveYield),
          ),
        ]);
        if (settled.status === "pending") {
          const handle = generateHandle();
          registerBackgroundTask(handle, command, execTask);
          return {
            content: JSON.stringify({
              handle,
              status: "running",
              message: `Process still running after ${effectiveYield}ms — moved to background. Use exec_status("${handle}") to check.`,
            }),
            isError: false,
          };
        }
        result = settled.value;
      } else {
        result = await execTask;
      }
      const output = [result.stdout, result.stderr ? `stderr: ${result.stderr}` : ""]
        .filter(Boolean)
        .join("\n");
      const sanitized = sanitizeContent(capOutput(output) || "(no output)");
      return {
        content: frameAsData(sanitized, "exec"),
        isError: result.exitCode !== 0,
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

async function runHarnessExec(
  command: string,
  workdir: string | undefined,
  env: Record<string, string | undefined>,
  timeoutS: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const routed = routeCompatibilityCommand(command, workdir);
  const sessionEnv = await createDefaultAriaSessionEnv({
    cwd: routed.projectRoot,
    projectRoot: routed.projectRoot,
  });
  try {
    const result = await createLegacyExecTool(sessionEnv).execute({
      command: routed.command,
      workdir: "/workspace",
      env: env as Record<string, string>,
      timeout: timeoutS,
    });
    return {
      stdout: result.content,
      stderr: "",
      exitCode: result.isError ? 1 : 0,
    };
  } finally {
    await sessionEnv.cleanup();
  }
}

function routeCompatibilityCommand(
  command: string,
  workdir: string | undefined,
): { command: string; projectRoot: string } {
  if (workdir) {
    return { command, projectRoot: workdir };
  }

  const quotedAbsolutePath = command.match(/(["'])(\/[^"']+)\1/);
  if (!quotedAbsolutePath?.[2]) {
    const projectRoot = process.env.TERMINAL_CWD ?? process.cwd();
    return { command, projectRoot };
  }

  const absolutePath = quotedAbsolutePath[2];
  const projectRoot = dirname(absolutePath);
  const routedCommand = command.replace(
    /(["'])(\/[^"']+)\1/g,
    (match, quote: string, path: string) => {
      if (path === projectRoot) return `${quote}/workspace${quote}`;
      if (path.startsWith(`${projectRoot}/`)) {
        return `${quote}/workspace/${relative(projectRoot, path)}${quote}`;
      }
      return match;
    },
  );
  return { command: routedCommand, projectRoot };
}
