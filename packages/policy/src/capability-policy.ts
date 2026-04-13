import type { DangerLevel, ToolImpl } from "@aria/agent-aria";
import type { ToolApprovalMode } from "@aria/protocol";
import { getPrimaryToolset } from "@aria/tools/toolsets";

export type CapabilitySource = "builtin" | "mcp";

export interface CapabilityMcpServerStatus {
  name: string;
  trust: "trusted" | "prompt" | "blocked";
  sessionAvailability: "all" | "enabled" | "disabled" | "session_opt_in" | "admin_only";
}

export interface CapabilityMcpRegistry {
  getServerForTool(toolName: string): string | undefined;
  listServers(): CapabilityMcpServerStatus[];
}

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
  mcpTrust?: CapabilityMcpServerStatus["trust"];
  mcpSessionAvailability?: CapabilityMcpServerStatus["sessionAvailability"];
}

export interface CapabilityPolicyDecision extends ToolCapabilityDescriptor {
  dangerLevel: DangerLevel;
  approvalMode: ToolApprovalMode;
  approvalRequired: boolean;
  policyDecision: "auto_approve" | "require_operator_approval";
}

function getMcpStatusMap(
  mcp: Pick<CapabilityMcpRegistry, "listServers">,
): Map<string, CapabilityMcpServerStatus> {
  return new Map(mcp.listServers().map((status) => [status.name, status]));
}

export function buildToolCapabilityCatalog(
  tools: ToolImpl[],
  mcp: Pick<CapabilityMcpRegistry, "getServerForTool" | "listServers">,
): Map<string, ToolCapabilityDescriptor> {
  const mcpStatuses = getMcpStatusMap(mcp);
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
