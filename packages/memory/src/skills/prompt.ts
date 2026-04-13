import type { LoadedSkill, SkillMetadata } from "./types.js";

export const MAX_SKILLS_IN_PROMPT = 150;
export const MAX_SKILLS_PROMPT_CHARS = 30_000;

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatSkillEntry(skill: SkillMetadata): string {
  return `<skill>\n<name>${escapeXml(skill.name)}</name>\n<description>${escapeXml(skill.description)}</description>\n</skill>`;
}

function wrapSkillsXml(entries: string, omitted: number): string {
  let xml = `<available_skills>\n${entries}\n</available_skills>`;
  if (omitted > 0) {
    xml += `\n<!-- ${omitted} additional skill(s) omitted. Use the clawhub skill to find more. -->`;
  }
  return xml;
}

export function formatSkillsDiscovery(skills: SkillMetadata[]): string {
  if (skills.length === 0) return "";

  const sorted = [...skills].sort((left, right) => left.name.localeCompare(right.name));
  const capped = sorted.slice(0, MAX_SKILLS_IN_PROMPT);
  const formattedEntries = capped.map(formatSkillEntry);
  const omitted = sorted.length - capped.length;

  const fullEntries = formattedEntries.join("\n");
  const fullXml = wrapSkillsXml(fullEntries, omitted);
  if (fullXml.length <= MAX_SKILLS_PROMPT_CHARS) {
    return fullXml;
  }

  let lo = 0;
  let hi = formattedEntries.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const subset = formattedEntries.slice(0, mid).join("\n");
    const testXml = wrapSkillsXml(subset, sorted.length - mid);
    if (testXml.length <= MAX_SKILLS_PROMPT_CHARS) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return wrapSkillsXml(formattedEntries.slice(0, lo).join("\n"), sorted.length - lo);
}

export function formatActiveSkills(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";

  const sections = skills.map((skill) => `## Skill: ${skill.name}\n${skill.content}`).join("\n\n");
  return `## Active Skills\n${sections}`;
}
