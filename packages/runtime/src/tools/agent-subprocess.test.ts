import { describe, it, expect, afterEach } from "bun:test";
import {
  probeAuth,
  runSubprocess,
  runBackground,
  getBackgroundStatus,
  cleanupBackgroundHandles,
} from "./agent-subprocess.js";

describe("AgentSubprocess", () => {
  describe("probeAuth", () => {
    it("returns installed=false when CLI is not found", async () => {
      const result = await probeAuth("nonexistent-cli-xyz");
      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
    });

    it("detects installed CLI via --version", async () => {
      // Use 'echo' as a stand-in for a CLI that has --version
      const result = await probeAuth("echo");
      expect(result.installed).toBe(true);
      expect(result.version).toBeDefined();
    });
  });

  describe("runSubprocess", () => {
    it("runs a simple command and captures output", async () => {
      const result = await runSubprocess({
        cli: "echo",
        args: ["hello world"],
      });
      expect(result.status).toBe("success");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello world");
      expect(result.duration).toBeGreaterThan(0);
    });

    it("captures stderr on error", async () => {
      const result = await runSubprocess({
        cli: "sh",
        args: ["-c", "echo error >&2; exit 1"],
      });
      expect(result.status).toBe("error");
      expect(result.exitCode).toBe(1);
      expect(result.stderr.trim()).toBe("error");
    });

    it("returns error status for non-existent CLI", async () => {
      const result = await runSubprocess({
        cli: "nonexistent-cli-xyz",
        args: [],
      });
      expect(result.status).toBe("error");
      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toContain("Failed to spawn");
    });

    it("handles timeout", async () => {
      const result = await runSubprocess({
        cli: "sleep",
        args: ["60"],
        timeout: 500,
      });
      expect(result.status).toBe("timeout");
    }, 10_000);

    it("respects workdir", async () => {
      const result = await runSubprocess({
        cli: "pwd",
        args: [],
        workdir: "/tmp",
      });
      expect(result.status).toBe("success");
      expect(result.stdout.trim()).toMatch(/\/tmp|\/private\/tmp/);
    });

    it("injects extra env vars", async () => {
      const result = await runSubprocess({
        cli: "sh",
        args: ["-c", "echo $MY_TEST_VAR"],
        env: { MY_TEST_VAR: "test-value-123" },
      });
      expect(result.status).toBe("success");
      expect(result.stdout.trim()).toBe("test-value-123");
    });

    it("parses file paths from diff output", async () => {
      const diffOutput = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
diff --git a/src/bar.ts b/src/bar.ts`;

      const result = await runSubprocess({
        cli: "echo",
        args: [diffOutput],
      });
      expect(result.filesModified).toContain("src/foo.ts");
      expect(result.filesModified).toContain("src/bar.ts");
    });

    it("extracts summary from output", async () => {
      const result = await runSubprocess({
        cli: "echo",
        args: ["Done: Added authentication module"],
      });
      expect(result.summary).toBe("Added authentication module");
    });
  });

  describe("runBackground", () => {
    afterEach(() => {
      cleanupBackgroundHandles(0);
    });

    it("returns handle immediately", () => {
      const handle = runBackground({
        cli: "echo",
        args: ["bg-test"],
      });
      expect(handle.id).toBeDefined();
      expect(handle.cli).toBe("echo");
      expect(handle.running).toBe(true);
    });

    it("completes with result", async () => {
      const handle = runBackground({
        cli: "echo",
        args: ["bg-done"],
      });

      // Wait for completion
      await new Promise((r) => setTimeout(r, 500));

      const status = getBackgroundStatus(handle.id);
      expect(status).not.toBeNull();
      expect(status!.running).toBe(false);
      expect(status!.result).toBeDefined();
      expect(status!.result!.status).toBe("success");
      expect(status!.result!.stdout.trim()).toBe("bg-done");
    });

    it("returns null for unknown handle", () => {
      expect(getBackgroundStatus("nonexistent")).toBeNull();
    });

    it("cleans up old handles", async () => {
      const handle = runBackground({
        cli: "echo",
        args: ["cleanup-test"],
      });

      await new Promise((r) => setTimeout(r, 500));

      // Clean up handles older than 0ms (all completed)
      cleanupBackgroundHandles(0);
      expect(getBackgroundStatus(handle.id)).toBeNull();
    });
  });
});
