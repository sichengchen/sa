import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseContextReferences, preprocessContextReferences } from "./context-references.js";

let workspaceDir: string;

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "aria-context-refs-"));
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("parseContextReferences", () => {
  test("parses file line ranges, folders, and simple git references", () => {
    const refs = parseContextReferences("Review @file:src/app.ts:10-20 and @folder:src plus @diff");
    expect(refs).toHaveLength(3);
    expect(refs[0]).toMatchObject({ kind: "file", target: "src/app.ts", lineStart: 10, lineEnd: 20 });
    expect(refs[1]).toMatchObject({ kind: "folder", target: "src" });
    expect(refs[2]).toMatchObject({ kind: "diff" });
  });
});

describe("preprocessContextReferences", () => {
  test("expands file references into the message body", async () => {
    const filePath = join(workspaceDir, "notes.txt");
    await writeFile(filePath, "alpha\nbeta\ngamma\n");

    const result = await preprocessContextReferences(
      "Summarize @file:notes.txt:2-3",
      { cwd: workspaceDir },
    );

    expect(result.blocked).toBe(false);
    expect(result.message).toContain("Summarize");
    expect(result.message).toContain("beta\ngamma");
    expect(result.message).toContain("--- Attached Context ---");
  });

  test("expands folder references into a tree listing", async () => {
    await mkdir(join(workspaceDir, "src", "nested"), { recursive: true });
    await writeFile(join(workspaceDir, "src", "nested", "file.ts"), "export {};\n");

    const result = await preprocessContextReferences(
      "Inspect @folder:src",
      { cwd: workspaceDir },
    );

    expect(result.blocked).toBe(false);
    expect(result.message).toContain("nested/");
    expect(result.message).toContain("file.ts");
  });

  test("warns when a file reference escapes the active workspace", async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), "aria-context-refs-outside-"));
    try {
      const outsideFile = join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "top secret\n");

      const result = await preprocessContextReferences(
        `Read @file:${outsideFile}`,
        { cwd: workspaceDir, allowedRoot: workspaceDir },
      );

      expect(result.blocked).toBe(false);
      expect(result.warnings.join("\n")).toContain("path escapes the active workspace");
      expect(result.message).not.toContain("top secret");
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  test("blocks sibling paths that only share the workspace prefix text", async () => {
    const outsideDir = `${workspaceDir}-secrets`;
    await mkdir(outsideDir, { recursive: true });
    try {
      const outsideFile = join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "prefix-confusable secret\n");

      const result = await preprocessContextReferences(
        `Read @file:${outsideFile}`,
        { cwd: workspaceDir, allowedRoot: workspaceDir },
      );

      expect(result.warnings.join("\n")).toContain("path escapes the active workspace");
      expect(result.message).not.toContain("prefix-confusable secret");
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});
