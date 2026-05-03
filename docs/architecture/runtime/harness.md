# Aria Harness

`@aria/harness` owns Aria's programmable agent-facing capabilities.

North star:

`Flue is the reference design; just-bash is the default environment; Aria owns the trust boundary.`

## Responsibilities

- create harness contexts, agents, sessions, roles, tasks, skills, and typed results
- expose built-in agent tools generated from `AriaSessionEnv`
- route shell and file access through explicit execution environments
- support command leases without exposing secrets to the model
- keep harness-local history for prompt, skill, shell, task, and result calls

## Non-Responsibilities

`@aria/harness` does not own approvals, audit, durable runtime identity, or durable storage.
It calls the runtime-owned host boundary:

```ts
export interface AriaHarnessHost {
  resolveModel(input: ResolveModelInput): unknown;
  requestToolDecision(intent: ToolIntent): Promise<ToolDecision>;
  recordAudit(event: HarnessAuditEvent): Promise<void>;
  appendRunEvent(event: HarnessRunEvent): Promise<void>;
  loadHarnessSession(id: string): Promise<HarnessSessionData | null>;
  saveHarnessSession(id: string, data: HarnessSessionData): Promise<void>;
  resolveSecrets(leases: SecretLeaseRequest[]): Promise<Record<string, string>>;
}
```

## Session Environment

All built-in agent tools are generated from `AriaSessionEnv`.
File, bash, grep, glob, and task are not independent global tools.

```ts
export interface AriaSessionEnv {
  kind: "default" | "host" | "external";
  cwd: string;
  exec(command: string, options?: ShellOptions): Promise<ShellResult>;
  readFile(path: string): Promise<string>;
  readFileBuffer(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  stat(path: string): Promise<FileStat>;
  readdir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  scope?(options?: { commands?: CommandLease[]; tools?: ToolLease[] }): Promise<AriaSessionEnv>;
  resolvePath(path: string): string;
  cleanup(): Promise<void>;
}
```

## Built-In Harness Tools

Generated from a session env:

- `read`
- `write`
- `edit`
- `bash`
- `grep`
- `glob`
- `task`

Legacy `exec` remains a compatibility tool, routed through harness shell environments.

## Environments

- `default`: just-bash. Plain chat uses in-memory filesystem. Project threads use `OverlayFs`, so reads come from the project root and writes remain virtual.
- `host`: the real local machine. Conceptually "Dangerously use this Mac" and approval-gated.
- `external`: Daytona, E2B, Vercel Sandbox, Docker, or a remote Aria node. This is the preferred path for isolated real execution. Named adapters are selected explicitly; missing requested adapters produce escalation-required results.

There is no silent fallback from `default` or `external` to `host`.

## Command Leases

Command leases make narrow command capabilities visible to the model while keeping credentials outside the prompt.

```ts
const gh = defineCommandLease("gh", {
  executable: "gh",
  environment: "host",
  allowedArgs: ["issue", "pr", "run"],
  env: { GH_TOKEN: secretRef("github.token") },
});
```

The runtime resolves secrets at the execution boundary and records audit metadata with lease ids, not secret values.

## Roles And Results

Role precedence is:

`call role > session role > agent role > Aria default identity`

Roles are prompt overlays, not fake persisted messages.

Typed results validate model output against a schema, persist raw and parsed values, and support Valibot first, with Zod and TypeBox adapters.
