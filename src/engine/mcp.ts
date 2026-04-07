import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CompatibilityCallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ToolImpl, DangerLevel, ToolResult } from "./agent/types.js";
import type { MCPServerConfig, MCPServerToolFilterConfig } from "./config/types.js";

interface MCPToolDefinition {
  originalName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  dangerLevel: DangerLevel;
}

interface MCPServerConnection {
  name: string;
  config: MCPServerConfig;
  client: Client;
  transport: "stdio" | "http";
  tools: MCPToolDefinition[];
  instructions?: string;
}

export interface MCPServerStatus {
  name: string;
  enabled: boolean;
  connected: boolean;
  transport: "stdio" | "http" | "unknown";
  toolCount: number;
  promptCount: number;
  resourceCount: number;
  instructions?: string;
  error?: string;
}

export interface MCPPromptReference {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface MCPResourceReference {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unnamed";
}

function dangerLevelForMcpTool(tool: any): DangerLevel {
  const annotations = tool?.annotations ?? {};
  if (annotations.destructiveHint) return "dangerous";
  if (annotations.readOnlyHint && !annotations.openWorldHint) return "safe";
  return "moderate";
}

function formatContentBlock(block: any): string {
  if (!block || typeof block !== "object") {
    return String(block ?? "");
  }

  switch (block.type) {
    case "text":
      return String(block.text ?? "");
    case "image":
      return `[image ${block.mimeType ?? "unknown"} ${String(block.data ?? "").length}b64]`;
    case "audio":
      return `[audio ${block.mimeType ?? "unknown"} ${String(block.data ?? "").length}b64]`;
    case "resource":
      if (block.resource?.text) {
        return `Resource ${block.resource.uri}\n${block.resource.text}`;
      }
      return `Resource ${block.resource?.uri ?? "(unknown resource)"}`;
    case "resource_link":
      return `Resource link: ${block.name ?? block.uri}\n${block.uri}`;
    default:
      return JSON.stringify(block, null, 2);
  }
}

function formatToolResult(result: any): ToolResult {
  if (result && typeof result === "object" && "toolResult" in result) {
    return { content: JSON.stringify(result.toolResult, null, 2) };
  }

  const parts: string[] = [];
  if (Array.isArray(result?.content)) {
    for (const block of result.content) {
      const formatted = formatContentBlock(block);
      if (formatted) parts.push(formatted);
    }
  }
  if (result?.structuredContent && Object.keys(result.structuredContent).length > 0) {
    parts.push(`Structured content:\n${JSON.stringify(result.structuredContent, null, 2)}`);
  }

  return {
    content: parts.join("\n\n").trim() || "(no content)",
    isError: Boolean(result?.isError),
  };
}

function formatPromptMessages(result: any): string {
  const messages = Array.isArray(result?.messages) ? result.messages : [];
  if (messages.length === 0) {
    return "(no prompt messages)";
  }

  return messages
    .map((message: any) => {
      const content = formatContentBlock(message?.content);
      return `${message?.role ?? "unknown"}:\n${content}`;
    })
    .join("\n\n");
}

function formatResourceRead(result: any): string {
  const contents = Array.isArray(result?.contents) ? result.contents : [];
  if (contents.length === 0) {
    return "(empty resource)";
  }

  return contents
    .map((content: any) => {
      if (typeof content?.text === "string") {
        return `${content.uri ?? ""}\n${content.text}`.trim();
      }
      if (typeof content?.blob === "string") {
        return `${content.uri ?? ""}\n[binary ${content.mimeType ?? "unknown"} ${content.blob.length}b64]`.trim();
      }
      return JSON.stringify(content, null, 2);
    })
    .join("\n\n");
}

function isToolAllowed(toolName: string, filter?: MCPServerToolFilterConfig): boolean {
  if (!filter) return true;
  if (filter.include && filter.include.length > 0 && !filter.include.includes(toolName)) {
    return false;
  }
  if (filter.exclude && filter.exclude.includes(toolName)) {
    return false;
  }
  return true;
}

function resolveTransport(config: MCPServerConfig, cwd: string) {
  if (config.command) {
    return {
      transport: "stdio" as const,
      instance: new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd,
      }),
    };
  }

  if (config.url) {
    return {
      transport: "http" as const,
      instance: new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: config.headers ? { headers: config.headers } : undefined,
      }),
    };
  }

  throw new Error("MCP server config must set either command or url.");
}

function dedupeToolName(serverName: string, originalName: string, used: Set<string>): string {
  const base = `mcp_${sanitizeSegment(serverName)}_${sanitizeSegment(originalName)}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let index = 2;
  while (used.has(`${base}_${index}`)) {
    index++;
  }
  const finalName = `${base}_${index}`;
  used.add(finalName);
  return finalName;
}

export class MCPManager {
  private readonly serverConfigs: Record<string, MCPServerConfig>;
  private readonly cwd: string;
  private readonly connections = new Map<string, MCPServerConnection>();
  private readonly statuses = new Map<string, MCPServerStatus>();

  constructor(serverConfigs: Record<string, MCPServerConfig> | undefined, cwd = process.env.TERMINAL_CWD ?? process.cwd()) {
    this.serverConfigs = serverConfigs ?? {};
    this.cwd = cwd;
  }

  async init(): Promise<void> {
    for (const [name, config] of Object.entries(this.serverConfigs)) {
      if (config.enabled === false) {
        this.statuses.set(name, {
          name,
          enabled: false,
          connected: false,
          transport: config.command ? "stdio" : config.url ? "http" : "unknown",
          toolCount: 0,
          promptCount: 0,
          resourceCount: 0,
        });
        continue;
      }

      try {
        const { transport, instance } = resolveTransport(config, this.cwd);
        const client = new Client({ name: "sa", version: "2026.3.4" }, { capabilities: {} });
        await client.connect(instance);

        const listedTools = await client.listTools();
        const usedToolNames = new Set<string>();
        const tools = (listedTools.tools ?? [])
          .filter((tool) => isToolAllowed(tool.name, config.tools))
          .map((tool) => ({
            originalName: tool.name,
            toolName: dedupeToolName(name, tool.name, usedToolNames),
            description: tool.description ?? `MCP tool ${tool.name} from server ${name}`,
            inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
            dangerLevel: dangerLevelForMcpTool(tool),
          }));

        const connection: MCPServerConnection = {
          name,
          config,
          client,
          transport,
          tools,
          instructions: client.getInstructions(),
        };
        this.connections.set(name, connection);

        let promptCount = 0;
        let resourceCount = 0;
        try {
          if (config.tools?.prompts !== false) {
            promptCount = (await client.listPrompts()).prompts?.length ?? 0;
          }
        } catch {
          // Prompt discovery is best-effort.
        }
        try {
          if (config.tools?.resources !== false) {
            resourceCount = (await client.listResources()).resources?.length ?? 0;
          }
        } catch {
          // Resource discovery is best-effort.
        }

        this.statuses.set(name, {
          name,
          enabled: true,
          connected: true,
          transport,
          toolCount: tools.length,
          promptCount,
          resourceCount,
          instructions: connection.instructions,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.statuses.set(name, {
          name,
          enabled: true,
          connected: false,
          transport: config.command ? "stdio" : config.url ? "http" : "unknown",
          toolCount: 0,
          promptCount: 0,
          resourceCount: 0,
          error: message,
        });
      }
    }
  }

  async close(): Promise<void> {
    for (const connection of this.connections.values()) {
      try {
        await connection.client.close();
      } catch {
        // Shutdown best-effort only.
      }
    }
    this.connections.clear();
  }

  getTools(): ToolImpl[] {
    const tools: ToolImpl[] = [];
    for (const connection of this.connections.values()) {
      for (const tool of connection.tools) {
        tools.push({
          name: tool.toolName,
          description: `${tool.description} [MCP server: ${connection.name}]`,
          summary: `${tool.description} [server ${connection.name}]`,
          dangerLevel: tool.dangerLevel,
          parameters: tool.inputSchema as any,
          execute: async (args) => {
            try {
              const result = await connection.client.callTool(
                { name: tool.originalName, arguments: args },
                CompatibilityCallToolResultSchema,
              );
              return formatToolResult(result);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              return {
                content: `MCP tool ${connection.name}/${tool.originalName} failed: ${message}`,
                isError: true,
              };
            }
          },
        });
      }
    }
    return tools;
  }

  listServers(): MCPServerStatus[] {
    return Array.from(this.statuses.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  listTools(serverName?: string): Array<{ server: string; name: string; toolName: string; description: string; dangerLevel: DangerLevel }> {
    const connections = serverName ? [this.getConnection(serverName)] : Array.from(this.connections.values());
    return connections
      .flatMap((connection) => connection.tools.map((tool) => ({
        server: connection.name,
        name: tool.originalName,
        toolName: tool.toolName,
        description: tool.description,
        dangerLevel: tool.dangerLevel,
      })))
      .sort((a, b) => a.toolName.localeCompare(b.toolName));
  }

  async listPrompts(serverName: string): Promise<MCPPromptReference[]> {
    const connection = this.getConnection(serverName);
    if (connection.config.tools?.prompts === false) {
      return [];
    }

    const result = await connection.client.listPrompts();
    return (result.prompts ?? []).map((prompt: any) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: Array.isArray(prompt.arguments)
        ? prompt.arguments.map((arg: any) => ({
          name: arg.name,
          description: arg.description,
          required: arg.required,
        }))
        : undefined,
    }));
  }

  async getPrompt(serverName: string, name: string, args?: Record<string, string>): Promise<string> {
    const connection = this.getConnection(serverName);
    if (connection.config.tools?.prompts === false) {
      throw new Error(`MCP prompts are disabled for server "${serverName}".`);
    }
    const result = await connection.client.getPrompt({ name, arguments: args });
    return formatPromptMessages(result);
  }

  async listResources(serverName: string, cursor?: string): Promise<MCPResourceReference[]> {
    const connection = this.getConnection(serverName);
    if (connection.config.tools?.resources === false) {
      return [];
    }

    const result = await connection.client.listResources(cursor ? { cursor } : undefined);
    return (result.resources ?? []).map((resource: any) => ({
      name: resource.name,
      uri: resource.uri,
      description: resource.description,
      mimeType: resource.mimeType,
    }));
  }

  async readResource(serverName: string, uri: string): Promise<string> {
    const connection = this.getConnection(serverName);
    if (connection.config.tools?.resources === false) {
      throw new Error(`MCP resources are disabled for server "${serverName}".`);
    }
    const result = await connection.client.readResource({ uri });
    return formatResourceRead(result);
  }

  private getConnection(serverName: string): MCPServerConnection {
    const connection = this.connections.get(serverName);
    if (!connection) {
      const status = this.statuses.get(serverName);
      if (status?.error) {
        throw new Error(status.error);
      }
      throw new Error(`Unknown MCP server: ${serverName}`);
    }
    return connection;
  }
}
