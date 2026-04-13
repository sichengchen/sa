/**
 * `claude_code` native tool — delegates coding tasks to Claude Code CLI.
 *
 * Replaces the bundled claude-code skill with a structured ToolImpl that uses
 * the AgentSubprocess infrastructure for lifecycle management, auth probing,
 * structured output parsing, and timeout handling.
 */

import { Type } from "@sinclair/typebox";
import type { ToolImpl, ToolResult } from "../agent/types.js";
import {
  probeAuth,
  runSubprocess,
  runBackground,
  getBackgroundStatus,
} from "./agent-subprocess.js";

export interface ClaudeCodeToolDeps {
  /** Lookup an API key from secrets (e.g. ANTHROPIC_API_KEY) */
  getSecret?: (envVar: string) => string | undefined;
}

export function createClaudeCodeTool(deps?: ClaudeCodeToolDeps): ToolImpl {
  return {
    name: "claude_code",
    description:
      "Delegate a coding task to Claude Code CLI. Spawns `claude --print` as a subprocess with structured results. " +
      "Use for: complex code generation, multi-file refactoring, debugging, test writing. " +
      "Do NOT use for: general chat, questions, or tasks you can handle directly.",
    summary: "Delegate coding tasks to Claude Code CLI (subprocess)",
    dangerLevel: "moderate",
    parameters: Type.Object({
      task: Type.String({ description: "The coding task description" }),
      files: Type.Optional(
        Type.Array(Type.String(), { description: "Relevant file paths to pass as context" }),
      ),
      workdir: Type.Optional(
        Type.String({ description: "Working directory (default: current directory)" }),
      ),
      background: Type.Optional(
        Type.Boolean({ description: "Run in background and return handle ID (default: false)" }),
      ),
      handle: Type.Optional(
        Type.String({ description: "Check status of a background task by handle ID" }),
      ),
    }),
    async execute(args: Record<string, unknown>): Promise<ToolResult> {
      const task = args.task as string | undefined;
      const files = args.files as string[] | undefined;
      const workdir = args.workdir as string | undefined;
      const background = args.background as boolean | undefined;
      const handle = args.handle as string | undefined;

      // Status check mode — poll a background handle
      if (handle) {
        const status = getBackgroundStatus(handle);
        if (!status) {
          return { content: `No background task found with handle "${handle}".`, isError: true };
        }
        if (status.running) {
          const elapsed = Math.round((Date.now() - status.startedAt) / 1000);
          return { content: `Task still running (${elapsed}s elapsed). Poll again later.` };
        }
        return { content: formatResult(status.result!) };
      }

      if (!task) {
        return { content: "Missing required parameter: task", isError: true };
      }

      // Probe auth
      const auth = await probeAuth("claude");
      if (!auth.installed) {
        return {
          content:
            "Claude Code CLI is not installed. Install it with:\n" +
            "curl -fsSL https://claude.ai/install.sh | bash",
          isError: true,
        };
      }

      // Build environment — pass API key if not OAuth-authenticated
      const env: Record<string, string> = {};
      if (!auth.authenticated) {
        const apiKey = deps?.getSecret?.("ANTHROPIC_API_KEY") ?? process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          env.ANTHROPIC_API_KEY = apiKey;
        } else {
          return {
            content:
              "Claude Code is not authenticated. Either:\n" +
              "1. Run `claude login` to authenticate via OAuth, or\n" +
              "2. Set ANTHROPIC_API_KEY via `set_env_secret`",
            isError: true,
          };
        }
      }

      // Build task prompt with file context
      let fullTask = task;
      if (files && files.length > 0) {
        const fileList = files.map((f) => `- ${f}`).join("\n");
        fullTask = `Relevant files:\n${fileList}\n\n${task}`;
      }

      // Build CLI args
      const cliArgs = ["--print", fullTask];

      // Background mode
      if (background) {
        const bgHandle = runBackground({
          cli: "claude",
          args: cliArgs,
          env: Object.keys(env).length > 0 ? env : undefined,
          workdir,
        });
        return {
          content:
            `Background task started (handle: ${bgHandle.id}).\n` +
            `Use claude_code({ handle: "${bgHandle.id}" }) to check status.`,
        };
      }

      // Foreground execution
      const result = await runSubprocess({
        cli: "claude",
        args: cliArgs,
        env: Object.keys(env).length > 0 ? env : undefined,
        workdir,
      });

      return { content: formatResult(result), isError: result.status === "error" };
    },
  };
}

/** Format a subprocess result into a readable tool result */
function formatResult(result: import("./agent-subprocess-types.js").AgentSubprocessResult): string {
  const lines: string[] = [];

  if (result.status === "timeout") {
    lines.push("Task timed out.");
  } else if (result.status === "error") {
    lines.push(`Task failed (exit code ${result.exitCode}).`);
  } else {
    lines.push("Task completed successfully.");
  }

  if (result.summary) {
    lines.push(`\nSummary: ${result.summary}`);
  }

  if (result.filesModified && result.filesModified.length > 0) {
    lines.push(`\nFiles modified:\n${result.filesModified.map((f) => `- ${f}`).join("\n")}`);
  }

  lines.push(`\nDuration: ${(result.duration / 1000).toFixed(1)}s`);

  // Include output (truncated if very long)
  const output = result.stdout.trim();
  if (output) {
    const maxLen = 8000;
    const truncated =
      output.length > maxLen ? output.slice(0, maxLen) + "\n...(truncated)" : output;
    lines.push(`\nOutput:\n${truncated}`);
  }

  if (result.stderr.trim()) {
    const stderr = result.stderr.trim();
    const maxLen = 2000;
    const truncated =
      stderr.length > maxLen ? stderr.slice(0, maxLen) + "\n...(truncated)" : stderr;
    lines.push(`\nStderr:\n${truncated}`);
  }

  return lines.join("\n");
}
