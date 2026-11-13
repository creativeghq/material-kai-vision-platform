const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');
import { wrapUntrusted } from '../untrusted.ts';

const svc = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const BATCH = 25;

function cycleStartUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export const createFieldReviewQueueTool = () => tool(
  async ({ limit }) => {
    const { data, error } = await svc().rpc('field_review_queue', {
      p_limit: Math.min(Math.max(limit ?? BATCH, 1), 40), p_since: cycleStartUtc(),
    });
    if (error) return JSON.stringify({ success: false, error: error.message });
    return wrapUntrusted('catalogue data', JSON.stringify(data));
  },
  {
    name: 'field_review_queue',
    description:
      'The next items waiting on Admin → Field Roles, each with the evidence to decide it: merge '
      + 'conflicts (two values one product held), role suggestions from ingestion, and fields still '
      + 'on their first heuristic role. Items already decided or left for a person today are not '
      + 'offered again. An empty list means the queue is done.',
    schema: z.object({
      limit: z.number().int().min(1).max(40).optional().describe('Items per batch (default 25).'),
    }),
  },
);

export const createFieldReviewApplyTool = () => tool(
  async ({ decisions }) => {
    const { data, error } = await svc().rpc('field_review_apply', { p_run_id: null, p_decisions: decisions });
    if (error) return JSON.stringify({ success: false, error: error.message });
    const results = (data?.results ?? []) as Array<{ ref: string; decision: string; result?: { applied?: boolean; reason?: string } }>;
    const refused = results.filter((r) => r.decision !== 'abstain' && r.result?.applied !== true);
    return JSON.stringify({
      success: true,
      sent: decisions.length,
      recorded: results.length,
      applied: results.filter((r) => r.result?.applied === true).length,
      abstained: results.filter((r) => r.decision === 'abstain').length,
      refused: refused.map((r) => ({ ref: r.ref, decision: r.decision, reason: r.result?.reason ?? 'not applied' })),
    });
  },
  {
    name: 'field_review_apply',
    description:
      'Decide items field_review_queue returned. A conflict keeps one of the two existing values '
      + '(keep_survivor / keep_loser); a suggestion is accepted or dismissed; a field role is set to '
      + 'identity or descriptive. Use abstain when the evidence does not decide it, which leaves the '
      + 'item for a person. Every decision is logged with its reason on the Field Roles JARVIS Log, '
      + 'where a person can reverse it. Send a whole batch in one call.',
    schema: z.object({
      decisions: z.array(z.object({
        kind: z.enum(['conflict', 'suggestion', 'field_role']),
        ref: z.string().describe('The item ref exactly as the queue returned it.'),
        decision: z.enum(['keep_survivor', 'keep_loser', 'accept', 'dismiss', 'identity', 'descriptive', 'abstain']),
        reason: z.string().min(3).describe('One sentence citing the evidence.'),
      })).min(1).max(40),
    }),
  },
);
