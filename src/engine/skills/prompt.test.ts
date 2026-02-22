import { describe, it, expect } from "bun:test";
import {
  formatSkillsDiscovery,
  MAX_SKILLS_IN_PROMPT,
  MAX_SKILLS_PROMPT_CHARS,
} from "./prompt.js";
import type { SkillMetadata } from "./types.js";

function makeSkill(name: string, description = "A test skill."): SkillMetadata {
  return { name, description, filePath: `/fake/${name}/SKILL.md` };
}

describe("formatSkillsDiscovery", () => {
  it("returns empty string for no skills", () => {
    expect(formatSkillsDiscovery([])).toBe("");
  });

  it("wraps skills in <available_skills> XML", () => {
    const result = formatSkillsDiscovery([makeSkill("weather")]);
    expect(result).toContain("<available_skills>");
    expect(result).toContain("</available_skills>");
    expect(result).toContain("<name>weather</name>");
    expect(result).toContain("<description>A test skill.</description>");
  });

  it("sorts skills alphabetically by name", () => {
    const skills = [makeSkill("zeta"), makeSkill("alpha"), makeSkill("mid")];
    const result = formatSkillsDiscovery(skills);
    const alphaIdx = result.indexOf("alpha");
    const midIdx = result.indexOf("mid");
    const zetaIdx = result.indexOf("zeta");
    expect(alphaIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(zetaIdx);
  });

  it("escapes XML special characters in name and description", () => {
    const skill = makeSkill("test<script>", "Use & enjoy <this>");
    const result = formatSkillsDiscovery([skill]);
    expect(result).toContain("test&lt;script&gt;");
    expect(result).toContain("Use &amp; enjoy &lt;this&gt;");
    expect(result).not.toContain("<script>");
  });

  it("truncates at MAX_SKILLS_IN_PROMPT and shows omission note", () => {
    const skills = Array.from({ length: MAX_SKILLS_IN_PROMPT + 10 }, (_, i) =>
      makeSkill(`skill-${String(i).padStart(4, "0")}`)
    );
    const result = formatSkillsDiscovery(skills);
    // Should have exactly MAX_SKILLS_IN_PROMPT skill entries
    const skillTagCount = (result.match(/<skill>/g) || []).length;
    expect(skillTagCount).toBeLessThanOrEqual(MAX_SKILLS_IN_PROMPT);
    expect(result).toContain("additional skill(s) omitted");
    expect(result).toContain("clawhub skill");
  });

  it("truncates by char limit and shows omission note", () => {
    // Create skills with very long descriptions to exceed char limit
    const longDesc = "x".repeat(500);
    const skills = Array.from({ length: 100 }, (_, i) =>
      makeSkill(`skill-${String(i).padStart(3, "0")}`, longDesc)
    );
    const result = formatSkillsDiscovery(skills);
    expect(result.length).toBeLessThanOrEqual(MAX_SKILLS_PROMPT_CHARS);
    expect(result).toContain("additional skill(s) omitted");
  });

  it("does not show omission note when all skills fit", () => {
    const skills = [makeSkill("alpha"), makeSkill("beta")];
    const result = formatSkillsDiscovery(skills);
    expect(result).not.toContain("omitted");
  });

  it("includes all skills when under both limits", () => {
    const skills = Array.from({ length: 5 }, (_, i) => makeSkill(`skill-${i}`));
    const result = formatSkillsDiscovery(skills);
    const skillTagCount = (result.match(/<skill>/g) || []).length;
    expect(skillTagCount).toBe(5);
  });
});
