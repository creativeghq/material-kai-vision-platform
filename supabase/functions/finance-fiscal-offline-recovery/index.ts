/**
 * offline-MARK recovery. When AADE is down the connector accepts a document
 * "offline" and the final MARK is assigned later. This cron re-queries the connector for
 * any invoice / credit-note / delivery-note still in fiscal_status='offline' and stamps the
 * final MARK once available. Safe to schedule continuously; no-ops when there's nothing pending.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { resolveWorkspaceConnector } from '../_shared/fiscal/registry.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import { normalizeVat } from '../_shared/crm/vatNormalize.generated.ts';

/** Don't call a document dead until it has been offline this long — a provider that simply
 *  hasn't transmitted yet must not be mistaken for AADE refusing the document. */
const REJECT_GRACE_HOURS = 6;
/** Offline this long with no verdict either way is itself the problem worth reporting. */
const STUCK_ALERT_HOURS = 24;
/** Re-alert cadence for a document that stays stuck after the first alert. */
const REALERT_HOURS = 24;
/** An unreachable-provider failure is retried this many times, spaced by RETRY_SPACING_MIN × attempt. */
const MAX_OUTAGE_RETRIES = 8;
const RETRY_SPACING_MIN = 10;
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
    outage_retried: 0, outage_alerted: 0,
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

  /** Give back the transmission credits for a document AADE refused on delayed transmission. */
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
        action_url: table === 'invoices' ? `/finance/invoices/${r.id}` : '/finance?tab=doc_credit_notes',
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
        // `uid` is what the Novus docs name for picking up the SECOND (MARKed) copy of a
        // document that came back Offline, and it is the only key an offline document reliably
        // has: it has no MARK yet, by definition. It was never sent.
        const res = await conn.connector.fetchTransmitted(
          {
            invoiceMark: r.fiscal_mark ?? undefined,
            uid: r.fiscal_uid ?? undefined,
            aa: aaOf(r),
            issuerVatNumber: normalizeVat(fs?.business_vat) ?? undefined,
          },
          conn.ctx,
        );
        if (res?.status === 'accepted' && res.mark) {
          // The counter must follow the WRITE, not the fetch. supabase-js resolves on error
          // instead of throwing, so the old `await update(); results.recovered++` incremented
          // even when the update failed — the cron reported N documents recovered while N rows
          // were still sitting at fiscal_status='offline', and the next tick re-fetched them.
          // The MARKed copy also carries the auth code and both links; a recovered document without
          // them prints no QR and no authentication code.
          const { error: markError } = await supabase.from(table)
            .update({
              fiscal_status: 'accepted', fiscal_mark: res.mark, fiscal_error: null,
              ...(res.uid ? { fiscal_uid: res.uid } : {}),
              ...(res.qrUrl ? { fiscal_qr_url: res.qrUrl } : {}),
              ...(res.aadeQrUrl ? { fiscal_aade_qr_url: res.aadeQrUrl } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.id);
          if (!markError) {
            const { error: subErr } = await supabase.from('fiscal_submissions').insert({
              workspace_id: r.workspace_id,
              invoice_id: table === 'invoices' ? r.id : null,
              document_table: table,
              document_id: r.id,
              connector_slug: conn.slug ?? 'novus',
              capability: 'legal_invoice',
              status: 'accepted',
              mark: res.mark,
              uid: res.uid ?? null,
              authentication_code: res.authenticationCode ?? null,
              qr_url: res.qrUrl ?? null,
              aade_qr_url: res.aadeQrUrl ?? null,
              invoice_url: res.invoiceUrl ?? null,
              aa: aaOf(r),
              is_offline: false,
              transmission_failure: false,
              response_payload: res.raw ?? null,
            });
            if (subErr) console.error(`[fiscal-offline-recovery] ${table} ${r.id} recovered, but its auth code was not recorded:`, subErr.message);
          }
          if (markError) {
            console.error(`[fiscal-offline-recovery] ${table} ${r.id} accepted upstream but NOT marked locally:`, markError.message);
          } else if (table === 'invoices') results.invoices_recovered++;
          else if (table === 'credit_notes') results.credit_notes_recovered++;
          else results.delivery_notes_recovered++;
          continue;
        }

        // ── The document was REFUSED on delayed transmission (#193 / M6) ───────────────
        // Only terminal on a real provider verdict AND after the grace period: a document the
        // provider simply hasn't transmitted yet must never look identical to a refusal.
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
            // Which document this verdict is ABOUT. `invoice_id` alone cannot say it for a credit
            // note or a delivery note, and the replay guard in finance-issue-invoice reads this pair.
            document_table: table,
            document_id: r.id,
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
    .select('id, workspace_id, fiscal_mark, fiscal_uid, legal_number, internal_number, fiscal_submitted_at, fiscal_alerted_at, fiscal_credits_refunded_at, updated_at')
    .eq('fiscal_status', 'offline').limit(50);
  results.invoices_checked = (invs ?? []).length;
  await recover('invoices', invs ?? [],
    (r) => String(r.legal_number ?? r.internal_number ?? ''),
    (r) => `Invoice ${r.legal_number ?? r.internal_number ?? ''}`.trim());

  const { data: cns } = await supabase.from('credit_notes')
    .select('id, workspace_id, fiscal_mark, fiscal_uid, credit_note_number, fiscal_submitted_at, fiscal_alerted_at, fiscal_credits_refunded_at, updated_at')
    .eq('fiscal_status', 'offline').limit(50);
  results.credit_notes_checked = (cns ?? []).length;
  await recover('credit_notes', cns ?? [],
    (r) => String(r.credit_note_number ?? ''),
    (r) => `Credit note ${r.credit_note_number ?? ''}`.trim());

  // Delivery notes (myDATA 9.3) go offline exactly like invoices and were never swept here at
  // all — an offline movement document simply never got its MARK. Same treatment.
  const { data: dns } = await supabase.from('delivery_notes')
    .select('id, workspace_id, fiscal_mark, fiscal_uid, delivery_note_number, fiscal_submitted_at, fiscal_alerted_at, fiscal_credits_refunded_at, updated_at')
    .eq('fiscal_status', 'offline').limit(50);
  results.delivery_notes_checked = (dns ?? []).length;
  await recover('delivery_notes', dns ?? [],
    (r) => String(r.delivery_note_number ?? ''),
    (r) => `Delivery note ${r.delivery_note_number ?? ''}`.trim());

  // ── Missing payment receipts (safety net for the Stripe webhook) ───────────────
  // Online payments generate their receipt in a post-response background task, which
  // gives immediacy but not durability: if the worker dies mid-task the receipt is lost
  // with no retry. Sweep any recent CARD payment that still has no receipt PDF and mint it.
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
  // The OPERATOR's single master key: when it empties, every tenant stops invoicing at once.
  // GetCreditsBalance is the balance; the per-document `credits` on a submission is a COST.
  {
    results.credits_alerted = 0;
    const { data: root } = await supabase.from('workspaces').select('id').eq('is_root', true).limit(1).maybeSingle();
    const conn = root?.id ? await getConn(root.id) : null;
    const reading = conn?.connector?.getCreditsBalance ? await conn.connector.getCreditsBalance(conn.ctx) : null;
    if (reading?.ok && reading.balance != null) {
      const slug = conn.slug ?? 'novus';
      const balance = Number(reading.balance);
      const { data: prev } = await supabase.from('fiscal_provider_balance')
        .select('balance, alerted_tier').eq('connector_slug', slug).maybeSingle();
      const configured = (await resolveSecret(supabase, 'FISCAL_PROVIDER_CREDIT_TIERS')).value;
      const tiers = (configured ?? '100,50,20,5')
        .split(',').map((t: string) => Number(t.trim()))
        .filter((n: number) => Number.isFinite(n) && n > 0)
        .sort((a: number, b: number) => a - b);
      // The LOWEST tier the balance is at or under: the most urgent line crossed.
      const tier = tiers.find((t: number) => balance <= t) ?? null;
      // A top-up past the last alerted tier re-arms it; only a FALL can alert.
      const prevTier = (prev as any)?.alerted_tier;
      const alertedTier = tier == null || (prevTier != null && tier > Number(prevTier)) ? null : prevTier ?? null;
      const falling = (prev as any)?.balance == null || balance < Number((prev as any).balance);
      const crossed = tier != null && falling && (alertedTier == null || tier < Number(alertedTier));
      const { error: balErr } = await supabase.from('fiscal_provider_balance').upsert({
        connector_slug: slug, balance, read_at: new Date().toISOString(),
        alerted_tier: crossed ? tier : alertedTier,
        ...(crossed ? { alerted_at: new Date().toISOString() } : {}),
      }, { onConflict: 'connector_slug' });
      if (balErr) console.error('[fiscal-offline-recovery] could not record the provider balance — not alerting:', balErr.message);
      if (crossed && root?.id && !balErr) {
        results.credits_alerted = 1;
        await emitFlowEventToWorkspaceRoles(
          root.id, ['owner', 'admin'], 'fiscal_credits_low',
          (uid) => ({
            type: 'fiscal_credits_low',
            user_id: uid,
            title: `myDATA provider credits low — ${balance} left`,
            body: `The platform's ${slug} provider pool has fallen to ${balance} credits (alert tier ${tier}). Every tenant's e-invoicing stops when it reaches zero. Top up the provider account.`,
            action_url: '/finance?tab=settings',
            workspace_id: root.id,
            connector_slug: slug,
            balance,
            tier,
          }),
        );
      }
    } else if (reading && !reading.ok) {
      console.error('[fiscal-offline-recovery] provider balance unreadable:', reading.errorMessage);
    }
  }

  // ── Provider unreachable at issue time: resend through the one transmission path ─────────
  // finance-issue-invoice looks the document up before resending, adopts a filed copy, adds
  // transmissionFailure=1 once the issue date has passed, and refuses past myDATA's one-day window.
  {
    const since = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
    const bodyFor: Record<DocTable, (id: string) => Record<string, unknown>> = {
      invoices: (id) => ({ invoice_id: id, submit_fiscal: true }),
      credit_notes: (id) => ({ credit_note_id: id, submit_fiscal: true }),
      delivery_notes: (id) => ({ delivery_note_id: id, submit_fiscal: true }),
    };
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    // A resend can take the provider's full timeout, so one per tick keeps the cron inside 150 s.
    let budget = 1;
    for (const table of ['invoices', 'credit_notes', 'delivery_notes'] as DocTable[]) {
      const { data: failed } = await supabase.from(table)
        .select('id, workspace_id, fiscal_alerted_at')
        .eq('fiscal_status', 'error').gte('updated_at', since).limit(25);
      for (const d of failed ?? []) {
        const { data: attempts } = await supabase.from('fiscal_submissions')
          .select('transmission_failure, created_at')
          .eq('document_table', table).eq('document_id', (d as any).id)
          .order('created_at', { ascending: false }).limit(MAX_OUTAGE_RETRIES + 1);
        const rows = (attempts ?? []) as { transmission_failure: boolean; created_at: string }[];
        if (!rows[0]?.transmission_failure) continue;
        const transient = rows.filter((a) => a.transmission_failure).length;
        const label = `${table === 'invoices' ? 'Invoice' : table === 'credit_notes' ? 'Credit note' : 'Delivery note'} ${(d as any).id}`;
        if (transient > MAX_OUTAGE_RETRIES) {
          if (hoursSince((d as any).fiscal_alerted_at) >= REALERT_HOURS) {
            results.outage_alerted++;
            await alertDocument(table, d, label, `${label} could not reach myDATA`,
              `The provider was unreachable on ${transient} attempts. The document holds a legal number but no MARK. Check the provider portal, then retransmit it from Finance → myDATA Transmissions.`,
              'stuck_offline', 'Provider unreachable on every retry.');
          }
          continue;
        }
        if ((Date.now() - new Date(rows[0].created_at).getTime()) / 60_000 < RETRY_SPACING_MIN * transient) continue;
        if (budget-- <= 0) continue;
        try {
          const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/finance-issue-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
            body: JSON.stringify(bodyFor[table]((d as any).id)),
            signal: AbortSignal.timeout(110_000),
          });
          if (res.ok) results.outage_retried++;
          else console.error(`[fiscal-offline-recovery] outage retry ${table} ${(d as any).id} → ${res.status}`);
        } catch (e) {
          console.error('[fiscal-offline-recovery] outage retry threw', table, (d as any).id, e);
        }
      }
    }
  }

  return json({ ok: true, ...results });
}));
