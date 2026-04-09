import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { SkillRegistry, scanSkillDirectory, formatSkillsDiscovery, formatActiveSkills } from "@aria/engine/skills/index.js";
import { parseFrontmatter } from "@aria/engine/skills/loader.js";

const testHome = join(tmpdir(), "aria-test-skills-" + Date.now());
const skillsDir = join(testHome, "skills");

beforeEach(async () => {
  await mkdir(skillsDir, { recursive: true });
});

afterEach(async () => {
  await rm(testHome, { recursive: true, force: true });
});

async function createSkill(name: string, content: string): Promise<void> {
  const dir = join(skillsDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), content);
}

describe("parseFrontmatter", () => {
  test("parses valid frontmatter", () => {
    const { meta, body } = parseFrontmatter(
      "---\nname: test-skill\ndescription: A test skill\n---\n# Instructions\nDo stuff",
    );
    expect(meta.name).toBe("test-skill");
    expect(meta.description).toBe("A test skill");
    expect(body).toBe("# Instructions\nDo stuff");
  });

  test("handles missing frontmatter", () => {
    const { meta, body } = parseFrontmatter("# No frontmatter\nJust content");
    expect(Object.keys(meta)).toHaveLength(0);
    expect(body).toBe("# No frontmatter\nJust content");
  });
});

describe("scanSkillDirectory", () => {
  test("discovers skills with SKILL.md", async () => {
    await createSkill("code-review", "---\nname: code-review\ndescription: Reviews code\n---\n# Review code");
    await createSkill("summarize", "---\nname: summarize\ndescription: Summarizes text\n---\n# Summarize");

    const skills = await scanSkillDirectory(skillsDir);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["code-review", "summarize"]);
  });

  test("skips directories without SKILL.md", async () => {
    await mkdir(join(skillsDir, "empty-dir"), { recursive: true });
    await createSkill("valid", "---\nname: valid\ndescription: A valid skill\n---\nContent");

    const skills = await scanSkillDirectory(skillsDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("valid");
  });

  test("skips skills missing required frontmatter", async () => {
    await createSkill("incomplete", "---\nname: incomplete\n---\nNo description");
    const skills = await scanSkillDirectory(skillsDir);
    expect(skills).toHaveLength(0);
  });

  test("returns empty for non-existent directory", async () => {
    const skills = await scanSkillDirectory("/nonexistent/path");
    expect(skills).toEqual([]);
  });
});

describe("SkillRegistry", () => {
  test("loads skills from directory (user + bundled)", async () => {
    await createSkill("test", "---\nname: test\ndescription: Test skill\n---\nInstructions here");

    const registry = new SkillRegistry();
    await registry.loadAll(testHome);

    // Bundled skills (skill-creator) + user skills
    expect(registry.size).toBeGreaterThanOrEqual(1);
    const names = registry.getMetadataList().map((s) => s.name);
    expect(names).toContain("test");
    expect(names).toContain("skill-creator"); // bundled
  });

  test("activates and deactivates skills", async () => {
    await createSkill("test", "---\nname: test\ndescription: Test skill\n---\nFull content");

    const registry = new SkillRegistry();
    await registry.loadAll(testHome);

    expect(registry.isActive("test")).toBe(false);
    await registry.activate("test");
    expect(registry.isActive("test")).toBe(true);
    registry.deactivate("test");
    expect(registry.isActive("test")).toBe(false);
  });

  test("lazy-loads content on getContent", async () => {
    await createSkill("lazy", "---\nname: lazy\ndescription: Lazy skill\n---\nLazy content body");

    const registry = new SkillRegistry();
    await registry.loadAll(testHome);

    const content = await registry.getContent("lazy");
    expect(content).toBe("Lazy content body");
  });

  test("returns null for unknown skill", async () => {
    const registry = new SkillRegistry();
    const content = await registry.getContent("nonexistent");
    expect(content).toBeNull();
  });
});

describe("formatSkillsDiscovery", () => {
  test("generates XML block", () => {
    const xml = formatSkillsDiscovery([
      { name: "review", description: "Code review", filePath: "/p" },
      { name: "summarize", description: "Summarize text", filePath: "/p" },
    ]);
    expect(xml).toContain("<available_skills>");
    expect(xml).toContain("<name>review</name>");
    expect(xml).toContain("<description>Code review</description>");
    expect(xml).toContain("<name>summarize</name>");
  });

  test("returns empty string for no skills", () => {
    expect(formatSkillsDiscovery([])).toBe("");
  });
});

describe("formatActiveSkills", () => {
  test("generates active skills section", () => {
    const result = formatActiveSkills([
      { name: "review", description: "Review code", filePath: "/p", content: "Review instructions", active: true },
    ]);
    expect(result).toContain("## Skill: review");
    expect(result).toContain("Review instructions");
  });

  test("returns empty string for no active skills", () => {
    expect(formatActiveSkills([])).toBe("");
  });
});

describe("bundled orchestration skills", () => {
  const bundledDir = join(import.meta.dir, "..", "src", "engine", "skills", "bundled");

  const orchestrationSkills = [
    { dir: "coding-agents", expectedName: "coding-agents", mustMention: ["claude_code", "codex", "esperkit", "ask_user", "background"] },
  ];

  for (const { dir, expectedName, mustMention } of orchestrationSkills) {
    test(`${dir}/SKILL.md exists and has valid frontmatter`, async () => {
      const skillFile = join(bundledDir, dir, "SKILL.md");
      expect(existsSync(skillFile)).toBe(true);

      const content = await readFile(skillFile, "utf-8");
      const { meta, body } = parseFrontmatter(content);

      expect(meta.name).toBe(expectedName);
      expect(meta.description).toBeTruthy();
      expect(meta.description!.length).toBeGreaterThan(10);
      expect(body.length).toBeGreaterThan(100);
    });

    test(`${dir}/SKILL.md mentions required topics`, async () => {
      const content = await readFile(join(bundledDir, dir, "SKILL.md"), "utf-8");
      for (const keyword of mustMention) {
        expect(content).toContain(keyword);
      }
    });
  }

  test("orchestration skills are discovered by SkillRegistry", async () => {
    const registry = new SkillRegistry();
    await registry.loadAll(testHome);

    const names = registry.getMetadataList().map((s) => s.name);
    expect(names).toContain("coding-agents");
  });

  test("coding-agents skill documents tool usage and esperkit", async () => {
    const content = await readFile(join(bundledDir, "coding-agents", "SKILL.md"), "utf-8");
    expect(content).toContain("claude_code");
    expect(content).toContain("codex");
    expect(content).toContain("esperkit");
    expect(content).toContain("background");
  });
});
