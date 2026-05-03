export type AriaEnvironmentKind = "default" | "host" | "external";

export interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  escalationRequired?: boolean;
  escalationReason?: string;
}

export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink?: boolean;
  size: number;
  mode?: number;
  mtime?: Date;
}

export interface CommandLease {
  id: string;
  name: string;
  executable: string;
  environment: AriaEnvironmentKind;
  allowedArgs?: string[];
  env?: Record<string, string | SecretRef>;
  description?: string;
}

export interface ToolLease {
  id: string;
  toolName: string;
  description?: string;
}

export interface SecretRef {
  kind: "secret_ref";
  name: string;
}

export interface AriaSessionEnv {
  kind: AriaEnvironmentKind;
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

export function normalizePath(path: string): string {
  const rawParts = path.replace(/\\/g, "/").split("/");
  const parts: string[] = [];
  for (const part of rawParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return (
    `${path.startsWith("/") ? "/" : ""}${parts.join("/")}` || (path.startsWith("/") ? "/" : ".")
  );
}

export function createEscalationShellResult(reason: string): ShellResult {
  return {
    stdout: "",
    stderr: reason,
    exitCode: 126,
    escalationRequired: true,
    escalationReason: reason,
  };
}

export function resolveFromCwd(cwd: string, path: string): string {
  if (path.startsWith("/")) return normalizePath(path);
  return normalizePath(cwd === "/" ? `/${path}` : `${cwd}/${path}`);
}

export function createCwdScopedEnv(parentEnv: AriaSessionEnv, cwd: string): AriaSessionEnv {
  const scopedCwd = normalizePath(cwd);
  const resolvePath = (path: string) => resolveFromCwd(scopedCwd, path);
  return {
    kind: parentEnv.kind,
    cwd: scopedCwd,
    exec: (command, options) =>
      parentEnv.exec(command, {
        ...options,
        cwd: options?.cwd ? resolvePath(options.cwd) : scopedCwd,
      }),
    readFile: (path) => parentEnv.readFile(resolvePath(path)),
    readFileBuffer: (path) => parentEnv.readFileBuffer(resolvePath(path)),
    writeFile: (path, content) => parentEnv.writeFile(resolvePath(path), content),
    stat: (path) => parentEnv.stat(resolvePath(path)),
    readdir: (path) => parentEnv.readdir(resolvePath(path)),
    exists: (path) => parentEnv.exists(resolvePath(path)),
    mkdir: (path, options) => parentEnv.mkdir(resolvePath(path), options),
    rm: (path, options) => parentEnv.rm(resolvePath(path), options),
    scope: async (options) =>
      createCwdScopedEnv((await parentEnv.scope?.(options)) ?? parentEnv, scopedCwd),
    resolvePath,
    cleanup: () => parentEnv.cleanup(),
  };
}

export function createDeferredAriaSessionEnv(
  kind: AriaEnvironmentKind,
  cwd: string,
  factory: () => Promise<AriaSessionEnv>,
): AriaSessionEnv {
  let envPromise: Promise<AriaSessionEnv> | undefined;
  const getEnv = () => {
    envPromise ??= factory();
    return envPromise;
  };
  return {
    kind,
    cwd,
    exec: async (command, options) => (await getEnv()).exec(command, options),
    readFile: async (path) => (await getEnv()).readFile(path),
    readFileBuffer: async (path) => (await getEnv()).readFileBuffer(path),
    writeFile: async (path, content) => (await getEnv()).writeFile(path, content),
    stat: async (path) => (await getEnv()).stat(path),
    readdir: async (path) => (await getEnv()).readdir(path),
    exists: async (path) => (await getEnv()).exists(path),
    mkdir: async (path, options) => (await getEnv()).mkdir(path, options),
    rm: async (path, options) => (await getEnv()).rm(path, options),
    scope: async (options) => (await getEnv()).scope?.(options) ?? (await getEnv()),
    resolvePath: (path) => resolveFromCwd(cwd, path),
    cleanup: async () => (await getEnv()).cleanup(),
  };
}
