import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";

type MemoryOverview = {
  curatedLength: number;
  curatedPreview?: string | null;
  layers: {
    profile: string[];
    project: string[];
    operational: string[];
  };
  journals: string[];
};

type MemoryReadResult = {
  content?: string | null;
};

type MemorySearchResult = {
  sourceType: string;
  source: string;
  score: number;
  content: string;
};

type AutomationTask = {
  taskId: string;
  taskType: string;
  name: string;
  slug?: string | null;
  enabled: boolean;
  paused: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastSummary?: string | null;
};

type AutomationRun = {
  taskType: string;
  taskName: string;
  taskId: string;
  status: string;
  runId?: string | null;
  sessionId?: string | null;
  startedAt: number;
  attemptNumber: number;
  maxAttempts: number;
  deliveryStatus: string;
  deliveryError?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
};

const state: {
  memoryOverview: MemoryOverview;
  memoryRead: MemoryReadResult;
  memorySearch: MemorySearchResult[];
  automationTasks: AutomationTask[];
  automationRuns: AutomationRun[];
  lastReadInput?: { layer: string; key?: string };
  lastSearchInput?: { query: string; limit?: number };
  lastRunsInput?: { taskId?: string; limit?: number };
} = {
  memoryOverview: {
    curatedLength: 0,
    curatedPreview: null,
    layers: { profile: [], project: [], operational: [] },
    journals: [],
  },
  memoryRead: {},
  memorySearch: [],
  automationTasks: [],
  automationRuns: [],
};

let runtimeHome = "";
let memoryCommand: (args: string[]) => Promise<void>;
let automationCommand: (args: string[]) => Promise<void>;
let capturedLogs: string[] = [];
let originalConsoleLog: typeof console.log;

const mockClient = {
  memory: {
    overview: {
      query: async () => state.memoryOverview,
    },
    read: {
      query: async (input: { layer: string; key?: string }) => {
        state.lastReadInput = input;
        return state.memoryRead;
      },
    },
    search: {
      query: async (input: { query: string; limit?: number }) => {
        state.lastSearchInput = input;
        return state.memorySearch;
      },
    },
  },
  automation: {
    list: {
      query: async () => state.automationTasks,
    },
    runs: {
      query: async (input?: { taskId?: string; limit?: number }) => {
        state.lastRunsInput = input ?? undefined;
        return state.automationRuns;
      },
    },
  },
};

function resetState() {
  state.memoryOverview = {
    curatedLength: 0,
    curatedPreview: null,
    layers: { profile: [], project: [], operational: [] },
    journals: [],
  };
  state.memoryRead = {};
  state.memorySearch = [];
  state.automationTasks = [];
  state.automationRuns = [];
  state.lastReadInput = undefined;
  state.lastSearchInput = undefined;
  state.lastRunsInput = undefined;
}

beforeAll(async () => {
  runtimeHome = await mkdtemp(join(tmpdir(), "aria-cli-compat-"));
  process.env.ARIA_HOME = runtimeHome;
  const daemonModule = await import("@aria/server/daemon");
  vi.spyOn(daemonModule, "ensureEngine").mockResolvedValue(undefined);
  const consoleClientModule = await import("@aria/console/client.js");
  vi.spyOn(consoleClientModule, "createTuiClient").mockImplementation(() => mockClient as never);

  ({ memoryCommand } = await import("../packages/cli/src/memory.js"));
  ({ automationCommand } = await import("../packages/cli/src/automation.js"));

  originalConsoleLog = console.log;
});

afterAll(async () => {
  console.log = originalConsoleLog;
  vi.restoreAllMocks();
  delete process.env.ARIA_HOME;
  await rm(runtimeHome, { recursive: true, force: true });
});

beforeEach(() => {
  resetState();
  capturedLogs = [];
  console.log = (...args: unknown[]) => {
    capturedLogs.push(args.map((arg) => String(arg)).join(" "));
  };
});

describe("cli command compatibility", () => {
  test("memory list keeps the current overview output shape", async () => {
    state.memoryOverview = {
      curatedLength: 128,
      curatedPreview: "## Curated memory preview",
      layers: {
        profile: ["preferences"],
        project: ["phase-2-ledger", "migration-plan"],
        operational: ["active-runtime"],
      },
      journals: ["2026-04-11"],
    };

    await memoryCommand(["list"]);

    expect(capturedLogs).toEqual([
      "Curated memory: 128 chars",
      "Profile keys (1): preferences",
      "Project keys (2): phase-2-ledger, migration-plan",
      "Operational keys (1): active-runtime",
      "Recent journals: 2026-04-11",
    ]);
  });

  test("memory read preserves routed layer/key queries", async () => {
    state.memoryRead = {
      content: "Package ownership moves without changing the operator-facing memory command.",
    };

    await memoryCommand(["read", "project", "phase-2-ledger"]);

    expect(state.lastReadInput).toEqual({
      layer: "project",
      key: "phase-2-ledger",
    });
    expect(capturedLogs).toEqual([
      "Package ownership moves without changing the operator-facing memory command.",
    ]);
  });

  test("memory search keeps formatted result output", async () => {
    state.memorySearch = [
      {
        sourceType: "project",
        source: "phase-2-ledger",
        score: 0.8754,
        content: "Package boundaries stay stable while current CLI behavior remains intact.",
      },
    ];

    await memoryCommand(["search", "package boundaries"]);

    expect(state.lastSearchInput).toEqual({
      query: "package boundaries",
      limit: 10,
    });
    expect(capturedLogs).toEqual([
      "[project] phase-2-ledger score=0.875",
      "  Package boundaries stay stable while current CLI behavior remains intact.",
    ]);
  });

  test("automation list keeps durable task formatting", async () => {
    state.automationTasks = [
      {
        taskId: "cron:heartbeat",
        taskType: "heartbeat",
        name: "heartbeat",
        enabled: true,
        paused: false,
        nextRunAt: "2026-04-11T16:00:00.000Z",
        lastRunAt: "2026-04-11T15:30:00.000Z",
        lastStatus: "success",
        lastSummary: "Heartbeat OK",
      },
      {
        taskId: "webhook:deploy-notify",
        taskType: "webhook",
        name: "Deploy Notify",
        slug: "deploy-notify",
        enabled: false,
        paused: false,
        nextRunAt: null,
        lastRunAt: null,
        lastStatus: null,
        lastSummary: null,
      },
    ];

    await automationCommand(["list"]);

    expect(capturedLogs[0]).toBe("[heartbeat] heartbeat (active)");
    expect(capturedLogs[1]).toContain("id=cron:heartbeat");
    expect(capturedLogs[1]).toContain("last_status=success | Heartbeat OK");
    expect(capturedLogs[2]).toBe("[webhook] Deploy Notify (disabled) slug=deploy-notify");
    expect(capturedLogs[3]).toContain("id=webhook:deploy-notify");
    expect(capturedLogs[3]).toContain("next=n/a last=n/a last_status=n/a");
  });

  test("automation runs keeps slug lookup and attempt/delivery details", async () => {
    state.automationTasks = [
      {
        taskId: "webhook:deploy-notify",
        taskType: "webhook",
        name: "Deploy Notify",
        slug: "deploy-notify",
        enabled: true,
        paused: false,
      },
    ];
    state.automationRuns = [
      {
        taskType: "webhook",
        taskName: "Deploy Notify",
        taskId: "webhook:deploy-notify",
        status: "success",
        runId: "run-42",
        sessionId: "webhook:deploy-notify:1",
        startedAt: Date.UTC(2026, 3, 11, 15, 45, 0),
        attemptNumber: 2,
        maxAttempts: 3,
        deliveryStatus: "delivered",
        summary: "Deployment summary delivered.",
      },
    ];

    await automationCommand(["runs", "deploy-notify"]);

    expect(state.lastRunsInput).toEqual({
      taskId: "webhook:deploy-notify",
      limit: 20,
    });
    expect(capturedLogs[0]).toBe("[webhook] Deploy Notify success");
    expect(capturedLogs[1]).toContain("task=webhook:deploy-notify");
    expect(capturedLogs[1]).toContain("run=run-42");
    expect(capturedLogs[1]).toContain("attempt=2/3");
    expect(capturedLogs[1]).toContain("delivery=delivered");
    expect(capturedLogs[2]).toBe("  Deployment summary delivered.");
  });
});
