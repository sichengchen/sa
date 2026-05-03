import type { AriaHarnessHost } from "./host.js";
import { createDefaultAriaSessionEnv } from "./bash/default-env.js";
import { createExternalAriaSessionEnv, type ExternalSandboxAdapter } from "./bash/external-env.js";
import { createHostAriaSessionEnv } from "./bash/host-env.js";
import { AriaHarnessAgent } from "./agent.js";
import type { AriaEnvironmentKind, AriaSessionEnv } from "./session-env.js";
import type { AriaRoleMap } from "./roles.js";
import type { SkillResolutionOptions } from "./skills.js";

export interface AriaHarnessContextOptions {
  id?: string;
  host: AriaHarnessHost;
  cwd?: string;
  projectRoot?: string;
  externalAdapter?: ExternalSandboxAdapter;
  externalAdapters?: readonly ExternalSandboxAdapter[];
  externalAdapterName?: string;
  roles?: AriaRoleMap;
  skillResolution?: SkillResolutionOptions;
}

export interface InitAgentOptions {
  id?: string;
  model?: string;
  environment?: AriaEnvironmentKind;
  role?: string;
  cwd?: string;
}

export class AriaHarnessContext {
  constructor(private readonly options: AriaHarnessContextOptions) {}

  async init(options: InitAgentOptions = {}): Promise<AriaHarnessAgent> {
    const env = await this.createEnv(options.environment ?? "default", options.cwd);
    this.options.host.resolveModel({ model: options.model, role: options.role });
    return new AriaHarnessAgent({
      id: options.id ?? this.options.id ?? crypto.randomUUID(),
      env,
      host: this.options.host,
      role: options.role,
      roles: this.options.roles,
      skillResolution: this.options.skillResolution,
    });
  }

  async createEnv(kind: AriaEnvironmentKind, cwd?: string): Promise<AriaSessionEnv> {
    if (kind === "host")
      return createHostAriaSessionEnv({ host: this.options.host, cwd: cwd ?? this.options.cwd });
    if (kind === "external") {
      return createExternalAriaSessionEnv({
        host: this.options.host,
        cwd: cwd ?? this.options.cwd,
        adapter: this.options.externalAdapter,
        adapters: this.options.externalAdapters,
        adapterName: this.options.externalAdapterName,
      });
    }
    return createDefaultAriaSessionEnv({
      cwd: cwd ?? this.options.cwd,
      projectRoot: this.options.projectRoot,
      host: this.options.host,
    });
  }
}

export function createAriaHarnessContext(options: AriaHarnessContextOptions): AriaHarnessContext {
  return new AriaHarnessContext(options);
}
