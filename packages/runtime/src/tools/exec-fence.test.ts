import { describe, it, expect } from "bun:test";
import { homedir } from "node:os";
import { validateExecPaths } from "./exec-fence.js";

const HOME = homedir();

describe("validateExecPaths", () => {
  const config = {
    fence: ["~/projects", "/tmp"],
    alwaysDeny: ["~/.aria", "~/.ssh", "~/.gnupg"],
  };

  describe("workdir validation", () => {
    it("allows workdir inside fence", () => {
      expect(validateExecPaths("ls", `${HOME}/projects/myapp`, config)).toEqual({ ok: true });
    });

    it("allows workdir in /tmp", () => {
      expect(validateExecPaths("ls", "/tmp/test", config)).toEqual({ ok: true });
    });

    it("blocks workdir outside fence", () => {
      const result = validateExecPaths("ls", "/etc", config);
      expect("ok" in result).toBe(false);
      if (!("ok" in result)) {
        expect(result.layer).toBe("exec_fence");
        expect(result.detail).toContain("outside the fence");
      }
    });

    it("blocks workdir in always-deny", () => {
      const result = validateExecPaths("ls", `${HOME}/.aria`, config);
      expect("ok" in result).toBe(false);
      if (!("ok" in result)) {
        expect(result.detail).toContain("denied");
      }
    });

    it("allows commands with no workdir", () => {
      expect(validateExecPaths("echo hello", undefined, config)).toEqual({ ok: true });
    });
  });

  describe("command path extraction", () => {
    it("blocks commands with paths in always-deny", () => {
      const result = validateExecPaths(`cat ${HOME}/.ssh/id_rsa`, undefined, config);
      expect("ok" in result).toBe(false);
      if (!("ok" in result)) {
        expect(result.detail).toContain("denied");
      }
    });

    it("blocks commands accessing ~/.aria", () => {
      const result = validateExecPaths(`cat ${HOME}/.aria/config.json`, undefined, config);
      expect("ok" in result).toBe(false);
    });

    it("blocks commands with paths outside fence", () => {
      const result = validateExecPaths("cat /etc/passwd", undefined, config);
      expect("ok" in result).toBe(false);
      if (!("ok" in result)) {
        expect(result.detail).toContain("outside the fence");
      }
    });

    it("allows commands with paths inside fence", () => {
      expect(validateExecPaths(`cat ${HOME}/projects/app/README.md`, undefined, config)).toEqual({
        ok: true,
      });
    });

    it("allows commands with /tmp paths", () => {
      expect(validateExecPaths("cat /tmp/test.txt", undefined, config)).toEqual({ ok: true });
    });

    it("allows commands with no absolute paths", () => {
      expect(validateExecPaths("echo hello world", undefined, config)).toEqual({ ok: true });
    });
  });

  describe("tilde expansion", () => {
    it("expands ~/path correctly", () => {
      const result = validateExecPaths("cat ~/.ssh/config", undefined, config);
      expect("ok" in result).toBe(false);
    });

    it("handles fence with ~ prefix", () => {
      expect(
        validateExecPaths(`ls ${HOME}/projects`, undefined, {
          fence: ["~/projects"],
          alwaysDeny: [],
        }),
      ).toEqual({ ok: true });
    });
  });

  describe("session overrides", () => {
    it("allows previously blocked path with override", () => {
      const overrides = new Set(["/etc"]);
      expect(validateExecPaths("cat /etc/hosts", undefined, config, overrides)).toEqual({
        ok: true,
      });
    });

    it("cannot override ~/.aria (always denied)", () => {
      const overrides = new Set([`${HOME}/.aria`]);
      const result = validateExecPaths(
        `cat ${HOME}/.aria/config.json`,
        undefined,
        config,
        overrides,
      );
      expect("ok" in result).toBe(false);
    });
  });

  describe("defaults", () => {
    it("uses default fence when no config", () => {
      // No absolute paths in command = passes
      expect(validateExecPaths("echo hello", undefined)).toEqual({ ok: true });
    });

    it("blocks ~/.ssh with defaults", () => {
      const result = validateExecPaths(`cat ${HOME}/.ssh/id_rsa`, undefined);
      expect("ok" in result).toBe(false);
    });
  });
});
