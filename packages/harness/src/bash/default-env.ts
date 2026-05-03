import { Bash, InMemoryFs, OverlayFs, type CustomCommand, type IFileSystem } from "just-bash";
import { toolIntentRequiresApproval } from "@aria/policy/capability-policy";
import type { ToolIntent } from "@aria/policy/capability-policy";
import type { AriaHarnessHost } from "../host.js";
import type {
  AriaSessionEnv,
  CommandLease,
  FileStat,
  ShellOptions,
  ShellResult,
  ToolLease,
} from "../session-env.js";
import {
  createCwdScopedEnv,
  createEscalationShellResult,
  normalizePath,
  resolveFromCwd,
} from "../session-env.js";
import { commandLeaseToJustBashCommand } from "../commands.js";

export interface DefaultAriaSessionEnvOptions {
  cwd?: string;
  projectRoot?: string;
  host?: AriaHarnessHost;
  commands?: CommandLease[];
  tools?: ToolLease[];
  allowlistedNetwork?: string[];
}

const DEFAULT_CWD = "/home/user";
const PROJECT_MOUNT = "/workspace";

export async function createDefaultAriaSessionEnv(
  options: DefaultAriaSessionEnvOptions = {},
): Promise<AriaSessionEnv> {
  const fs = options.projectRoot
    ? new OverlayFs({ root: options.projectRoot, mountPoint: PROJECT_MOUNT })
    : new InMemoryFs();
  const cwd = options.projectRoot
    ? mapProjectCwd(options.cwd, options.projectRoot)
    : (options.cwd ?? DEFAULT_CWD);
  if (!options.projectRoot) {
    await fs.mkdir(cwd, { recursive: true });
  }
  return createJustBashSessionEnv({
    kind: "default",
    fs,
    cwd: normalizePath(cwd),
    host: options.host,
    commands: options.commands ?? [],
    tools: options.tools ?? [],
    allowlistedNetwork: options.allowlistedNetwork,
  });
}

interface JustBashSessionEnvOptions {
  kind: "default";
  fs: IFileSystem;
  cwd: string;
  host?: AriaHarnessHost;
  commands: CommandLease[];
  tools: ToolLease[];
  allowlistedNetwork?: string[];
}

function createBash(options: JustBashSessionEnvOptions): Bash {
  const customCommands: CustomCommand[] = options.host
    ? options.commands.map((lease) => commandLeaseToJustBashCommand(lease, options.host!))
    : [];
  return new Bash({
    fs: options.fs,
    cwd: options.cwd,
    customCommands,
    network:
      options.allowlistedNetwork && options.allowlistedNetwork.length > 0
        ? { allowedUrlPrefixes: options.allowlistedNetwork }
        : undefined,
  });
}

function createJustBashSessionEnv(options: JustBashSessionEnvOptions): AriaSessionEnv {
  const bash = createBash(options);
  const resolvePath = (path: string) => resolveFromCwd(options.cwd, path);
  const recordIntent = async (intent: ToolIntent) => {
    await options.host?.recordAudit({ type: "tool_intent", toolName: intent.toolName, intent });
  };
  const toolLeaseIds = (toolName: string) =>
    options.tools.filter((lease) => lease.toolName === toolName).map((lease) => lease.id);
  const decideIfRequired = async (intent: ToolIntent): Promise<ShellResult | null> => {
    await recordIntent(intent);
    if (!options.host || !toolIntentRequiresApproval(intent)) return null;
    const decision = await options.host.requestToolDecision(intent);
    await options.host.recordAudit({
      type: "tool_decision",
      toolName: intent.toolName,
      intent,
      decision,
    });
    if (decision.status === "allow") return null;
    return createEscalationShellResult(decision.reason ?? "default execution requires approval");
  };

  return {
    kind: "default",
    cwd: options.cwd,
    async exec(command: string, shellOptions?: ShellOptions): Promise<ShellResult> {
      const cwd = shellOptions?.cwd ? resolvePath(shellOptions.cwd) : options.cwd;
      const denied = await decideIfRequired({
        toolName: "bash",
        environment: "default",
        filesystemEffect: "virtual",
        network: options.allowlistedNetwork?.length ? "allowlist" : "none",
        leases: [
          ...toolLeaseIds("bash"),
          ...options.commands.map((commandLease) => commandLease.id),
        ],
        command,
        cwd,
      });
      if (denied) return denied;
      let timer: Timer | undefined;
      let signal: AbortSignal | undefined;
      if (shellOptions?.timeout && shellOptions.timeout > 0) {
        const controller = new AbortController();
        signal = controller.signal;
        timer = setTimeout(() => controller.abort(), shellOptions.timeout * 1000);
      }
      try {
        const result = await bash.exec(command, {
          cwd,
          env: shellOptions?.env,
          signal,
        });
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    readFile: (path) => options.fs.readFile(resolvePath(path)),
    readFileBuffer: (path) => options.fs.readFileBuffer(resolvePath(path)),
    async writeFile(path, content): Promise<void> {
      const resolved = resolvePath(path);
      const dir = resolved.replace(/\/[^/]*$/, "");
      if (dir && dir !== resolved) {
        await options.fs.mkdir(dir, { recursive: true });
      }
      await recordIntent({
        toolName: "write",
        environment: "default",
        filesystemEffect: "virtual",
        network: "none",
        leases: toolLeaseIds("write"),
        cwd: options.cwd,
      });
      await options.fs.writeFile(resolved, content);
    },
    async stat(path): Promise<FileStat> {
      const stat = await options.fs.stat(resolvePath(path));
      return {
        isFile: stat.isFile,
        isDirectory: stat.isDirectory,
        isSymbolicLink: stat.isSymbolicLink,
        size: stat.size,
        mode: stat.mode,
        mtime: stat.mtime,
      };
    },
    readdir: (path) => options.fs.readdir(resolvePath(path)),
    exists: (path) => options.fs.exists(resolvePath(path)),
    mkdir: (path, mkdirOptions) => options.fs.mkdir(resolvePath(path), mkdirOptions),
    async rm(path, rmOptions): Promise<void> {
      await recordIntent({
        toolName: "rm",
        environment: "default",
        filesystemEffect: "virtual",
        network: "none",
        leases: toolLeaseIds("rm"),
        cwd: options.cwd,
      });
      await options.fs.rm(resolvePath(path), rmOptions);
    },
    async scope(scopeOptions): Promise<AriaSessionEnv> {
      return createJustBashSessionEnv({
        ...options,
        commands: [...options.commands, ...(scopeOptions?.commands ?? [])],
        tools: [...options.tools, ...(scopeOptions?.tools ?? [])],
      });
    },
    resolvePath,
    async cleanup(): Promise<void> {},
  };
}

function mapProjectCwd(cwd: string | undefined, projectRoot: string): string {
  if (!cwd) return PROJECT_MOUNT;
  const normalizedRoot = normalizePath(projectRoot);
  const normalizedCwd = normalizePath(cwd);
  if (normalizedCwd === normalizedRoot) return PROJECT_MOUNT;
  if (normalizedCwd.startsWith(`${normalizedRoot}/`)) {
    return normalizePath(`${PROJECT_MOUNT}/${normalizedCwd.slice(normalizedRoot.length + 1)}`);
  }
  return cwd.startsWith("/") ? cwd : normalizePath(`${PROJECT_MOUNT}/${cwd}`);
}

export { createCwdScopedEnv };
