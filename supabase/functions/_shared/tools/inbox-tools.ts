/**
 * Inbox Tools — agent-chat surface for the multi-tenant customer Inbox.
 *
 * ONE tool, actions:
 *   - list     — recent customer conversations (optionally by status)
 *   - reply    — send a reply into a conversation (CONFIRM-gated: it's a real customer-facing message)
 *   - status   — set a thread open/snoozed/closed
 *   - handover — hand a thread to the AI assistant (agent_state=active) or take it back (off)
 *   - label    — set the thread's labels
 *
 * `reply` is a customer-facing send → confirm-gated (Approve/Decline). Everything runs through the
 * validated inbox-api as the user (JWT) — its directional ACL/scope applies. Module `inbox` +
 * entitlement gated.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'inbox';

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

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
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : String(parsed)?.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

export const createManageInboxTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, status, thread_id, body, internal_note, confirm, agent_state, label_ids }) => {
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

      // Set the labels on a thread — e.g. "label this urgent". Replaces the current label set.
      if (action === 'label') {
        if (!thread_id) return JSON.stringify({ success: false, error: 'label needs thread_id and label_ids[].' });
        const r = await callInbox('set_thread_labels', { thread_id, label_ids: Array.isArray(label_ids) ? label_ids : [] }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        return JSON.stringify({ success: true, thread_id, label_ids: label_ids ?? [] });
      }

      if (action === 'list') {
        const r = await callInbox('list_threads', status ? { status } : {}, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `inbox-api ${r.status}` });
        const threads = r.data?.threads ?? [];
        onChunk?.({ type: 'inbox_threads_list', workspace_id: workspaceId, threads, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: threads.length, threads: threads.slice(0, 15) });
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
        'Customer Inbox: list conversations, reply, set status (close/reopen/snooze), hand a thread '
        + 'to/from the AI assistant, or set its labels. A customer-facing reply ALWAYS asks the user to '
        + 'Approve/Decline first (never set confirm:true yourself). Use internal_note:true for a private '
        + 'team note (not sent to the customer, no confirmation).',
      schema: z.object({
        action: z.enum(['list', 'reply', 'status', 'handover', 'label']).default('list'),
        status: z.string().optional().describe('list: filter by thread status. status action: open|snoozed|closed.'),
        thread_id: z.string().optional().describe('the conversation id (reply/status/handover/label).'),
        body: z.string().optional().describe('reply: the message text.'),
        internal_note: z.boolean().optional().describe('reply: post as a private internal note instead of a customer-facing message (no confirmation).'),
        agent_state: z.enum(['off', 'active']).optional().describe('handover: active = hand the thread to the AI; off = take it back.'),
        label_ids: z.array(z.string()).optional().describe('label: the full set of label ids for the thread (replaces the current set).'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
