/**
 * Skills loader for LangGraph agent
 *
 * Skills are loaded from embedded content (Deno Edge Function compatible)
 * using progressive disclosure - metadata loads first, full content on demand.
 */

import type { Skill, SkillMetadata } from './skills-types.ts';

// Import skill files as raw text
// Each skill is a separate import to enable tree-shaking
// Example:
// import mySkill from './my-skill/SKILL.md' with { type: 'text' };

/**
 * Registry of all available skills
 * Add new skills here after creating their SKILL.md files
 *
 * Example:
 * const SKILL_FILES: Record<string, string> = {
 *   'my-skill': mySkill,
 * };
 */
const SKILL_FILES: Record<string, string> = {
  // Add skills here when you have proprietary knowledge to inject
};

/**
 * Parse a SKILL.md file into metadata and content
 */
export function parseSkillFile(content: string): Skill {
  // Match YAML frontmatter between --- delimiters
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const frontmatterRaw = frontmatterMatch[1];
  const markdownContent = frontmatterMatch[2].trim();

  // Simple YAML parser for frontmatter (avoids external dependency)
  const metadata = parseSimpleYaml(frontmatterRaw);

  return {
    name: metadata.name || '',
    slug: metadata.slug || '',
    description: metadata.description || '',
    agents: metadata.agents || [],
    tags: metadata.tags || [],
    content: markdownContent,
  };
}

/**
 * Simple YAML parser for skill frontmatter
 * Supports: strings, arrays (inline [a, b] format), and simple key-value pairs
 */
function parseSimpleYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Handle inline arrays: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1);
      result[key] = arrayContent
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    } else {
      // Handle strings (remove quotes if present)
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get skill metadata for a specific agent (progressive disclosure)
 * Only returns metadata, not full content - saves tokens
 */
export function getSkillsForAgent(agentId: string): SkillMetadata[] {
  const skills: SkillMetadata[] = [];

  for (const [slug, content] of Object.entries(SKILL_FILES)) {
    try {
      const skill = parseSkillFile(content);
      if (skill.agents.includes(agentId)) {
        // Return metadata only, exclude content
        const { content: _, ...metadata } = skill;
        skills.push(metadata);
      }
    } catch (error) {
      console.error(`Failed to parse skill ${slug}:`, error);
    }
  }

  return skills;
}

/**
 * Get full skill content by slug
 * Called when agent decides to use a skill
 */
export function getSkillContent(slug: string): string | null {
  const file = SKILL_FILES[slug];
  if (!file) return null;

  try {
    const skill = parseSkillFile(file);
    return skill.content;
  } catch (error) {
    console.error(`Failed to parse skill ${slug}:`, error);
    return null;
  }
}

/**
 * Get all available skill slugs
 */
export function getAllSkillSlugs(): string[] {
  return Object.keys(SKILL_FILES);
}

/**
 * Get full skill by slug (metadata + content)
 */
export function getSkill(slug: string): Skill | null {
  const file = SKILL_FILES[slug];
  if (!file) return null;

  try {
    return parseSkillFile(file);
  } catch (error) {
    console.error(`Failed to parse skill ${slug}:`, error);
    return null;
  }
}
