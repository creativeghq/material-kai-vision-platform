/**
 * Reviews Tools — agent-chat surface for professional/profile reviews.
 *
 * ONE tool, actions:
 *   - list  — reviews written ABOUT the caller (profile_reviews.to_user_id = me), newest first
 *   - reply — post a public reply to one of those reviews (CONFIRM-gated: it's publicly visible)
 *
 * No edge function + no workspace scoping: profile_reviews already carries the validated contract in
 * RLS — `reviews_select_public` (read) and `reviews_update_owner_reply` (only to_user_id may set the
 * reply). So a USER-JWT client IS the contract, exactly like the finance read tool. Module `reviews`
 * gate is checked via the service client. Product reviews (material_reviews) have no reply concept and
 * are intentionally out of scope. 0 credits.
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MODULE_SLUG = 'reviews';

import { serviceClient as svcClient } from '../supabase-client.ts';
/** User-scoped client so RLS scopes reads/writes to the caller exactly as on the page. */
function userClient(jwt: string | undefined) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

async function moduleReady(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: mod } = await svcClient().from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The Reviews module is not enabled on this platform.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Reviews availability check failed: ${(e as Error).message}` };
  }
}

export const createManageReviewsTool = (
  userId: string,
  _workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, only_unanswered, limit = 20, review_id, reply, confirm }) => {
      const gate = await moduleReady();
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      if (!userId) return JSON.stringify({ success: false, error: 'No signed-in user.' });
      const sb = userClient(jwt);

      if (action === 'list') {
        let q = sb.from('profile_reviews')
          .select('id, from_name, overall_rating, comment, service_name, reply, is_hidden, created_at')
          .eq('to_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(Math.min(limit, 50));
        if (only_unanswered) q = q.is('reply', null);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        const rows = data ?? [];
        onChunk?.({ type: 'reviews_list', only_unanswered: !!only_unanswered, reviews: rows, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: rows.length, reviews: rows.slice(0, 15) });
      }

      if (action === 'reply') {
        if (!review_id || !reply) return JSON.stringify({ success: false, error: 'reply needs review_id and reply text.' });
        // Load + validate the review is about me (RLS also enforces this on the update).
        const { data: rev } = await sb.from('profile_reviews')
          .select('id, from_name, overall_rating, comment, reply, to_user_id')
          .eq('id', review_id).maybeSingle();
        if (!rev || rev.to_user_id !== userId) return JSON.stringify({ success: false, error: 'review not found (or it is not about you).' });

        // Public reply → HUMAN-IN-THE-LOOP GATE (invariant #9).
        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_reviews',
            input: { action: 'reply', review_id, reply },
            title: 'Post this public reply?',
            summary: `Reply to ${rev.from_name || 'the reviewer'}'s ${rev.overall_rating ?? '—'}★ review: "${String(reply).slice(0, 200)}". It will be publicly visible on your profile.`,
            danger: true,
            toolkit_id: 'reviews',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval to post this reply. Do not retry.' });
        }

        const { data, error } = await sb.from('profile_reviews')
          .update({ reply }).eq('id', review_id).eq('to_user_id', userId).select('id').maybeSingle();
        if (error) return JSON.stringify({ success: false, error: error.message });
        if (!data) return JSON.stringify({ success: false, error: 'reply not saved (RLS blocked or review not yours).' });
        onChunk?.({ type: 'review_reply_posted', review_id, timestamp: Date.now() });
        return JSON.stringify({ success: true, replied: true, review_id });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_reviews',
      description:
        'Professional reviews written about you: list them (optionally only unanswered) and post a '
        + 'public reply to one. A reply is publicly visible → it ALWAYS asks the user to Approve/Decline '
        + 'first (never set confirm:true yourself). 0 credits.',
      schema: z.object({
        action: z.enum(['list', 'reply']).default('list'),
        only_unanswered: z.boolean().optional().describe('list: only reviews you have not replied to yet.'),
        limit: z.number().int().min(1).max(50).default(20),
        review_id: z.string().optional().describe('reply: the review UUID.'),
        reply: z.string().optional().describe('reply: your public response text.'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
