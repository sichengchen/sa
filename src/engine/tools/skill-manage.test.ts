import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillRegistry } from "../skills/index.js";
import { createSkillManageTool } from "./skill-manage.js";

let homeDir: string;
let registry: SkillRegistry;

beforeEach(async () => {
  homeDir = await mkdtemp(join(tmpdir(), "sa-skill-manage-"));
  registry = new SkillRegistry();
  await registry.loadAll(homeDir);
});

afterEach(async () => {
  await rm(homeDir, { recursive: true, force: true });
});

describe("skill_manage tool", () => {
  test("creates, patches, and deletes a user skill", async () => {
    const tool = createSkillManageTool({ homeDir, registry });
    const initialContent = [
      "---",
      "name: release-helper",
      "description: Helps with release checklists.",
      "---",
      "",
      "# Release Helper",
      "",
      "Step one.",
      "",
    ].join("\n");

    const created = await tool.execute({
      action: "create",
      name: "release-helper",
      content: initialContent,
    });
    expect(created.isError).toBeUndefined();
    expect(registry.get("release-helper")).toBeDefined();

    const patched = await tool.execute({
      action: "patch",
      name: "release-helper",
      old_string: "Step one.",
      new_string: "Step one updated.",
    });
    expect(patched.isError).toBeUndefined();

    const wroteFile = await tool.execute({
      action: "write_file",
      name: "release-helper",
      file_path: "references/checklist.md",
      file_content: "# Checklist\n",
    });
    expect(wroteFile.isError).toBeUndefined();

    const skillText = await readFile(join(homeDir, "skills", "release-helper", "SKILL.md"), "utf-8");
    expect(skillText).toContain("Step one updated.");
    const refText = await readFile(join(homeDir, "skills", "release-helper", "references", "checklist.md"), "utf-8");
    expect(refText).toContain("# Checklist");

    const deleted = await tool.execute({
      action: "delete",
      name: "release-helper",
    });
    expect(deleted.isError).toBeUndefined();
    expect(registry.get("release-helper")).toBeUndefined();
  });
});
