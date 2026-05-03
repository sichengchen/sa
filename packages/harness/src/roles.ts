export interface AriaRole {
  name: string;
  instructions: string;
  model?: string;
}

export type AriaRoleMap = Record<string, AriaRole>;

export function assertRoleExists(roles: AriaRoleMap, roleName: string | undefined): void {
  if (!roleName || roles[roleName]) return;
  const available = Object.keys(roles).join(", ") || "(none)";
  throw new Error(`Role "${roleName}" not registered. Available roles: ${available}`);
}

export function resolveEffectiveRole(options: {
  roles: AriaRoleMap;
  callRole?: string;
  sessionRole?: string;
  agentRole?: string;
}): string | undefined {
  const role = options.callRole ?? options.sessionRole ?? options.agentRole;
  assertRoleExists(options.roles, role);
  return role;
}

export function buildRolePrompt(basePrompt: string, roles: AriaRoleMap, roleName?: string): string {
  if (!roleName) return basePrompt;
  const role = roles[roleName];
  if (!role) return basePrompt;
  return [basePrompt, role.instructions].filter(Boolean).join("\n\n");
}
