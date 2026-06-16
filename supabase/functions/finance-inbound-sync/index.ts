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
import { authenticate, listUserWorkspaceIds } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { pickTag, pickAllTagBlocks } from '../_shared/aade/soap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { extractProductsFromLines } from '../_shared/finance/extract-products.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const num = (s: string | null) => (s != null && s !== '' ? Number(s) : null);

Deno.serve(withApiLogging('finance-inbound-sync', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Auth: cron secret OR a signed-in finance manager (the "Sync now" button).
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  const cronOk = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  // On the manual ("Sync now") path, restrict the all-workspace fan-out below to the
  // caller's own workspaces — without this, one tenant's finance user triggers (and reads
  // the results of) an inbound myDATA pull for EVERY workspace on the platform.
  let allowedWorkspaceIds: string[] | null = null;
  if (!cronOk) {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
    if (!auth.success) return json({ error: 'unauthorized' }, 401);
    allowedWorkspaceIds = await listUserWorkspaceIds(supabase, auth.userId);
    if (allowedWorkspaceIds.length === 0) return json({ ok: true, skipped: 'no_member_workspaces' });
  }

  const defaultBase = (await resolveSecret(supabase, 'AADE_MYDATA_BASE_URL')).value || 'https://mydatapi.aade.gr/myDATA';

  // Every workspace that configured its own myDATA received-docs credentials.
  let credsQuery = supabase
    .from('workspace_inbound_credentials')
    .select('workspace_id, aade_user_id, subscription_key, base_url, enabled')
    .eq('enabled', true)
    .not('aade_user_id', 'is', null)
    .not('subscription_key', 'is', null);
  // Manual path: only the caller's own workspaces. Cron path: all of them.
  if (allowedWorkspaceIds) credsQuery = credsQuery.in('workspace_id', allowedWorkspaceIds);
  const { data: creds } = await credsQuery;

  if (!creds || creds.length === 0) {
    return json({ ok: true, skipped: 'no_configured_workspaces' });
  }

  // Automated (cron) pulls are credit-metered per workspace; the manual "Sync now"
  // button (finance-manager JWT) is free. Root workspace is never billed.
  const INBOUND_SYNC_CREDIT_COST = 2;
  const wsIds = creds.map((c) => c.workspace_id);
  const { data: wsMeta } = await supabase.from('workspaces').select('id, created_by, is_root').in('id', wsIds);
  const metaById = new Map((wsMeta ?? []).map((w: any) => [w.id, w]));

  const summary: any[] = [];
  for (const c of creds) {
    const workspaceId = c.workspace_id as string;
    const baseUrl = c.base_url || defaultBase;

    // #212 — myDATA inbound is a Finance-module feature; skip workspaces that don't own it.
    // (Root passes via is_workspace_entitled; the configured-but-unentitled case is skipped,
    //  not errored, so one unentitled tenant can't fail the whole cron batch.)
    if (!(await isWorkspaceEntitled(supabase, workspaceId, 'sales-finance'))) {
      summary.push({ workspaceId, skipped: 'not_entitled' });
      continue;
    }

    // Pre-check credit balance on the automated path WITHOUT debiting yet — we only charge
    // for a sync that actually reached AADE, so a failed pull never burns the tenant's credits.
    const meta = metaById.get(workspaceId);
    const mustBill = cronOk && meta && !meta.is_root && !!meta.created_by;
    if (mustBill) {
      const { data: cr } = await supabase.from('user_credits').select('balance').eq('user_id', meta.created_by).maybeSingle();
      if ((cr?.balance ?? 0) < INBOUND_SYNC_CREDIT_COST) {
        summary.push({ workspaceId, skipped: 'insufficient_credits' });
        continue;
      }
    }

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

    // The pull succeeded — now charge (automated path only).
    if (mustBill) {
      const { data: debit, error: debitErr } = await supabase.rpc('debit_user_credits', {
        p_user_id: meta.created_by, p_amount: INBOUND_SYNC_CREDIT_COST,
        p_operation_type: 'mydata_inbound_sync',
        p_description: `Daily myDATA inbound pull (workspace ${workspaceId})`,
      });
      const row = Array.isArray(debit) ? debit[0] : debit;
      if (debitErr || (row && !row.success)) {
        summary.push({ workspaceId, skipped: 'insufficient_credits' });
        continue;
      }
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
      // Per-line detail (for warehouse intake). myDATA carries tax-level line data; an item
      // description is often absent, so the intake UI lets the operator map each line to a
      // warehouse item manually. lineNumber/quantity/net/vat are what AADE reliably returns.
      const lines = pickAllTagBlocks(b, 'invoiceDetails').map((lb) => ({
        line_number: num(pickTag(lb, 'lineNumber')),
        quantity: num(pickTag(lb, 'quantity')),
        net_value: num(pickTag(lb, 'netValue')),
        vat_amount: num(pickTag(lb, 'vatAmount')),
        item_description: pickTag(lb, 'itemDescr') ?? pickTag(lb, 'productDescription') ?? null,
      }));
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
        lines,
        raw: { xml: b.slice(0, 20000) },
      };
      const { error } = await supabase.from('inbound_documents').upsert(row, { onConflict: 'workspace_id,mark', ignoreDuplicates: true });
      if (!error) upserted++;
      if (Number(mark) > Number(maxMark)) maxMark = mark;
    }
    if (maxMark !== watermark) {
      await supabase.from('finance_settings').update({ inbound_last_mark: maxMark }).eq('workspace_id', workspaceId);
    }

    // ── Background AI product extraction → pending-products queue (credit-gated) ──
    // For each not-yet-extracted inbound doc with line detail, run the cheapest model to
    // turn raw supplier lines into clean products and queue them for the operator's ✓/✗.
    // Entitlement was already checked above; each doc costs EXTRACT_CREDIT_COST credits.
    let extracted = 0;
    try {
      const EXTRACT_CREDIT_COST = 1;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const { data: docs } = await supabase
        .from('inbound_documents')
        .select('id, currency, lines')
        .eq('workspace_id', workspaceId)
        .neq('status', 'dismissed')
        .order('created_at', { ascending: false })
        .limit(30);
      for (const d of (docs ?? []) as any[]) {
        const all = Array.isArray(d.lines) ? d.lines : [];
        const usable = all.filter((l: any) => String(l?.item_description ?? '').trim());
        if (usable.length === 0) continue;
        const { count } = await supabase.from('warehouse_pending_items')
          .select('id', { count: 'exact', head: true }).eq('inbound_document_id', d.id);
        if ((count ?? 0) > 0) continue; // already extracted

        const { data: debit } = await supabase.rpc('debit_user_credits', {
          p_user_id: meta?.created_by, p_amount: EXTRACT_CREDIT_COST,
          p_operation_type: 'expense_product_extraction',
          p_description: `AI product extraction (inbound doc ${d.id})`,
        });
        const drow = Array.isArray(debit) ? debit[0] : debit;
        if (!drow?.success) break; // out of credits — stop extracting for this workspace

        // Per-doc isolation: a single doc's extraction failure must (a) refund THAT
        // doc's credit and (b) not abort the whole batch (audit #217 H14). Previously
        // the catch was outside the loop → charged-but-not-delivered + lost intake.
        try {
          const suggestions = await extractProductsFromLines(
            usable.map((l: any, i: number) => ({ index: i, description: String(l.item_description), quantity: l.quantity ?? null })),
          );
          const byIdx = new Map(suggestions.map((s) => [s.index, s]));
          const pendingRows = usable.map((l: any, i: number) => {
            const s = byIdx.get(i);
            const qty = l.quantity != null && Number(l.quantity) > 0 ? Number(l.quantity) : 1;
            const unitCost = l.net_value != null ? r2(Number(l.net_value) / qty) : null;
            const name = s ? [s.name, s.size, s.attributes].filter((x) => x && String(x).trim()).join(' ').trim() : String(l.item_description);
            return {
              workspace_id: workspaceId, inbound_document_id: d.id, line_index: i,
              raw_description: String(l.item_description), name: name || 'Item',
              sku: s?.sku ?? null, unit: s?.unit ?? null, size: s?.size ?? null, attributes: s?.attributes ?? null,
              quantity: qty, unit_cost: unitCost, currency: d.currency ?? 'EUR',
            };
          });
          await supabase.from('warehouse_pending_items').upsert(pendingRows, { onConflict: 'inbound_document_id,line_index', ignoreDuplicates: true });
          extracted += pendingRows.length;
        } catch (docErr) {
          console.error('[inbound-sync] extraction failed for doc', d.id, String(docErr));
          // Refund the credit for this doc — nothing was queued.
          try {
            await supabase.rpc('credit_user_credits', {
              p_user_id: meta?.created_by, p_amount: EXTRACT_CREDIT_COST,
              p_operation_type: 'expense_product_extraction.refund',
              p_description: `Refund: extraction failed (inbound doc ${d.id})`,
            });
          } catch (refundErr) { console.error('[inbound-sync] refund failed (non-fatal)', String(refundErr)); }
          // continue with the next doc
        }
      }
    } catch (e) { console.error('[inbound-sync] product extraction failed', String(e)); }

    summary.push({ workspaceId, found: blocks.length, upserted, extracted, new_watermark: maxMark });
  }

  return json({ ok: true, workspaces: summary.length, results: summary });
}));
