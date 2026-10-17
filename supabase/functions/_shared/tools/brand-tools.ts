const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { callerDbClient } from '../caller-client.ts';
import { serviceClient as svcClient } from '../supabase-client.ts';
import { pickBrandProfile } from '../brand-context.ts';
import { BRAND_PROPOSABLE_FIELDS, BRAND_PROPOSAL_OPS, BRAND_PROPOSAL_SOURCES, brandOpAllowed } from '../brandProfileFields.generated.ts';

export const createProposeBrandChangeTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  agentId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ field, op, value, rationale, source, evidence, website_id }) => {
      if (!workspaceId) return JSON.stringify({ success: false, error: 'No active workspace for the current user.' });
      if (!brandOpAllowed(field, op)) {
        return JSON.stringify({ success: false, error: `${field} takes ${op === 'set' ? 'add or remove' : 'set'}, not ${op}.` });
      }
      const svc = svcClient();
      let target: string | null = null;
      if (website_id) {
        const { data: site } = await svc.from('user_websites').select('id').eq('id', website_id).eq('workspace_id', workspaceId).maybeSingle();
        if (!site) return JSON.stringify({ success: false, error: 'website not found in this workspace' });
        const { data: rows } = await svc.from('workspace_brand_profile').select('website_id').eq('workspace_id', workspaceId);
        target = pickBrandProfile((rows ?? []) as Array<{ website_id: string | null }>, website_id)?.website_id ?? null;
      }

      const { data, error } = await callerDbClient(jwt, userId, workspaceId).from('brand_profile_proposals').insert({
        workspace_id: workspaceId,
        website_id: target,
        field,
        op,
        value: String(value).trim(),
        rationale: String(rationale).trim(),
        source,
        evidence: evidence?.trim() ? { note: evidence.trim().slice(0, 2000) } : {},
        agent_id: agentId,
        proposed_by: userId,
      }).select('id').single();
      if (error?.code === '23505') {
        return JSON.stringify({ success: true, duplicate: true, message: 'The same change is already waiting for approval.' });
      }
      if (error || !data) return JSON.stringify({ success: false, error: error?.message ?? 'Could not store the proposal.' });

      onChunk?.({
        type: 'brand_change_proposed',
        proposal_id: data.id,
        field, op, value, rationale,
        open_url: website_id ? `/websites/${website_id}?section=brand` : '/profile?tab=websites',
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true,
        proposal_id: data.id,
        status: 'proposed',
        message: 'Proposed. A workspace admin approves or dismisses it under the website\'s Brand section; nothing changes until then.',
      });
    },
    {
      name: 'propose_brand_change',
      description:
        'PROPOSE a change to the workspace brand profile — positioning, ideal customer, messaging pillars, active hypotheses, ' +
        'tone, personality, writing style, preferred terminology or words to avoid. It never applies: a workspace admin ' +
        'approves or dismisses it, and only an approved change reaches every agent. List fields take add/remove of one ' +
        'item; writing_style, icp and positioning take set (the whole new text). Competitors are not proposable here — ' +
        'they come from the website\'s tracked competitors.',
      schema: z.object({
        field: z.enum(BRAND_PROPOSABLE_FIELDS).describe('The brand profile field to change.'),
        op: z.enum(BRAND_PROPOSAL_OPS).describe('add/remove one item of a list field; set replaces a text field.'),
        value: z.string().min(1).max(2000).describe('The item to add or remove, or the full new text.'),
        rationale: z.string().min(1).max(2000).describe('Why, in one or two sentences the approver can judge.'),
        source: z.enum(BRAND_PROPOSAL_SOURCES)
          .describe('What prompted it: your own analysis, a mention, a request we could not meet, an editor\'s changes, or the user asking.'),
        evidence: z.string().max(2000).optional().describe('The quote, URL or figure the proposal rests on.'),
        website_id: z.string().uuid().optional().describe('A website whose own voice this is for; omit for the workspace default.'),
      }),
    },
  );
};
