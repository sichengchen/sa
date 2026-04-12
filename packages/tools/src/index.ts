import type { ToolImpl } from "../../runtime/src/agent/types.js";
import { readTool } from "../../runtime/src/tools/read.js";
import { writeTool } from "../../runtime/src/tools/write.js";
import { editTool } from "../../runtime/src/tools/edit.js";
import { execTool } from "../../runtime/src/tools/exec.js";
import { execStatusTool, execKillTool } from "../../runtime/src/tools/exec-background.js";
import { webFetchTool, createWebFetchTool } from "../../runtime/src/tools/web-fetch.js";
import { webSearchTool } from "../../runtime/src/tools/web-search.js";
import { reactionTool } from "../../runtime/src/tools/reaction.js";

export { readTool } from "../../runtime/src/tools/read.js";
export { writeTool } from "../../runtime/src/tools/write.js";
export { editTool } from "../../runtime/src/tools/edit.js";
export { execTool } from "../../runtime/src/tools/exec.js";
export { execStatusTool, execKillTool } from "../../runtime/src/tools/exec-background.js";
/** @deprecated Use execTool instead */
export { bashTool } from "../../runtime/src/tools/bash.js";
export { webFetchTool, createWebFetchTool } from "../../runtime/src/tools/web-fetch.js";
export { webSearchTool } from "../../runtime/src/tools/web-search.js";
export { reactionTool } from "../../runtime/src/tools/reaction.js";
export { createSetEnvSecretTool, createSetEnvVariableTool } from "../../runtime/src/tools/set-api-key.js";
export { createMemoryWriteTool } from "../../runtime/src/tools/memory-write.js";
export { createMemorySearchTool } from "../../runtime/src/tools/memory-search.js";
export { createMemoryReadTool } from "../../runtime/src/tools/memory-read.js";
export { createMemoryDeleteTool } from "../../runtime/src/tools/memory-delete.js";
export { createDelegateTool } from "../../runtime/src/tools/delegate.js";
export { createDelegateStatusTool } from "../../runtime/src/tools/delegate-status.js";
export { createClaudeCodeTool } from "../../runtime/src/tools/claude-code.js";
export { createCodexTool } from "../../runtime/src/tools/codex.js";
export { askUserTool } from "../../runtime/src/tools/ask-user.js";
export { createSkillManageTool } from "../../runtime/src/tools/skill-manage.js";

export function getBuiltinTools(): ToolImpl[] {
  return [readTool, writeTool, editTool, execTool, execStatusTool, execKillTool, webSearchTool, reactionTool];
}

export function formatToolsSection(tools: ToolImpl[]): string {
  const lines = tools.map((t) => `- ${t.name} [${t.dangerLevel}]: ${t.summary ?? t.description}`);
  return `## Available Tools\n${lines.join("\n")}`;
}

export * from "./toolsets.js";

export * from "./session-tool-environment.js";
