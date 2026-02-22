import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { ClawHubClient, ClawHubError } from "@sa/engine/clawhub/client.js";
import { SkillInstaller } from "@sa/engine/clawhub/installer.js";
import type { ClawHubPage, ClawHubSkill, ClawHubSkillDetail } from "@sa/engine/clawhub/types.js";

// --- Mock server setup ---

let mockServer: ReturnType<typeof Bun.serve> | null = null;
let mockPort: number;
let mockRoutes: Map<string, { status: number; body: unknown }>;

function setMockRoute(path: string, body: unknown, status = 200) {
  mockRoutes.set(path, { status, body });
}

beforeEach(async () => {
  mockRoutes = new Map();
  mockServer = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const route = mockRoutes.get(url.pathname + url.search) ?? mockRoutes.get(url.pathname);
      if (!route) {
        return new Response("Not found", { status: 404 });
      }
      if (route.body instanceof ArrayBuffer || Buffer.isBuffer(route.body)) {
        return new Response(route.body as ArrayBuffer, {
          status: route.status,
          headers: { "Content-Type": "application/zip" },
        });
      }
      return new Response(JSON.stringify(route.body), {
        status: route.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  mockPort = mockServer.port;
});

afterEach(async () => {
  if (mockServer) {
    mockServer.stop(true);
    mockServer = null;
  }
});

function createClient(token?: string): ClawHubClient {
  return new ClawHubClient({ baseUrl: `http://127.0.0.1:${mockPort}`, token });
}

// --- Test data ---

const sampleSkill: ClawHubSkill = {
  slug: "acme/code-review",
  name: "code-review",
  description: "AI-powered code review",
  author: "acme",
  version: "1.0.0",
  downloads: 42,
  score: 0.95,
  tags: ["code", "review"],
  updatedAt: "2026-01-15T00:00:00Z",
};

const sampleDetail: ClawHubSkillDetail = {
  ...sampleSkill,
  versions: ["1.0.0", "0.9.0"],
  license: "MIT",
  repository: "https://github.com/acme/code-review",
  readme: "# Code Review Skill",
};

// --- ClawHubClient tests ---

describe("ClawHubClient", () => {
  test("search returns paginated results", async () => {
    const page: ClawHubPage<ClawHubSkill> = {
      items: [sampleSkill],
      cursor: "abc",
      hasMore: true,
    };
    setMockRoute("/skills/search", page);

    const client = createClient();
    const result = await client.search("code review");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.slug).toBe("acme/code-review");
    expect(result.hasMore).toBe(true);
  });

  test("search with options passes query params", async () => {
    const page: ClawHubPage<ClawHubSkill> = { items: [], cursor: null, hasMore: false };
    setMockRoute("/skills/search", page);

    const client = createClient();
    const result = await client.search("test", { limit: 5 });
    expect(result.items).toHaveLength(0);
  });

  test("getSkill returns detail", async () => {
    setMockRoute("/skills/acme%2Fcode-review", sampleDetail);

    const client = createClient();
    const detail = await client.getSkill("acme/code-review");
    expect(detail.name).toBe("code-review");
    expect(detail.versions).toHaveLength(2);
    expect(detail.license).toBe("MIT");
  });

  test("listPopular returns page", async () => {
    const page: ClawHubPage<ClawHubSkill> = {
      items: [sampleSkill],
      cursor: null,
      hasMore: false,
    };
    setMockRoute("/skills/popular", page);

    const client = createClient();
    const result = await client.listPopular(10);
    expect(result.items).toHaveLength(1);
  });

  test("throws ClawHubError on 404", async () => {
    const client = createClient();
    try {
      await client.getSkill("nonexistent/skill");
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(ClawHubError);
      expect((err as ClawHubError).statusCode).toBe(404);
    }
  });

  test("throws ClawHubError on 500", async () => {
    setMockRoute("/skills/search", { error: "internal" }, 500);

    const client = createClient();
    try {
      await client.search("test");
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(ClawHubError);
      expect((err as ClawHubError).statusCode).toBe(500);
    }
  });

  test("sends auth header when token provided", async () => {
    let receivedAuth: string | null = null;
    if (mockServer) mockServer.stop(true);

    mockServer = Bun.serve({
      port: 0,
      fetch(req) {
        receivedAuth = req.headers.get("authorization");
        return new Response(JSON.stringify(sampleDetail), {
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    mockPort = mockServer.port;

    const client = createClient("my-github-token");
    await client.getSkill("acme/code-review");
    expect(receivedAuth).toBe("Bearer my-github-token");
  });
});

// --- SkillInstaller tests ---

describe("SkillInstaller", () => {
  const testHome = join(tmpdir(), "sa-test-clawhub-" + Date.now());
  const skillsDir = join(testHome, "skills");

  beforeEach(async () => {
    await mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
  });

  test("listInstalled returns empty for fresh dir", async () => {
    const installer = new SkillInstaller(testHome);
    const installed = await installer.listInstalled();
    expect(installed).toEqual([]);
  });

  test("uninstall returns false for nonexistent skill", async () => {
    const installer = new SkillInstaller(testHome);
    const result = await installer.uninstall("nonexistent");
    expect(result).toBe(false);
  });

  test("uninstall removes skill and registry entry", async () => {
    // Manually create a skill dir and registry
    const skillDir = join(skillsDir, "test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: test-skill\ndescription: Test\n---\nContent");
    await writeFile(
      join(skillsDir, ".registry.json"),
      JSON.stringify([{ slug: "acme/test-skill", name: "test-skill", version: "1.0.0", installedAt: "2026-01-01" }]),
    );

    const installer = new SkillInstaller(testHome);
    const result = await installer.uninstall("test-skill");
    expect(result).toBe(true);
    expect(existsSync(skillDir)).toBe(false);

    const installed = await installer.listInstalled();
    expect(installed).toHaveLength(0);
  });

  test("listInstalled reads registry file", async () => {
    const entry = { slug: "acme/test", name: "test", version: "1.0.0", installedAt: "2026-01-01" };
    await writeFile(join(skillsDir, ".registry.json"), JSON.stringify([entry]));

    const installer = new SkillInstaller(testHome);
    const installed = await installer.listInstalled();
    expect(installed).toHaveLength(1);
    expect(installed[0]!.slug).toBe("acme/test");
  });
});

// --- Script tests ---

describe("clawhub search script", () => {
  const scriptPath = join(import.meta.dir, "..", "src", "engine", "skills", "bundled", "clawhub", "scripts", "search.ts");

  test("exits with error when no query provided", async () => {
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});

describe("clawhub install script", () => {
  const scriptPath = join(import.meta.dir, "..", "src", "engine", "skills", "bundled", "clawhub", "scripts", "install.ts");

  test("exits with error when no slug provided", async () => {
    const proc = Bun.spawn(["bun", "run", scriptPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});

// --- skill.reload procedure test ---

describe("skill.reload procedure", () => {
  test("SkillRegistry.loadAll reloads skills", async () => {
    // This tests the underlying mechanism that the reload procedure calls
    const { SkillRegistry } = await import("@sa/engine/skills/index.js");
    const registry = new SkillRegistry();

    // Initial load
    await registry.loadAll();
    const initialCount = registry.size;
    expect(initialCount).toBeGreaterThan(0);

    // Reload — should still have the same bundled skills
    await registry.loadAll();
    expect(registry.size).toBe(initialCount);
  });
});
