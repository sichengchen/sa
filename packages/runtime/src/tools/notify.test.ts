import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createNotifyTool } from "./notify.js";
import type { SecretsFile } from "../config/types.js";

const mockSecrets: SecretsFile = {
  apiKeys: {},
  botToken: "test-bot-token",
  pairedChatId: 12345,
};

describe("notify tool", () => {
  test("has correct metadata", () => {
    const tool = createNotifyTool(null);
    expect(tool.name).toBe("notify");
    expect(tool.dangerLevel).toBe("safe");
  });

  test("returns error for empty message", async () => {
    const tool = createNotifyTool(mockSecrets);
    const result = await tool.execute({ message: "" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("empty message");
  });

  test("returns helpful message when no connectors configured", async () => {
    const tool = createNotifyTool({ apiKeys: {} });
    const result = await tool.execute({ message: "hello" });
    expect(result.content).toContain("No connectors configured");
  });

  test("returns specific error when telegram requested but not configured", async () => {
    const tool = createNotifyTool({ apiKeys: {} });
    const result = await tool.execute({ message: "hello", connector: "telegram" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Telegram not configured");
  });

  test("returns specific error when discord requested but not configured", async () => {
    const tool = createNotifyTool({ apiKeys: {} });
    const result = await tool.execute({ message: "hello", connector: "discord" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Discord not configured");
  });

  test("returns error for null secrets", async () => {
    const tool = createNotifyTool(null);
    const result = await tool.execute({ message: "hello" });
    expect(result.content).toContain("No connectors configured");
  });

  // Note: actual Telegram/Discord API calls are tested manually
  // These tests verify the tool's input validation and configuration checking
  test("attempts telegram send when configured (mock fails gracefully)", async () => {
    // Using a mock token that won't actually work but tests the flow
    const secrets: SecretsFile = {
      apiKeys: {},
      botToken: "invalid-token",
      pairedChatId: 99999,
    };
    const tool = createNotifyTool(secrets);
    const result = await tool.execute({ message: "test notification", connector: "telegram" });
    // Will fail with HTTP error since token is invalid, but should not throw
    expect(result.content).toBeTruthy();
  });
});
