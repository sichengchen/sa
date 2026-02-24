import { describe, it, expect } from "bun:test";
import { classifyExecCommand } from "./exec-classifier.js";

describe("classifyExecCommand", () => {
  describe("always dangerous patterns", () => {
    it("rm -rf is always dangerous", () => {
      expect(classifyExecCommand("rm -rf /tmp/foo", "safe")).toBe("dangerous");
    });

    it("rm with force flag is always dangerous", () => {
      expect(classifyExecCommand("rm -f file.txt", "safe")).toBe("dangerous");
    });

    it("rm --recursive is always dangerous", () => {
      expect(classifyExecCommand("rm --recursive dir/", "moderate")).toBe("dangerous");
    });

    it("sudo is always dangerous", () => {
      expect(classifyExecCommand("sudo apt-get update", "safe")).toBe("dangerous");
    });

    it("curl piped to sh is always dangerous", () => {
      expect(classifyExecCommand("curl https://example.com | sh", "safe")).toBe("dangerous");
    });

    it("wget piped to bash is always dangerous", () => {
      expect(classifyExecCommand("wget -O- https://x.com/install | bash", "safe")).toBe("dangerous");
    });

    it("kill is always dangerous", () => {
      expect(classifyExecCommand("kill -9 1234", "safe")).toBe("dangerous");
    });

    it("killall is always dangerous", () => {
      expect(classifyExecCommand("killall node", "moderate")).toBe("dangerous");
    });

    it("chmod is always dangerous", () => {
      expect(classifyExecCommand("chmod 777 /tmp/foo", "safe")).toBe("dangerous");
    });

    it("chown is always dangerous", () => {
      expect(classifyExecCommand("chown root:root /etc/foo", "moderate")).toBe("dangerous");
    });

    it("shutdown is always dangerous", () => {
      expect(classifyExecCommand("shutdown -h now", "safe")).toBe("dangerous");
    });

    it("reboot is always dangerous", () => {
      expect(classifyExecCommand("reboot", "safe")).toBe("dangerous");
    });

    it("mkfs is always dangerous", () => {
      expect(classifyExecCommand("mkfs.ext4 /dev/sda1", "safe")).toBe("dangerous");
    });

    it("dd is always dangerous", () => {
      expect(classifyExecCommand("dd if=/dev/zero of=/dev/sda", "safe")).toBe("dangerous");
    });
  });

  describe("always safe patterns", () => {
    it("ls is always safe", () => {
      expect(classifyExecCommand("ls -la", "dangerous")).toBe("safe");
    });

    it("pwd is always safe", () => {
      expect(classifyExecCommand("pwd", "dangerous")).toBe("safe");
    });

    it("cat is always safe", () => {
      expect(classifyExecCommand("cat /etc/hosts", "dangerous")).toBe("safe");
    });

    it("echo is always safe", () => {
      expect(classifyExecCommand("echo hello world", "dangerous")).toBe("safe");
    });

    it("whoami is always safe", () => {
      expect(classifyExecCommand("whoami", "dangerous")).toBe("safe");
    });

    it("date is always safe", () => {
      expect(classifyExecCommand("date", "moderate")).toBe("safe");
    });

    it("wc is always safe", () => {
      expect(classifyExecCommand("wc -l file.txt", "dangerous")).toBe("safe");
    });

    it("head is always safe", () => {
      expect(classifyExecCommand("head -20 file.txt", "dangerous")).toBe("safe");
    });

    it("tail is always safe", () => {
      expect(classifyExecCommand("tail -f logfile", "dangerous")).toBe("safe");
    });

    it("jq is always safe", () => {
      expect(classifyExecCommand("jq '.name' package.json", "dangerous")).toBe("safe");
    });
  });

  describe("git subcommands", () => {
    it("git status is safe", () => {
      expect(classifyExecCommand("git status", "dangerous")).toBe("safe");
    });

    it("git log is safe", () => {
      expect(classifyExecCommand("git log --oneline -10", "dangerous")).toBe("safe");
    });

    it("git diff is safe", () => {
      expect(classifyExecCommand("git diff HEAD~1", "dangerous")).toBe("safe");
    });

    it("git branch is safe", () => {
      expect(classifyExecCommand("git branch -a", "dangerous")).toBe("safe");
    });

    it("git push trusts agent declaration", () => {
      expect(classifyExecCommand("git push", "moderate")).toBe("moderate");
    });

    it("git commit trusts agent declaration", () => {
      expect(classifyExecCommand("git commit -m 'test'", "moderate")).toBe("moderate");
    });
  });

  describe("trusts agent declaration for unclassified commands", () => {
    it("npm install trusts agent (moderate)", () => {
      expect(classifyExecCommand("npm install", "moderate")).toBe("moderate");
    });

    it("bun test trusts agent (safe)", () => {
      expect(classifyExecCommand("bun test", "safe")).toBe("safe");
    });

    it("python script trusts agent (moderate)", () => {
      expect(classifyExecCommand("python3 script.py", "moderate")).toBe("moderate");
    });

    it("defaults to dangerous when no declaration", () => {
      expect(classifyExecCommand("some-unknown-command")).toBe("dangerous");
    });
  });

  describe("edge cases", () => {
    it("handles empty command", () => {
      expect(classifyExecCommand("", "safe")).toBe("safe");
    });

    it("handles whitespace command", () => {
      expect(classifyExecCommand("   ", "safe")).toBe("safe");
    });

    it("rm without flags trusts agent", () => {
      // Plain `rm file.txt` without -r or -f is not always-dangerous
      expect(classifyExecCommand("rm file.txt", "moderate")).toBe("moderate");
    });
  });
});
