import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent";
import type { AriaSessionEnv, ShellOptions, ShellResult } from "./session-env.js";

const MAX_READ_LINES = 2000;
const MAX_READ_BYTES = 50 * 1024;
const MAX_GREP_MATCHES = 100;
const MAX_GLOB_RESULTS = 1000;

export interface HarnessToolOptions {
  task?: (input: {
    prompt: string;
    description?: string;
    role?: string;
    cwd?: string;
  }) => Promise<string>;
}

export function createHarnessTools(
  env: AriaSessionEnv,
  options: HarnessToolOptions = {},
): ToolImpl[] {
  const tools = [
    createReadTool(env),
    createWriteTool(env),
    createEditTool(env),
    createBashTool(env),
    createGrepTool(env),
    createGlobTool(env),
  ];
  if (options.task) tools.push(createTaskTool(options.task));
  return tools;
}

export function createReadTool(env: AriaSessionEnv): ToolImpl {
  return {
    name: "read",
    description: "Read a file or list a directory from the active Aria session environment.",
    summary: "Read files through the active AriaSessionEnv. Large file output is truncated.",
    dangerLevel: "safe",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Path to read" })),
      file_path: Type.Optional(Type.String({ description: "Compatibility path to read" })),
      offset: Type.Optional(Type.Number({ description: "Line number to start from, 1-indexed" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
    }),
    async execute(args) {
      const path = String(args.path ?? args.file_path ?? "");
      if (!path) return { content: "Missing path", isError: true };
      try {
        const fileStat = await env.stat(path);
        if (fileStat.isDirectory) {
          const entries = await env.readdir(path);
          return { content: entries.join("\n") || "(empty directory)" };
        }
        const content = await env.readFile(path);
        const lines = content.split("\n");
        const start = Math.max(0, Number(args.offset ?? 1) - 1);
        const end = args.limit ? start + Number(args.limit) : lines.length;
        const output = truncateHead(lines.slice(start, end));
        return { content: output.text + (output.wasTruncated ? "\n\n[output truncated]" : "") };
      } catch (error) {
        return { content: errorMessage(error), isError: true };
      }
    },
  };
}

export function createWriteTool(env: AriaSessionEnv): ToolImpl {
  return {
    name: "write",
    description: "Write a file through the active Aria session environment.",
    summary: "Write files through AriaSessionEnv; default project writes stay virtual.",
    dangerLevel: env.kind === "host" ? "dangerous" : "moderate",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Path to write" })),
      file_path: Type.Optional(Type.String({ description: "Compatibility path to write" })),
      content: Type.String({ description: "Content to write" }),
    }),
    async execute(args) {
      const path = String(args.path ?? args.file_path ?? "");
      const content = String(args.content ?? "");
      if (!path) return { content: "Missing path", isError: true };
      try {
        await env.writeFile(path, content);
        return { content: `Successfully wrote ${content.length} bytes to ${path}` };
      } catch (error) {
        return { content: errorMessage(error), isError: true };
      }
    },
  };
}

export function createEditTool(env: AriaSessionEnv): ToolImpl {
  return {
    name: "edit",
    description: "Edit a file using exact text replacement in the active Aria session environment.",
    summary: "Exact-text edit. oldText must uniquely match unless replaceAll is true.",
    dangerLevel: env.kind === "host" ? "dangerous" : "moderate",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Path to edit" })),
      file_path: Type.Optional(Type.String({ description: "Compatibility path to edit" })),
      oldText: Type.Optional(Type.String({ description: "Exact text to replace" })),
      old_string: Type.Optional(
        Type.String({ description: "Compatibility exact text to replace" }),
      ),
      newText: Type.Optional(Type.String({ description: "Replacement text" })),
      new_string: Type.Optional(Type.String({ description: "Compatibility replacement text" })),
      replaceAll: Type.Optional(Type.Boolean({ description: "Replace all occurrences" })),
    }),
    async execute(args) {
      const path = String(args.path ?? args.file_path ?? "");
      const oldText = String(args.oldText ?? args.old_string ?? "");
      const newText = String(args.newText ?? args.new_string ?? "");
      if (!path || !oldText) return { content: "Missing path or oldText", isError: true };
      try {
        const content = await env.readFile(path);
        const count = content.split(oldText).length - 1;
        if (count === 0) return { content: `Could not find exact text in ${path}`, isError: true };
        if (count > 1 && !args.replaceAll) {
          return {
            content: `Found ${count} occurrences in ${path}; use replaceAll`,
            isError: true,
          };
        }
        await env.writeFile(
          path,
          args.replaceAll
            ? content.replaceAll(oldText, newText)
            : content.replace(oldText, newText),
        );
        return { content: `Successfully edited ${path}` };
      } catch (error) {
        return { content: errorMessage(error), isError: true };
      }
    },
  };
}

export function createBashTool(env: AriaSessionEnv): ToolImpl {
  return {
    name: "bash",
    description: "Execute a command through the active Aria session shell environment.",
    summary:
      "Run shell commands through AriaSessionEnv. Default uses just-bash; host is explicit and approval-gated.",
    dangerLevel: env.kind === "host" ? "dangerous" : "safe",
    parameters: Type.Object({
      command: Type.String({ description: "Command to execute" }),
      cwd: Type.Optional(Type.String({ description: "Working directory" })),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
    }),
    async execute(args) {
      const result = await env.exec(String(args.command), {
        cwd: args.cwd as string | undefined,
        timeout: args.timeout as number | undefined,
      });
      return shellResultToToolResult(result);
    },
  };
}

export function createLegacyExecTool(env: AriaSessionEnv): ToolImpl {
  return {
    ...createBashTool(env),
    name: "exec",
    description: "Compatibility shell command routed through the Aria harness shell environment.",
    summary:
      "Compatibility exec. Routes through harness environment selection; default never silently falls back to host.",
    parameters: Type.Object({
      command: Type.String(),
      danger: Type.Optional(
        Type.Union([Type.Literal("safe"), Type.Literal("moderate"), Type.Literal("dangerous")]),
      ),
      workdir: Type.Optional(Type.String()),
      cwd: Type.Optional(Type.String()),
      env: Type.Optional(Type.Record(Type.String(), Type.String())),
      timeout: Type.Optional(Type.Number()),
    }),
    async execute(args) {
      const options: ShellOptions = {
        cwd: (args.workdir ?? args.cwd) as string | undefined,
        env: args.env as Record<string, string> | undefined,
        timeout: args.timeout as number | undefined,
      };
      const result = await env.exec(String(args.command), options);
      return shellResultToToolResult(result);
    },
  };
}

export function createGrepTool(env: AriaSessionEnv): ToolImpl {
  return {
    name: "grep",
    description:
      "Search file contents with ripgrep or grep in the active Aria session environment.",
    summary: "Search file contents through AriaSessionEnv.",
    dangerLevel: "safe",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
      include: Type.Optional(Type.String()),
    }),
    async execute(args) {
      const pattern = shellEscape(String(args.pattern));
      const path = shellEscape(String(args.path ?? "."));
      const include = args.include ? ` -g ${shellEscape(String(args.include))}` : "";
      const result = await env.exec(`rg -n${include} ${pattern} ${path}`);
      if (result.exitCode === 1 && !result.stdout.trim()) return { content: "No matches found." };
      if (result.exitCode !== 0) return shellResultToToolResult(result);
      const lines = result.stdout.trim().split("\n").slice(0, MAX_GREP_MATCHES);
      return { content: lines.join("\n") || "No matches found." };
    },
  };
}

export function createGlobTool(env: AriaSessionEnv): ToolImpl {
  return {
    name: "glob",
    description: "Find files by glob pattern in the active Aria session environment.",
    summary: "Find files through AriaSessionEnv.",
    dangerLevel: "safe",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
    }),
    async execute(args) {
      const result = await env.exec(
        `find ${shellEscape(String(args.path ?? "."))} -type f -name ${shellEscape(String(args.pattern))}`,
      );
      if (result.exitCode !== 0 && !result.stdout.trim()) return shellResultToToolResult(result);
      const paths = result.stdout.trim().split("\n").filter(Boolean).slice(0, MAX_GLOB_RESULTS);
      return { content: paths.join("\n") || "No files found matching pattern." };
    },
  };
}

function createTaskTool(runTask: NonNullable<HarnessToolOptions["task"]>): ToolImpl {
  return {
    name: "task",
    description: "Create a linked child harness task with its own session context.",
    summary: "Delegate focused work to a linked child Aria harness task.",
    dangerLevel: "moderate",
    parameters: Type.Object({
      description: Type.Optional(Type.String()),
      prompt: Type.String(),
      role: Type.Optional(Type.String()),
      cwd: Type.Optional(Type.String()),
    }),
    async execute(args) {
      try {
        return {
          content: await runTask({
            description: args.description as string | undefined,
            prompt: String(args.prompt),
            role: args.role as string | undefined,
            cwd: args.cwd as string | undefined,
          }),
        };
      } catch (error) {
        return { content: errorMessage(error), isError: true };
      }
    },
  };
}

export function shellResultToToolResult(result: ShellResult): {
  content: string;
  isError?: boolean;
} {
  const output = [result.stdout, result.stderr ? `stderr: ${result.stderr}` : ""]
    .filter(Boolean)
    .join("\n");
  return {
    content: truncateTail(output || "(no output)").text,
    isError: result.exitCode !== 0 || result.escalationRequired,
  };
}

function truncateHead(lines: string[]): { text: string; wasTruncated: boolean } {
  let text = "";
  let count = 0;
  for (const line of lines) {
    const next = count === 0 ? line : `\n${line}`;
    if (count >= MAX_READ_LINES || text.length + next.length > MAX_READ_BYTES) {
      return { text, wasTruncated: true };
    }
    text += next;
    count++;
  }
  return { text, wasTruncated: false };
}

function truncateTail(text: string): { text: string; wasTruncated: boolean } {
  const lines = text.split("\n");
  if (lines.length <= MAX_READ_LINES && text.length <= MAX_READ_BYTES)
    return { text, wasTruncated: false };
  return {
    text: lines.slice(-MAX_READ_LINES).join("\n").slice(-MAX_READ_BYTES),
    wasTruncated: true,
  };
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
