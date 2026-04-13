import { describe, expect, test } from "bun:test";
import type { ToolImpl } from "./agent/types.js";
import {
  buildToolCapabilityCatalog,
  resolveCapabilityPolicyDecision,
} from "./capability-policy.js";

const tools: ToolImpl[] = [
  {
    name: "read",
    description: "Read files",
    summary: "Read files",
    dangerLevel: "safe",
    parameters: { type: "object", properties: {} } as any,
    execute: async () => ({ content: "" }),
  },
  {
    name: "exec",
    description: "Execute commands",
    summary: "Execute commands",
    dangerLevel: "dangerous",
    parameters: { type: "object", properties: {} } as any,
    execute: async () => ({ content: "" }),
  },
  {
    name: "mcp_docs_search",
    description: "Search docs",
    summary: "Search docs",
    dangerLevel: "moderate",
    parameters: { type: "object", properties: {} } as any,
    execute: async () => ({ content: "" }),
  },
];

describe("capability policy", () => {
  test("builds capability descriptors from toolsets and MCP status", () => {
    const catalog = buildToolCapabilityCatalog(tools, {
      getServerForTool(toolName: string) {
        return toolName === "mcp_docs_search" ? "docs" : undefined;
      },
      listServers() {
        return [
          {
            name: "docs",
            enabled: true,
            connected: true,
            transport: "stdio" as const,
            trust: "prompt" as const,
            sessionAvailability: "session_opt_in" as const,
            defaultSessionEnabled: false,
            toolCount: 1,
            promptCount: 0,
            resourceCount: 0,
          },
        ];
      },
    });

    expect(catalog.get("read")).toMatchObject({
      toolName: "read",
      source: "builtin",
      toolsetName: "files",
      executionBackend: "local",
    });
    expect(catalog.get("mcp_docs_search")).toMatchObject({
      toolName: "mcp_docs_search",
      source: "mcp",
      toolsetName: "mcp:docs",
      mcpServer: "docs",
      mcpTrust: "prompt",
      mcpSessionAvailability: "session_opt_in",
    });
  });

  test("resolves approval decisions from danger level and connector policy", () => {
    const decision = resolveCapabilityPolicyDecision(
      {
        toolName: "exec",
        source: "builtin",
        toolsetName: "terminal",
        executionBackend: "local",
        approvalPolicy: "operator_gated",
      },
      "dangerous",
      "never",
    );

    expect(decision.approvalRequired).toBe(true);
    expect(decision.policyDecision).toBe("require_operator_approval");
    expect(decision.toolsetName).toBe("terminal");
  });
});
