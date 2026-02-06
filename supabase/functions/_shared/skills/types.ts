/**
 * Skill type definitions for the LangGraph agent skills system
 */

export interface SkillMetadata {
  name: string;
  slug: string;
  description: string;
  agents: string[];
  tags?: string[];
}

export interface Skill extends SkillMetadata {
  content: string; // Full markdown content (without frontmatter)
}

export interface SkillRegistry {
  [slug: string]: SkillMetadata;
}
