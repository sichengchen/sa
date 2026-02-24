import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readTool } from "@sa/engine/tools/read.js";
import { writeTool } from "@sa/engine/tools/write.js";
import { editTool } from "@sa/engine/tools/edit.js";
import { bashTool } from "@sa/engine/tools/bash.js";
import { getBuiltinTools } from "@sa/engine/tools/index.js";
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";

const testDir = join(tmpdir(), "sa-test-tools-" + Date.now());

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

describe("Bash tool", () => {
  test("executes simple command", async () => {
    const result = await bashTool.execute({ command: "echo hello" });
    expect(result.content.trim()).toBe("hello");
    expect(result.isError).toBe(false);
  });

  test("captures stderr", async () => {
    const result = await bashTool.execute({
      command: "echo err >&2",
    });
    expect(result.content).toContain("stderr");
    expect(result.content).toContain("err");
  });

  test("returns exit code on failure", async () => {
    const result = await bashTool.execute({ command: "exit 42" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("42");
  });

  test("respects cwd", async () => {
    const result = await bashTool.execute({
      command: "pwd",
      cwd: testDir,
    });
    expect(result.content.trim()).toContain(testDir);
  });

  test("handles timeout", async () => {
    const result = await bashTool.execute({
      command: "sleep 10",
      timeout: 100,
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");
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
