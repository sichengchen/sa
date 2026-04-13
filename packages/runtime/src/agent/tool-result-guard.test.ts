import { describe, it, expect } from "bun:test";
import {
  capToolResultSize,
  HARD_MAX_TOOL_RESULT_CHARS,
  MIN_KEEP_CHARS,
} from "./tool-result-guard.js";

describe("capToolResultSize", () => {
  it("passes through content under the limit unchanged", () => {
    const result = { content: "hello world" };
    const capped = capToolResultSize(result);
    expect(capped.content).toBe("hello world");
    expect(capped).toBe(result); // same reference
  });

  it("passes through empty string unchanged", () => {
    const result = { content: "" };
    const capped = capToolResultSize(result);
    expect(capped.content).toBe("");
  });

  it("truncates content exceeding the default limit", () => {
    const content = "x".repeat(HARD_MAX_TOOL_RESULT_CHARS + 1000);
    const result = { content };
    const capped = capToolResultSize(result);
    expect(capped.content.length).toBeLessThan(content.length);
    expect(capped.content).toContain("[truncated from");
  });

  it("truncates content exceeding a custom limit", () => {
    const content = "x".repeat(5000);
    const result = { content };
    const capped = capToolResultSize(result, 1000);
    expect(capped.content.length).toBeLessThan(5000);
    expect(capped.content).toContain("[truncated from 5000 to");
  });

  it("preserves isError flag", () => {
    const content = "x".repeat(5000);
    const result = { content, isError: true };
    const capped = capToolResultSize(result, 1000);
    expect(capped.isError).toBe(true);
  });

  it("preserves at least MIN_KEEP_CHARS even with very small limit", () => {
    const content = "x".repeat(5000);
    const result = { content };
    const capped = capToolResultSize(result, 100);
    // The kept portion (before the truncation note) should be >= MIN_KEEP_CHARS
    const keptPortion = capped.content.split("\n...[truncated")[0];
    expect(keptPortion.length).toBeGreaterThanOrEqual(MIN_KEEP_CHARS);
  });

  it("tries to break at newline boundary", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}: ${"x".repeat(50)}`);
    const content = lines.join("\n");
    const result = { content };
    const capped = capToolResultSize(result, 2500);
    // Should end at a line boundary (before the truncation note)
    const keptPortion = capped.content.split("\n...[truncated")[0];
    expect(keptPortion.endsWith("\n") || keptPortion.match(/line \d+:/) !== null).toBe(true);
  });

  it("content at exactly the limit is not truncated", () => {
    const content = "x".repeat(HARD_MAX_TOOL_RESULT_CHARS);
    const result = { content };
    const capped = capToolResultSize(result);
    expect(capped.content).toBe(content);
    expect(capped).toBe(result);
  });
});
