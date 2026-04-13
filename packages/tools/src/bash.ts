import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";

const DEFAULT_TIMEOUT = 30_000;

export const bashTool: ToolImpl = {
  name: "bash",
  description:
    "Execute a shell command and return stdout and stderr. Has a configurable timeout (default 30s).",
  summary:
    "Execute a shell command. Use for: running CLI tools, installing packages, curl requests, system operations. Always prefer dedicated tools (read, write, edit) over bash for file operations.",
  dangerLevel: "dangerous",
  parameters: Type.Object({
    command: Type.String({ description: "The shell command to execute" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for the command" })),
    timeout: Type.Optional(
      Type.Number({
        description: "Timeout in milliseconds (default 30000)",
      }),
    ),
  }),
  async execute(args) {
    const command = args.command as string;
    const cwd = args.cwd as string | undefined;
    const timeout = (args.timeout as number | undefined) ?? DEFAULT_TIMEOUT;

    try {
      const proc = Bun.spawn(["sh", "-c", command], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
      });

      const resultPromise = (async () => {
        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;
        return { stdout, stderr, exitCode };
      })();

      const { stdout, stderr, exitCode } = await Promise.race([resultPromise, timeoutPromise]);

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
