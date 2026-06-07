/**
 * #206 — inbound myDATA poller. Pulls documents OTHER businesses issued to us via the
 * myDATA `RequestDocs` REST endpoint (per-tenant AADE creds: aade-user-id +
 * Ocp-Apim-Subscription-Key), upserts them into `inbound_documents`, and advances the
 * per-workspace MARK watermark. No-ops cleanly when creds aren't configured yet, so it
 * can be scheduled now and "switches on" the moment the operator pastes credentials.
 *
 * Cron: invoke with header `x-cron-secret: <CRON_SECRET>`.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { authenticate } from '../_shared/auth.ts';
import { pickTag, pickAllTagBlocks } from '../_shared/aade/soap.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const num = (s: string | null) => (s != null && s !== '' ? Number(s) : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Auth: cron secret OR a signed-in finance manager (the "Sync now" button).
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  const cronOk = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  if (!cronOk) {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
    if (!auth.success) return json({ error: 'unauthorized' }, 401);
  }

  const defaultBase = (await resolveSecret(supabase, 'AADE_MYDATA_BASE_URL')).value || 'https://mydatapi.aade.gr/myDATA';

  // Every workspace that configured its own myDATA received-docs credentials.
  const { data: creds } = await supabase
    .from('workspace_inbound_credentials')
    .select('workspace_id, aade_user_id, subscription_key, base_url, enabled')
    .eq('enabled', true)
    .not('aade_user_id', 'is', null)
    .not('subscription_key', 'is', null);

  if (!creds || creds.length === 0) {
    return json({ ok: true, skipped: 'no_configured_workspaces' });
  }

  const summary: any[] = [];
  for (const c of creds) {
    const workspaceId = c.workspace_id as string;
    const baseUrl = c.base_url || defaultBase;
    const { data: fs } = await supabase.from('finance_settings').select('inbound_last_mark').eq('workspace_id', workspaceId).maybeSingle();
    const watermark = fs?.inbound_last_mark || '0';

    let xml: string;
    try {
      const res = await fetch(`${baseUrl}/RequestDocs?mark=${encodeURIComponent(watermark)}`, {
        headers: { 'aade-user-id': c.aade_user_id, 'Ocp-Apim-Subscription-Key': c.subscription_key },
      });
      xml = await res.text();
      if (!res.ok) { summary.push({ workspaceId, error: `RequestDocs ${res.status}` }); continue; }
    } catch (err) {
      summary.push({ workspaceId, error: String(err) });
      continue;
    }

    const blocks = pickAllTagBlocks(xml, 'invoice');
    let maxMark = watermark;
    let upserted = 0;
    for (const b of blocks) {
      const mark = pickTag(b, 'mark');
      if (!mark) continue;
      const issuerBlock = pickTag(b, 'issuer') ?? '';
      const headerB = pickTag(b, 'invoiceHeader') ?? b;
      const summaryB = pickTag(b, 'invoiceSummary') ?? b;
      const row = {
        workspace_id: workspaceId,
        mark,
        issuer_vat: pickTag(issuerBlock, 'vatNumber'),
        issuer_name: pickTag(issuerBlock, 'name'),
        issue_date: pickTag(headerB, 'issueDate'),
        doc_type: pickTag(headerB, 'invoiceType'),
        total_net: num(pickTag(summaryB, 'totalNetValue')),
        total_vat: num(pickTag(summaryB, 'totalVatAmount')),
        total_gross: num(pickTag(summaryB, 'totalGrossValue')),
        raw: { xml: b.slice(0, 20000) },
      };
      const { error } = await supabase.from('inbound_documents').upsert(row, { onConflict: 'workspace_id,mark', ignoreDuplicates: true });
      if (!error) upserted++;
      if (Number(mark) > Number(maxMark)) maxMark = mark;
    }
    if (maxMark !== watermark) {
      await supabase.from('finance_settings').update({ inbound_last_mark: maxMark }).eq('workspace_id', workspaceId);
    }
    summary.push({ workspaceId, found: blocks.length, upserted, new_watermark: maxMark });
  }

  return json({ ok: true, workspaces: summary.length, results: summary });
});
