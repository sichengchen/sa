import type { CommandLease, SecretRef, ToolLease } from "./session-env.js";

export function secretRef(name: string): SecretRef {
  return { kind: "secret_ref", name };
}

export function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "secret_ref" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

export function defineCommandLease(
  name: string,
  options: Omit<CommandLease, "id" | "name"> & { id?: string },
): CommandLease {
  return {
    id: options.id ?? `command:${name}`,
    name,
    executable: options.executable,
    environment: options.environment,
    allowedArgs: options.allowedArgs,
    env: options.env,
    description: options.description,
  };
}

export function defineToolLease(
  toolName: string,
  options: Omit<ToolLease, "id" | "toolName"> & { id?: string } = {},
): ToolLease {
  return {
    id: options.id ?? `tool:${toolName}`,
    toolName,
    description: options.description,
  };
}

export function assertAllowedLeaseArgs(lease: CommandLease, args: string[]): void {
  if (!lease.allowedArgs || lease.allowedArgs.length === 0) return;
  const subcommand = args[0];
  if (!subcommand || !lease.allowedArgs.includes(subcommand)) {
    throw new Error(`Command lease "${lease.name}" only allows: ${lease.allowedArgs.join(", ")}`);
  }
}
