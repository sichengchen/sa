import { describe, test, expect } from "bun:test";
import type { WebhookTask, AutomationConfig } from "@sa/engine/config/types.js";

describe("Webhook task types", () => {
  test("WebhookTask has required fields", () => {
    const task: WebhookTask = {
      name: "deploy-notify",
      slug: "deploy-notify",
      prompt: "A deploy happened: {{payload}}",
      enabled: true,
    };
    expect(task.name).toBe("deploy-notify");
    expect(task.slug).toBe("deploy-notify");
    expect(task.prompt).toContain("{{payload}}");
    expect(task.enabled).toBe(true);
  });

  test("WebhookTask optional fields", () => {
    const task: WebhookTask = {
      name: "alert",
      slug: "alert",
      prompt: "Handle alert: {{payload}}",
      enabled: true,
      model: "fast",
      connector: "telegram",
    };
    expect(task.model).toBe("fast");
    expect(task.connector).toBe("telegram");
  });

  test("AutomationConfig includes webhookTasks", () => {
    const config: AutomationConfig = {
      cronTasks: [],
      webhookTasks: [
        { name: "test", slug: "test", prompt: "test", enabled: true },
      ],
    };
    expect(config.webhookTasks).toHaveLength(1);
  });

  test("AutomationConfig webhookTasks defaults to undefined", () => {
    const config: AutomationConfig = {
      cronTasks: [],
    };
    expect(config.webhookTasks).toBeUndefined();
  });
});

describe("Webhook prompt interpolation", () => {
  function interpolatePrompt(template: string, payload: string): string {
    return template.replace(/\{\{payload\}\}/g, payload);
  }

  test("replaces {{payload}} with JSON body", () => {
    const result = interpolatePrompt(
      "Process this event: {{payload}}",
      '{"event":"push","repo":"sa"}',
    );
    expect(result).toBe('Process this event: {"event":"push","repo":"sa"}');
  });

  test("replaces multiple occurrences", () => {
    const result = interpolatePrompt(
      "Event: {{payload}} — Summary of {{payload}}",
      '{"x":1}',
    );
    expect(result).toBe('Event: {"x":1} — Summary of {"x":1}');
  });

  test("leaves template unchanged when no placeholder", () => {
    const result = interpolatePrompt("Run a health check", '{"data":"test"}');
    expect(result).toBe("Run a health check");
  });

  test("handles empty payload", () => {
    const result = interpolatePrompt("Event: {{payload}}", "{}");
    expect(result).toBe("Event: {}");
  });
});

describe("Webhook bearer token authentication", () => {
  // Test the timing-safe comparison logic pattern
  function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    const { timingSafeEqual } = require("node:crypto");
    return timingSafeEqual(bufA, bufB);
  }

  test("matching tokens return true", () => {
    expect(safeCompare("test-token-123", "test-token-123")).toBe(true);
  });

  test("different tokens return false", () => {
    expect(safeCompare("test-token-123", "wrong-token-456")).toBe(false);
  });

  test("different length tokens return false", () => {
    expect(safeCompare("short", "much-longer-token")).toBe(false);
  });

  test("empty tokens match", () => {
    expect(safeCompare("", "")).toBe(true);
  });

  test("bearer token extraction from header", () => {
    const header = "Bearer my-secret-token";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    expect(token).toBe("my-secret-token");
  });

  test("non-bearer header returns empty", () => {
    const header = "Basic dXNlcjpwYXNz";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    expect(token).toBe("");
  });

  test("missing header returns empty", () => {
    const header = "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    expect(token).toBe("");
  });
});

describe("Webhook slug routing", () => {
  const tasks: WebhookTask[] = [
    { name: "Deploy Notify", slug: "deploy-notify", prompt: "{{payload}}", enabled: true },
    { name: "Alert Handler", slug: "alert", prompt: "Alert: {{payload}}", enabled: true, connector: "telegram" },
    { name: "Disabled Task", slug: "disabled", prompt: "test", enabled: false },
  ];

  test("finds task by slug", () => {
    const task = tasks.find((t) => t.slug === "deploy-notify");
    expect(task).toBeDefined();
    expect(task!.name).toBe("Deploy Notify");
  });

  test("returns undefined for unknown slug", () => {
    const task = tasks.find((t) => t.slug === "nonexistent");
    expect(task).toBeUndefined();
  });

  test("finds disabled task", () => {
    const task = tasks.find((t) => t.slug === "disabled");
    expect(task).toBeDefined();
    expect(task!.enabled).toBe(false);
  });

  test("task with connector field", () => {
    const task = tasks.find((t) => t.slug === "alert");
    expect(task!.connector).toBe("telegram");
  });

  test("task without connector field", () => {
    const task = tasks.find((t) => t.slug === "deploy-notify");
    expect(task!.connector).toBeUndefined();
  });
});

describe("Webhook slug validation", () => {
  const slugPattern = /^[a-zA-Z0-9_-]+$/;

  test("valid slugs", () => {
    expect(slugPattern.test("deploy-notify")).toBe(true);
    expect(slugPattern.test("my_task")).toBe(true);
    expect(slugPattern.test("Task123")).toBe(true);
    expect(slugPattern.test("a")).toBe(true);
  });

  test("invalid slugs", () => {
    expect(slugPattern.test("has space")).toBe(false);
    expect(slugPattern.test("has/slash")).toBe(false);
    expect(slugPattern.test("has.dot")).toBe(false);
    expect(slugPattern.test("")).toBe(false);
  });
});

describe("Webhook URL pattern matching", () => {
  const taskPattern = /^\/webhook\/tasks\/([a-zA-Z0-9_-]+)$/;

  test("matches /webhook/tasks/:slug", () => {
    const match = "/webhook/tasks/deploy-notify".match(taskPattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("deploy-notify");
  });

  test("matches slug with underscores", () => {
    const match = "/webhook/tasks/my_task_123".match(taskPattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("my_task_123");
  });

  test("does not match nested paths", () => {
    const match = "/webhook/tasks/a/b".match(taskPattern);
    expect(match).toBeNull();
  });

  test("does not match empty slug", () => {
    const match = "/webhook/tasks/".match(taskPattern);
    expect(match).toBeNull();
  });

  test("does not match /webhook/tasks without trailing", () => {
    const match = "/webhook/tasks".match(taskPattern);
    expect(match).toBeNull();
  });
});

describe("Payload truncation", () => {
  test("short payloads unchanged", () => {
    const payload = '{"event":"test"}';
    const truncated = payload.length > 10000
      ? payload.slice(0, 10000) + "...(truncated)"
      : payload;
    expect(truncated).toBe(payload);
  });

  test("long payloads truncated", () => {
    const payload = "x".repeat(20000);
    const truncated = payload.length > 10000
      ? payload.slice(0, 10000) + "...(truncated)"
      : payload;
    expect(truncated).toHaveLength(10000 + "...(truncated)".length);
    expect(truncated.endsWith("...(truncated)")).toBe(true);
  });

  test("exactly 10000 chars unchanged", () => {
    const payload = "x".repeat(10000);
    const truncated = payload.length > 10000
      ? payload.slice(0, 10000) + "...(truncated)"
      : payload;
    expect(truncated).toHaveLength(10000);
  });
});
