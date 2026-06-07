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

  // Cron auth.
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  // Per-tenant myDATA received-docs credentials (distinct from the RgWsPublic2 VAT lookup).
  const userId = (await resolveSecret(supabase, 'AADE_MYDATA_USER_ID')).value;
  const subKey = (await resolveSecret(supabase, 'AADE_MYDATA_SUBSCRIPTION_KEY')).value;
  if (!userId || !subKey) {
    return json({ ok: true, skipped: 'not_configured', detail: 'AADE_MYDATA_USER_ID / AADE_MYDATA_SUBSCRIPTION_KEY not set' });
  }
  const baseUrl = (await resolveSecret(supabase, 'AADE_MYDATA_BASE_URL')).value
    || 'https://mydatapi.aade.gr/myDATA';

  // v1: pull for the root/operator workspace (per-workspace creds come with multi-tenant).
  const { data: ws } = await supabase.from('workspaces').select('id').eq('is_root', true).limit(1).maybeSingle();
  if (!ws) return json({ ok: true, skipped: 'no_root_workspace' });
  const workspaceId = ws.id as string;

  const { data: fs } = await supabase.from('finance_settings').select('inbound_last_mark').eq('workspace_id', workspaceId).maybeSingle();
  const watermark = fs?.inbound_last_mark || '0';

  let xml: string;
  try {
    const res = await fetch(`${baseUrl}/RequestDocs?mark=${encodeURIComponent(watermark)}`, {
      headers: { 'aade-user-id': userId, 'Ocp-Apim-Subscription-Key': subKey },
    });
    xml = await res.text();
    if (!res.ok) return json({ ok: false, error: `RequestDocs ${res.status}`, body: xml.slice(0, 500) }, 502);
  } catch (err) {
    return json({ ok: false, error: String(err) }, 502);
  }

  // Parse each invoice block → an inbound_documents row.
  const blocks = pickAllTagBlocks(xml, 'invoice');
  let maxMark = watermark;
  let upserted = 0;
  for (const b of blocks) {
    const mark = pickTag(b, 'mark');
    if (!mark) continue;
    const issuerBlock = pickTag(b, 'issuer') ?? '';
    const summary = pickTag(b, 'invoiceSummary') ?? b;
    const header = pickTag(b, 'invoiceHeader') ?? b;
    const totalGross = num(pickTag(summary, 'totalGrossValue'));
    const row = {
      workspace_id: workspaceId,
      mark,
      issuer_vat: pickTag(issuerBlock, 'vatNumber'),
      issuer_name: pickTag(issuerBlock, 'name'),
      issue_date: pickTag(header, 'issueDate'),
      doc_type: pickTag(header, 'invoiceType'),
      total_net: num(pickTag(summary, 'totalNetValue')),
      total_vat: num(pickTag(summary, 'totalVatAmount')),
      total_gross: totalGross,
      raw: { xml: b.slice(0, 20000) },
    };
    const { error } = await supabase.from('inbound_documents').upsert(row, { onConflict: 'workspace_id,mark', ignoreDuplicates: true });
    if (!error) upserted++;
    if (Number(mark) > Number(maxMark)) maxMark = mark;
  }

  if (maxMark !== watermark) {
    await supabase.from('finance_settings').update({ inbound_last_mark: maxMark }).eq('workspace_id', workspaceId);
  }

  return json({ ok: true, found: blocks.length, upserted, watermark, new_watermark: maxMark });
});
