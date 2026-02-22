import type { SkillMetadata, LoadedSkill } from "./types.js";

/** Maximum number of skills to include in the prompt catalog */
export const MAX_SKILLS_IN_PROMPT = 150;

/** Maximum total characters for the skills XML block */
export const MAX_SKILLS_PROMPT_CHARS = 30_000;

/** Escape XML special characters in skill metadata */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Format a single skill entry as XML */
function formatSkillEntry(s: SkillMetadata): string {
  return `<skill>\n<name>${escapeXml(s.name)}</name>\n<description>${escapeXml(s.description)}</description>\n</skill>`;
}

/** Wrap skill entries in the <available_skills> tag, optionally with a truncation note */
function wrapSkillsXml(entries: string, omitted: number): string {
  let xml = `<available_skills>\n${entries}\n</available_skills>`;
  if (omitted > 0) {
    xml += `\n<!-- ${omitted} additional skill(s) omitted. Use the clawhub skill to find more. -->`;
  }
  return xml;
}

/** Generate the <available_skills> XML block for the system prompt */
export function formatSkillsDiscovery(skills: SkillMetadata[]): string {
  if (skills.length === 0) return "";

  // Sort by name for deterministic ordering
  const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name));

  // Cap at MAX_SKILLS_IN_PROMPT
  const capped = sorted.slice(0, MAX_SKILLS_IN_PROMPT);
  let omitted = sorted.length - capped.length;

  // Format all entries
  const formattedEntries = capped.map(formatSkillEntry);

  // Check if total fits within char limit
  const fullEntries = formattedEntries.join("\n");
  const fullXml = wrapSkillsXml(fullEntries, omitted);

  if (fullXml.length <= MAX_SKILLS_PROMPT_CHARS) {
    return fullXml;
  }

  // Binary search for the largest prefix that fits
  let lo = 0;
  let hi = formattedEntries.length;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const subset = formattedEntries.slice(0, mid).join("\n");
    const testOmitted = sorted.length - mid;
    const testXml = wrapSkillsXml(subset, testOmitted);

    if (testXml.length <= MAX_SKILLS_PROMPT_CHARS) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const finalEntries = formattedEntries.slice(0, lo).join("\n");
  const finalOmitted = sorted.length - lo;
  return wrapSkillsXml(finalEntries, finalOmitted);
}

/** Generate active skill instructions block for injection into prompt */
export function formatActiveSkills(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";

  const sections = skills
    .map((s) => `## Skill: ${s.name}\n${s.content}`)
    .join("\n\n");

  return `## Active Skills\n${sections}`;
}
