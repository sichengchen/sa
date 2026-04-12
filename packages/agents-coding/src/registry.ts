import { createClaudeCodeRuntimeBackendAdapter } from "./claude-code.js";
import { createCodexRuntimeBackendAdapter } from "./codex.js";
import { createOpenCodeRuntimeBackendAdapter } from "./opencode.js";
import type { RuntimeBackendAdapter } from "./contracts.js";

export function createCodingAgentBackendRegistry(): Map<string, RuntimeBackendAdapter> {
  return new Map<string, RuntimeBackendAdapter>([
    ["codex", createCodexRuntimeBackendAdapter()],
    ["claude-code", createClaudeCodeRuntimeBackendAdapter()],
    ["opencode", createOpenCodeRuntimeBackendAdapter()],
  ]);
}
