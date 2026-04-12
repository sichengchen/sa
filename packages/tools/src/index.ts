import type { ToolImpl } from "@aria/agent-aria";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { execTool } from "./exec.js";
import { execStatusTool, execKillTool } from "./exec-background.js";
import { webFetchTool, createWebFetchTool } from "./web-fetch.js";
import { webSearchTool } from "./web-search.js";
import { reactionTool } from "./reaction.js";

export { readTool } from "./read.js";
export { writeTool } from "./write.js";
export { editTool } from "./edit.js";
export { execTool } from "./exec.js";
export { execStatusTool, execKillTool, generateHandle, registerBackground } from "./exec-background.js";
/** @deprecated Use execTool instead */
export { bashTool } from "./bash.js";
export { webFetchTool, createWebFetchTool } from "./web-fetch.js";
export { webSearchTool } from "./web-search.js";
export { reactionTool } from "./reaction.js";
export { createSetEnvSecretTool, createSetEnvVariableTool, validateEnvVarName } from "./set-api-key.js";
export { createMemoryWriteTool } from "./memory-write.js";
export { createMemorySearchTool } from "./memory-search.js";
export { createMemoryReadTool } from "./memory-read.js";
export { createMemoryDeleteTool } from "./memory-delete.js";
export { createDelegateTool } from "./delegate.js";
export { createDelegateStatusTool } from "./delegate-status.js";
export { createClaudeCodeTool } from "./claude-code.js";
export { createCodexTool } from "./codex.js";
export { askUserTool } from "./ask-user.js";
export { createReadSkillTool } from "./read-skill.js";
export { createSkillManageTool } from "./skill-manage.js";
export { createNotifyTool } from "./notify.js";

export function getBuiltinTools(): ToolImpl[] {
  return [readTool, writeTool, editTool, execTool, execStatusTool, execKillTool, webSearchTool, reactionTool];
}

export function formatToolsSection(tools: ToolImpl[]): string {
  const lines = tools.map((t) => `- ${t.name} [${t.dangerLevel}]: ${t.summary ?? t.description}`);
  return `## Available Tools\n${lines.join("\n")}`;
}

export * from "./toolsets.js";

export * from "./session-tool-environment.js";
