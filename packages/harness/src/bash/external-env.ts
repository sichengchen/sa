import type { ToolIntent } from "@aria/policy/capability-policy";
import type { AriaHarnessHost } from "../host.js";
import type {
  AriaSessionEnv,
  FileStat,
  ShellOptions,
  ShellResult,
  ToolLease,
} from "../session-env.js";
import { createEscalationShellResult, normalizePath, resolveFromCwd } from "../session-env.js";
import { executeHostCommand, shellQuote } from "../commands.js";

export interface ExternalSandboxAdapter {
  name: string;
  createSessionEnv(options: { cwd: string; host: AriaHarnessHost }): Promise<AriaSessionEnv>;
}

export interface ExternalAriaSessionEnvOptions {
  cwd?: string;
  host: AriaHarnessHost;
  adapter?: ExternalSandboxAdapter;
  adapters?: readonly ExternalSandboxAdapter[];
  adapterName?: string;
  tools?: ToolLease[];
}

export interface DockerExternalSandboxAdapterOptions {
  image?: string;
  volumeName?: string;
}

export async function createExternalAriaSessionEnv(
  options: ExternalAriaSessionEnvOptions,
): Promise<AriaSessionEnv> {
  const cwd = normalizePath(options.cwd ?? "/workspace");
  const intent: ToolIntent = {
    toolName: "external_sandbox",
    environment: "external",
    filesystemEffect: "virtual",
    network: "allowlist",
    leases: toolLeaseIds(options.tools, "external_sandbox"),
    cwd,
  };
  await options.host.recordAudit({ type: "tool_intent", toolName: "external_sandbox", intent });
  const adapter =
    options.adapter ?? selectExternalSandboxAdapter(options.adapters, options.adapterName);
  if (!adapter) {
    return createUnavailableExternalEnv(
      cwd,
      `external sandbox adapter unavailable${options.adapterName ? `: ${options.adapterName}` : ""}`,
    );
  }
  const decision = await options.host.requestToolDecision(intent);
  await options.host.recordAudit({
    type: "tool_decision",
    toolName: "external_sandbox",
    intent,
    decision,
  });
  if (decision.status !== "allow") {
    return createUnavailableExternalEnv(
      cwd,
      decision.reason ?? "external sandbox creation requires approval",
    );
  }
  const env = await adapter.createSessionEnv({ cwd, host: options.host });
  return wrapExternalEnv(env, options.host, options.tools ?? []);
}

export function selectExternalSandboxAdapter(
  adapters: readonly ExternalSandboxAdapter[] | undefined,
  name?: string,
): ExternalSandboxAdapter | undefined {
  if (!adapters || adapters.length === 0) return undefined;
  if (name) return adapters.find((adapter) => adapter.name === name);
  return adapters[0];
}

function createUnavailableExternalEnv(cwd: string, reason: string): AriaSessionEnv {
  const fail = () => {
    throw new Error(reason);
  };
  return {
    kind: "external",
    cwd,
    exec: async () => createEscalationShellResult(reason),
    readFile: async () => fail(),
    readFileBuffer: async () => fail(),
    writeFile: async () => fail(),
    stat: async (): Promise<FileStat> => fail(),
    readdir: async () => fail(),
    exists: async () => false,
    mkdir: async () => fail(),
    rm: async () => fail(),
    scope: async () => createUnavailableExternalEnv(cwd, reason),
    resolvePath: (path) => resolveFromCwd(cwd, path),
    cleanup: async () => {},
  };
}

function toolLeaseIds(tools: readonly ToolLease[] | undefined, toolName: string): string[] {
  return (tools ?? []).filter((lease) => lease.toolName === toolName).map((lease) => lease.id);
}

function wrapExternalEnv(
  env: AriaSessionEnv,
  host: AriaHarnessHost,
  tools: readonly ToolLease[] = [],
): AriaSessionEnv {
  const decide = async (intent: ToolIntent): Promise<ShellResult | null> => {
    await host.recordAudit({ type: "tool_intent", toolName: intent.toolName, intent });
    const decision = await host.requestToolDecision(intent);
    await host.recordAudit({
      type: "tool_decision",
      toolName: intent.toolName,
      intent,
      decision,
    });
    if (decision.status === "allow") return null;
    return createEscalationShellResult(decision.reason ?? "external execution requires approval");
  };

  const resolvePath = (path: string) => env.resolvePath(path);
  return {
    ...env,
    kind: "external",
    async exec(command, shellOptions) {
      const commandCwd = shellOptions?.cwd ? resolvePath(shellOptions.cwd) : env.cwd;
      const denied = await decide({
        toolName: "bash",
        environment: "external",
        filesystemEffect: "virtual",
        network: "allowlist",
        leases: toolLeaseIds(tools, "bash"),
        command,
        cwd: commandCwd,
      });
      if (denied) return denied;
      return env.exec(command, shellOptions);
    },
    async writeFile(path, content) {
      const denied = await decide({
        toolName: "write",
        environment: "external",
        filesystemEffect: "virtual",
        network: "none",
        leases: toolLeaseIds(tools, "write"),
        cwd: env.cwd,
      });
      if (denied) throw new Error(denied.stderr);
      return env.writeFile(path, content);
    },
    async rm(path, rmOptions) {
      const denied = await decide({
        toolName: "rm",
        environment: "external",
        filesystemEffect: "virtual",
        network: "none",
        leases: toolLeaseIds(tools, "rm"),
        cwd: env.cwd,
      });
      if (denied) throw new Error(denied.stderr);
      return env.rm(path, rmOptions);
    },
    async scope(scopeOptions) {
      return wrapExternalEnv((await env.scope?.(scopeOptions)) ?? env, host, [
        ...tools,
        ...(scopeOptions?.tools ?? []),
      ]);
    },
  };
}

export function createDockerExternalSandboxAdapter(
  options: DockerExternalSandboxAdapterOptions = {},
): ExternalSandboxAdapter {
  return {
    name: "docker",
    async createSessionEnv({ cwd }) {
      const image = options.image ?? "alpine:latest";
      const volumeName = options.volumeName ?? `aria-harness-${crypto.randomUUID()}`;
      const docker = (args: string, shellOptions?: ShellOptions) =>
        executeHostCommand(`docker ${args}`, {
          env: shellOptions?.env,
          timeout: shellOptions?.timeout,
        });
      const run = (command: string, shellOptions?: ShellOptions) =>
        docker(
          [
            "run --rm",
            `-v ${shellQuote(`${volumeName}:/workspace`)}`,
            `-w ${shellQuote(shellOptions?.cwd ?? cwd)}`,
            shellQuote(image),
            "sh -lc",
            shellQuote(command),
          ].join(" "),
          shellOptions,
        );

      const env: AriaSessionEnv = {
        kind: "external",
        cwd,
        exec: run,
        async readFile(path) {
          const result = await run(`cat ${shellQuote(resolveFromCwd(cwd, path))}`);
          if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
          return result.stdout;
        },
        async readFileBuffer(path) {
          return new TextEncoder().encode(await this.readFile(path));
        },
        async writeFile(path, content) {
          const resolved = resolveFromCwd(cwd, path);
          const text = typeof content === "string" ? content : new TextDecoder().decode(content);
          const result = await run(
            `mkdir -p ${shellQuote(resolved.replace(/\/[^/]*$/, ""))} && printf %s ${shellQuote(text)} > ${shellQuote(resolved)}`,
          );
          if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
        },
        async stat(path): Promise<FileStat> {
          const resolved = resolveFromCwd(cwd, path);
          const result = await run(
            `if [ -d ${shellQuote(resolved)} ]; then echo directory; elif [ -f ${shellQuote(resolved)} ]; then echo file; else exit 1; fi`,
          );
          if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
          const kind = result.stdout.trim();
          return {
            isFile: kind === "file",
            isDirectory: kind === "directory",
            size: 0,
          };
        },
        async readdir(path) {
          const result = await run(`ls -1 ${shellQuote(resolveFromCwd(cwd, path))}`);
          if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
          return result.stdout.split("\n").filter(Boolean);
        },
        async exists(path) {
          const result = await run(`test -e ${shellQuote(resolveFromCwd(cwd, path))}`);
          return result.exitCode === 0;
        },
        async mkdir(path, mkdirOptions) {
          const flag = mkdirOptions?.recursive ? "-p " : "";
          const result = await run(`mkdir ${flag}${shellQuote(resolveFromCwd(cwd, path))}`);
          if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
        },
        async rm(path, rmOptions) {
          const flags = `${rmOptions?.recursive ? "r" : ""}${rmOptions?.force ? "f" : ""}`;
          const result = await run(
            `rm ${flags ? `-${flags} ` : ""}${shellQuote(resolveFromCwd(cwd, path))}`,
          );
          if (result.exitCode !== 0) throw new Error(result.stderr || result.stdout);
        },
        scope: async () => env,
        resolvePath: (path) => resolveFromCwd(cwd, path),
        async cleanup() {
          await docker(`volume rm -f ${shellQuote(volumeName)}`);
        },
      };
      return env;
    },
  };
}
