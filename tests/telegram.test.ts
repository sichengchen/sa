import { describe, test, expect } from "bun:test";
import {
  hasTelegramCredentials,
  getMissingCredentials,
} from "@aria/connectors-im/telegram";
import {
  formatToolResult,
  splitMessage,
  getMaxLength,
  formatSenderAttribution,
} from "@aria/connectors-im/chat-sdk/formatter";

describe("Telegram config", () => {
  describe("hasTelegramCredentials", () => {
    test("returns false when TELEGRAM_BOT_TOKEN is not set", () => {
      const prev = process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_BOT_TOKEN;
      expect(hasTelegramCredentials()).toBe(false);
      if (prev) process.env.TELEGRAM_BOT_TOKEN = prev;
    });

    test("returns true when TELEGRAM_BOT_TOKEN is set", () => {
      const prev = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = "test-token";
      expect(hasTelegramCredentials()).toBe(true);
      if (prev) process.env.TELEGRAM_BOT_TOKEN = prev;
      else delete process.env.TELEGRAM_BOT_TOKEN;
    });
  });

  describe("getMissingCredentials", () => {
    test("lists missing env vars", () => {
      const prev = process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_BOT_TOKEN;
      expect(getMissingCredentials()).toContain("TELEGRAM_BOT_TOKEN");
      if (prev) process.env.TELEGRAM_BOT_TOKEN = prev;
    });
  });
});

describe("Chat SDK formatter (shared, used by Telegram)", () => {
  describe("getMaxLength", () => {
    test("returns 4096 for telegram", () => {
      expect(getMaxLength("telegram")).toBe(4096);
    });

    test("returns default for unknown platform", () => {
      expect(getMaxLength("unknown")).toBe(4000);
    });
  });

  describe("formatToolResult", () => {
    test("formats tool result with code block", () => {
      const result = formatToolResult("bash", "hello world");
      expect(result).toContain("bash");
      expect(result).toContain("hello world");
      expect(result).toContain("```");
    });

    test("truncates long content", () => {
      const long = "x".repeat(600);
      const result = formatToolResult("read", long);
      expect(result.length).toBeLessThan(700);
      expect(result).toContain("...");
    });
  });

  describe("splitMessage", () => {
    test("returns single chunk for short message", () => {
      const chunks = splitMessage("hello", 4096);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("hello");
    });

    test("splits long messages at telegram limit", () => {
      const long = "a".repeat(5000);
      const chunks = splitMessage(long, 4096);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
      expect(chunks.join("")).toBe(long);
    });

    test("prefers splitting at newlines", () => {
      const text = "a".repeat(3000) + "\n" + "b".repeat(2000);
      const chunks = splitMessage(text, 4096);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe("a".repeat(3000));
      expect(chunks[1]).toBe("b".repeat(2000));
    });
  });

  describe("formatSenderAttribution", () => {
    test("prefixes message with sender name", () => {
      expect(formatSenderAttribution("Alice", "hello")).toBe("[Alice]: hello");
    });

    test("handles empty text", () => {
      expect(formatSenderAttribution("Bob", "")).toBe("[Bob]: ");
    });
  });
});
