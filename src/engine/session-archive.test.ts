import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "@mariozechner/pi-ai";
import { SessionArchiveManager } from "./session-archive.js";

describe("SessionArchiveManager", () => {
  let homeDir: string;
  let archive: SessionArchiveManager;

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "sa-session-archive-test-"));
    archive = new SessionArchiveManager(homeDir);
    await archive.init();
  });

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("persists and restores archived history", async () => {
    const session = {
      id: "tui:test-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    };
    const messages: Message[] = [
      { role: "user", content: "Find the latest deployment issue", timestamp: 101 } as unknown as Message,
      { role: "assistant", content: "Checking the deployment logs now.", timestamp: 102 } as unknown as Message,
      {
        role: "toolResult",
        toolCallId: "tool-1",
        toolName: "web_search",
        content: [{ type: "text", text: "Search results..." }],
        isError: false,
        timestamp: 103,
      } as unknown as Message,
    ];

    await archive.syncSession(session, messages);

    const history = await archive.getHistory(session.id);
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ role: "user", content: "Find the latest deployment issue" });
    expect(history[2]).toMatchObject({ role: "tool", toolName: "web_search", content: "Search results..." });
  });

  it("strips injected memory context from archived user messages", async () => {
    const session = {
      id: "tui:memory-context",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    };
    const messages: Message[] = [
      {
        role: "user",
        content: "<memory_context>\nold context\n</memory_context>\n\nWhat changed in the repo?",
        timestamp: 101,
      } as unknown as Message,
    ];

    await archive.syncSession(session, messages);

    const history = await archive.getHistory(session.id);
    expect(history[0]?.content).toBe("What changed in the repo?");
  });

  it("searches archived sessions and returns compact metadata", async () => {
    const session = {
      id: "telegram:123:alpha",
      connectorType: "telegram",
      connectorId: "telegram:123",
      createdAt: 100,
      lastActiveAt: 200,
    };
    const messages: Message[] = [
      { role: "user", content: "Investigate the cron failure in production", timestamp: 101 } as unknown as Message,
      { role: "assistant", content: "The cron failure was caused by a missing env var.", timestamp: 102 } as unknown as Message,
    ];

    await archive.syncSession(session, messages);

    const results = await archive.search("cron failure", 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.sessionId).toBe(session.id);
    expect(results[0]?.summary).toContain("Latest assistant");
    expect(results[0]?.snippet.length).toBeGreaterThan(0);
  });

  it("lists recently archived sessions", async () => {
    const older = {
      id: "tui:older",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 100,
    };
    const newer = {
      id: "tui:newer",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 200,
      lastActiveAt: 200,
    };

    await archive.syncSession(older, [
      { role: "user", content: "older session", timestamp: 101 } as unknown as Message,
    ]);
    await archive.syncSession(newer, [
      { role: "user", content: "newer session", timestamp: 201 } as unknown as Message,
    ]);

    const recent = await archive.listRecent(10);
    expect(recent.map((entry) => entry.sessionId)).toEqual(["tui:newer", "tui:older"]);
  });
});
