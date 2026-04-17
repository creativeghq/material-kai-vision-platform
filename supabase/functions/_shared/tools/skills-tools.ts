/**
 * Skills tools
 *
 * Provides the `load_skill` tool that the agent calls when it decides a skill
 * playbook is relevant to the current task. This is the "disclosure" half of
 * the progressive-disclosure pattern — the skill list is injected into the
 * system prompt (metadata only) and the full markdown is only pulled into
 * context when the agent asks for it, one slug at a time.
 */

// Match the top-level-await dynamic-import pattern used by the other tool files
// in this directory (search-tools, generation-tools, etc.). Cast to `any` to
// dodge LangChain's "Type instantiation is excessively deep" error on typecheck
// without losing any runtime behavior.
const toolsMod: any = await import('npm:@langchain/core@1.1.15/tools');
const zodMod: any   = await import('npm:zod@3.24.0');
const tool = toolsMod.tool;
const z    = zodMod.z;
import { getSkill, getAllSkillSlugs } from '../skills-loader.ts';

export const createLoadSkillTool = (agentId: string) => {
  return tool(
    async ({ slug }: { slug: string }) => {
      const skill = getSkill(slug);
      if (!skill) {
        return JSON.stringify({
          success: false,
          error: `Skill "${slug}" not found. Available slugs: ${getAllSkillSlugs().join(', ') || '(none)'}`,
        });
      }

      // Verify this skill is actually available to the calling agent.
      // Prevents a tool call from surfacing a skill the system prompt didn't advertise.
      if (!skill.agents.includes(agentId)) {
        return JSON.stringify({
          success: false,
          error: `Skill "${slug}" is not available to agent "${agentId}".`,
        });
      }

      return JSON.stringify({
        success: true,
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        content: skill.content,
      });
    },
    {
      name: 'load_skill',
      description:
        'Load the full playbook for one of the skills listed in your system prompt. Call this when the user request matches a skill description, then follow the returned recipe exactly. Only pass slugs that appear in the "Skills available" section — do not invent slugs.',
      schema: z.object({
        slug: z.string().describe('The exact skill slug from the "Skills available" list (e.g. "b2b-manufacturer-research").'),
      }),
    },
  );
};
