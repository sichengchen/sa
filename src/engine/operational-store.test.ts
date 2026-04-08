import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { OperationalStore } from "./operational-store.js";

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), "aria-operational-store-test-"));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("OperationalStore", () => {
  test("persists sessions and messages across restarts", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:test-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.syncSessionMessages("tui:test-session", [
      { role: "user", content: "hello", timestamp: 101 } as any,
      { role: "assistant", content: "hi", timestamp: 102 } as any,
    ]);
    store.close();

    const reopened = new OperationalStore(testDir);
    await reopened.init();

    expect(reopened.getSession("tui:test-session")).toEqual({
      id: "tui:test-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    expect(reopened.getLatest("tui")?.id).toBe("tui:test-session");
    expect(reopened.getSessionMessages("tui:test-session")).toHaveLength(2);
    expect((reopened.getSessionMessages("tui:test-session")[0] as any).content).toBe("hello");

    reopened.close();
  });

  test("marks running work as interrupted on restart", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:restart-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.createRun({
      runId: "run-1",
      sessionId: "tui:restart-session",
      trigger: "chat",
      status: "running",
      inputText: "hello",
      startedAt: 300,
    });
    store.recordToolCallStart({
      toolCallId: "tool-1",
      runId: "run-1",
      sessionId: "tui:restart-session",
      toolName: "exec",
      args: { command: "pwd" },
      startedAt: 301,
    });
    store.recordApprovalPending({
      approvalId: "tool-1",
      runId: "run-1",
      sessionId: "tui:restart-session",
      toolCallId: "tool-1",
      toolName: "exec",
      args: { command: "pwd" },
      createdAt: 302,
    });
    store.close();

    const reopened = new OperationalStore(testDir);
    await reopened.init();
    reopened.close();

    const db = new Database(join(testDir, "aria.sqlite"), { readonly: true });
    const run = db
      .prepare("SELECT status, error_message FROM runs WHERE run_id = ?")
      .get("run-1") as { status: string; error_message: string };
    const toolCall = db
      .prepare("SELECT status, is_error FROM tool_calls WHERE tool_call_id = ?")
      .get("tool-1") as { status: string; is_error: number };
    const approval = db
      .prepare("SELECT status, resolution FROM approvals WHERE approval_id = ?")
      .get("tool-1") as { status: string; resolution: string };
    db.close(false);

    expect(run.status).toBe("interrupted");
    expect(run.error_message).toContain("Runtime restarted");
    expect(toolCall.status).toBe("interrupted");
    expect(toolCall.is_error).toBe(1);
    expect(approval.status).toBe("interrupted");
    expect(approval.resolution).toBe("interrupted");
  });

  test("records completion and approval resolution", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:lifecycle-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.createRun({
      runId: "run-2",
      sessionId: "tui:lifecycle-session",
      trigger: "chat",
      status: "running",
      inputText: "ship it",
      startedAt: 300,
    });
    store.recordToolCallStart({
      toolCallId: "tool-2",
      runId: "run-2",
      sessionId: "tui:lifecycle-session",
      toolName: "write",
      args: { path: "/tmp/demo.txt" },
      startedAt: 301,
    });
    store.recordApprovalPending({
      approvalId: "tool-2",
      runId: "run-2",
      sessionId: "tui:lifecycle-session",
      toolCallId: "tool-2",
      toolName: "write",
      args: { path: "/tmp/demo.txt" },
      createdAt: 302,
    });
    store.resolveApproval("tool-2", "allow_session", 303);
    store.recordToolCallEnd({
      toolCallId: "tool-2",
      status: "completed",
      result: { content: "wrote file" },
      endedAt: 304,
    });
    store.finishRun("run-2", {
      status: "completed",
      completedAt: 305,
      stopReason: "endTurn",
    });
    store.close();

    const db = new Database(join(testDir, "aria.sqlite"), { readonly: true });
    const run = db
      .prepare("SELECT status, stop_reason FROM runs WHERE run_id = ?")
      .get("run-2") as { status: string; stop_reason: string };
    const toolCall = db
      .prepare("SELECT status, is_error FROM tool_calls WHERE tool_call_id = ?")
      .get("tool-2") as { status: string; is_error: number };
    const approval = db
      .prepare("SELECT status, resolution FROM approvals WHERE approval_id = ?")
      .get("tool-2") as { status: string; resolution: string };
    db.close(false);

    expect(run.status).toBe("completed");
    expect(run.stop_reason).toBe("endTurn");
    expect(toolCall.status).toBe("completed");
    expect(toolCall.is_error).toBe(0);
    expect(approval.status).toBe("allow_session");
    expect(approval.resolution).toBe("allow_session");
  });
});
