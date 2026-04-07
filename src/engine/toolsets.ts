import type { ToolImpl } from "./agent/types.js";

export interface ToolsetDefinition {
  name: string;
  description: string;
  tools: string[];
}

const BUILTIN_TOOLSET_DEFINITIONS: ToolsetDefinition[] = [
  {
    name: "file",
    description: "Read and modify files in the local workspace.",
    tools: ["read", "write", "edit"],
  },
  {
    name: "exec",
    description: "Run local shell commands and manage background processes.",
    tools: ["exec", "exec_status", "exec_kill"],
  },
  {
    name: "web",
    description: "Fetch URLs and run web searches.",
    tools: ["web_fetch", "web_search"],
  },
  {
    name: "memory",
    description: "Read, search, write, and delete persistent memory.",
    tools: ["memory_search", "memory_read", "memory_write", "memory_delete"],
  },
  {
    name: "skills",
    description: "Read and manage reusable skills.",
    tools: ["read_skill", "skill_manage"],
  },
  {
    name: "env",
    description: "Manage environment variables and encrypted secrets.",
    tools: ["set_env_secret", "set_env_variable"],
  },
  {
    name: "notify",
    description: "Notify users or react in chat connectors.",
    tools: ["notify", "reaction"],
  },
  {
    name: "delegation",
    description: "Delegate work to sub-agents or coding agents.",
    tools: ["delegate", "delegate_status", "claude_code", "codex"],
  },
  {
    name: "interaction",
    description: "Ask the user clarifying questions.",
    tools: ["ask_user"],
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
  }));
}

export function listToolsets(tools: ToolImpl[]): ToolsetDefinition[] {
  return [...getBuiltinToolsets(), ...buildDynamicToolsets(tools)];
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
