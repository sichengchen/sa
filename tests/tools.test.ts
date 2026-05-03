import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  editTool,
  execKillTool,
  execStatusTool,
  execTool,
  createSessionToolEnvironment,
  getBuiltinTools,
  readTool,
  writeTool,
} from "@aria/tools";
import { InMemoryHarnessHost } from "@aria/harness";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, readFileSync } from "node:fs";

const testDir = join(tmpdir(), "aria-test-tools-" + Date.now());

beforeEach(async () => {
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Read tool", () => {
  test("reads entire file", async () => {
    const filePath = join(testDir, "hello.txt");
    await writeFile(filePath, "line1\nline2\nline3");

    const result = await readTool.execute({ file_path: filePath });
    expect(result.content).toBe("line1\nline2\nline3");
    expect(result.isError).toBeUndefined();
  });

  test("reads with offset and limit", async () => {
    const filePath = join(testDir, "lines.txt");
    await writeFile(filePath, "a\nb\nc\nd\ne");

    const result = await readTool.execute({
      file_path: filePath,
      offset: 2,
      limit: 2,
    });
    expect(result.content).toBe("b\nc");
  });

  test("returns error for missing file", async () => {
    const result = await readTool.execute({
      file_path: join(testDir, "nope.txt"),
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Error");
  });
});

describe("Write tool", () => {
  test("creates new file", async () => {
    const filePath = join(testDir, "new.txt");
    const result = await writeTool.execute({
      file_path: filePath,
      content: "hello world",
    });
    expect(result.isError).toBeUndefined();
    expect(readFileSync(filePath, "utf-8")).toBe("hello world");
  });

  test("creates parent directories", async () => {
    const filePath = join(testDir, "deep", "nested", "file.txt");
    const result = await writeTool.execute({
      file_path: filePath,
      content: "nested",
    });
    expect(result.isError).toBeUndefined();
    expect(readFileSync(filePath, "utf-8")).toBe("nested");
  });

  test("overwrites existing file", async () => {
    const filePath = join(testDir, "existing.txt");
    await writeFile(filePath, "old");
    const result = await writeTool.execute({
      file_path: filePath,
      content: "new",
    });
    expect(result.isError).toBeUndefined();
    expect(readFileSync(filePath, "utf-8")).toBe("new");
  });
});

describe("Edit tool", () => {
  test("replaces unique string", async () => {
    const filePath = join(testDir, "edit.txt");
    await writeFile(filePath, "hello world");
    const result = await editTool.execute({
      file_path: filePath,
      old_string: "world",
      new_string: "universe",
    });
    expect(result.isError).toBeUndefined();
    expect(readFileSync(filePath, "utf-8")).toBe("hello universe");
  });

  test("fails when old_string not found", async () => {
    const filePath = join(testDir, "edit2.txt");
    await writeFile(filePath, "hello world");
    const result = await editTool.execute({
      file_path: filePath,
      old_string: "missing",
      new_string: "x",
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  test("fails when old_string is not unique", async () => {
    const filePath = join(testDir, "edit3.txt");
    await writeFile(filePath, "aaa bbb aaa");
    const result = await editTool.execute({
      file_path: filePath,
      old_string: "aaa",
      new_string: "ccc",
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("2 times");
  });

  test("fails on missing file", async () => {
    const result = await editTool.execute({
      file_path: join(testDir, "nope.txt"),
      old_string: "a",
      new_string: "b",
    });
    expect(result.isError).toBe(true);
  });
});

describe("Exec tool", () => {
  test("moves long-running harness exec to background after yieldMs", async () => {
    const result = await execTool.execute({
      command: "sleep 1 && echo done",
      yieldMs: 1,
      timeout: 5,
    });
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content);
    expect(payload.status).toBe("running");
    expect(payload.handle).toMatch(/^bg-/);

    const status = await execStatusTool.execute({ handle: payload.handle });
    expect(status.content).toContain(`handle: ${payload.handle}`);
    await execKillTool.execute({ handle: payload.handle });
  });
});

describe("Session tool environment", () => {
  test("passes harness host into generated builtins", async () => {
    const host = new InMemoryHarnessHost();
    const environment = createSessionToolEnvironment({
      baseTools: [],
      workingDir: testDir,
      harnessBuiltins: true,
      harnessHost: host,
    });
    const bash = environment.tools.find((tool) => tool.name === "bash");
    expect(bash).toBeDefined();

    const result = await bash!.execute({ command: "echo env-host" });
    expect(result.isError).toBeFalsy();
    const intent = host.audit.find((event) => event.type === "tool_intent")?.intent;
    expect(intent).toMatchObject({
      toolName: "bash",
      environment: "default",
      command: "echo env-host",
    });
  });

  test("uses in-memory just-bash when no project root is bound", async () => {
    const hostPath = join(testDir, "host.txt");
    const virtualPath = join(testDir, "virtual.txt");
    await writeFile(hostPath, "real");
    const environment = createSessionToolEnvironment({
      baseTools: [],
      workingDir: testDir,
      harnessBuiltins: true,
    });
    const read = environment.tools.find((tool) => tool.name === "read")!;
    const write = environment.tools.find((tool) => tool.name === "write")!;

    const readResult = await read.execute({ path: "host.txt" });
    expect(readResult.isError).toBe(true);

    const writeResult = await write.execute({ path: "virtual.txt", content: "virtual" });
    expect(writeResult.isError).toBeFalsy();
    expect(existsSync(virtualPath)).toBe(false);
    expect(readFileSync(hostPath, "utf8")).toBe("real");
    expect(environment.projectRoot).toBeUndefined();
  });

  test("uses project OverlayFS only when project root is bound", async () => {
    const hostPath = join(testDir, "host.txt");
    const virtualPath = join(testDir, "virtual.txt");
    await writeFile(hostPath, "real");
    const environment = createSessionToolEnvironment({
      baseTools: [],
      workingDir: testDir,
      projectRoot: testDir,
      harnessBuiltins: true,
    });
    const read = environment.tools.find((tool) => tool.name === "read")!;
    const write = environment.tools.find((tool) => tool.name === "write")!;

    const readResult = await read.execute({ path: "host.txt" });
    expect(readResult.content).toBe("real");

    const writeResult = await write.execute({ path: "virtual.txt", content: "virtual" });
    expect(writeResult.isError).toBeFalsy();
    expect(existsSync(virtualPath)).toBe(false);
    expect(environment.projectRoot).toBe(testDir);
  });
});

describe("getBuiltinTools", () => {
  test("returns all 8 builtin tools (web_fetch is a factory)", () => {
    const tools = getBuiltinTools();
    expect(tools).toHaveLength(8);
    const names = tools.map((t) => t.name);
    expect(names).toContain("read");
    expect(names).toContain("write");
    expect(names).toContain("edit");
    expect(names).toContain("exec");
    expect(names).toContain("exec_status");
    expect(names).toContain("exec_kill");
    expect(names).toContain("web_search");
    expect(names).toContain("reaction");
  });
});
