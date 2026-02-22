import { describe, test, expect } from "bun:test";
import {
  shouldRespondInGuild,
  stripBotMention,
  formatSenderAttribution,
} from "@sa/connectors/discord/index.js";

describe("Discord group chat filtering", () => {
  describe("shouldRespondInGuild", () => {
    test("always responds in DM (non-guild)", () => {
      expect(shouldRespondInGuild({
        isGuild: false,
        mentionedBot: false,
        isReplyToBot: false,
      })).toBe(true);
    });

    test("ignores guild message without mention or reply", () => {
      expect(shouldRespondInGuild({
        isGuild: true,
        mentionedBot: false,
        isReplyToBot: false,
      })).toBe(false);
    });

    test("responds when @mentioned in guild", () => {
      expect(shouldRespondInGuild({
        isGuild: true,
        mentionedBot: true,
        isReplyToBot: false,
      })).toBe(true);
    });

    test("responds when reply-to-bot in guild", () => {
      expect(shouldRespondInGuild({
        isGuild: true,
        mentionedBot: false,
        isReplyToBot: true,
      })).toBe(true);
    });

    test("responds when both mentioned and replied to", () => {
      expect(shouldRespondInGuild({
        isGuild: true,
        mentionedBot: true,
        isReplyToBot: true,
      })).toBe(true);
    });
  });

  describe("stripBotMention", () => {
    test("strips <@botId> mention", () => {
      expect(stripBotMention("<@123456> hello", "123456")).toBe("hello");
    });

    test("strips <@!botId> nickname mention", () => {
      expect(stripBotMention("<@!123456> hello", "123456")).toBe("hello");
    });

    test("strips multiple mentions", () => {
      expect(stripBotMention("<@123456> hello <@123456> world", "123456")).toBe("hello world");
    });

    test("returns empty string when only mention", () => {
      expect(stripBotMention("<@123456>", "123456")).toBe("");
    });

    test("preserves text without mention", () => {
      expect(stripBotMention("hello world", "123456")).toBe("hello world");
    });

    test("does not strip other user mentions", () => {
      expect(stripBotMention("<@999999> hello", "123456")).toBe("<@999999> hello");
    });

    test("strips mention with trailing whitespace", () => {
      expect(stripBotMention("<@123456>   hello", "123456")).toBe("hello");
    });
  });

  describe("formatSenderAttribution", () => {
    test("prefixes message with display name", () => {
      expect(formatSenderAttribution("Alice", "hello")).toBe("[Alice]: hello");
    });

    test("handles display name with special characters", () => {
      expect(formatSenderAttribution("User#1234", "hi")).toBe("[User#1234]: hi");
    });

    test("handles empty text", () => {
      expect(formatSenderAttribution("Bob", "")).toBe("[Bob]: ");
    });
  });
});
