import type { Tool } from "@mariozechner/pi-ai";
import type { DangerLevel, ToolImpl, ToolResult } from "./types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolImpl>();

  register(tool: ToolImpl): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolImpl | undefined {
    return this.tools.get(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Unknown tool: ${name}`, isError: true };
    }
    try {
      return await tool.execute(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Tool error: ${message}`, isError: true };
    }
  }

  /** Get PI-mono Tool definitions for the LLM context */
  getToolDefinitions(): Tool[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  /** Get the danger level for a tool (defaults to "dangerous" if unknown) */
  getDangerLevel(name: string): DangerLevel {
    return this.tools.get(name)?.dangerLevel ?? "dangerous";
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
