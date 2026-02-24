import { describe, it, expect } from "bun:test";
import { SeatbeltSandbox, NoopSandbox, detectSandbox } from "./sandbox.js";

describe("SeatbeltSandbox", () => {
  const sandbox = new SeatbeltSandbox();

  it("reports available on macOS", () => {
    if (process.platform === "darwin") {
      expect(sandbox.available()).toBe(true);
    } else {
      expect(sandbox.available()).toBe(false);
    }
  });

  it("returns name 'seatbelt'", () => {
    expect(sandbox.name()).toBe("seatbelt");
  });

  it("wraps command with sandbox-exec on macOS", () => {
    if (process.platform !== "darwin") return; // skip on non-macOS

    const wrapped = sandbox.wrap(["sh", "-c", "echo hello"], {
      fence: ["/tmp", "~/projects"],
      deny: ["~/.sa", "~/.ssh"],
    });

    expect(wrapped[0]).toBe("sandbox-exec");
    expect(wrapped[1]).toBe("-f");
    // Profile path should exist
    expect(typeof wrapped[2]).toBe("string");
    expect(wrapped[3]).toBe("--");
    expect(wrapped[4]).toBe("sh");
    expect(wrapped[5]).toBe("-c");
    expect(wrapped[6]).toBe("echo hello");

    sandbox.cleanup();
  });
});

describe("NoopSandbox", () => {
  const sandbox = new NoopSandbox();

  it("reports not available", () => {
    expect(sandbox.available()).toBe(false);
  });

  it("returns name 'none'", () => {
    expect(sandbox.name()).toBe("none");
  });

  it("returns command unchanged", () => {
    const cmd = ["sh", "-c", "ls -la"];
    const result = sandbox.wrap(cmd, { fence: ["/tmp"], deny: ["~/.sa"] });
    expect(result).toEqual(cmd);
  });
});

describe("detectSandbox", () => {
  it("returns a sandbox instance", () => {
    const sandbox = detectSandbox();
    expect(typeof sandbox.available).toBe("function");
    expect(typeof sandbox.name).toBe("function");
    expect(typeof sandbox.wrap).toBe("function");
  });

  it("returns seatbelt on macOS, noop elsewhere", () => {
    const sandbox = detectSandbox();
    if (process.platform === "darwin") {
      expect(sandbox.name()).toBe("seatbelt");
    } else {
      expect(sandbox.name()).toBe("none");
    }
  });
});
