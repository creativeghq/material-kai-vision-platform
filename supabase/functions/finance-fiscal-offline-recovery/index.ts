/**
 * offline-MARK recovery. When AADE is down the connector accepts a document
 * "offline" and the final MARK is assigned later. This cron re-queries the connector for
 * any invoice/credit-note still in fiscal_status='offline' and stamps the final MARK once
 * available. Safe to schedule continuously; no-ops when there's nothing pending.
 *
 * Cron: invoke with header `x-cron-secret: <CRON_SECRET>`.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { resolveWorkspaceConnector } from '../_shared/fiscal/registry.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(withApiLogging('finance-fiscal-offline-recovery', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Fail closed: this mutates legally-binding myDATA records across tenants, so an
  // unset CRON_SECRET must REJECT rather than skip the check.
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'unauthorized' }, 401);

  const results: Record<string, number> = { invoices_checked: 0, invoices_recovered: 0, credit_notes_checked: 0, credit_notes_recovered: 0 };
  // Cache one connector per workspace across the batch.
  const connByWs = new Map<string, any>();
  const getConn = async (wsId: string) => {
    if (connByWs.has(wsId)) return connByWs.get(wsId);
    const r = await resolveWorkspaceConnector(supabase, wsId, 'legal_invoice');
    const c = r.ok ? r.resolved : null;
    connByWs.set(wsId, c);
    return c;
  };

  const recover = async (
    table: 'invoices' | 'credit_notes',
    rows: any[],
    aaOf: (r: any) => string,
  ) => {
    for (const r of rows) {
      const conn = await getConn(r.workspace_id);
      if (!conn?.connector?.fetchTransmitted) continue;
      const { data: fs } = await supabase.from('finance_settings').select('business_vat').eq('workspace_id', r.workspace_id).maybeSingle();
      try {
        const res = await conn.connector.fetchTransmitted(
          { invoiceMark: r.fiscal_mark ?? undefined, aa: aaOf(r), issuerVatNumber: fs?.business_vat ?? undefined },
          conn.ctx,
        );
        if (res?.status === 'accepted' && res.mark) {
          // The counter must follow the WRITE, not the fetch. supabase-js resolves on error
          // instead of throwing, so the old `await update(); results.recovered++` incremented
          // even when the update failed — the cron reported N documents recovered while N rows
          // were still sitting at fiscal_status='offline', and the next tick re-fetched them.
          const { error: markError } = await supabase.from(table)
            .update({ fiscal_status: 'accepted', fiscal_mark: res.mark, updated_at: new Date().toISOString() })
            .eq('id', r.id);
          if (markError) {
            console.error(`[fiscal-offline-recovery] ${table} ${r.id} accepted upstream but NOT marked locally:`, markError.message);
          } else if (table === 'invoices') results.invoices_recovered++;
          else results.credit_notes_recovered++;
        }
      } catch (e) {
        console.error(`[fiscal-offline-recovery] ${table} ${r.id} left offline, retried next tick:`, e);
      }
    }
  };

  const { data: invs } = await supabase.from('invoices')
    .select('id, workspace_id, fiscal_mark, legal_number, internal_number')
    .eq('fiscal_status', 'offline').limit(50);
  results.invoices_checked = (invs ?? []).length;
  await recover('invoices', invs ?? [], (r) => String(r.legal_number ?? r.internal_number ?? ''));

  const { data: cns } = await supabase.from('credit_notes')
    .select('id, workspace_id, fiscal_mark, credit_note_number')
    .eq('fiscal_status', 'offline').limit(50);
  results.credit_notes_checked = (cns ?? []).length;
  await recover('credit_notes', cns ?? [], (r) => String(r.credit_note_number ?? ''));

  // ── Missing payment receipts (safety net for the Stripe webhook) ───────────────
  // Online payments generate their receipt in a post-response background task, which
  // gives immediacy but not durability: if the worker dies mid-task the receipt is lost
  // with no retry. Sweep any recent CARD payment that still has no receipt PDF and mint it.
  // Scoped to stripe_payment_intent_id IS NOT NULL on purpose: a MANUALLY recorded payment
  // may legitimately have no receipt because the user un-ticked "Send receipt to customer",
  // and silently generating one would override that choice.
  {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: missing } = await supabase.from('payments')
      .select('id')
      .eq('direction', 'in')
      .not('stripe_payment_intent_id', 'is', null)
      .is('pdf_storage_path', null)
      .gte('created_at', since)
      .limit(25);
    results.receipts_missing = (missing ?? []).length;
    results.receipts_generated = 0;
    for (const p of missing ?? []) {
      try {
        // finance-invoice-pdf is idempotent — it returns the cached PDF if one already exists.
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/finance-invoice-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
          body: JSON.stringify({ payment_id: (p as any).id }),
        });
        if (res.ok) results.receipts_generated++;
        else console.error(`receipt sweep failed (${res.status}) for payment ${(p as any).id}`);
      } catch (err) {
        console.error('receipt sweep threw', err); // retried next tick
      }
    }
  }

  return json({ ok: true, ...results });
}));
