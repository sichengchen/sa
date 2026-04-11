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

    const db = new Database(join(testDir, "aria.db"), { readonly: true });
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

    const db = new Database(join(testDir, "aria.db"), { readonly: true });
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

  test("lists approvals with session and status filters", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:approval-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.createRun({
      runId: "run-approval-list",
      sessionId: "tui:approval-session",
      trigger: "chat",
      status: "running",
      inputText: "approve this",
      startedAt: 300,
    });
    store.recordToolCallStart({
      toolCallId: "tool-approval-list",
      runId: "run-approval-list",
      sessionId: "tui:approval-session",
      toolName: "exec",
      args: { command: "pwd" },
      startedAt: 301,
    });
    store.recordApprovalPending({
      approvalId: "approval-list",
      runId: "run-approval-list",
      sessionId: "tui:approval-session",
      toolCallId: "tool-approval-list",
      toolName: "exec",
      args: { command: "pwd" },
      createdAt: 302,
    });

    const approvals = store.listApprovals({
      sessionId: "tui:approval-session",
      status: "pending",
      limit: 5,
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.toolName).toBe("exec");
    expect(approvals[0]?.args).toEqual({ command: "pwd" });

    store.close();
  });

  test("persists session summaries and prompt cache entries", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:summary-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.upsertSessionSummary({
      sessionId: "tui:summary-session",
      summaryKind: "rolling",
      messageCount: 18,
      summaryText: "- user: earlier request\n- assistant: prior response",
      updatedAt: 300,
    });
    store.putPromptCache({
      cacheKey: "cache-1",
      scope: "base_prompt",
      content: "cached prompt body",
      metadata: { activeModel: "test-model" },
      updatedAt: 301,
    });
    store.close();

    const reopened = new OperationalStore(testDir);
    await reopened.init();

    expect(reopened.getSessionSummary("tui:summary-session", "rolling")).toEqual({
      sessionId: "tui:summary-session",
      summaryKind: "rolling",
      messageCount: 18,
      summaryText: "- user: earlier request\n- assistant: prior response",
      updatedAt: 300,
    });
    expect(reopened.getPromptCache("cache-1")).toEqual({
      cacheKey: "cache-1",
      scope: "base_prompt",
      content: "cached prompt body",
      metadata: { activeModel: "test-model" },
      updatedAt: 301,
    });

    reopened.close();
  });

  test("persists per-session MCP server availability", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:mcp-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.setSessionMcpServerEnabled("tui:mcp-session", "docs", true, 300);
    store.setSessionMcpServerEnabled("tui:mcp-session", "fs", false, 301);
    store.close();

    const reopened = new OperationalStore(testDir);
    await reopened.init();

    expect(reopened.getSessionMcpServerEnabled("tui:mcp-session", "docs")).toBe(true);
    expect(reopened.getSessionMcpServerEnabled("tui:mcp-session", "fs")).toBe(false);
    expect(reopened.listSessionMcpServers("tui:mcp-session")).toEqual({
      docs: true,
      fs: false,
    });

    reopened.close();
  });

  test("soft-deletes sessions while preserving durable state", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertSession({
      id: "tui:durable-session",
      connectorType: "tui",
      connectorId: "tui",
      createdAt: 100,
      lastActiveAt: 200,
    });
    store.createRun({
      runId: "run-durable",
      sessionId: "tui:durable-session",
      trigger: "chat",
      status: "completed",
      inputText: "persist me",
      startedAt: 300,
      completedAt: 301,
    });
    expect(store.destroySession("tui:durable-session")).toBe(true);
    expect(store.getSession("tui:durable-session")).toBeUndefined();
    expect(store.listSessions().some((session) => session.id === "tui:durable-session")).toBe(false);
    store.close();

    const db = new Database(join(testDir, "aria.db"), { readonly: true });
    const sessionRow = db
      .prepare("SELECT destroyed_at FROM sessions WHERE session_id = ?")
      .get("tui:durable-session") as { destroyed_at: number };
    const runRow = db
      .prepare("SELECT status FROM runs WHERE run_id = ?")
      .get("run-durable") as { status: string };
    db.close(false);

    expect(sessionRow.destroyed_at).toBeGreaterThan(0);
    expect(runRow.status).toBe("completed");
  });

  test("persists automation tasks and task runs", async () => {
    const store = new OperationalStore(testDir);
    await store.init();

    store.upsertAutomationTask({
      taskId: "cron:daily-summary",
      taskType: "cron",
      name: "daily-summary",
      enabled: true,
      paused: false,
      config: { schedule: "0 9 * * *", prompt: "Summarize yesterday" },
      createdAt: 100,
      updatedAt: 101,
      nextRunAt: "2026-04-08T09:00:00.000Z",
    });
    store.recordAutomationRunStart({
      taskRunId: "task-run-1",
      taskId: "cron:daily-summary",
      taskType: "cron",
      taskName: "daily-summary",
      sessionId: "cron:daily-summary:run",
      runId: "run-automation-1",
      trigger: "cron",
      promptText: "Summarize yesterday",
      deliveryTarget: { connector: "telegram" },
      startedAt: 200,
    });
    store.finishAutomationRun({
      taskRunId: "task-run-1",
      status: "success",
      responseText: "Yesterday was productive.",
      summary: "Yesterday was productive.",
      completedAt: 201,
    });
    store.recordAutomationDelivery({
      taskRunId: "task-run-1",
      deliveryStatus: "delivered",
      deliveryAttemptedAt: 202,
    });
    store.close();

    const reopened = new OperationalStore(testDir);
    await reopened.init();

    expect(reopened.listAutomationTasks("cron")).toEqual([
      {
        taskId: "cron:daily-summary",
        taskType: "cron",
        name: "daily-summary",
        slug: null,
        enabled: true,
        paused: false,
        config: { schedule: "0 9 * * *", prompt: "Summarize yesterday" },
        createdAt: 100,
        updatedAt: 101,
        lastRunAt: null,
        nextRunAt: "2026-04-08T09:00:00.000Z",
        lastStatus: null,
        lastSummary: null,
      },
    ]);
    expect(reopened.listAutomationRuns("cron:daily-summary")).toEqual([
      {
        taskRunId: "task-run-1",
        taskId: "cron:daily-summary",
        taskType: "cron",
        taskName: "daily-summary",
        sessionId: "cron:daily-summary:run",
        runId: "run-automation-1",
        trigger: "cron",
        status: "success",
        promptText: "Summarize yesterday",
        responseText: "Yesterday was productive.",
        summary: "Yesterday was productive.",
        attemptNumber: 1,
        maxAttempts: 1,
        startedAt: 200,
        completedAt: 201,
        deliveryTarget: { connector: "telegram" },
        deliveryStatus: "delivered",
        deliveryAttemptedAt: 202,
        deliveryError: null,
        errorMessage: null,
      },
    ]);

    reopened.close();
  });

  test("persists hashed auth session tokens and pairing codes", async () => {
    const store = new OperationalStore(testDir);
    await store.init();
    const now = Date.now();

    store.upsertAuthSessionToken({
      tokenHash: "token-hash-1",
      connectorId: "telegram:123",
      connectorType: "telegram",
      pairedAt: now,
      ttlMs: 60_000,
    });
    store.replacePairingCode({
      codeHash: "pairing-hash-1",
      createdAt: now,
      expiresAt: now + 60_000,
    });
    store.close();

    const reopened = new OperationalStore(testDir);
    await reopened.init();

    expect(reopened.getAuthSessionToken("token-hash-1", now + 500)).toEqual({
      tokenHash: "token-hash-1",
      connectorId: "telegram:123",
      connectorType: "telegram",
      pairedAt: now,
      ttlMs: 60_000,
    });
    expect(reopened.consumePairingCode("pairing-hash-1", now + 500)).toBe("ok");
    expect(reopened.consumePairingCode("pairing-hash-1", now + 501)).toBe("missing");

    reopened.close();
  });
});
