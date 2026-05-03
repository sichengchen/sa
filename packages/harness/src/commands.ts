import { defineCommand, type CustomCommand } from "just-bash";
import type { ToolIntent } from "@aria/policy/capability-policy";
import type { AriaHarnessHost } from "./host.js";
import type { CommandLease, ShellResult } from "./session-env.js";
import { createEscalationShellResult } from "./session-env.js";
import { assertAllowedLeaseArgs, isSecretRef } from "./leases.js";

export type { CommandLease } from "./session-env.js";
export { defineCommandLease } from "./leases.js";

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function executeHostCommand(
  command: string,
  options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<ShellResult> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  let timer: Timer | undefined;
  if (options.timeout && options.timeout > 0) {
    timer = setTimeout(() => proc.kill(), options.timeout * 1000);
  }
  try {
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    return { stdout, stderr, exitCode };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function commandLeaseToJustBashCommand(
  lease: CommandLease,
  host: AriaHarnessHost,
): CustomCommand {
  return defineCommand(lease.name, async (args, ctx) => {
    try {
      assertAllowedLeaseArgs(lease, args);
      const command = [lease.executable, ...args.map(shellQuote)].join(" ");
      const intent: ToolIntent = {
        toolName: lease.name,
        environment: lease.environment,
        filesystemEffect: lease.environment === "host" ? "host_write" : "virtual",
        network: "none",
        leases: [lease.id],
        command,
        cwd: ctx.cwd,
      };
      await host.recordAudit({ type: "tool_intent", toolName: lease.name, intent });
      if (lease.environment !== "host") {
        const decision = {
          status: "escalate" as const,
          reason: `command lease environment is not available: ${lease.environment}`,
        };
        await host.recordAudit({ type: "tool_decision", toolName: lease.name, intent, decision });
        const result = createEscalationShellResult(decision.reason);
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
      }
      const decision = await host.requestToolDecision(intent);
      await host.recordAudit({ type: "tool_decision", toolName: lease.name, intent, decision });
      if (decision.status !== "allow") {
        const result = createEscalationShellResult(
          decision.reason ?? "command lease requires escalation",
        );
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
      }
      const secretRequests = Object.entries(lease.env ?? {})
        .filter((entry) => isSecretRef(entry[1]))
        .map(([name, ref]) => ({ id: name, ref: ref as { kind: "secret_ref"; name: string } }));
      const secrets = await host.resolveSecrets(secretRequests);
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(lease.env ?? {})) {
        env[key] = isSecretRef(value) ? (secrets[key] ?? "") : value;
      }
      const result = await executeHostCommand(command, { env });
      return result;
    } catch (error) {
      return {
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: 1,
      };
    }
  });
}
