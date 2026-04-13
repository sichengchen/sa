import { describe, it, expect } from "bun:test";
import { ToolPolicyManager, type ToolEventContext } from "./policy.js";
import type { DangerLevel } from "../agent/types.js";
import type { ConnectorType } from "@aria/protocol";

/** Helper to build a minimal ToolEventContext */
function ctx(
  toolName: string,
  dangerLevel: DangerLevel,
  opts?: { isError?: boolean; elapsedMs?: number },
): ToolEventContext {
  return { toolName, dangerLevel, ...opts };
}

describe("ToolPolicyManager", () => {
  const builtinLevels = new Map<string, DangerLevel>([
    ["read", "safe"],
    ["write", "moderate"],
    ["exec", "dangerous"],
  ]);

  describe("getDangerLevel", () => {
    it("returns builtin level for known tools", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);
      expect(pm.getDangerLevel("read")).toBe("safe");
      expect(pm.getDangerLevel("write")).toBe("moderate");
      expect(pm.getDangerLevel("exec")).toBe("dangerous");
    });

    it("returns 'dangerous' for unknown tools", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);
      expect(pm.getDangerLevel("unknown_tool")).toBe("dangerous");
    });

    it("override takes precedence over builtin", () => {
      const pm = new ToolPolicyManager(
        { overrides: { read: { dangerLevel: "dangerous" } } },
        builtinLevels,
      );
      expect(pm.getDangerLevel("read")).toBe("dangerous");
    });
  });

  describe("getVerbosity", () => {
    it("returns default verbosity for each connector", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);
      expect(pm.getVerbosity("tui")).toBe("minimal");
      expect(pm.getVerbosity("telegram")).toBe("silent");
      expect(pm.getVerbosity("discord")).toBe("silent");
      expect(pm.getVerbosity("wechat")).toBe("silent");
      expect(pm.getVerbosity("webhook")).toBe("silent");
    });

    it("user config overrides defaults", () => {
      const pm = new ToolPolicyManager({ verbosity: { telegram: "verbose" } }, builtinLevels);
      expect(pm.getVerbosity("telegram")).toBe("verbose");
      // Others remain default
      expect(pm.getVerbosity("tui")).toBe("minimal");
    });
  });

  describe("shouldEmitToolStart", () => {
    describe("verbose mode", () => {
      const pm = new ToolPolicyManager({ verbosity: { tui: "verbose" } }, builtinLevels);

      it("emits for safe tools", () => {
        expect(pm.shouldEmitToolStart("tui", ctx("read", "safe"))).toBe(true);
      });

      it("emits for moderate tools", () => {
        expect(pm.shouldEmitToolStart("tui", ctx("write", "moderate"))).toBe(true);
      });

      it("emits for dangerous tools", () => {
        expect(pm.shouldEmitToolStart("tui", ctx("exec", "dangerous"))).toBe(true);
      });
    });

    describe("minimal mode (default TUI)", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);

      it("suppresses safe tools", () => {
        expect(pm.shouldEmitToolStart("tui", ctx("read", "safe"))).toBe(false);
      });

      it("emits for moderate tools", () => {
        expect(pm.shouldEmitToolStart("tui", ctx("write", "moderate"))).toBe(true);
      });

      it("emits for dangerous tools", () => {
        expect(pm.shouldEmitToolStart("tui", ctx("exec", "dangerous"))).toBe(true);
      });
    });

    describe("silent mode (default IM)", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);

      it("suppresses safe tools", () => {
        expect(pm.shouldEmitToolStart("telegram", ctx("read", "safe"))).toBe(false);
      });

      it("suppresses moderate tools", () => {
        expect(pm.shouldEmitToolStart("telegram", ctx("write", "moderate"))).toBe(false);
      });

      it("emits for dangerous tools", () => {
        expect(pm.shouldEmitToolStart("telegram", ctx("exec", "dangerous"))).toBe(true);
      });

      it("emits for long-running tasks (>10s)", () => {
        expect(
          pm.shouldEmitToolStart("telegram", ctx("write", "moderate", { elapsedMs: 15_000 })),
        ).toBe(true);
      });

      it("suppresses short-running tasks", () => {
        expect(
          pm.shouldEmitToolStart("telegram", ctx("write", "moderate", { elapsedMs: 5_000 })),
        ).toBe(false);
      });
    });

    describe("per-tool report overrides", () => {
      it("report 'never' suppresses even dangerous tools", () => {
        const pm = new ToolPolicyManager(
          { overrides: { exec: { report: "never" } } },
          builtinLevels,
        );
        expect(pm.shouldEmitToolStart("tui", ctx("exec", "dangerous"))).toBe(false);
      });

      it("report 'always' forces emission even for safe tools in silent mode", () => {
        const pm = new ToolPolicyManager(
          { overrides: { read: { report: "always" } } },
          builtinLevels,
        );
        expect(pm.shouldEmitToolStart("telegram", ctx("read", "safe"))).toBe(true);
      });
    });
  });

  describe("shouldEmitToolEnd", () => {
    describe("verbose mode", () => {
      const pm = new ToolPolicyManager({ verbosity: { tui: "verbose" } }, builtinLevels);

      it("emits for all tools", () => {
        expect(pm.shouldEmitToolEnd("tui", ctx("read", "safe"))).toBe(true);
        expect(pm.shouldEmitToolEnd("tui", ctx("write", "moderate"))).toBe(true);
        expect(pm.shouldEmitToolEnd("tui", ctx("exec", "dangerous"))).toBe(true);
      });

      it("emits for errors", () => {
        expect(pm.shouldEmitToolEnd("tui", ctx("read", "safe", { isError: true }))).toBe(true);
      });
    });

    describe("minimal mode", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);

      it("suppresses safe tool results", () => {
        expect(pm.shouldEmitToolEnd("tui", ctx("read", "safe"))).toBe(false);
      });

      it("suppresses moderate tool results", () => {
        expect(pm.shouldEmitToolEnd("tui", ctx("write", "moderate"))).toBe(false);
      });

      it("emits dangerous tool results", () => {
        expect(pm.shouldEmitToolEnd("tui", ctx("exec", "dangerous"))).toBe(true);
      });

      it("always emits errors", () => {
        expect(pm.shouldEmitToolEnd("tui", ctx("read", "safe", { isError: true }))).toBe(true);
        expect(pm.shouldEmitToolEnd("tui", ctx("write", "moderate", { isError: true }))).toBe(true);
      });
    });

    describe("silent mode", () => {
      const pm = new ToolPolicyManager(undefined, builtinLevels);

      it("suppresses all non-error results", () => {
        expect(pm.shouldEmitToolEnd("telegram", ctx("read", "safe"))).toBe(false);
        expect(pm.shouldEmitToolEnd("telegram", ctx("write", "moderate"))).toBe(false);
        expect(pm.shouldEmitToolEnd("telegram", ctx("exec", "dangerous"))).toBe(false);
      });

      it("emits errors", () => {
        expect(pm.shouldEmitToolEnd("telegram", ctx("read", "safe", { isError: true }))).toBe(true);
        expect(pm.shouldEmitToolEnd("telegram", ctx("exec", "dangerous", { isError: true }))).toBe(
          true,
        );
      });
    });

    describe("per-tool report overrides", () => {
      it("report 'never' suppresses even errors", () => {
        const pm = new ToolPolicyManager(
          { overrides: { exec: { report: "never" } } },
          builtinLevels,
        );
        expect(pm.shouldEmitToolEnd("tui", ctx("exec", "dangerous"))).toBe(false);
      });

      it("report 'never' still shows errors", () => {
        const pm = new ToolPolicyManager(
          { overrides: { exec: { report: "never" } } },
          builtinLevels,
        );
        // When report is "never" but isError is true, the implementation says: if "never" && !isError return false
        // So errors are still shown even with "never"
        expect(pm.shouldEmitToolEnd("tui", ctx("exec", "dangerous", { isError: true }))).toBe(true);
      });

      it("report 'on_error' suppresses success", () => {
        const pm = new ToolPolicyManager(
          { overrides: { write: { report: "on_error" } } },
          builtinLevels,
        );
        expect(pm.shouldEmitToolEnd("tui", ctx("write", "moderate"))).toBe(false);
      });

      it("report 'on_error' emits errors", () => {
        const pm = new ToolPolicyManager(
          { overrides: { write: { report: "on_error" } } },
          builtinLevels,
        );
        expect(pm.shouldEmitToolEnd("tui", ctx("write", "moderate", { isError: true }))).toBe(true);
      });

      it("report 'always' forces emission in silent mode", () => {
        const pm = new ToolPolicyManager(
          { overrides: { read: { report: "always" } } },
          builtinLevels,
        );
        expect(pm.shouldEmitToolEnd("telegram", ctx("read", "safe"))).toBe(true);
      });
    });
  });

  describe("shouldEmitApproval", () => {
    const pm = new ToolPolicyManager(undefined, builtinLevels);

    it("suppresses safe tool approvals", () => {
      expect(pm.shouldEmitApproval("tui", ctx("read", "safe"), "ask")).toBe(false);
    });

    it("suppresses moderate tools when mode is not 'always'", () => {
      expect(pm.shouldEmitApproval("tui", ctx("write", "moderate"), "never")).toBe(false);
      expect(pm.shouldEmitApproval("telegram", ctx("write", "moderate"), "ask")).toBe(false);
    });

    it("emits for moderate tools when mode is 'always'", () => {
      expect(pm.shouldEmitApproval("tui", ctx("write", "moderate"), "always")).toBe(true);
    });

    it("emits for dangerous tools regardless of mode", () => {
      expect(pm.shouldEmitApproval("tui", ctx("exec", "dangerous"), "never")).toBe(true);
      expect(pm.shouldEmitApproval("telegram", ctx("exec", "dangerous"), "ask")).toBe(true);
    });
  });

  describe("combined overrides", () => {
    it("danger level override + report override work together", () => {
      const pm = new ToolPolicyManager(
        {
          overrides: {
            read: { dangerLevel: "dangerous", report: "always" },
          },
        },
        builtinLevels,
      );
      // Danger level is overridden
      expect(pm.getDangerLevel("read")).toBe("dangerous");
      // Report "always" forces emission in silent mode
      expect(pm.shouldEmitToolStart("telegram", ctx("read", "dangerous"))).toBe(true);
      expect(pm.shouldEmitToolEnd("telegram", ctx("read", "dangerous"))).toBe(true);
    });

    it("unknown tool names in overrides are silently applied", () => {
      const pm = new ToolPolicyManager(
        { overrides: { future_tool: { dangerLevel: "safe", report: "never" } } },
        builtinLevels,
      );
      // The override applies if the tool is ever encountered
      expect(pm.getDangerLevel("future_tool")).toBe("safe");
      expect(pm.shouldEmitToolStart("tui", ctx("future_tool", "safe"))).toBe(false);
    });
  });
});
