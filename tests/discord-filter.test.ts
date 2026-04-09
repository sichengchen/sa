import { describe, test, expect } from "bun:test";
import {
  formatSenderAttribution,
} from "@aria/connectors/chat-sdk/formatter.js";

/**
 * Tests for shared Chat SDK formatting utilities.
 *
 * Note: shouldRespondInGuild and stripBotMention tests were removed
 * during the Discord.js → Chat SDK migration. Chat SDK handles mention
 * gating internally via onNewMention.
 */

describe("Chat SDK formatter", () => {
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
