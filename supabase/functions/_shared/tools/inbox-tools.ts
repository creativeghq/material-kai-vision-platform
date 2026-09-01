/**
 * Inbox Tools — agent-chat surface for the multi-tenant customer Inbox.
 *
 * ONE tool, actions:
 *   - list     — recent customer conversations (optionally by status, or by label)
 *   - reply    — send a reply into a conversation (CONFIRM-gated: it's a real customer-facing message)
 *   - status   — set a thread open/snoozed/closed
 *   - handover — hand a thread to the AI assistant (agent_state=active) or take it back (off)
 *   - labels   — what labels this workspace has
 *   - label    — set the thread's labels
 *
 * ── Labels are NAMED here, not identified ──
 * `label` originally took `label_ids` and nothing else, and no action returned any: a label id is
 * a uuid the model has no way to come by, so "tag this urgent" was an offered capability that
 * could not be performed. It reads as a working tool right up to the point of use, which is the
 * worst shape a tool can have. So `labels` lists them and every label argument accepts a NAME,
 * resolved here against the workspace's own set — the model works in the vocabulary the operator
 * typed, and an unknown name comes back as an error naming the ones that exist.
 *
 * `reply` is a customer-facing send → confirm-gated (Approve/Decline). Everything runs through the
 * validated inbox-api as the user (JWT) — its directional ACL/scope applies. Module `inbox` +
 * entitlement gated.
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
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'inbox';

import { serviceClient as svcClient } from '../supabase-client.ts';
import { describeUpstreamError } from '../tool-result-shape.ts';
async function moduleReady(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The Inbox module is not enabled on this platform.' };
    if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
    const { data: entitled } = await sb.rpc('is_workspace_entitled', { p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG });
    if (entitled !== true) return { ok: false, error: 'This workspace has not activated the Inbox. Enable it under Profile → Modules.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Inbox availability check failed: ${(e as Error).message}` };
  }
}

/** Call inbox-api as the user (JWT) — its directional ACL/scope applies. */
async function callInbox(action: string, payload: Record<string, unknown>, jwt: string | undefined): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/inbox-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt || SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ action, ...payload }),
    });
    const text = await resp.text();
    let parsed: any = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : describeUpstreamError(resp.status, parsed) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

/**
 * The workspace's labels, as the operator named them.
 *
 * Read through inbox-api rather than off the table, so the caller's own membership decides what
 * comes back — the same gate every other action here goes through.
 */
async function workspaceLabels(jwt: string | undefined, workspaceId: string):
  Promise<Array<{ id: string; name: string; color: string }>> {
  const r = await callInbox('list_labels', { workspace_id: workspaceId }, jwt);
  return r.ok ? (r.data?.labels ?? []) : [];
}

/**
 * A name or an id in, an id out.
 *
 * Case- and whitespace-insensitive on the name, because the operator typed "Urgent" and the model
 * will say "urgent". An unmatched value returns null rather than being passed through: sending an
 * unknown string as a label id gets a 400 from PostgREST that says nothing useful, and silently
 * dropping it would apply a DIFFERENT set of labels than the one that was asked for.
 */
function resolveLabel(
  value: string,
  labels: Array<{ id: string; name: string }>,
): string | null {
  const v = value.trim().toLowerCase();
  const byId = labels.find((l) => l.id.toLowerCase() === v);
  if (byId) return byId.id;
  return labels.find((l) => l.name.trim().toLowerCase() === v)?.id ?? null;
}

export const createManageInboxTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, status, thread_id, body, internal_note, confirm, agent_state, label_ids, label }) => {
      const gate = await moduleReady(workspaceId);
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });

      // Set a thread's status (open / snoozed / closed) — e.g. "close this conversation".
      if (action === 'status') {
        if (!thread_id || !status) return JSON.stringify({ success: false, error: 'status action needs thread_id and status (open|snoozed|closed).' });
        const r = await callInbox('set_status', { thread_id, status }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        return JSON.stringify({ success: true, thread_id, status });
      }

      // Hand a thread to the AI assistant, or take it back — e.g. "let the bot handle this".
      if (action === 'handover') {
        if (!thread_id || (agent_state !== 'off' && agent_state !== 'active')) return JSON.stringify({ success: false, error: 'handover needs thread_id and agent_state (active to hand to the bot, off to take it back).' });
        const r = await callInbox('set_agent', { thread_id, agent_state }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        return JSON.stringify({ success: true, thread_id, agent_state });
      }

      // What labels exist — the answer the model needs before it can use any of the others.
      if (action === 'labels') {
        const labels = await workspaceLabels(jwt, workspaceId);
        // No chunk: this is the model looking something up so it can use it, not a result
        // for the reader. A card here would be a list of the labels they made, drawn back at
        // them every time the agent needs to know one.
        return JSON.stringify({ success: true, count: labels.length, labels });
      }

      // Set the labels on a thread — e.g. "label this urgent". Replaces the current label set.
      if (action === 'label') {
        if (!thread_id) return JSON.stringify({ success: false, error: 'label needs thread_id and label_ids[] (names or ids).' });
        const known = await workspaceLabels(jwt, workspaceId);
        const wanted = Array.isArray(label_ids) ? label_ids : [];
        const resolved: string[] = [];
        const unknown: string[] = [];
        for (const w of wanted) {
          const id = resolveLabel(String(w), known);
          if (id) resolved.push(id); else unknown.push(String(w));
        }
        // Named, not swallowed: applying the labels it DID recognise would set a different set
        // than the one requested and report success, and nobody would look at the thread again.
        if (unknown.length) {
          return JSON.stringify({
            success: false,
            error: `No label named ${unknown.map((u) => `"${u}"`).join(', ')} in this workspace.`,
            available: known.map((l) => l.name),
          });
        }
        const r = await callInbox('set_thread_labels', { thread_id, label_ids: resolved }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        return JSON.stringify({ success: true, thread_id, labels: wanted, label_ids: resolved });
      }

      if (action === 'list') {
        // "Show me the conversations tagged Urgent" — the filter is applied SERVER-side by
        // `list_threads`, so it narrows the query rather than the 200 rows that came back.
        let labelId: string | undefined;
        if (label) {
          const known = await workspaceLabels(jwt, workspaceId);
          const id = resolveLabel(String(label), known);
          if (!id) {
            return JSON.stringify({
              success: false,
              error: `No label named "${label}" in this workspace.`,
              available: known.map((l) => l.name),
            });
          }
          labelId = id;
        }
        const r = await callInbox('list_threads', {
          ...(status ? { status } : {}),
          ...(labelId ? { label_id: labelId } : {}),
        }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        const threads = r.data?.threads ?? [];
        onChunk?.({ type: 'inbox_threads_list', workspace_id: workspaceId, threads, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: threads.length, label: label ?? null, threads: threads.slice(0, 15) });
      }

      if (action === 'reply') {
        if (!thread_id || !body) return JSON.stringify({ success: false, error: 'reply needs thread_id and body.' });

        // Internal notes are not customer-facing → no confirmation needed.
        if (internal_note) {
          const r = await callInbox('send_message', { thread_id, body, message_type: 'note' }, jwt);
          if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
          return JSON.stringify({ success: true, noted: true, thread_id });
        }

        // Customer-facing reply → HUMAN-IN-THE-LOOP GATE (invariant #9).
        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_inbox',
            input: { action: 'reply', thread_id, body },
            title: 'Send this reply to the customer?',
            summary: `Reply in the conversation: "${String(body).slice(0, 200)}". The customer receives it immediately.`,
            danger: true,
            toolkit_id: 'inbox',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval to send this reply. Do not retry.' });
        }

        const r = await callInbox('send_message', { thread_id, body, message_type: 'text' }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        onChunk?.({ type: 'inbox_reply_sent', thread_id, message_id: r.data?.message?.id, timestamp: Date.now() });
        return JSON.stringify({ success: true, sent: true, thread_id, message_id: r.data?.message?.id });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_inbox',
      description:
        'Customer Inbox: list conversations (optionally filtered by label), reply, set status '
        + '(close/reopen/snooze), hand a thread to/from the AI assistant, list the workspace labels, or '
        + 'set a thread\'s labels. Labels are referred to BY NAME — call action:"labels" first if you do '
        + 'not know what exists. A customer-facing reply ALWAYS asks the user to Approve/Decline first '
        + '(never set confirm:true yourself). Use internal_note:true for a private team note (not sent '
        + 'to the customer, no confirmation).',
      schema: z.object({
        action: z.enum(['list', 'reply', 'status', 'handover', 'labels', 'label']).default('list'),
        status: z.string().optional().describe('list: filter by thread status. status action: open|snoozed|closed.'),
        thread_id: z.string().optional().describe('the conversation id (reply/status/handover/label).'),
        body: z.string().optional().describe('reply: the message text.'),
        internal_note: z.boolean().optional().describe('reply: post as a private internal note instead of a customer-facing message (no confirmation).'),
        agent_state: z.enum(['off', 'active']).optional().describe('handover: active = hand the thread to the AI; off = take it back.'),
        label: z.string().optional().describe('list: only conversations carrying this label (its name, e.g. "Urgent").'),
        label_ids: z.array(z.string()).optional().describe('label: the full set of labels for the thread, by NAME (replaces the current set). An unknown name is refused rather than skipped.'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
