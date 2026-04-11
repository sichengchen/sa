import { describe, it, expect } from "bun:test";
import { ToolLoopDetector } from "./tool-loop-detection.js";

describe("ToolLoopDetector", () => {
  it("returns ok for first call", () => {
    const detector = new ToolLoopDetector();
    const result = detector.checkBeforeExecution("read", { file_path: "/tmp/foo" });
    expect(result.level).toBe("ok");
  });

  it("emits warning after warnThreshold identical calls with same result", () => {
    const detector = new ToolLoopDetector({ warnThreshold: 3, blockThreshold: 6, circuitBreakerThreshold: 9 });
    const args = { file_path: "/tmp/foo" };

    for (let i = 0; i < 3; i++) {
      detector.checkBeforeExecution("read", args);
      const result = detector.recordResult("read", args, "same content");
      if (i < 2) {
        expect(result.level).toBe("ok");
      } else {
        expect(result.level).toBe("warn");
        expect(result.message).toContain("possible loop");
      }
    }
  });

  it("blocks after blockThreshold identical calls", () => {
    const detector = new ToolLoopDetector({ warnThreshold: 2, blockThreshold: 4, circuitBreakerThreshold: 6, windowSize: 50 });
    const args = { command: "ls" };

    for (let i = 0; i < 4; i++) {
      detector.checkBeforeExecution("bash", args);
      detector.recordResult("bash", args, "same output");
    }

    // Next check should block
    const check = detector.checkBeforeExecution("bash", args);
    expect(check.level).toBe("block");
    expect(check.message).toContain("call blocked");
  });

  it("triggers circuit breaker after circuitBreakerThreshold", () => {
    const detector = new ToolLoopDetector({ warnThreshold: 2, blockThreshold: 3, circuitBreakerThreshold: 5, windowSize: 50 });
    const args = { file_path: "/tmp/bar" };

    for (let i = 0; i < 5; i++) {
      detector.checkBeforeExecution("read", args);
      detector.recordResult("read", args, "stuck content");
    }

    const check = detector.checkBeforeExecution("read", args);
    expect(check.level).toBe("circuit_breaker");
    expect(check.message).toContain("stopping agent");
  });

  it("does not trigger for different args", () => {
    const detector = new ToolLoopDetector({ warnThreshold: 2, blockThreshold: 4, circuitBreakerThreshold: 6 });

    for (let i = 0; i < 5; i++) {
      const args = { file_path: `/tmp/file-${i}` };
      const check = detector.checkBeforeExecution("read", args);
      expect(check.level).toBe("ok");
      const record = detector.recordResult("read", args, `content-${i}`);
      expect(record.level).toBe("ok");
    }
  });

  it("does not warn when same args produce different results (progress)", () => {
    const detector = new ToolLoopDetector({ warnThreshold: 3, blockThreshold: 6, circuitBreakerThreshold: 9 });
    const args = { command: "date" };

    for (let i = 0; i < 5; i++) {
      detector.checkBeforeExecution("bash", args);
      const result = detector.recordResult("bash", args, `result-${i}`);
      expect(result.level).toBe("ok");
    }
  });

  it("trims history to windowSize", () => {
    const detector = new ToolLoopDetector({ windowSize: 5, warnThreshold: 3, blockThreshold: 6, circuitBreakerThreshold: 9 });

    for (let i = 0; i < 10; i++) {
      detector.checkBeforeExecution("read", { file_path: `/tmp/file-${i}` });
      detector.recordResult("read", { file_path: `/tmp/file-${i}` }, `content-${i}`);
    }

    expect(detector.historyLength).toBe(5);
  });

  it("reset clears history", () => {
    const detector = new ToolLoopDetector();
    const args = { file_path: "/tmp/foo" };

    for (let i = 0; i < 5; i++) {
      detector.checkBeforeExecution("read", args);
      detector.recordResult("read", args, "same");
    }

    detector.reset();
    expect(detector.historyLength).toBe(0);

    // After reset, no warnings
    const check = detector.checkBeforeExecution("read", args);
    expect(check.level).toBe("ok");
  });

  it("uses default thresholds when no config provided", () => {
    const detector = new ToolLoopDetector();
    const args = { file_path: "/tmp/foo" };

    // Should not warn for 9 calls (default warn = 10)
    for (let i = 0; i < 9; i++) {
      detector.checkBeforeExecution("read", args);
      const result = detector.recordResult("read", args, "same");
      expect(result.level).toBe("ok");
    }

    // 10th should warn
    detector.checkBeforeExecution("read", args);
    const result = detector.recordResult("read", args, "same");
    expect(result.level).toBe("warn");
  });
});
