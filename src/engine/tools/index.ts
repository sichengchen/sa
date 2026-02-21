import type { ToolImpl } from "../agent/types.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { bashTool } from "./bash.js";
import { clawHubSearchTool } from "./clawhub-search.js";

export { readTool } from "./read.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
export { bashTool } from "./bash.js";
export { clawHubSearchTool } from "./clawhub-search.js";
export { createClawHubInstallTool } from "./clawhub-install.js";
export { createClawHubUpdateTool } from "./clawhub-update.js";

export function getBuiltinTools(): ToolImpl[] {
  return [readTool, writeTool, editTool, bashTool, clawHubSearchTool];
}

export function formatToolsSection(tools: ToolImpl[]): string {
  const lines = tools.map((t) => `- ${t.name}: ${t.summary ?? t.description}`);
  return `## Available Tools\n${lines.join("\n")}`;
}
