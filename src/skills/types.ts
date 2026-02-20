/** Skill metadata from SKILL.md frontmatter (agentskills.io spec) */
export interface SkillMetadata {
  /** Skill name (kebab-case, e.g. "code-review") */
  name: string;
  /** Short description of what the skill does */
  description: string;
  /** Path to the SKILL.md file */
  filePath: string;
}

/** A loaded skill with full content available */
export interface LoadedSkill extends SkillMetadata {
  /** Full Markdown content (body, excluding frontmatter) */
  content: string;
  /** Whether this skill is currently active (content injected into prompt) */
  active: boolean;
}
