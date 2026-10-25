/**
 * Skills loader for LangGraph agent
 *
 * Skills are loaded from embedded content (Deno Edge Function compatible)
 * using progressive disclosure - metadata loads first, full content on demand.
 */

import type { Skill, SkillMetadata } from './skills-types.ts';

// Skills are registered statically: each skill lives in its own directory under
// ./skills/<slug>/ with a SKILL.md (source of truth for humans / PR review) and
// a skill.ts that re-exports the same markdown as a template literal. The .ts
// export is what we import here — the Supabase Edge Runtime's Deno build does
// not enable `--unstable-raw-imports`, so we cannot import the .md directly.
// When editing a skill: edit both files OR edit SKILL.md and copy into skill.ts.
import b2bManufacturerResearch from './skills/b2b-manufacturer-research/skill.ts';
import customerFacingReply     from './skills/customer-facing-reply/skill.ts';
import designToQuote           from './skills/design-to-quote/skill.ts';
import interiorStagingWorkflow  from './skills/interior-staging-workflow/skill.ts';
import materialSpecExtraction   from './skills/material-spec-extraction/skill.ts';
import propertyLeadToViewing   from './skills/property-lead-to-viewing/skill.ts';
import seoOpportunityTriage    from './skills/seo-opportunity-triage/skill.ts';

import assumptionAudit from './skills/assumption-audit/skill.ts';
import businessCaseBuilder from './skills/business-case-builder/skill.ts';
import competitiveIntel from './skills/competitive-intel/skill.ts';
import customerSegmentation from './skills/customer-segmentation/skill.ts';
import decisionMemo from './skills/decision-memo/skill.ts';
import growthBarriers from './skills/growth-barriers/skill.ts';
import initiativePrioritizer from './skills/initiative-prioritizer/skill.ts';
import kpiArchitect from './skills/kpi-architect/skill.ts';
import marketMapping from './skills/market-mapping/skill.ts';
import narrativeBuilder from './skills/narrative-builder/skill.ts';
import operatingModelDesign from './skills/operating-model-design/skill.ts';
import portfolioReview from './skills/portfolio-review/skill.ts';
import pricingStrategy from './skills/pricing-strategy/skill.ts';
import profitPoolAnalysis from './skills/profit-pool-analysis/skill.ts';
import riskMitigation from './skills/risk-mitigation/skill.ts';
import situationAssessment from './skills/situation-assessment/skill.ts';
import stakeholderAlignment from './skills/stakeholder-alignment/skill.ts';
import strategicOptions from './skills/strategic-options/skill.ts';
import transformationRoadmap from './skills/transformation-roadmap/skill.ts';
import valueRealization from './skills/value-realization/skill.ts';
import warGaming from './skills/war-gaming/skill.ts';

const SKILL_FILES: Record<string, string> = {
  'b2b-manufacturer-research': b2bManufacturerResearch,
  'customer-facing-reply':     customerFacingReply,
  'design-to-quote':           designToQuote,
  'interior-staging-workflow': interiorStagingWorkflow,
  'material-spec-extraction':  materialSpecExtraction,
  'property-lead-to-viewing':  propertyLeadToViewing,
  'seo-opportunity-triage':    seoOpportunityTriage,
  'assumption-audit': assumptionAudit,
  'business-case-builder': businessCaseBuilder,
  'competitive-intel': competitiveIntel,
  'customer-segmentation': customerSegmentation,
  'decision-memo': decisionMemo,
  'growth-barriers': growthBarriers,
  'initiative-prioritizer': initiativePrioritizer,
  'kpi-architect': kpiArchitect,
  'market-mapping': marketMapping,
  'narrative-builder': narrativeBuilder,
  'operating-model-design': operatingModelDesign,
  'portfolio-review': portfolioReview,
  'pricing-strategy': pricingStrategy,
  'profit-pool-analysis': profitPoolAnalysis,
  'risk-mitigation': riskMitigation,
  'situation-assessment': situationAssessment,
  'stakeholder-alignment': stakeholderAlignment,
  'strategic-options': strategicOptions,
  'transformation-roadmap': transformationRoadmap,
  'value-realization': valueRealization,
  'war-gaming': warGaming,
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

/**
 * Render the "Skills available" section that gets appended to an agent's system
 * prompt. Lists only name/slug/description — the full content is loaded on
 * demand via the `load_skill` tool (progressive disclosure, token-efficient).
 *
 * Returns an empty string when the agent has no skills — caller can unconditionally
 * concatenate without a length check.
 */
export function formatSkillsForSystemPrompt(agentId: string): string {
  const skills = getSkillsForAgent(agentId);
  if (skills.length === 0) return '';

  const lines = skills.map(
    s => `- **${s.name}** (slug: \`${s.slug}\`) — ${s.description}`,
  );

  return `

## Skills available

You have access to the following skill playbooks. Each skill is a detailed procedure for a specific kind of task. When the user's request matches a skill's description, call the \`load_skill\` tool with the skill's slug to receive the full playbook, then follow it step-by-step.

${lines.join('\n')}

Do not invent skill slugs. Only the exact slugs listed above are loadable. If no skill matches, proceed with your normal reasoning and tools.`;
}
