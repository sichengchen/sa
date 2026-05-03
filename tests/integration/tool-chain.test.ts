import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createSessionToolEnvironment, editTool, readTool, writeTool } from "@aria/tools";
import { existsSync } from "node:fs";
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
  function createHarnessEnvironment() {
    return createSessionToolEnvironment({
      baseTools: [],
      workingDir: testDir,
      projectRoot: testDir,
      harnessBuiltins: true,
    });
  }

  function getHarnessTool(name: string) {
    const environment = createHarnessEnvironment();
    const tool = environment.tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Missing harness tool: ${name}`);
    return tool;
  }

  function getHarnessToolFromEnvironment(
    environment: ReturnType<typeof createSessionToolEnvironment>,
    name: string,
  ) {
    const tool = environment.tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`Missing harness tool: ${name}`);
    return tool;
  }

  test("Write → Read → Edit → Read flow", async () => {
    const filePath = join(testDir, "chain.txt");

    // Write
    const w = await writeTool.execute({
      file_path: filePath,
      content: "hello world",
    });
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

  test("Bash writes stay virtual", async () => {
    const filePath = join(testDir, "bash-created.txt");
    const environment = createHarnessEnvironment();
    const bash = getHarnessToolFromEnvironment(environment, "bash");
    const read = getHarnessToolFromEnvironment(environment, "read");

    const b = await bash.execute({
      command: `echo "from bash" > bash-created.txt`,
    });
    expect(b.isError).toBeFalsy();

    expect(existsSync(filePath)).toBe(false);
    const r = await read.execute({ path: "bash-created.txt" });
    expect(r.content).toBe("from bash\n");
  });

  test("Write nested → Bash lists → Read content", async () => {
    const nested = join(testDir, "deep", "nested", "file.txt");
    const bash = getHarnessTool("bash");

    // Write creates nested dirs
    await writeTool.execute({ file_path: nested, content: "nested content" });

    // Bash lists the dir
    const ls = await bash.execute({
      command: "ls deep/nested",
    });
    expect(ls.content).toContain("file.txt");

    // Read the nested file
    const r = await readTool.execute({ file_path: nested });
    expect(r.content).toBe("nested content");
  });
});
