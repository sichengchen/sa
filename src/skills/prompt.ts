import type { SkillMetadata, LoadedSkill } from "./types.js";

/** Generate the <available_skills> XML block for the system prompt */
export function formatSkillsDiscovery(skills: SkillMetadata[]): string {
  if (skills.length === 0) return "";

  const entries = skills
    .map(
      (s) =>
        `<skill>\n<name>${s.name}</name>\n<description>${s.description}</description>\n</skill>`,
    )
    .join("\n");

  return `<available_skills>\n${entries}\n</available_skills>`;
}

/** Generate active skill instructions block for injection into prompt */
export function formatActiveSkills(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";

  const sections = skills
    .map((s) => `## Skill: ${s.name}\n${s.content}`)
    .join("\n\n");

  return `## Active Skills\n${sections}`;
}
