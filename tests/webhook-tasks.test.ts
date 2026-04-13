import { describe, test, expect } from "bun:test";
import type { AutomationConfig, WebhookTask } from "@aria/automation";

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
      retryPolicy: { maxAttempts: 4, delaySeconds: 10 },
      delivery: { connector: "telegram" },
    };
    expect(task.model).toBe("fast");
    expect(task.retryPolicy?.maxAttempts).toBe(4);
    expect(task.delivery?.connector).toBe("telegram");
  });

  test("AutomationConfig includes webhookTasks", () => {
    const config: AutomationConfig = {
      cronTasks: [],
      webhookTasks: [{ name: "test", slug: "test", prompt: "test", enabled: true }],
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
      '{"event":"push","repo":"aria"}',
    );
    expect(result).toBe('Process this event: {"event":"push","repo":"aria"}');
  });

  test("replaces multiple occurrences", () => {
    const result = interpolatePrompt("Event: {{payload}} — Summary of {{payload}}", '{"x":1}');
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

describe("Webhook bearer-token-only authentication", () => {
  const { timingSafeEqual } = require("node:crypto");

  // Mirror the production authenticateWebhook logic (bearer-token only)
  function authenticateWebhook(
    req: Request,
    webhookConfig: { token?: string } | undefined,
  ): Response | null {
    if (webhookConfig?.token) {
      const authHeader = req.headers.get("authorization") ?? "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (
        !bearerToken ||
        bearerToken.length !== webhookConfig.token.length ||
        !timingSafeEqual(Buffer.from(bearerToken), Buffer.from(webhookConfig.token))
      ) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return null;
    }
    return null; // No auth configured = open
  }

  test("valid bearer token authenticates", () => {
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
      headers: { authorization: "Bearer my-token" },
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).toBeNull();
  });

  test("wrong bearer token returns 401", () => {
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("missing authorization header returns 401 when token configured", () => {
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("non-Bearer auth scheme returns 401", () => {
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("no token configured allows request through (open)", () => {
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
    });
    const result = authenticateWebhook(req, { token: undefined });
    expect(result).toBeNull();
  });

  test("undefined webhook config allows request through", () => {
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
    });
    const result = authenticateWebhook(req, undefined);
    expect(result).toBeNull();
  });

  test("legacy secret in body is not accepted (no secret auth path)", () => {
    // Even if someone sends a secret field in the body, it should not bypass bearer token auth
    const req = new Request("http://localhost/webhook/agent", {
      method: "POST",
      headers: { "x-webhook-secret": "some-secret" },
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("all routes use same auth (task route)", () => {
    const req = new Request("http://localhost/webhook/tasks/deploy", {
      method: "POST",
      headers: { authorization: "Bearer correct-token" },
    });
    const result = authenticateWebhook(req, { token: "correct-token" });
    expect(result).toBeNull();
  });

  test("all routes use same auth (heartbeat route)", () => {
    const req = new Request("http://localhost/webhook/heartbeat", {
      method: "POST",
      headers: { authorization: "Bearer correct-token" },
    });
    const result = authenticateWebhook(req, { token: "correct-token" });
    expect(result).toBeNull();
  });

  test("task route rejects without bearer token", () => {
    const req = new Request("http://localhost/webhook/tasks/deploy", {
      method: "POST",
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("heartbeat route rejects without bearer token", () => {
    const req = new Request("http://localhost/webhook/heartbeat", {
      method: "POST",
    });
    const result = authenticateWebhook(req, { token: "my-token" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

describe("Webhook slug routing", () => {
  const tasks: WebhookTask[] = [
    {
      name: "Deploy Notify",
      slug: "deploy-notify",
      prompt: "{{payload}}",
      enabled: true,
    },
    {
      name: "Alert Handler",
      slug: "alert",
      prompt: "Alert: {{payload}}",
      enabled: true,
      delivery: { connector: "telegram" },
    },
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

  test("task with delivery connector", () => {
    const task = tasks.find((t) => t.slug === "alert");
    expect(task!.delivery?.connector).toBe("telegram");
  });

  test("task without delivery connector", () => {
    const task = tasks.find((t) => t.slug === "deploy-notify");
    expect(task!.delivery?.connector).toBeUndefined();
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
    const truncated = payload.length > 10000 ? payload.slice(0, 10000) + "...(truncated)" : payload;
    expect(truncated).toBe(payload);
  });

  test("long payloads truncated", () => {
    const payload = "x".repeat(20000);
    const truncated = payload.length > 10000 ? payload.slice(0, 10000) + "...(truncated)" : payload;
    expect(truncated).toHaveLength(10000 + "...(truncated)".length);
    expect(truncated.endsWith("...(truncated)")).toBe(true);
  });

  test("exactly 10000 chars unchanged", () => {
    const payload = "x".repeat(10000);
    const truncated = payload.length > 10000 ? payload.slice(0, 10000) + "...(truncated)" : payload;
    expect(truncated).toHaveLength(10000);
  });
});
