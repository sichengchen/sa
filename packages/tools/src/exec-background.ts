import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent";

export interface BackgroundProcess {
  id: string;
  command: string;
  abort?: () => void;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Global store of background processes */
const backgroundProcesses = new Map<string, BackgroundProcess>();

let nextId = 1;

export function generateHandle(): string {
  return `bg-${nextId++}`;
}

export function registerBackgroundTask(
  handle: string,
  command: string,
  task: Promise<{ stdout: string; stderr: string; exitCode: number }>,
  abort?: () => void,
): BackgroundProcess {
  const bg: BackgroundProcess = {
    id: handle,
    command,
    abort,
    stdout: "",
    stderr: "",
    exitCode: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  backgroundProcesses.set(handle, bg);

  task
    .then((result) => {
      bg.stdout = result.stdout;
      bg.stderr = result.stderr;
      bg.exitCode = result.exitCode;
    })
    .catch((error) => {
      bg.stderr = error instanceof Error ? error.message : String(error);
      bg.exitCode = 1;
    })
    .finally(() => {
      bg.finishedAt = Date.now();
    });

  return bg;
}

export function getBackground(handle: string): BackgroundProcess | undefined {
  return backgroundProcesses.get(handle);
}

export function removeBackground(handle: string): boolean {
  return backgroundProcesses.delete(handle);
}

/** exec_status tool: check on a background process */
export const execStatusTool: ToolImpl = {
  name: "exec_status",
  description: "Check the status and output of a background exec process.",
  summary:
    "Check status/output of a background process by handle. Returns stdout, stderr, exit code, and whether still running.",
  dangerLevel: "safe",
  parameters: Type.Object({
    handle: Type.String({ description: "The background process handle returned by exec" }),
  }),
  async execute(args) {
    const handle = args.handle as string;
    const bg = getBackground(handle);
    if (!bg) {
      return { content: `No background process found with handle: ${handle}`, isError: true };
    }

    const running = bg.exitCode === null;
    const elapsed = ((bg.finishedAt ?? Date.now()) - bg.startedAt) / 1000;

    let output = `handle: ${bg.id}\nstatus: ${running ? "running" : "finished"}\nelapsed: ${elapsed.toFixed(1)}s\n`;
    if (bg.exitCode !== null) output += `exit_code: ${bg.exitCode}\n`;
    if (bg.stdout) output += `\nstdout:\n${bg.stdout.slice(-8000)}`;
    if (bg.stderr) output += `\nstderr:\n${bg.stderr.slice(-4000)}`;

    return { content: output || "(no output yet)", isError: false };
  },
};

/** exec_kill tool: terminate a background process */
export const execKillTool: ToolImpl = {
  name: "exec_kill",
  description: "Terminate a background exec process.",
  summary: "Kill a background process by handle. Returns final output.",
  dangerLevel: "dangerous",
  parameters: Type.Object({
    handle: Type.String({ description: "The background process handle to kill" }),
  }),
  async execute(args) {
    const handle = args.handle as string;
    const bg = getBackground(handle);
    if (!bg) {
      return { content: `No background process found with handle: ${handle}`, isError: true };
    }

    if (bg.exitCode === null) {
      bg.abort?.();
    }

    const output = [
      `Killed process: ${bg.id}`,
      bg.stdout ? `stdout:\n${bg.stdout.slice(-4000)}` : "",
      bg.stderr ? `stderr:\n${bg.stderr.slice(-2000)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    removeBackground(handle);
    return { content: output || "Process killed.", isError: false };
  },
};
