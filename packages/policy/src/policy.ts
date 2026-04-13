import type { DangerLevel } from "@aria/agent-aria";
import type { ConnectorType, ToolApprovalMode } from "@aria/protocol";
import type { ToolPolicyConfig, ToolVerbosity } from "@aria/server/config";

/** Default per-connector verbosity */
const DEFAULT_VERBOSITY: Record<string, ToolVerbosity> = {
  tui: "minimal",
  telegram: "silent",
  discord: "silent",
  wechat: "silent",
  webhook: "silent",
};

export interface ToolEventContext {
  toolName: string;
  dangerLevel: DangerLevel;
  isError?: boolean;
  /** Elapsed milliseconds since tool_start (for long-running detection) */
  elapsedMs?: number;
}

/**
 * ToolPolicyManager centralizes decisions about tool event reporting.
 * It replaces the inline `SAFE_TOOLS.has()` checks in procedures.ts.
 */
export class ToolPolicyManager {
  private verbosity: Record<string, ToolVerbosity>;
  private overrides: Record<
    string,
    { dangerLevel?: DangerLevel; report?: "always" | "never" | "on_error" }
  >;
  /** Built-in danger levels from tool registrations */
  private builtinLevels: Map<string, DangerLevel>;

  constructor(policy: ToolPolicyConfig | undefined, builtinLevels: Map<string, DangerLevel>) {
    this.verbosity = { ...DEFAULT_VERBOSITY, ...policy?.verbosity };
    this.overrides = policy?.overrides ?? {};
    this.builtinLevels = builtinLevels;
  }

  /** Get the effective danger level for a tool (override takes precedence) */
  getDangerLevel(toolName: string): DangerLevel {
    return this.overrides[toolName]?.dangerLevel ?? this.builtinLevels.get(toolName) ?? "dangerous";
  }

  /** Get the verbosity for a connector type */
  getVerbosity(connectorType: ConnectorType): ToolVerbosity {
    return this.verbosity[connectorType] ?? "silent";
  }

  /** Decide whether to emit a tool_start event */
  shouldEmitToolStart(connectorType: ConnectorType, ctx: ToolEventContext): boolean {
    const reportOverride = this.overrides[ctx.toolName]?.report;
    if (reportOverride === "never") return false;
    if (reportOverride === "always") return true;

    const verbosity = this.getVerbosity(connectorType);

    switch (verbosity) {
      case "verbose":
        return true;
      case "minimal":
        // Show moderate + dangerous tool starts
        return ctx.dangerLevel !== "safe";
      case "silent":
        // Only show dangerous tools and long-running tasks
        return ctx.dangerLevel === "dangerous" || (ctx.elapsedMs != null && ctx.elapsedMs > 10_000);
    }
  }

  /** Decide whether to emit a tool_end event */
  shouldEmitToolEnd(connectorType: ConnectorType, ctx: ToolEventContext): boolean {
    const reportOverride = this.overrides[ctx.toolName]?.report;
    if (reportOverride === "never" && !ctx.isError) return false;
    if (reportOverride === "on_error" && !ctx.isError) return false;
    if (reportOverride === "always") return true;

    const verbosity = this.getVerbosity(connectorType);

    switch (verbosity) {
      case "verbose":
        return true;
      case "minimal":
        // Show errors and dangerous tool results
        return ctx.isError === true || ctx.dangerLevel === "dangerous";
      case "silent":
        // Only show errors
        return ctx.isError === true;
    }
  }

  /** Decide whether to emit a tool_approval_request event */
  shouldEmitApproval(
    _connectorType: ConnectorType,
    ctx: ToolEventContext,
    approvalMode: ToolApprovalMode,
  ): boolean {
    // Safe tools never need approval
    if (ctx.dangerLevel === "safe") return false;
    // Dangerous tools always need approval
    if (ctx.dangerLevel === "dangerous") return true;
    // Moderate tools only block when mode is "always"
    return approvalMode === "always";
  }
}
