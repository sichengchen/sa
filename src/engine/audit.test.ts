import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditLogger, type AuditEntry, type AuditInput } from "./audit.js";

function readEntries(logDir: string): AuditEntry[] {
  const path = join(logDir, "audit.log");
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line));
}

describe("AuditLogger", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "audit-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates audit.log file on construction", () => {
    new AuditLogger(tmpDir);
    expect(existsSync(join(tmpDir, "audit.log"))).toBe(true);
  });

  it("writes valid NDJSON entries", () => {
    const logger = new AuditLogger(tmpDir);
    logger.log({
      session: "tui:abc123",
      connector: "tui",
      event: "tool_call",
      tool: "exec",
      danger: "safe",
      command: "ls -la",
    });
    logger.log({
      session: "telegram:456",
      connector: "telegram",
      event: "auth_success",
    });

    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(2);

    expect(entries[0]!.event).toBe("tool_call");
    expect(entries[0]!.tool).toBe("exec");
    expect(entries[0]!.command).toBe("ls -la");
    expect(entries[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(entries[1]!.event).toBe("auth_success");
    expect(entries[1]!.connector).toBe("telegram");
  });

  it("includes all required fields", () => {
    const logger = new AuditLogger(tmpDir);
    logger.log({
      session: "test-session",
      connector: "tui",
      event: "session_create",
    });

    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.ts).toBeDefined();
    expect(entry.session).toBeDefined();
    expect(entry.connector).toBe("tui");
    expect(entry.event).toBe("session_create");
  });

  it("omits optional fields when not provided", () => {
    const logger = new AuditLogger(tmpDir);
    logger.log({
      session: "s1",
      connector: "tui",
      event: "session_create",
    });

    const entries = readEntries(tmpDir);
    const entry = entries[0]!;
    expect(entry.tool).toBeUndefined();
    expect(entry.danger).toBeUndefined();
    expect(entry.command).toBeUndefined();
    expect(entry.url).toBeUndefined();
    expect(entry.summary).toBeUndefined();
    expect(entry.escalation).toBeUndefined();
  });

  it("records escalation details", () => {
    const logger = new AuditLogger(tmpDir);
    logger.log({
      session: "s1",
      connector: "tui",
      event: "security_escalation",
      escalation: {
        layer: "exec_fence",
        choice: "allow_session",
        resource: "/etc/hosts",
      },
    });

    const entries = readEntries(tmpDir);
    expect(entries[0]!.escalation).toEqual({
      layer: "exec_fence",
      choice: "allow_session",
      resource: "/etc/hosts",
    });
  });

  it("truncates long session IDs", () => {
    const logger = new AuditLogger(tmpDir);
    const longSession = "tui:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-extra-stuff-that-is-very-long";
    logger.log({
      session: longSession,
      connector: "tui",
      event: "tool_call",
    });

    const entries = readEntries(tmpDir);
    expect(entries[0]!.session.length).toBeLessThanOrEqual(36);
  });

  it("truncates long summaries to 200 chars", () => {
    const logger = new AuditLogger(tmpDir);
    const longSummary = "x".repeat(500);
    logger.log({
      session: "s1",
      connector: "tui",
      event: "tool_result",
      summary: longSummary,
    });

    const entries = readEntries(tmpDir);
    expect(entries[0]!.summary!.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(entries[0]!.summary!.endsWith("...")).toBe(true);
  });

  it("rotates log when file exceeds 10MB", () => {
    const logger = new AuditLogger(tmpDir);
    const logPath = join(tmpDir, "audit.log");

    // Write a file just under the rotation threshold, then trigger rotation
    const bigContent = "x".repeat(10 * 1024 * 1024 + 1);
    writeFileSync(logPath, bigContent);

    // This log call should trigger rotation
    logger.log({
      session: "s1",
      connector: "tui",
      event: "tool_call",
    });

    // The old content should be in audit.log.1
    expect(existsSync(join(tmpDir, "audit.log.1"))).toBe(true);
    const rotatedContent = readFileSync(join(tmpDir, "audit.log.1"), "utf-8");
    expect(rotatedContent).toBe(bigContent);

    // The new log should have the new entry
    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.event).toBe("tool_call");
  });

  it("keeps only 3 rotated generations", () => {
    const logger = new AuditLogger(tmpDir);
    const logPath = join(tmpDir, "audit.log");

    // Create pre-existing rotated files
    writeFileSync(join(tmpDir, "audit.log.1"), "gen1\n");
    writeFileSync(join(tmpDir, "audit.log.2"), "gen2\n");
    writeFileSync(join(tmpDir, "audit.log.3"), "gen3\n");

    // Write a big file to trigger rotation
    writeFileSync(logPath, "x".repeat(10 * 1024 * 1024 + 1));

    logger.log({
      session: "s1",
      connector: "tui",
      event: "tool_call",
    });

    // gen3 should be overwritten by gen2's content
    expect(readFileSync(join(tmpDir, "audit.log.3"), "utf-8")).toBe("gen2\n");
    expect(readFileSync(join(tmpDir, "audit.log.2"), "utf-8")).toBe("gen1\n");
  });

  it("sets file permissions to 0o600", () => {
    new AuditLogger(tmpDir);
    const logPath = join(tmpDir, "audit.log");
    const stat = statSync(logPath);
    // Check owner read/write only (0o600 = 33152 on most systems)
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("handles multiple rapid writes", () => {
    const logger = new AuditLogger(tmpDir);
    for (let i = 0; i < 100; i++) {
      logger.log({
        session: `s${i}`,
        connector: "tui",
        event: "tool_call",
        tool: `tool_${i}`,
      });
    }

    const entries = readEntries(tmpDir);
    expect(entries).toHaveLength(100);
    expect(entries[99]!.tool).toBe("tool_99");
  });

  it("records url field for web_fetch calls", () => {
    const logger = new AuditLogger(tmpDir);
    logger.log({
      session: "s1",
      connector: "tui",
      event: "tool_call",
      tool: "web_fetch",
      url: "https://example.com",
    });

    const entries = readEntries(tmpDir);
    expect(entries[0]!.url).toBe("https://example.com");
  });

  it("getLogPath returns the correct path", () => {
    const logger = new AuditLogger(tmpDir);
    expect(logger.getLogPath()).toBe(join(tmpDir, "audit.log"));
  });
});
