import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import { fauxAssistantMessage, registerFauxProvider } from "@mariozechner/pi-ai";
import * as v from "valibot";
import * as z from "zod";
import {
  createAriaHarnessContext,
  createDefaultAriaSessionEnv,
  createExternalAriaSessionEnv,
  createHostAriaSessionEnv,
  createLegacyExecTool,
  defineCommandLease,
  defineToolLease,
  InMemoryHarnessHost,
  parseTypedResult,
  secretRef,
} from "../packages/harness/src/index.js";
import type { ToolDecision, ToolIntent } from "../packages/policy/src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

class AllowingHarnessHost extends InMemoryHarnessHost {
  decisions: ToolIntent[] = [];

  async requestToolDecision(intent: ToolIntent): Promise<ToolDecision> {
    this.decisions.push(intent);
    await this.recordAudit({ type: "tool_decision", intent, decision: { status: "allow" } });
    return { status: "allow" };
  }
}

class DenyingHarnessHost extends InMemoryHarnessHost {
  secretResolutions = 0;

  async requestToolDecision(intent: ToolIntent): Promise<ToolDecision> {
    await this.recordAudit({
      type: "tool_decision",
      intent,
      decision: { status: "deny", reason: "denied in test" },
    });
    return { status: "deny", reason: "denied in test" };
  }

  async resolveSecrets(leases: Parameters<InMemoryHarnessHost["resolveSecrets"]>[0]) {
    this.secretResolutions += 1;
    return super.resolveSecrets(leases);
  }
}

class DenyExternalCommandHost extends InMemoryHarnessHost {
  decisions: ToolIntent[] = [];

  async requestToolDecision(intent: ToolIntent): Promise<ToolDecision> {
    this.decisions.push(intent);
    if (intent.toolName === "external_sandbox") return { status: "allow" };
    return { status: "deny", reason: "external command denied in test" };
  }
}

describe("@aria/harness shell environments", () => {
  test("default just-bash shell runs without approval", async () => {
    const host = new InMemoryHarnessHost();
    const env = await createDefaultAriaSessionEnv({ host });
    const result = await env.exec("echo hello");

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
    expect(host.audit.some((event) => event.type === "tool_decision")).toBe(false);
  });

  test("default env cannot mutate host files and project OverlayFS writes stay virtual", async () => {
    const dir = await tempDir("aria-harness-overlay-");
    const path = join(dir, "note.txt");
    await writeFile(path, "real\n");

    const env = await createDefaultAriaSessionEnv({ projectRoot: dir, cwd: dir });
    const result = await env.exec("printf 'virtual\\n' > note.txt && cat note.txt");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("virtual\n");
    expect(readFileSync(path, "utf8")).toBe("real\n");
  });

  test("default env does not silently fall back to host for unavailable commands", async () => {
    const env = await createDefaultAriaSessionEnv();
    const result = await env.exec("definitely-not-a-real-host-command");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("command not found");
  });

  test("default env requests approval for gated command intent", async () => {
    const host = new InMemoryHarnessHost();
    const env = await createDefaultAriaSessionEnv({ host });
    const result = await env.exec("git push origin main");

    expect(result.exitCode).toBe(126);
    expect(result.escalationRequired).toBe(true);
    const decision = host.audit.find((event) => event.type === "tool_decision");
    expect(decision?.intent).toMatchObject({
      environment: "default",
      filesystemEffect: "virtual",
      command: "git push origin main",
    });
  });

  test("host shell requires approval", async () => {
    const host = new InMemoryHarnessHost();
    const env = createHostAriaSessionEnv({ host });
    const result = await env.exec("echo host");

    expect(result.escalationRequired).toBe(true);
    expect(result.exitCode).toBe(126);
  });

  test("host file reads go through ToolIntent decision", async () => {
    const dir = await tempDir("aria-harness-host-read-");
    const path = join(dir, "note.txt");
    await writeFile(path, "host\n");
    const host = new InMemoryHarnessHost();
    const env = createHostAriaSessionEnv({ host, cwd: dir });

    await expect(env.readFile("note.txt")).rejects.toThrow(
      "approval required for host or full-network execution",
    );
    const intent = host.audit.find((event) => event.intent?.toolName === "read")?.intent;
    expect(intent).toMatchObject({
      environment: "host",
      filesystemEffect: "host_read",
      cwd: dir,
    });
    await expect(env.exists("note.txt")).rejects.toThrow(
      "approval required for host or full-network execution",
    );
  });

  test("host mkdir goes through ToolIntent decision", async () => {
    const dir = await tempDir("aria-harness-host-mkdir-");
    const host = new InMemoryHarnessHost();
    const env = createHostAriaSessionEnv({ host, cwd: dir });

    await expect(env.mkdir("created")).rejects.toThrow(
      "approval required for host or full-network execution",
    );
    const intent = host.audit.find((event) => event.intent?.toolName === "mkdir")?.intent;
    expect(intent).toMatchObject({
      environment: "host",
      filesystemEffect: "host_write",
      cwd: dir,
    });
  });

  test("external sandbox without adapter returns escalation-required result", async () => {
    const host = new InMemoryHarnessHost();
    const env = await createExternalAriaSessionEnv({ host, adapterName: "daytona" });
    const result = await env.exec("echo nope");

    expect(result.escalationRequired).toBe(true);
    expect(result.stderr).toContain("external sandbox adapter unavailable");
  });

  test("external sandbox uses the configured adapter after host decision", async () => {
    const host = new AllowingHarnessHost();
    let adapterCalled = false;
    const env = await createExternalAriaSessionEnv({
      host,
      adapter: {
        name: "fake-external",
        async createSessionEnv() {
          adapterCalled = true;
          return {
            kind: "external",
            cwd: "/workspace",
            exec: async () => ({ stdout: "external ok\n", stderr: "", exitCode: 0 }),
            readFile: async () => "external",
            readFileBuffer: async () => new TextEncoder().encode("external"),
            writeFile: async () => {},
            stat: async () => ({ isFile: true, isDirectory: false, size: 8 }),
            readdir: async () => ["file.txt"],
            exists: async () => true,
            mkdir: async () => {},
            rm: async () => {},
            resolvePath: (path) => path,
            cleanup: async () => {},
          };
        },
      },
    });
    const result = await env.exec("echo external");

    expect(adapterCalled).toBe(true);
    expect(host.decisions[0]?.toolName).toBe("external_sandbox");
    expect(host.decisions[1]).toMatchObject({
      toolName: "bash",
      environment: "external",
      command: "echo external",
    });
    expect(result.stdout).toBe("external ok\n");
  });

  test("external sandbox selects a named adapter from registered providers", async () => {
    const host = new AllowingHarnessHost();
    const called: string[] = [];
    const makeAdapter = (name: string) => ({
      name,
      async createSessionEnv() {
        called.push(name);
        return {
          kind: "external" as const,
          cwd: "/workspace",
          exec: async () => ({ stdout: `${name}\n`, stderr: "", exitCode: 0 }),
          readFile: async () => name,
          readFileBuffer: async () => new TextEncoder().encode(name),
          writeFile: async () => {},
          stat: async () => ({ isFile: true, isDirectory: false, size: name.length }),
          readdir: async () => [],
          exists: async () => true,
          mkdir: async () => {},
          rm: async () => {},
          resolvePath: (path: string) => path,
          cleanup: async () => {},
        };
      },
    });

    const env = await createExternalAriaSessionEnv({
      host,
      adapterName: "docker",
      adapters: [makeAdapter("daytona"), makeAdapter("docker")],
    });
    const result = await env.exec("echo selected");

    expect(called).toEqual(["docker"]);
    expect(result.stdout).toBe("docker\n");
  });

  test("external sandbox does not fall back when a named adapter is missing", async () => {
    const host = new AllowingHarnessHost();
    let adapterCalled = false;
    const env = await createExternalAriaSessionEnv({
      host,
      adapterName: "e2b",
      adapters: [
        {
          name: "docker",
          async createSessionEnv() {
            adapterCalled = true;
            throw new Error("wrong adapter");
          },
        },
      ],
    });
    const result = await env.exec("echo missing");

    expect(adapterCalled).toBe(false);
    expect(result.escalationRequired).toBe(true);
    expect(result.stderr).toContain("external sandbox adapter unavailable: e2b");
  });

  test("external sandbox command intent can deny adapter execution", async () => {
    const host = new DenyExternalCommandHost();
    let execCalled = false;
    const env = await createExternalAriaSessionEnv({
      host,
      adapter: {
        name: "fake-external",
        async createSessionEnv() {
          return {
            kind: "external",
            cwd: "/workspace",
            exec: async () => {
              execCalled = true;
              return { stdout: "should not run", stderr: "", exitCode: 0 };
            },
            readFile: async () => "external",
            readFileBuffer: async () => new TextEncoder().encode("external"),
            writeFile: async () => {},
            stat: async () => ({ isFile: true, isDirectory: false, size: 8 }),
            readdir: async () => ["file.txt"],
            exists: async () => true,
            mkdir: async () => {},
            rm: async () => {},
            resolvePath: (path) => path,
            cleanup: async () => {},
          };
        },
      },
    });
    const result = await env.exec("git push origin main");

    expect(execCalled).toBe(false);
    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain("external command denied in test");
    expect(host.decisions.map((intent) => intent.toolName)).toEqual(["external_sandbox", "bash"]);
  });

  test("legacy exec compatibility routes through default harness env", async () => {
    const dir = await tempDir("aria-harness-exec-");
    const path = join(dir, "package.json");
    await writeFile(path, '{"name":"real"}\n');

    const env = await createDefaultAriaSessionEnv({ projectRoot: dir, cwd: dir });
    const result = await createLegacyExecTool(env).execute({
      command: 'printf \'{"name":"virtual"}\\n\' > package.json',
      workdir: "/workspace",
    });

    expect(result.isError).toBeFalsy();
    expect(readFileSync(path, "utf8")).toBe('{"name":"real"}\n');
  });
});

describe("@aria/harness capabilities", () => {
  test("command leases hide secrets from audit metadata", async () => {
    const host = new AllowingHarnessHost();
    host.secrets.set("github.token", "ghs_secret");
    const gh = defineCommandLease("ghx", {
      executable: "printf",
      environment: "host",
      allowedArgs: ["issue"],
      env: { GH_TOKEN: secretRef("github.token") },
    });
    const env = await createDefaultAriaSessionEnv({ host, commands: [gh] });
    const result = await env.exec("ghx issue");

    expect(result.exitCode).toBe(0);
    expect(JSON.stringify(host.audit)).not.toContain("ghs_secret");
    expect(host.decisions[0]?.leases).toEqual([gh.id]);
  });

  test("command leases do not silently run non-host leases on host", async () => {
    const host = new AllowingHarnessHost();
    const lease = defineCommandLease("localx", {
      executable: "printf",
      environment: "default",
    });
    const env = await createDefaultAriaSessionEnv({ host, commands: [lease] });
    const result = await env.exec("localx hello");

    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain("command lease environment is not available: default");
    expect(host.decisions).toHaveLength(0);
  });

  test("command leases resolve secrets only after host approval", async () => {
    const host = new DenyingHarnessHost();
    host.secrets.set("github.token", "ghs_secret");
    const lease = defineCommandLease("ghx", {
      executable: "printf",
      environment: "host",
      env: { GH_TOKEN: secretRef("github.token") },
    });
    const env = await createDefaultAriaSessionEnv({ host, commands: [lease] });
    const result = await env.exec("ghx issue");

    expect(result.exitCode).toBe(126);
    expect(host.secretResolutions).toBe(0);
    expect(JSON.stringify(host.audit)).not.toContain("ghs_secret");
  });

  test("role precedence is call > session > agent", async () => {
    const host = new InMemoryHarnessHost();
    const ctx = createAriaHarnessContext({
      host,
      roles: {
        coder: { name: "coder", instructions: "code" },
        researcher: { name: "researcher", instructions: "research" },
        reviewer: { name: "reviewer", instructions: "review" },
      },
    });
    const agent = await ctx.init({ role: "coder" });
    const session = await agent.session("roles", { role: "researcher" });
    await session.prompt("check", { role: "reviewer", syntheticResponse: "ok" });

    expect(host.runEvents.at(-1)?.data?.role).toBe("reviewer");
  });

  test("typed result validation supports Valibot", () => {
    const schema = v.object({ ok: v.boolean() });
    const parsed = parseTypedResult('---RESULT_START---\n{"ok":true}\n---RESULT_END---', schema);

    expect(parsed.parsed).toEqual({ ok: true });
  });

  test("typed result validation supports Zod and TypeBox", () => {
    const zodSchema = z.object({ ok: z.boolean() });
    const typeBoxSchema = Type.Object({ ok: Type.Boolean() });

    expect(
      parseTypedResult('---RESULT_START---\n{"ok":true}\n---RESULT_END---', zodSchema).parsed,
    ).toEqual({ ok: true });
    expect(
      parseTypedResult('---RESULT_START---\n{"ok":true}\n---RESULT_END---', typeBoxSchema).parsed,
    ).toEqual({ ok: true });
    expect(() =>
      parseTypedResult('---RESULT_START---\n{"ok":"no"}\n---RESULT_END---', typeBoxSchema),
    ).toThrow("TypeBox result validation failed");
  });

  test("typed result validation retries one repair turn", async () => {
    const faux = registerFauxProvider({
      provider: "harness-result-repair",
      models: [{ id: "repair-model" }],
    });
    faux.setResponses([
      fauxAssistantMessage('---RESULT_START---\n{"ok":"no"}\n---RESULT_END---'),
      fauxAssistantMessage('---RESULT_START---\n{"ok":true}\n---RESULT_END---'),
    ]);

    try {
      const host = new InMemoryHarnessHost(faux.getModel());
      const ctx = createAriaHarnessContext({ host });
      const agent = await ctx.init({ model: "repair-model" });
      const session = await agent.session("result-repair");
      const response = await session.prompt<{ ok: boolean }>("return status", {
        result: v.object({ ok: v.boolean() }),
      });

      expect(response.result).toEqual({ ok: true });
      expect(host.audit.some((event) => event.type === "result_validation")).toBe(true);
      const saved = await host.loadHarnessSession("result-repair");
      const history = saved?.history as Array<{ type: string; raw?: unknown }> | undefined;
      const resultEntry = history?.find((entry) => entry.type === "result");
      expect(resultEntry?.raw).toMatchObject({
        raw: '{"ok":true}',
        parsed: { ok: true },
      });
    } finally {
      faux.unregister();
    }
  });

  test("skill args and result flow records a harness session result", async () => {
    const dir = await tempDir("aria-harness-skill-");
    const skillDir = join(dir, ".agents", "skills", "triage");
    await mkdir(skillDir, { recursive: true });
    await Bun.write(join(skillDir, "SKILL.md"), "---\nname: triage\n---\nReturn triage status.");
    const host = new InMemoryHarnessHost();
    const env = await createDefaultAriaSessionEnv({ projectRoot: dir, cwd: dir });
    const ctx = createAriaHarnessContext({
      host,
      projectRoot: dir,
      skillResolution: { projectRoot: dir },
    });
    const agent = await ctx.init();
    const session = await agent.session("skill", { env });
    const response = await session.skill("triage", {
      args: { issue: 123 },
      result: v.object({ status: v.string() }),
      syntheticResponse: '---RESULT_START---\n{"status":"ok"}\n---RESULT_END---',
    });

    expect(response.result).toEqual({ status: "ok" });
    expect((await host.loadHarnessSession("skill"))?.history.length).toBeGreaterThan(0);
  });

  test("skill resolution includes user home and explicit relative paths", async () => {
    const projectDir = await tempDir("aria-harness-project-skill-");
    const homeDir = await tempDir("aria-harness-home-skill-");
    await mkdir(join(projectDir, "local", "review"), { recursive: true });
    await mkdir(join(homeDir, "skills", "triage"), { recursive: true });
    await Bun.write(
      join(projectDir, "local", "review", "SKILL.md"),
      "---\nname: review\n---\nUse explicit project path.",
    );
    await Bun.write(
      join(homeDir, "skills", "triage", "SKILL.md"),
      "---\nname: triage\n---\nUse user home skill.",
    );

    const host = new InMemoryHarnessHost();
    const env = await createDefaultAriaSessionEnv({ projectRoot: projectDir, cwd: projectDir });
    const ctx = createAriaHarnessContext({
      host,
      skillResolution: { ariaHome: homeDir },
    });
    const agent = await ctx.init();
    const session = await agent.session("skill-resolution", { env });

    const relative = await session.skill("local/review/SKILL.md", { syntheticResponse: "local" });
    const home = await session.skill("triage", { syntheticResponse: "home" });

    expect(relative.text).toBe("local");
    expect(home.text).toBe("home");
    const saved = await host.loadHarnessSession("skill-resolution");
    expect(JSON.stringify(saved?.history)).toContain("Use explicit project path.");
    expect(JSON.stringify(saved?.history)).toContain("Use user home skill.");
  });

  test("task creates a linked child session", async () => {
    const host = new InMemoryHarnessHost();
    const ctx = createAriaHarnessContext({ host });
    const agent = await ctx.init();
    const session = await agent.session("parent");
    await session.task("inspect", { syntheticResponse: "done" });

    expect(host.runEvents.some((event) => event.type === "task_linked")).toBe(true);
  });

  test("audit records env kind, tool intent, command, cwd, leases", async () => {
    const host = new InMemoryHarnessHost();
    const env = await createDefaultAriaSessionEnv({ host });
    await env.exec("echo audit");
    const intent = host.audit.find((event) => event.type === "tool_intent")?.intent;

    expect(intent).toMatchObject({
      environment: "default",
      toolName: "bash",
      command: "echo audit",
      cwd: env.cwd,
      leases: [],
    });
  });

  test("scoped tool leases are recorded in tool intent metadata", async () => {
    const host = new InMemoryHarnessHost();
    const env = await createDefaultAriaSessionEnv({ host });
    const lease = defineToolLease("bash", { id: "tool:bash:scoped" });
    const scoped = await env.scope!({ tools: [lease] });

    await scoped.exec("echo leased");
    const intent = host.audit.find(
      (event) => event.type === "tool_intent" && event.intent?.command === "echo leased",
    )?.intent;

    expect(intent?.leases).toEqual([lease.id]);
  });
});
