import { describe, test, expect } from "bun:test";
import {
  formatToolResult,
  splitMessage,
  escapeMarkdown,
  isMessageAllowed,
  validatePairingCode,
  shouldRespondInGroup,
  stripBotMention,
  formatSenderAttribution,
} from "@sa/connectors/telegram/index.js";

describe("Telegram pairing", () => {
  describe("isMessageAllowed", () => {
    test("allows all senders when no chat ID is configured", () => {
      expect(isMessageAllowed(undefined, 12345)).toBe(true);
      expect(isMessageAllowed(undefined, 99999)).toBe(true);
    });

    test("allows the paired chat ID", () => {
      expect(isMessageAllowed(42, 42)).toBe(true);
    });

    test("blocks senders that are not the paired chat", () => {
      expect(isMessageAllowed(42, 99)).toBe(false);
    });
  });

  describe("validatePairingCode", () => {
    test("accepts correct code", () => {
      expect(validatePairingCode("ABC123", "ABC123")).toBe(true);
    });

    test("is case-insensitive", () => {
      expect(validatePairingCode("abc123", "ABC123")).toBe(true);
      expect(validatePairingCode("ABC123", "abc123")).toBe(true);
    });

    test("trims whitespace from user input", () => {
      expect(validatePairingCode("  ABC123  ", "ABC123")).toBe(true);
    });

    test("rejects wrong code", () => {
      expect(validatePairingCode("WRONG1", "ABC123")).toBe(false);
    });

    test("rejects when expected code is missing", () => {
      expect(validatePairingCode("ABC123", undefined)).toBe(false);
    });

    test("rejects when user input is missing", () => {
      expect(validatePairingCode(undefined, "ABC123")).toBe(false);
    });

    test("rejects when both are missing", () => {
      expect(validatePairingCode(undefined, undefined)).toBe(false);
    });
  });
});

describe("Telegram formatter", () => {
  describe("escapeMarkdown", () => {
    test("escapes special characters", () => {
      const result = escapeMarkdown("hello_world*bold*");
      expect(result).toBe("hello\\_world\\*bold\\*");
    });

    test("handles no special chars", () => {
      expect(escapeMarkdown("plain text")).toBe("plain text");
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
      expect(result.length).toBeLessThan(600);
      expect(result).toContain("…");
    });
  });

  describe("splitMessage", () => {
    test("returns single chunk for short message", () => {
      const chunks = splitMessage("hello");
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe("hello");
    });

    test("splits long messages", () => {
      const long = "a".repeat(5000);
      const chunks = splitMessage(long);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
      expect(chunks.join("")).toBe(long);
    });

    test("prefers splitting at newlines", () => {
      const text = "a".repeat(3000) + "\n" + "b".repeat(2000);
      const chunks = splitMessage(text);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe("a".repeat(3000));
      expect(chunks[1]).toBe("b".repeat(2000));
    });
  });
});

describe("Telegram group chat filtering", () => {
  const baseInput = {
    botUsername: "sa_bot",
    botId: 123,
  };

  describe("shouldRespondInGroup", () => {
    test("always responds in private chat", () => {
      expect(shouldRespondInGroup({ ...baseInput, chatType: "private" })).toBe(true);
    });

    test("ignores group message without mention or reply", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "hello everyone",
        entities: [],
      })).toBe(false);
    });

    test("ignores supergroup message without mention or reply", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "supergroup",
        text: "hello everyone",
        entities: [],
      })).toBe(false);
    });

    test("responds when @mentioned in group", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "@sa_bot hello",
        entities: [{ type: "mention", offset: 0, length: 7 }],
      })).toBe(true);
    });

    test("responds when @mentioned mid-sentence", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "hey @sa_bot what do you think?",
        entities: [{ type: "mention", offset: 4, length: 7 }],
      })).toBe(true);
    });

    test("responds when reply-to-bot in group", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "yes I agree",
        entities: [],
        replyToMessageFromId: 123,
      })).toBe(true);
    });

    test("ignores reply to different user in group", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "yes I agree",
        entities: [],
        replyToMessageFromId: 999,
      })).toBe(false);
    });

    test("mention matching is case-insensitive", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "@SA_BOT hello",
        entities: [{ type: "mention", offset: 0, length: 7 }],
      })).toBe(true);
    });

    test("ignores mention of different bot", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "@other_bot hello",
        entities: [{ type: "mention", offset: 0, length: 10 }],
      })).toBe(false);
    });

    test("handles missing entities gracefully", () => {
      expect(shouldRespondInGroup({
        ...baseInput,
        chatType: "group",
        text: "hello",
      })).toBe(false);
    });
  });

  describe("stripBotMention", () => {
    test("strips @mention from start of text", () => {
      expect(stripBotMention("@sa_bot hello world", "sa_bot")).toBe("hello world");
    });

    test("strips @mention from middle of text", () => {
      expect(stripBotMention("hey @sa_bot what's up?", "sa_bot")).toBe("hey what's up?");
    });

    test("strips multiple mentions", () => {
      expect(stripBotMention("@sa_bot hello @sa_bot world", "sa_bot")).toBe("hello world");
    });

    test("is case-insensitive", () => {
      expect(stripBotMention("@SA_BOT hello", "sa_bot")).toBe("hello");
    });

    test("returns empty string when only mention", () => {
      expect(stripBotMention("@sa_bot", "sa_bot")).toBe("");
    });

    test("preserves text without mention", () => {
      expect(stripBotMention("hello world", "sa_bot")).toBe("hello world");
    });
  });

  describe("formatSenderAttribution", () => {
    test("prefixes message with sender name", () => {
      expect(formatSenderAttribution("Alice", "hello")).toBe("[Alice]: hello");
    });

    test("handles long display names", () => {
      const name = "A".repeat(100);
      const result = formatSenderAttribution(name, "hi");
      expect(result).toBe(`[${name}]: hi`);
    });

    test("handles empty text", () => {
      expect(formatSenderAttribution("Bob", "")).toBe("[Bob]: ");
    });
  });
});
