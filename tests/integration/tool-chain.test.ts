import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readTool } from "@aria/engine/tools/read.js";
import { writeTool } from "@aria/engine/tools/write.js";
import { editTool } from "@aria/engine/tools/edit.js";
import { bashTool } from "@aria/engine/tools/bash.js";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const testDir = join(tmpdir(), "aria-integration-tools-" + Date.now());

beforeEach(async () => {
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Tool chain integration", () => {
  test("Write → Read → Edit → Read flow", async () => {
    const filePath = join(testDir, "chain.txt");

    // Write
    const w = await writeTool.execute({ file_path: filePath, content: "hello world" });
    expect(w.isError).toBeUndefined();

    // Read
    const r1 = await readTool.execute({ file_path: filePath });
    expect(r1.content).toBe("hello world");

    // Edit
    const e = await editTool.execute({
      file_path: filePath,
      old_string: "world",
      new_string: "universe",
    });
    expect(e.isError).toBeUndefined();

    // Read again
    const r2 = await readTool.execute({ file_path: filePath });
    expect(r2.content).toBe("hello universe");
  });

  test("Bash creates file → Read verifies it", async () => {
    const filePath = join(testDir, "bash-created.txt");

    // Bash creates a file
    const b = await bashTool.execute({
      command: `echo "from bash" > "${filePath}"`,
    });
    expect(b.isError).toBe(false);

    // Read verifies
    const r = await readTool.execute({ file_path: filePath });
    expect(r.content.trim()).toBe("from bash");
  });

  test("Write nested → Bash lists → Read content", async () => {
    const nested = join(testDir, "deep", "nested", "file.txt");

    // Write creates nested dirs
    await writeTool.execute({ file_path: nested, content: "nested content" });

    // Bash lists the dir
    const ls = await bashTool.execute({
      command: `ls "${join(testDir, "deep", "nested")}"`,
    });
    expect(ls.content).toContain("file.txt");

    // Read the nested file
    const r = await readTool.execute({ file_path: nested });
    expect(r.content).toBe("nested content");
  });
});
