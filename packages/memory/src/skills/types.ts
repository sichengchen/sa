export interface SkillMetadata {
  name: string;
  description: string;
  filePath: string;
}

export interface LoadedSkill extends SkillMetadata {
  content: string;
  active: boolean;
}
