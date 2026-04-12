import type { ToolImpl } from "@aria/agent-aria";

export interface ToolsetDefinition {
  name: string;
  description: string;
  tools: string[];
  capabilityScope?: "workspace" | "runtime" | "network" | "connector" | "external";
  executionEnvironment?: "local" | "connector" | "hybrid" | "mcp";
  isolationBoundary?: "workspace" | "runtime" | "connector" | "mcp_server";
  approvalPolicy?: "mostly_safe" | "mixed" | "operator_gated" | "connector_gated";
  auditDomain?: string;
  frontendVisibilityDefault?: "visible" | "summary" | "quiet";
}

const BUILTIN_TOOLSET_DEFINITIONS: ToolsetDefinition[] = [
  {
    name: "files",
    description: "Read and modify files in the local workspace.",
    tools: ["read", "write", "edit"],
    capabilityScope: "workspace",
    executionEnvironment: "local",
    isolationBoundary: "workspace",
    approvalPolicy: "mixed",
    auditDomain: "filesystem",
    frontendVisibilityDefault: "summary",
  },
  {
    name: "terminal",
    description: "Run local shell commands and manage background processes.",
    tools: ["exec", "exec_status", "exec_kill", "set_env_secret", "set_env_variable"],
    capabilityScope: "runtime",
    executionEnvironment: "local",
    isolationBoundary: "workspace",
    approvalPolicy: "operator_gated",
    auditDomain: "terminal",
    frontendVisibilityDefault: "summary",
  },
  {
    name: "web",
    description: "Fetch URLs and run web searches.",
    tools: ["web_fetch", "web_search"],
    capabilityScope: "network",
    executionEnvironment: "hybrid",
    isolationBoundary: "runtime",
    approvalPolicy: "mostly_safe",
    auditDomain: "web",
    frontendVisibilityDefault: "summary",
  },
  {
    name: "memory",
    description: "Read, search, write, and delete persistent memory.",
    tools: ["memory_search", "memory_read", "memory_write", "memory_delete"],
    capabilityScope: "runtime",
    executionEnvironment: "local",
    isolationBoundary: "runtime",
    approvalPolicy: "mixed",
    auditDomain: "memory",
    frontendVisibilityDefault: "summary",
  },
  {
    name: "automation",
    description: "Scheduled and event-driven execution capabilities governed by the runtime.",
    tools: [],
    capabilityScope: "runtime",
    executionEnvironment: "hybrid",
    isolationBoundary: "runtime",
    approvalPolicy: "operator_gated",
    auditDomain: "automation",
    frontendVisibilityDefault: "visible",
  },
  {
    name: "skills",
    description: "Read and manage reusable skills.",
    tools: ["read_skill", "skill_manage"],
    capabilityScope: "workspace",
    executionEnvironment: "local",
    isolationBoundary: "workspace",
    approvalPolicy: "mixed",
    auditDomain: "skills",
    frontendVisibilityDefault: "summary",
  },
  {
    name: "communication",
    description: "Notify users, react in connectors, and ask follow-up questions.",
    tools: ["notify", "reaction", "ask_user"],
    capabilityScope: "connector",
    executionEnvironment: "connector",
    isolationBoundary: "connector",
    approvalPolicy: "connector_gated",
    auditDomain: "communication",
    frontendVisibilityDefault: "visible",
  },
  {
    name: "delegation",
    description: "Delegate work to sub-agents and inspect delegated execution.",
    tools: ["delegate", "delegate_status"],
    capabilityScope: "runtime",
    executionEnvironment: "hybrid",
    isolationBoundary: "runtime",
    approvalPolicy: "operator_gated",
    auditDomain: "delegation",
    frontendVisibilityDefault: "visible",
  },
  {
    name: "coding",
    description: "Use external coding agents for implementation assistance.",
    tools: ["claude_code", "codex"],
    capabilityScope: "external",
    executionEnvironment: "local",
    isolationBoundary: "runtime",
    approvalPolicy: "operator_gated",
    auditDomain: "coding",
    frontendVisibilityDefault: "summary",
  },
];

function sanitizeToolsetName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
}

function buildDefinitionMap(extraDefinitions: ToolsetDefinition[] = []): Map<string, ToolsetDefinition> {
  const map = new Map<string, ToolsetDefinition>();
  for (const def of [...BUILTIN_TOOLSET_DEFINITIONS, ...extraDefinitions]) {
    map.set(def.name, def);
  }
  return map;
}

export function getBuiltinToolsets(): ToolsetDefinition[] {
  return BUILTIN_TOOLSET_DEFINITIONS.map((definition) => ({
    ...definition,
    tools: [...definition.tools],
  }));
}

export function buildDynamicToolsets(tools: ToolImpl[]): ToolsetDefinition[] {
  const mcpTools = tools.filter((tool) => tool.name.startsWith("mcp_"));
  if (mcpTools.length === 0) {
    return [];
  }

  const byServer = new Map<string, string[]>();
  for (const tool of mcpTools) {
    const match = tool.name.match(/^mcp_([^_]+)_.+$/);
    if (!match) continue;
    const serverName = sanitizeToolsetName(match[1] ?? "");
    const current = byServer.get(serverName) ?? [];
    current.push(tool.name);
    byServer.set(serverName, current);
  }

  return Array.from(byServer.entries()).map(([serverName, toolNames]) => ({
    name: `mcp:${serverName}`,
    description: `External MCP tools provided by server "${serverName}".`,
    tools: toolNames.sort(),
    capabilityScope: "external",
    executionEnvironment: "mcp",
    isolationBoundary: "mcp_server",
    approvalPolicy: "operator_gated",
    auditDomain: "mcp",
    frontendVisibilityDefault: "summary",
  }));
}

export function listToolsets(tools: ToolImpl[]): ToolsetDefinition[] {
  return [...getBuiltinToolsets(), ...buildDynamicToolsets(tools)];
}

export function getPrimaryToolset(toolName: string, tools: ToolImpl[]): ToolsetDefinition | undefined {
  return listToolsets(tools).find((toolset) => toolset.tools.includes(toolName));
}

export function resolveToolsets(
  toolsetNames: string[] | undefined,
  tools: ToolImpl[],
): string[] {
  if (!toolsetNames || toolsetNames.length === 0) {
    return [];
  }

  const availableToolNames = new Set(tools.map((tool) => tool.name));
  const definitions = buildDefinitionMap(buildDynamicToolsets(tools));
  const resolved = new Set<string>();

  for (const rawName of toolsetNames) {
    const name = sanitizeToolsetName(rawName);
    const definition = definitions.get(name);
    if (!definition) continue;
    for (const toolName of definition.tools) {
      if (availableToolNames.has(toolName)) {
        resolved.add(toolName);
      }
    }
  }

  return Array.from(resolved);
}

export function mergeAllowedTools(
  tools: ToolImpl[],
  allowedTools?: string[],
  toolsets?: string[],
): string[] | undefined {
  const availableToolNames = new Set(tools.map((tool) => tool.name));
  const resolved = new Set<string>();

  for (const toolName of resolveToolsets(toolsets, tools)) {
    resolved.add(toolName);
  }

  for (const toolName of allowedTools ?? []) {
    if (availableToolNames.has(toolName)) {
      resolved.add(toolName);
    }
  }

  return resolved.size > 0 ? Array.from(resolved) : undefined;
}
