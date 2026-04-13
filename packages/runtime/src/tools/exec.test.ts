import { describe, it, expect } from "bun:test";
import { sanitizeEnv, capOutput } from "./exec.js";

describe("sanitizeEnv", () => {
  it("strips env vars ending in _KEY", () => {
    const env = sanitizeEnv({
      ANTHROPIC_API_KEY: "sk-ant-123",
      HOME: "/home/user",
      PATH: "/usr/bin",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.HOME).toBe("/home/user");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("strips env vars ending in _TOKEN", () => {
    const env = sanitizeEnv({
      TELEGRAM_BOT_TOKEN: "bot-token",
      SHELL: "/bin/zsh",
    });
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.SHELL).toBe("/bin/zsh");
  });

  it("strips env vars ending in _SECRET", () => {
    const env = sanitizeEnv({
      WEBHOOK_SECRET: "shh",
      USER: "testuser",
    });
    expect(env.WEBHOOK_SECRET).toBeUndefined();
    expect(env.USER).toBe("testuser");
  });

  it("strips env vars starting with ARIA_", () => {
    const env = sanitizeEnv({
      ARIA_HOME: "/home/.aria",
      ARIA_DEBUG: "1",
      EDITOR: "vim",
    });
    expect(env.ARIA_HOME).toBeUndefined();
    expect(env.ARIA_DEBUG).toBeUndefined();
    expect(env.EDITOR).toBe("vim");
  });

  it("strips ANTHROPIC_ prefixed vars", () => {
    const env = sanitizeEnv({
      ANTHROPIC_API_KEY: "key",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it("strips OPENAI_ prefixed vars", () => {
    const env = sanitizeEnv({
      OPENAI_API_KEY: "sk-openai",
      OPENAI_ORG_ID: "org-123",
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.OPENAI_ORG_ID).toBeUndefined();
  });

  it("strips GOOGLE_AI_ and OPENROUTER_ prefixed vars", () => {
    const env = sanitizeEnv({
      GOOGLE_AI_API_KEY: "google-key",
      OPENROUTER_API_KEY: "or-key",
    });
    expect(env.GOOGLE_AI_API_KEY).toBeUndefined();
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
  });

  it("preserves common non-sensitive vars", () => {
    const env = sanitizeEnv({
      HOME: "/home/user",
      PATH: "/usr/bin",
      SHELL: "/bin/zsh",
      USER: "testuser",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
    });
    expect(env.HOME).toBe("/home/user");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.SHELL).toBe("/bin/zsh");
    expect(env.USER).toBe("testuser");
    expect(env.LANG).toBe("en_US.UTF-8");
    expect(env.TERM).toBe("xterm-256color");
  });

  it("applies user overrides after sanitization", () => {
    const env = sanitizeEnv(
      { ANTHROPIC_API_KEY: "stripped", PATH: "/usr/bin" },
      { CUSTOM_VAR: "custom", PATH: "/custom/bin" },
    );
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CUSTOM_VAR).toBe("custom");
    expect(env.PATH).toBe("/custom/bin");
  });

  it("user overrides can re-add stripped vars if explicitly set", () => {
    const env = sanitizeEnv({ ANTHROPIC_API_KEY: "original" }, { ANTHROPIC_API_KEY: "overridden" });
    // User override takes precedence — if they explicitly set it, allow it
    expect(env.ANTHROPIC_API_KEY).toBe("overridden");
  });
});

describe("capOutput", () => {
  it("returns short output unchanged", () => {
    const output = "Hello, world!";
    expect(capOutput(output)).toBe(output);
  });

  it("returns empty string unchanged", () => {
    expect(capOutput("")).toBe("");
  });

  it("truncates output exceeding 1MB", () => {
    // Create a string >1MB
    const bigOutput = "x".repeat(1_200_000);
    const result = capOutput(bigOutput);
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(1_048_576);
    expect(result).toContain("...[output truncated at 1MB]");
  });

  it("does not truncate output at exactly 1MB", () => {
    const exactOutput = "x".repeat(1_048_576);
    const result = capOutput(exactOutput);
    expect(result).toBe(exactOutput);
  });
});
