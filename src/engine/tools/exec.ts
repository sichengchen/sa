import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import { generateHandle, registerBackground } from "./exec-background.js";

const DEFAULT_TIMEOUT_S = 1800;
const DEFAULT_YIELD_MS = 10_000;

export const execTool: ToolImpl = {
  name: "exec",
  description:
    "Execute a shell command with advanced options: workdir, env overrides, background mode, yield timeout, and process timeout.",
  summary:
    "Execute a shell command. Supports workdir, env overrides, background mode (returns handle), yieldMs (auto-background after delay, default 10s), and timeout (seconds, default 1800). Use exec_status/exec_kill to manage background processes.",
  parameters: Type.Object({
    command: Type.String({ description: "The shell command to execute" }),
    workdir: Type.Optional(Type.String({ description: "Working directory (defaults to cwd)" })),
    env: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: "Environment variable overrides merged with process.env",
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
      Type.Number({ description: "Kill after this many seconds (default 1800)" }),
    ),
  }),
  async execute(args) {
    const command = args.command as string;
    const workdir = args.workdir as string | undefined;
    const env = args.env as Record<string, string> | undefined;
    const background = args.background as boolean | undefined;
    const yieldMs = args.yieldMs as number | undefined;
    const timeoutS = (args.timeout as number | undefined) ?? DEFAULT_TIMEOUT_S;

    const mergedEnv = env ? { ...process.env, ...env } : undefined;

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
        // Set a separate timeout for background processes
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
          // Process still running — move to background
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
        content: output || "(no output)",
        isError: exitCode !== 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Error: ${msg}`, isError: true };
    }
  },
};
