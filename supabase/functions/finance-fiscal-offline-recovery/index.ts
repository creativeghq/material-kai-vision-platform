/**
 * offline-MARK recovery. When AADE is down the connector accepts a document
 * "offline" and the final MARK is assigned later. This cron re-queries the connector for
 * any invoice / credit-note / delivery-note still in fiscal_status='offline' and stamps the
 * final MARK once available. Safe to schedule continuously; no-ops when there's nothing pending.
 *
 * An offline document has exactly three possible fates, and until #193/M6 this function
 * handled only the first:
 *   1. AADE accepts it late      → stamp the MARK, done.
 *   2. AADE REJECTS it late      → the document is dead: a legal series number is burned and the
 *                                  customer is holding a provisional PDF for a document that was
 *                                  refused. Previously this fell through the `if` and the row sat
 *                                  at 'offline' forever, re-queried every 15 minutes, with the
 *                                  invoice page still promising the MARK would "appear shortly".
 *   3. It never resolves at all  → same invisibility, no verdict to act on.
 * (2) and (3) now both end in a human being told, and (2) also refunds the transmission credits
 * — an immediate rejection is already free at issue time, so a late one must match or the price
 * of one filed document depends on whether AADE happened to be up when the operator clicked.
 * A rejection is only made terminal after a
 * grace period AND on a real provider error code, because a not-yet-transmitted document can
 * look like an error to `fetchTransmitted` — burning a live document on a transient blip would
 * be worse than waiting. Even then the flip is always accompanied by an alert, and the invoice
 * page's re-submit button remains the escape hatch.
 *
 * Cron: invoke with header `x-cron-secret: <CRON_SECRET>`.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { resolveWorkspaceConnector } from '../_shared/fiscal/registry.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

/** Don't call a document dead until it has been offline this long — a provider that simply
 *  hasn't transmitted yet must not be mistaken for AADE refusing the document. */
const REJECT_GRACE_HOURS = 6;
/** Offline this long with no verdict either way is itself the problem worth reporting. */
const STUCK_ALERT_HOURS = 24;
/** Re-alert cadence for a document that stays stuck after the first alert. */
const REALERT_HOURS = 24;
/** Our own synthetic codes from `interpret()` — these mean "we couldn't tell", NOT "AADE said no". */
const INDETERMINATE_ERROR_CODES = new Set(['Unknown', 'HttpError', 'TechnicalError']);

const hoursSince = (iso: string | null | undefined): number =>
  iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;

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

  const results: Record<string, number> = {
    invoices_checked: 0, invoices_recovered: 0,
    credit_notes_checked: 0, credit_notes_recovered: 0,
    delivery_notes_checked: 0, delivery_notes_recovered: 0,
    rejected_late: 0, stuck_alerted: 0, credits_refunded: 0,
  };
  // Cache one connector per workspace across the batch.
  const connByWs = new Map<string, any>();
  const getConn = async (wsId: string) => {
    if (connByWs.has(wsId)) return connByWs.get(wsId);
    const r = await resolveWorkspaceConnector(supabase, wsId, 'legal_invoice');
    const c = r.ok ? r.resolved : null;
    connByWs.set(wsId, c);
    return c;
  };

  type DocTable = 'invoices' | 'credit_notes' | 'delivery_notes';

  /**
   * Give back the transmission credits for a document AADE refused on delayed transmission.
   *
   * At issue time the debit is kept for anything `accepted` OR `offline`, and refunded for
   * everything else — so an IMMEDIATE rejection is free while a rejection that surfaced hours
   * later cost the tenant 2 credits. Same outcome, same tenant behaviour, and the only
   * discriminator is whether AADE happened to be down at the moment they clicked, which the
   * tenant can neither see nor influence. Worse, they fix the cause and re-issue for another 2,
   * so one filed document costs 4. The rule is "you pay when it lands on AADE", and this is the
   * half of it that was missing.
   *
   * Finds the original debit by the document key stamped on its metadata by
   * finance-issue-invoice. Idempotency is the `fiscal_credits_refunded_at` stamp on the document
   * rather than a probe for an existing refund row, because the two wallets record refunds in
   * two different tables with two different metadata shapes — a guard written against one would
   * silently miss the other and pay out twice. Root workspaces transmit free and have no debit
   * to find, which falls out of the lookup returning nothing.
   */
  const refundLateRejection = async (table: DocTable, r: any, docLabel: string) => {
    if (r.fiscal_credits_refunded_at) return false; // a previous tick already did this
    const docKeys = { einvoice_document_table: table, einvoice_document_id: r.id };

    // The debit landed in ONE of two tables depending on which wallet paid, and the two store
    // the operation type and the caller metadata differently. Check the pool first (that is what
    // `debit_credits` tries first), then the personal wallet.
    let userId: string | null = null;
    let amount = 0;
    let wallet: 'pool' | 'personal' = 'personal';
    let workspaceId: string | null = null;

    const { data: poolDebit } = await supabase
      .from('workspace_credit_transactions')
      .select('actor_user_id, amount, workspace_id')
      .eq('transaction_type', 'debit')
      .eq('operation_type', 'einvoice_transmission')
      .contains('metadata', docKeys)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (poolDebit) {
      userId = poolDebit.actor_user_id;
      amount = Math.abs(Number(poolDebit.amount));
      wallet = 'pool';
      workspaceId = poolDebit.workspace_id;
    } else {
      const { data: personalDebit } = await supabase
        .from('credit_transactions')
        .select('user_id, amount')
        .eq('transaction_type', 'debit')
        // credit_transactions nests as {operation_type, metadata:{…caller metadata…}}
        .contains('metadata', { operation_type: 'einvoice_transmission', metadata: docKeys })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (personalDebit) {
        userId = personalDebit.user_id;
        amount = Math.abs(Number(personalDebit.amount));
      }
    }

    // No debit found: operator root transmits free, or the document pre-dates the metadata
    // stamp. Nothing owed either way.
    if (!userId || !(amount > 0)) return false;

    const { error: rErr } = await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: 'einvoice_transmission_refund',
      p_description: `Refund — ${docLabel} (AADE refused it on delayed transmission)`,
      p_metadata: { ...docKeys, reason: 'late_rejection' },
      p_workspace_id: workspaceId,
      // Return it to the wallet that actually paid rather than letting refund_credits
      // re-derive: pool membership can have changed since the debit.
      p_wallet: wallet,
    });
    if (rErr) {
      // A failed refund is always in the PLATFORM's favour, never the tenant's — log loudly for
      // manual reconciliation rather than failing the sweep and leaving the document unresolved.
      console.error('[fiscal-offline-recovery] late-rejection refund FAILED — manual reconciliation needed', { table, docId: r.id, rErr });
      return false;
    }
    await supabase.from(table)
      .update({ fiscal_credits_refunded_at: new Date().toISOString() })
      .eq('id', r.id);
    return true;
  };

  /** Tell the workspace's finance-capable members that a legal document needs a human.
   *  Stamped onto the row so the 15-minute cron doesn't re-send every tick. */
  const alertDocument = async (
    table: DocTable, r: any, docLabel: string, title: string, body: string, reason: 'rejected' | 'stuck_offline',
    detail: string | null,
  ) => {
    // Deliberately does NOT touch updated_at: a document with no fiscal_submitted_at ages from
    // updated_at, so stamping it here would reset the very clock that decided to alert.
    const { error: stampError } = await supabase.from(table)
      .update({ fiscal_error: detail, fiscal_alerted_at: new Date().toISOString() })
      .eq('id', r.id);
    // Stamp FIRST and only notify if it stuck: a notification we can't record is a
    // notification we will send again in 15 minutes, forever.
    if (stampError) {
      console.error(`[fiscal-offline-recovery] ${table} ${r.id} could not record the alert stamp — not notifying:`, stampError.message);
      return;
    }
    await emitFlowEventToWorkspaceRoles(
      r.workspace_id, ['owner', 'admin', 'accountant'], 'fiscal_document_rejected',
      (uid) => ({
        type: 'fiscal_document_rejected',
        user_id: uid,
        title,
        body,
        action_url: table === 'invoices' ? `/admin/finance/invoices/${r.id}` : '/admin/finance?tab=documents',
        reason,
        document_table: table,
        document_id: r.id,
        document_label: docLabel,
        workspace_id: r.workspace_id,
        error_detail: detail ?? '',
      }),
    );
  };

  const recover = async (
    table: DocTable,
    rows: any[],
    aaOf: (r: any) => string,
    labelOf: (r: any) => string,
  ) => {
    for (const r of rows) {
      const conn = await getConn(r.workspace_id);
      if (!conn?.connector?.fetchTransmitted) continue;
      const { data: fs } = await supabase.from('finance_settings').select('business_vat').eq('workspace_id', r.workspace_id).maybeSingle();
      const docLabel = labelOf(r) || r.id;
      const offlineHours = hoursSince(r.fiscal_submitted_at ?? r.updated_at);
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
            .update({ fiscal_status: 'accepted', fiscal_mark: res.mark, fiscal_error: null, updated_at: new Date().toISOString() })
            .eq('id', r.id);
          if (markError) {
            console.error(`[fiscal-offline-recovery] ${table} ${r.id} accepted upstream but NOT marked locally:`, markError.message);
          } else if (table === 'invoices') results.invoices_recovered++;
          else if (table === 'credit_notes') results.credit_notes_recovered++;
          else results.delivery_notes_recovered++;
          continue;
        }

        // ── The document was REFUSED on delayed transmission (#193 / M6) ───────────────
        // Only terminal on a real provider verdict AND after the grace period: `interpret()`
        // funnels everything non-Success into 'rejected', so a document the provider simply
        // hasn't transmitted yet arrives here looking identical to a refusal.
        const definitiveRejection =
          res?.status === 'rejected'
          && !!res.errorCode
          && !INDETERMINATE_ERROR_CODES.has(String(res.errorCode))
          && offlineHours >= REJECT_GRACE_HOURS;

        if (definitiveRejection) {
          const detail = `${res.errorCode}: ${res.errorMessage ?? 'AADE refused the document on delayed transmission.'}`;
          // Flip FIRST, then record. The write is what takes the row out of the 'offline' query,
          // so doing it the other way round means a failing update re-inserts the same audit row
          // every 15 minutes. An audit row now implies the document really did move.
          const { error: rejError } = await supabase.from(table)
            .update({ fiscal_status: 'rejected', updated_at: new Date().toISOString() })
            .eq('id', r.id);
          if (rejError) {
            // Leave it offline rather than half-flipping — next tick retries the whole verdict.
            console.error(`[fiscal-offline-recovery] ${table} ${r.id} rejected upstream but NOT marked locally:`, rejError.message);
            continue;
          }
          // The verdict as its own attempt row — the audit log must show why the document
          // ended, not merely that it stopped being offline (pipeline convention 9).
          await supabase.from('fiscal_submissions').insert({
            workspace_id: r.workspace_id,
            invoice_id: table === 'invoices' ? r.id : null,
            connector_slug: conn.slug ?? 'novus',
            capability: 'legal_invoice',
            status: 'rejected',
            aa: aaOf(r),
            is_offline: false,
            transmission_failure: false,
            provider_credits: res.providerCredits ?? null,
            response_payload: res.raw ?? null,
            error_code: res.errorCode ?? null,
            error_message: res.errorMessage ?? null,
          });
          results.rejected_late++;
          // The document never landed, so the tenant should not have paid for it — an
          // IMMEDIATE rejection is already refunded at issue time and a late one must match.
          const refunded = await refundLateRejection(table, r, docLabel);
          if (refunded) results.credits_refunded++;
          await alertDocument(
            table, r, docLabel,
            `myDATA rejected ${docLabel}`,
            `AADE refused ${docLabel} on delayed transmission — ${detail}. The legal number is burned: void it and re-issue, or fix and re-transmit from the document page.`
              + (refunded ? ' The transmission credits have been refunded.' : ''),
            'rejected', detail,
          );
          continue;
        }

        // ── No verdict, and it has been offline far too long ───────────────────────────
        // The other half of the black hole: the provider never answers either way. Nothing
        // here is terminal — the document keeps being retried — but a human is told.
        if (offlineHours >= STUCK_ALERT_HOURS && hoursSince(r.fiscal_alerted_at) >= REALERT_HOURS) {
          const detail = res?.errorMessage
            ? `Still unresolved after ${Math.floor(offlineHours)}h. Last provider response: ${res.errorCode ?? res.status} — ${res.errorMessage}`
            : `Still unresolved after ${Math.floor(offlineHours)}h with no verdict from the provider.`;
          results.stuck_alerted++;
          await alertDocument(
            table, r, docLabel,
            `${docLabel} still not on myDATA`,
            `${docLabel} has been awaiting transmission for ${Math.floor(offlineHours)} hours. It holds a legal number but has no MARK. Check the provider portal before re-issuing.`,
            'stuck_offline', detail,
          );
        }
      } catch (e) {
        console.error(`[fiscal-offline-recovery] ${table} ${r.id} left offline, retried next tick:`, e);
      }
    }
  };

  const { data: invs } = await supabase.from('invoices')
    .select('id, workspace_id, fiscal_mark, legal_number, internal_number, fiscal_submitted_at, fiscal_alerted_at, fiscal_credits_refunded_at, updated_at')
    .eq('fiscal_status', 'offline').limit(50);
  results.invoices_checked = (invs ?? []).length;
  await recover('invoices', invs ?? [],
    (r) => String(r.legal_number ?? r.internal_number ?? ''),
    (r) => `Invoice ${r.legal_number ?? r.internal_number ?? ''}`.trim());

  const { data: cns } = await supabase.from('credit_notes')
    .select('id, workspace_id, fiscal_mark, credit_note_number, fiscal_submitted_at, fiscal_alerted_at, fiscal_credits_refunded_at, updated_at')
    .eq('fiscal_status', 'offline').limit(50);
  results.credit_notes_checked = (cns ?? []).length;
  await recover('credit_notes', cns ?? [],
    (r) => String(r.credit_note_number ?? ''),
    (r) => `Credit note ${r.credit_note_number ?? ''}`.trim());

  // Delivery notes (myDATA 9.3) go offline exactly like invoices and were never swept here at
  // all — an offline movement document simply never got its MARK. Same treatment.
  const { data: dns } = await supabase.from('delivery_notes')
    .select('id, workspace_id, fiscal_mark, delivery_note_number, fiscal_submitted_at, fiscal_alerted_at, fiscal_credits_refunded_at, updated_at')
    .eq('fiscal_status', 'offline').limit(50);
  results.delivery_notes_checked = (dns ?? []).length;
  await recover('delivery_notes', dns ?? [],
    (r) => String(r.delivery_note_number ?? ''),
    (r) => `Delivery note ${r.delivery_note_number ?? ''}`.trim());

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

  // ── Platform provider-credit pool (#193) ──────────────────────────────────────
  // Every submission records the provider's remaining credit balance and, until now, nothing
  // read it back. This pool is the OPERATOR's single master key: when it empties, every tenant
  // stops invoicing simultaneously — the tenant-side out-of-credits block does nothing for it.
  //
  // Dedup is on the observation, not the clock: we stamp the exact submission row we alerted
  // for, so re-reading the same latest row on the next tick stays quiet. A later submission
  // that is merely still-low is not a new event either — only crossing the next tier DOWN
  // speaks up again, which is what makes this safe to run every 15 minutes.
  {
    results.credits_alerted = 0;
    const { data: readings } = await supabase.from('fiscal_submissions')
      .select('id, provider_credits, credits_alerted_at, connector_slug')
      .not('provider_credits', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2);
    const latest = readings?.[0];
    const previous = readings?.[1];

    if (latest && !latest.credits_alerted_at) {
      const configured = (await resolveSecret(supabase, 'FISCAL_PROVIDER_CREDIT_TIERS')).value;
      const tiers = (configured ?? '100,50,20,5')
        .split(',').map((t: string) => Number(t.trim()))
        .filter((n: number) => Number.isFinite(n) && n > 0)
        .sort((a: number, b: number) => b - a);

      const balance = Number(latest.provider_credits);
      // Highest tier this reading has fallen to or below.
      const tier = tiers.find((t: number) => balance <= t);
      // A downward CROSSING — the previous reading was still above this tier. No previous
      // reading at all (the very first transmission) counts as a crossing so a pool that is
      // already low on day one is not silently accepted.
      const crossed = tier != null && (previous?.provider_credits == null || Number(previous.provider_credits) > tier);

      if (crossed) {
        const { data: root } = await supabase.from('workspaces').select('id').eq('is_root', true).limit(1).maybeSingle();
        const { error: stampError } = await supabase.from('fiscal_submissions')
          .update({ credits_alerted_at: new Date().toISOString() }).eq('id', latest.id);
        if (stampError) {
          console.error('[fiscal-offline-recovery] could not stamp the credit alert — not notifying:', stampError.message);
        } else if (root?.id) {
          results.credits_alerted = 1;
          await emitFlowEventToWorkspaceRoles(
            root.id, ['owner', 'admin'], 'fiscal_credits_low',
            (uid) => ({
              type: 'fiscal_credits_low',
              user_id: uid,
              title: `myDATA provider credits low — ${balance} left`,
              body: `The platform's ${latest.connector_slug ?? 'fiscal'} provider pool has fallen to ${balance} credits (alert tier ${tier}). Every tenant's e-invoicing stops when it reaches zero. Top up the provider account.`,
              action_url: '/admin/finance?tab=settings',
              workspace_id: root.id,
              connector_slug: latest.connector_slug ?? 'novus',
              balance,
              tier,
            }),
          );
        } else {
          console.error('[fiscal-offline-recovery] provider credits low but no root workspace to notify');
        }
      }
    }
  }

  return json({ ok: true, ...results });
}));
