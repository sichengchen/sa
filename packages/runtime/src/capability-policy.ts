import type { ToolImpl, DangerLevel } from "./agent/types.js";
import type { ToolApprovalMode } from "@aria/shared/types.js";
import type { MCPManager, MCPServerStatus } from "./mcp.js";
import { getPrimaryToolset } from "./toolsets.js";

export type CapabilitySource = "builtin" | "mcp";

export interface ToolCapabilityDescriptor {
  toolName: string;
  source: CapabilitySource;
  toolsetName: string;
  capabilityScope?: "workspace" | "runtime" | "network" | "connector" | "external";
  executionBackend?: "local" | "connector" | "hybrid" | "mcp";
  isolationBoundary?: "workspace" | "runtime" | "connector" | "mcp_server";
  approvalPolicy?: "mostly_safe" | "mixed" | "operator_gated" | "connector_gated";
  auditDomain?: string;
  frontendVisibilityDefault?: "visible" | "summary" | "quiet";
  mcpServer?: string;
  mcpTrust?: MCPServerStatus["trust"];
  mcpSessionAvailability?: MCPServerStatus["sessionAvailability"];
}

export interface CapabilityPolicyDecision extends ToolCapabilityDescriptor {
  dangerLevel: DangerLevel;
  approvalMode: ToolApprovalMode;
  approvalRequired: boolean;
  policyDecision: "auto_approve" | "require_operator_approval";
}

function getMcpStatusMap(mcp: Pick<MCPManager, "listServers">): Map<string, MCPServerStatus> {
  return new Map(mcp.listServers().map((status) => [status.name, status]));
}

export function buildToolCapabilityCatalog(
  tools: ToolImpl[],
  mcp: Pick<MCPManager, "getServerForTool" | "listServers">,
): Map<string, ToolCapabilityDescriptor> {
  const mcpStatuses = getMcpStatusMap(mcp as Pick<MCPManager, "listServers">);
  const catalog = new Map<string, ToolCapabilityDescriptor>();

  for (const tool of tools) {
    const toolset = getPrimaryToolset(tool.name, tools);
    const mcpServer = mcp.getServerForTool(tool.name);
    const mcpStatus = mcpServer ? mcpStatuses.get(mcpServer) : undefined;

    catalog.set(tool.name, {
      toolName: tool.name,
      source: mcpServer ? "mcp" : "builtin",
      toolsetName: toolset?.name ?? "unknown",
      capabilityScope: toolset?.capabilityScope,
      executionBackend: toolset?.executionEnvironment,
      isolationBoundary: toolset?.isolationBoundary,
      approvalPolicy: toolset?.approvalPolicy,
      auditDomain: toolset?.auditDomain,
      frontendVisibilityDefault: toolset?.frontendVisibilityDefault,
      mcpServer,
      mcpTrust: mcpStatus?.trust,
      mcpSessionAvailability: mcpStatus?.sessionAvailability,
    });
  }

  return catalog;
}

export function resolveApprovalRequired(
  dangerLevel: DangerLevel,
  approvalMode: ToolApprovalMode,
): boolean {
  if (dangerLevel === "safe") {
    return false;
  }
  if (dangerLevel === "dangerous") {
    return true;
  }
  return approvalMode === "always";
}

export function resolveCapabilityPolicyDecision(
  descriptor: ToolCapabilityDescriptor | undefined,
  dangerLevel: DangerLevel,
  approvalMode: ToolApprovalMode,
): CapabilityPolicyDecision {
  const approvalRequired = resolveApprovalRequired(dangerLevel, approvalMode);

  return {
    toolName: descriptor?.toolName ?? "unknown",
    source: descriptor?.source ?? "builtin",
    toolsetName: descriptor?.toolsetName ?? "unknown",
    capabilityScope: descriptor?.capabilityScope,
    executionBackend: descriptor?.executionBackend,
    isolationBoundary: descriptor?.isolationBoundary,
    approvalPolicy: descriptor?.approvalPolicy,
    auditDomain: descriptor?.auditDomain,
    frontendVisibilityDefault: descriptor?.frontendVisibilityDefault,
    mcpServer: descriptor?.mcpServer,
    mcpTrust: descriptor?.mcpTrust,
    mcpSessionAvailability: descriptor?.mcpSessionAvailability,
    dangerLevel,
    approvalMode,
    approvalRequired,
    policyDecision: approvalRequired ? "require_operator_approval" : "auto_approve",
  };
}
