import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { ToolIntent } from "@aria/policy/capability-policy";
import type { AriaHarnessHost } from "../host.js";
import type {
  AriaSessionEnv,
  FileStat,
  ShellOptions,
  ShellResult,
  ToolLease,
} from "../session-env.js";
import { createEscalationShellResult } from "../session-env.js";
import { executeHostCommand } from "../commands.js";

export interface HostAriaSessionEnvOptions {
  cwd?: string;
  host: AriaHarnessHost;
  tools?: ToolLease[];
}

export function createHostAriaSessionEnv(options: HostAriaSessionEnvOptions): AriaSessionEnv {
  const cwd = resolve(options.cwd ?? process.cwd());
  const resolvePath = (path: string) => resolve(cwd, path);
  const toolLeaseIds = (toolName: string) =>
    (options.tools ?? []).filter((lease) => lease.toolName === toolName).map((lease) => lease.id);

  async function decide(intent: ToolIntent): Promise<ShellResult | null> {
    await options.host.recordAudit({ type: "tool_intent", toolName: intent.toolName, intent });
    const decision = await options.host.requestToolDecision(intent);
    await options.host.recordAudit({
      type: "tool_decision",
      toolName: intent.toolName,
      intent,
      decision,
    });
    if (decision.status === "allow") return null;
    return createEscalationShellResult(decision.reason ?? "host execution requires approval");
  }

  async function decideFileRead(path: string): Promise<void> {
    const denied = await decide({
      toolName: "read",
      environment: "host",
      filesystemEffect: "host_read",
      network: "none",
      leases: toolLeaseIds("read"),
      cwd,
    });
    if (denied) throw new Error(denied.stderr);
  }

  return {
    kind: "host",
    cwd,
    async exec(command: string, shellOptions?: ShellOptions): Promise<ShellResult> {
      const commandCwd = shellOptions?.cwd ? resolvePath(shellOptions.cwd) : cwd;
      const denied = await decide({
        toolName: "bash",
        environment: "host",
        filesystemEffect: "host_write",
        network: "full",
        leases: toolLeaseIds("bash"),
        command,
        cwd: commandCwd,
      });
      if (denied) return denied;
      return executeHostCommand(command, {
        cwd: commandCwd,
        env: shellOptions?.env,
        timeout: shellOptions?.timeout,
      });
    },
    async readFile(path) {
      await decideFileRead(path);
      return readFile(resolvePath(path), "utf8");
    },
    async readFileBuffer(path) {
      await decideFileRead(path);
      return new Uint8Array(await readFile(resolvePath(path)));
    },
    async writeFile(path, content): Promise<void> {
      const resolved = resolvePath(path);
      const denied = await decide({
        toolName: "write",
        environment: "host",
        filesystemEffect: "host_write",
        network: "none",
        leases: toolLeaseIds("write"),
        cwd,
      });
      if (denied) throw new Error(denied.stderr);
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, content);
    },
    async stat(path): Promise<FileStat> {
      await decideFileRead(path);
      const s = await stat(resolvePath(path));
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        isSymbolicLink: s.isSymbolicLink(),
        size: s.size,
        mode: s.mode,
        mtime: s.mtime,
      };
    },
    async readdir(path) {
      await decideFileRead(path);
      return readdir(resolvePath(path));
    },
    exists: async (path) => {
      await decideFileRead(path);
      try {
        await stat(resolvePath(path));
        return true;
      } catch {
        return false;
      }
    },
    async mkdir(path, mkdirOptions) {
      const denied = await decide({
        toolName: "mkdir",
        environment: "host",
        filesystemEffect: "host_write",
        network: "none",
        leases: toolLeaseIds("mkdir"),
        cwd,
      });
      if (denied) throw new Error(denied.stderr);
      await mkdir(resolvePath(path), mkdirOptions);
    },
    async rm(path, rmOptions): Promise<void> {
      const denied = await decide({
        toolName: "rm",
        environment: "host",
        filesystemEffect: "host_write",
        network: "none",
        leases: toolLeaseIds("rm"),
        cwd,
      });
      if (denied) throw new Error(denied.stderr);
      await rm(resolvePath(path), rmOptions);
    },
    async scope(scopeOptions): Promise<AriaSessionEnv> {
      return createHostAriaSessionEnv({
        ...options,
        tools: [...(options.tools ?? []), ...(scopeOptions?.tools ?? [])],
      });
    },
    resolvePath,
    async cleanup(): Promise<void> {},
  };
}
