import { describe, it, expect, mock } from "bun:test";
import {
  validateEnvVarName,
  createSetEnvSecretTool,
  createSetEnvVariableTool,
} from "./set-api-key.js";
import type { ConfigManager } from "../config/index.js";

// ── validateEnvVarName ───────────────────────────────────────────────────────

describe("validateEnvVarName", () => {
  it("accepts valid uppercase names", () => {
    expect(validateEnvVarName("ANTHROPIC_API_KEY")).toBeNull();
    expect(validateEnvVarName("ARIA_HOME")).toBeNull();
    expect(validateEnvVarName("BRAVE_API_KEY")).toBeNull();
  });

  it("accepts valid lowercase and mixed names", () => {
    expect(validateEnvVarName("my_var")).toBeNull();
    expect(validateEnvVarName("MixedCase_123")).toBeNull();
  });

  it("accepts names starting with underscore", () => {
    expect(validateEnvVarName("_PRIVATE")).toBeNull();
  });

  it("rejects names with special chars", () => {
    expect(validateEnvVarName("MY=VAR")).not.toBeNull();
    expect(validateEnvVarName("MY VAR")).not.toBeNull();
    expect(validateEnvVarName("MY;VAR")).not.toBeNull();
    expect(validateEnvVarName("MY-VAR")).not.toBeNull();
    expect(validateEnvVarName("MY.VAR")).not.toBeNull();
  });

  it("rejects names starting with a digit", () => {
    expect(validateEnvVarName("1INVALID")).not.toBeNull();
  });

  it("blocks LD_PRELOAD (exact, case-insensitive)", () => {
    expect(validateEnvVarName("LD_PRELOAD")).not.toBeNull();
    expect(validateEnvVarName("ld_preload")).not.toBeNull();
    expect(validateEnvVarName("Ld_Preload")).not.toBeNull();
  });

  it("blocks NODE_OPTIONS", () => {
    expect(validateEnvVarName("NODE_OPTIONS")).not.toBeNull();
  });

  it("blocks PATH", () => {
    expect(validateEnvVarName("PATH")).not.toBeNull();
    expect(validateEnvVarName("path")).not.toBeNull();
  });

  it("blocks DYLD_INSERT_LIBRARIES", () => {
    expect(validateEnvVarName("DYLD_INSERT_LIBRARIES")).not.toBeNull();
  });

  it("blocks LD_LIBRARY_PATH", () => {
    expect(validateEnvVarName("LD_LIBRARY_PATH")).not.toBeNull();
  });

  it("blocks NODE_PATH", () => {
    expect(validateEnvVarName("NODE_PATH")).not.toBeNull();
  });

  it("blocks PYTHONPATH", () => {
    expect(validateEnvVarName("PYTHONPATH")).not.toBeNull();
  });

  it("blocks RUBYOPT", () => {
    expect(validateEnvVarName("RUBYOPT")).not.toBeNull();
  });

  it("blocks DYLD_LIBRARY_PATH", () => {
    expect(validateEnvVarName("DYLD_LIBRARY_PATH")).not.toBeNull();
  });
});

// ── createSetEnvSecretTool ───────────────────────────────────────────────────

function makeMockConfig(): ConfigManager {
  return {
    loadSecrets: mock(async () => ({ apiKeys: {} })),
    saveSecrets: mock(async () => {}),
    getConfigFile: mock(() => ({ runtime: { env: {} } })),
    saveConfig: mock(async () => {}),
  } as unknown as ConfigManager;
}

describe("createSetEnvSecretTool", () => {
  it("rejects empty name", async () => {
    const tool = createSetEnvSecretTool(makeMockConfig());
    const result = await tool.execute({ name: "", value: "secret" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("must not be empty");
  });

  it("rejects blocked env var name", async () => {
    const tool = createSetEnvSecretTool(makeMockConfig());
    const result = await tool.execute({ name: "LD_PRELOAD", value: "evil.so" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not permitted");
  });

  it("rejects name with special characters", async () => {
    const tool = createSetEnvSecretTool(makeMockConfig());
    const result = await tool.execute({ name: "MY=VAR", value: "value" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("letters, digits, and underscores");
  });

  it("accepts valid name and stores secret", async () => {
    const cfg = makeMockConfig();
    const tool = createSetEnvSecretTool(cfg);
    const result = await tool.execute({ name: "ANTHROPIC_API_KEY", value: "sk-test" });
    expect(result.isError).toBe(false);
    expect(result.content).toContain("ANTHROPIC_API_KEY");
    expect(cfg.saveSecrets).toHaveBeenCalled();
  });
});

// ── createSetEnvVariableTool ─────────────────────────────────────────────────

describe("createSetEnvVariableTool", () => {
  it("rejects empty name", async () => {
    const tool = createSetEnvVariableTool(makeMockConfig());
    const result = await tool.execute({ name: "", value: "value" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("must not be empty");
  });

  it("rejects blocked env var name", async () => {
    const tool = createSetEnvVariableTool(makeMockConfig());
    const result = await tool.execute({ name: "NODE_OPTIONS", value: "--require evil" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not permitted");
  });

  it("rejects name with special characters", async () => {
    const tool = createSetEnvVariableTool(makeMockConfig());
    const result = await tool.execute({ name: "BAD;NAME", value: "value" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("letters, digits, and underscores");
  });

  it("accepts valid name and saves config", async () => {
    const cfg = makeMockConfig();
    const tool = createSetEnvVariableTool(cfg);
    const result = await tool.execute({ name: "ARIA_LOG_LEVEL", value: "debug" });
    expect(result.isError).toBe(false);
    expect(result.content).toContain("ARIA_LOG_LEVEL");
    expect(cfg.saveConfig).toHaveBeenCalled();
  });
});
