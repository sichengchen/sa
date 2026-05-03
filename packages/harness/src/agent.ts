import type { AriaHarnessHost } from "./host.js";
import type { AriaSessionEnv } from "./session-env.js";
import { AriaHarnessSession } from "./session.js";
import type { AriaRoleMap } from "./roles.js";
import type { SkillResolutionOptions } from "./skills.js";

export interface AriaHarnessAgentOptions {
  id: string;
  env: AriaSessionEnv;
  host: AriaHarnessHost;
  role?: string;
  roles?: AriaRoleMap;
  skillResolution?: SkillResolutionOptions;
}

export class AriaHarnessAgent {
  readonly id: string;
  private readonly env: AriaSessionEnv;
  private readonly host: AriaHarnessHost;
  private readonly role?: string;
  private readonly roles?: AriaRoleMap;
  private readonly skillResolution?: SkillResolutionOptions;

  constructor(options: AriaHarnessAgentOptions) {
    this.id = options.id;
    this.env = options.env;
    this.host = options.host;
    this.role = options.role;
    this.roles = options.roles;
    this.skillResolution = options.skillResolution;
  }

  async session(
    id: string,
    options: { role?: string; env?: AriaSessionEnv } = {},
  ): Promise<AriaHarnessSession> {
    const existing = await this.host.loadHarnessSession(id);
    return new AriaHarnessSession(
      {
        id,
        agentId: this.id,
        env: options.env ?? this.env,
        host: this.host,
        agentRole: this.role,
        sessionRole: options.role,
        roles: this.roles,
        skillResolution: this.skillResolution,
        createChildSession: async (childOptions) =>
          new AriaHarnessSession({
            id: childOptions.id,
            agentId: this.id,
            env: childOptions.env,
            host: this.host,
            agentRole: this.role,
            sessionRole: childOptions.role,
            roles: this.roles,
            skillResolution: this.skillResolution,
          }),
      },
      existing,
    );
  }
}
