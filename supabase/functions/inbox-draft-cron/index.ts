// inbox-draft-cron — the half of "Draft with AI" that made it a queue instead of a button.
//
// The button only ever helps with the reply you were already writing: a member has to open the
// thread and press it. This drafts on arrival, so the operator opens the Inbox and finds a reply
// waiting on every conversation that is `agent_state = 'suggesting'`.

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

/** Small on purpose: each row is a model turn, and the runtime stops at 150s. */
const BATCH = 10;

interface ClaimedRow {
  thread_id: string;
  workspace_id: string | null;
  channel: string;
  subject: string | null;
  message_id: string;
}

/** Draft through inbox-api rather than by reaching for the model here — one brain, one caller. */
async function draft(threadId: string, messageId: string): Promise<{ ok: true; drafted: boolean } | { ok: false; error: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/inbox-api`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action: 'internal_draft_reply', thread_id: threadId, message_id: messageId }),
    });
    const text = await res.text();
    if (res.ok) {
      let drafted = false;
      try { drafted = !!(JSON.parse(text) as { drafted?: boolean }).drafted; } catch { /* raw */ }
      return { ok: true, drafted };
    }
    let detail = text;
    try { detail = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* raw */ }
    return { ok: false, error: `HTTP ${res.status}: ${String(detail).slice(0, 400)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(withApiLogging('inbox-draft-cron', async (req: Request) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  ) as DbClient;

  // The claim stamps the message id it is drafting for, in the same statement that selects the
  // row, so two overlapping runs cannot bill the same turn twice.
  const { data: claimed, error: claimErr } = await db.rpc('claim_due_inbox_drafts', { p_limit: BATCH });
  if (claimErr) {
    // Loud. A claim that cannot run means nothing is ever drafted, and the symptom — an empty
    // composer — is indistinguishable from nothing being due.
    return new Response(JSON.stringify({ success: false, error: claimErr.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (claimed || []) as ClaimedRow[];
  let drafted = 0, empty = 0, failed = 0;

  for (const row of rows) {
    const res = await draft(row.thread_id, row.message_id);
    if (!res.ok) {
      failed++;
      // The claim already happened, so leaving the row silent would strand it: the message id is
      // stamped and nothing would ever try again. Record the reason where the operator reads it.
      await db.from('inbox_threads')
        .update({ agent_draft_error: res.error.slice(0, 500) })
        .eq('id', row.thread_id)
        .eq('agent_draft_for_message_id', row.message_id);
      continue;
    }
    if (res.drafted) drafted++; else empty++;
  }

  return new Response(
    JSON.stringify({ success: true, claimed: rows.length, drafted, empty, failed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}));
