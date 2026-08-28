// deno-lint-ignore-file no-explicit-any
/**
 * Viva.com webhook receiver (multi-tenant BYOK).
 *
 * SECURITY MODEL — read this before changing anything here.
 *
 * Viva's payment webhooks (1796/1797/1798/2054) carry **no per-message signature**. The
 * verification-key handshake authenticates US TO VIVA at registration time; it does not
 * authenticate an individual delivery. `Viva-Signature-256` exists only on Viva's Data
 * Services contract, which has a shared `secret` to key the HMAC — payment webhooks have
 * none, so there is nothing to verify against.
 *
 * We therefore satisfy security invariant #6 differently, and more strongly:
 *
 *   THE WEBHOOK IS A TRIGGER, NEVER DATA.
 *
 * Nothing in the POST body is trusted for money. We take only the transaction id from it,
 * then re-read the transaction from Viva's API with the tenant's own credentials and
 * trust ONLY that response's orderCode / statusId / amount. A forged POST therefore buys
 * an attacker nothing: either the transaction doesn't exist, or it does and is genuinely
 * paid. Viva's own documentation mandates this read-back.
 *
 * Defence in depth on top of that:
 *   - the tenant is resolved from EventData.MerchantId against workspace_viva_config —
 *     an unknown merchant is dropped, so this endpoint cannot be used to poke at
 *     arbitrary workspaces;
 *   - the invoice is resolved from OUR invoice_payment_intents row, never from a
 *     body-supplied invoice id (BOLA, invariant #1);
 *   - ingestion is idempotent on (provider, provider_ref) = ('viva', TransactionId),
 *     which matters because Viva retries 24 times, hourly, until it gets a 2xx.
 *
 * GET on this URL returns the verification key, which is what Viva's dashboard requires
 * before it will accept the URL. There is no API to register merchant webhooks, so each
 * tenant does that step by hand — see the setup card in Finance → Settings → Payments.
 */

import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { recordInvoicePayment } from '../_shared/payments/record-payment.ts';
import { retrieveVivaOrder, retrieveVivaTransaction, VIVA_ORDER_STATE, vivaHosts } from '../_shared/payments/viva-provider.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import type { PaymentProviderContext } from '../_shared/payments/types.ts';

/** Viva event type ids we act on. */
const EVENT_PAYMENT_CREATED = 1796;
const EVENT_REVERSAL_CREATED = 1797;
const EVENT_PAYMENT_FAILED = 1798;
const EVENT_ACCOUNT_TRANSACTION = 2054; // merchant-level: covers incoming bank transfers (RF)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const supabase = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

/**
 * Pull OrderCode out of the RAW body before JSON.parse can truncate it.
 * Viva's OrderCode is a 16-digit int64 — beyond Number.MAX_SAFE_INTEGER.
 */
function rawOrderCode(rawBody: string): string | null {
  const m = rawBody.match(/"OrderCode"\s*:\s*"?(\d+)"?/);
  return m ? m[1] : null;
}

/** Build a provider context from a tenant's stored BYOK credentials. */
function ctxFromConfig(cfg: any): PaymentProviderContext {
  return {
    workspaceId: cfg.workspace_id,
    credentials: {
      client_id: cfg.client_id ?? '',
      client_secret: cfg.client_secret ?? '',
      merchant_id: cfg.merchant_id ?? '',
      api_key: cfg.api_key ?? '',
      source_code: cfg.source_code ?? 'Default',
    },
    isSandbox: (cfg.environment ?? 'demo') !== 'production',
  };
}

Deno.serve(withApiLogging('viva-webhooks', async (req) => {
  await bootstrapForFunction();
  const db = supabase();

  // ─── Verification-key handshake ──────────────────────────────────────────
  // Viva GETs this URL and expects {"Key": "..."} before it will save the webhook.
  // The key is per-merchant, so we need to know WHICH tenant is verifying: they pass
  // ?workspace_id=... (the setup card builds this URL for them).
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    if (!workspaceId) {
      return json({ error: 'workspace_id query parameter is required' }, 400);
    }

    const { data: cfg } = await db
      .from('workspace_viva_config')
      .select('workspace_id, merchant_id, api_key, environment, webhook_key')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!cfg?.merchant_id || !cfg?.api_key) {
      // Fail closed — never invent a key.
      return json({ error: 'Viva is not configured for this workspace', code: 'viva_not_configured' }, 503);
    }

    // Merchant-level token fetch is BASIC auth with merchant_id:api_key (NOT the
    // Smart Checkout OAuth pair) and lives on the www./demo. host.
    const hosts = vivaHosts((cfg.environment ?? 'demo') !== 'production');
    let payload: unknown = null;
    try {
      const res = await fetch(`${hosts.www}/api/messages/config/token`, {
        headers: {
          Authorization: `Basic ${btoa(`${cfg.merchant_id}:${cfg.api_key}`)}`,
          // Viva is behind Akamai bot management; an unidentified client is likelier to
          // be challenged. Name ourselves rather than arriving anonymous.
          'User-Agent': 'MaterialsHub/1.0 (+https://app.materialshub.gr)',
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[viva-webhooks] key fetch failed', res.status, body.slice(0, 200));
      } else {
        payload = await res.json();
        const fetched = (payload as Record<string, unknown> | null)?.Key
          ?? (payload as Record<string, unknown> | null)?.key;
        if (typeof fetched === 'string' && fetched) {
          await db
            .from('workspace_viva_config')
            .update({ webhook_key: fetched, webhook_key_fetched_at: new Date().toISOString() })
            .eq('workspace_id', workspaceId);
        }
      }
    } catch (err) {
      console.error('[viva-webhooks] key fetch threw', err);
    }

    // Fall back to the last key Viva issued us. Their endpoint sits behind Akamai and
    // intermittently refuses us (observed 2026-08-20: three verifications passed, the
    // fourth 502'd, and it was healthy two minutes later). Failing the handshake tells
    // the tenant "URL not verified", pointing them at the one thing that was never wrong.
    // The key is per-merchant and stable, so the cached copy is the same answer.
    if (payload === null && cfg.webhook_key) {
      console.warn('[viva-webhooks] serving cached verification key for', workspaceId);
      payload = { Key: cfg.webhook_key };
    }
    if (payload === null) {
      // Never fetched one — nothing to echo, so fail closed rather than invent.
      return json({ error: 'could not fetch the verification key from Viva' }, 502);
    }

    // Stamp the registration here, not on the first delivery.
    // This GET *is* Viva's "Verify" step: their dashboard calls it while the merchant
    // registers the URL, so answering it correctly is the proof that registration
    // happened. Waiting for a real POST instead would deadlock setup — the switch that
    // lets a tenant offer Viva requires webhook_verified_at, a delivery only follows a
    // payment, and a payment needs the switch on.
    await db
      .from('workspace_viva_config')
      .update({ webhook_verified_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .is('webhook_verified_at', null);

    // Echo Viva's own casing back rather than hardcoding it — merchant docs show
    // {"Key":...} while the ISV schema shows {"key":...}.
    return json(payload);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ─── Event delivery ──────────────────────────────────────────────────────
  const rawBody = await req.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const eventTypeId = Number(event?.EventTypeId ?? 0);
  const data = event?.EventData ?? {};
  const messageId = String(event?.MessageId ?? '');

  // Resolve the TENANT from the merchant id. Unknown merchant → drop (and say so
  // blandly): this endpoint must not become a probe for which workspaces exist.
  //
  // ORDER MATTERS: this runs BEFORE the actionable filter, so that a delivery we ignore
  // is still RECORDED. The whole diagnostic value is seeing that 4865 (Order Updated —
  // a cancellation notice) arrives while 1796 never does, which is the shape of a tenant
  // who picked the wrong event type in Viva's dropdown. Filter first and the one symptom
  // of that mistake is thrown away unseen.
  const merchantId = String(data?.MerchantId ?? '');
  if (!merchantId) {
    console.warn('[viva-webhooks] delivery without MerchantId', messageId);
    return json({ ok: true, ignored: true, reason: 'no merchant id' });
  }

  const { data: cfg } = await db
    .from('workspace_viva_config')
    .select('workspace_id, client_id, client_secret, merchant_id, api_key, source_code, environment')
    .eq('merchant_id', merchantId)
    .maybeSingle();

  if (!cfg) {
    console.warn('[viva-webhooks] delivery for unknown merchant', merchantId);
    return json({ ok: true, ignored: true });
  }

  // Delivery health, for the setup card. Diagnostic ONLY — nothing about settlement reads
  // it, so a forged POST buys an attacker a wrong number on a panel and nothing else.
  // Atomic in SQL: Viva retries hourly x24, so concurrent deliveries are routine and a
  // read-modify-write here would drop counts.
  await db.rpc('record_viva_webhook_delivery', {
    p_workspace_id: cfg.workspace_id,
    p_event_type_id: eventTypeId,
  }).then(({ error }: { error: unknown }) => {
    if (error) console.warn('[viva-webhooks] delivery record failed', error);
  });

  // Proof the tenant completed the manual dashboard registration — this is the only
  // signal we get, since Viva has no API to register merchant webhooks.
  await db
    .from('workspace_viva_config')
    .update({ webhook_verified_at: new Date().toISOString() })
    .eq('workspace_id', cfg.workspace_id)
    .is('webhook_verified_at', null);

  // Only act on the events that move money. Everything else is acknowledged so Viva
  // stops retrying (24 attempts, hourly, until a 2xx).
  const actionable = [
    EVENT_PAYMENT_CREATED,
    EVENT_REVERSAL_CREATED,
    EVENT_PAYMENT_FAILED,
    EVENT_ACCOUNT_TRANSACTION,
  ].includes(eventTypeId);
  if (!actionable) {
    return json({ ok: true, ignored: true, event_type_id: eventTypeId });
  }

  /**
   * ONE DELIVERY, ONE PROCESSING (#360 CB-9).
   *
   * Viva retries 24 times, hourly, until it gets a 2xx, and these payment webhooks carry no
   * per-message signature — so a replay is indistinguishable from a new notification. The card
   * path was covered by accident (`recordInvoicePayment` is idempotent on the TransactionId);
   * the reversal path had nothing, so a refund raised its alarm on every one of those retries,
   * and the 2054 account-transaction path re-polled every pending order each time.
   *
   * The claim IS the row. A duplicate key means somebody already has this delivery.
   */
  if (messageId) {
    const { error: claimErr } = await db.from('payment_webhook_events').insert({
      provider: 'viva',
      event_id: messageId,
      workspace_id: cfg.workspace_id,
      event_type: String(eventTypeId),
      status: 'processing',
    });
    if (claimErr) {
      if (!/duplicate|unique/i.test(claimErr.message ?? '')) {
        // We could not record that we are about to move money. Let Viva retry rather than act
        // without an audit row.
        return json({ error: 'could not claim the delivery' }, 500);
      }
      /**
       * A duplicate is only a REPLAY when the first attempt finished.
       *
       * This is the trap in the obvious version of this fix: if any duplicate short-circuits,
       * then a delivery that failed and answered 500 is claimed forever — and Viva's retry, the
       * very thing meant to recover it, gets acknowledged as "already processed". The failure
       * becomes permanent BECAUSE of the dedupe.
       *
       * So: `done` short-circuits; `processing` or `failed` is taken over and retried.
       */
      const { data: prior } = await db.from('payment_webhook_events')
        .select('status').eq('provider', 'viva').eq('event_id', messageId).maybeSingle();
      if ((prior as { status?: string } | null)?.status === 'done') {
        return json({ ok: true, ignored: true, reason: 'already processed' });
      }
      await db.from('payment_webhook_events')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('provider', 'viva').eq('event_id', messageId);
    }
  }

  /** Settle the claim, so a row stuck at `processing` is a run that died mid-way. */
  const settleDelivery = async (status: 'done' | 'failed', detail?: unknown) => {
    if (!messageId) return;
    await db.from('payment_webhook_events')
      .update({ status, detail: detail ?? null, updated_at: new Date().toISOString() })
      .eq('provider', 'viva').eq('event_id', messageId);
  };

  const ctx = ctxFromConfig(cfg);

  // Failures are informational only — nothing to reverse, and the customer may retry
  // (a later success fires 1796 normally).
  if (eventTypeId === EVENT_PAYMENT_FAILED) {
    const oc = rawOrderCode(rawBody);
    if (oc) {
      await db
        .from('invoice_payment_intents')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('provider', 'viva')
        .eq('provider_order_code', oc);
    }
    await settleDelivery('done', { outcome: 'payment_failed' });
    return json({ ok: true, recorded: false, outcome: 'failed' });
  }

  // Reversals: the money went back. We do NOT silently un-allocate — that would
  // rewrite settled books from an unsigned message. Flag it loudly for a human and
  // let the finance module's credit-note flow do the reversal properly.
  if (eventTypeId === EVENT_REVERSAL_CREATED) {
    const parentId = String(data?.ParentId ?? '');
    console.error(
      `[viva-webhooks] REVERSAL for merchant ${merchantId}, original transaction ${parentId}, amount ${data?.Amount} — needs a credit note`,
    );
    // The intent update is REMOVED, not repointed. It filtered on
    // `provider_order_code = rawOrderCode(rawBody)` — the REVERSAL message's own order code,
    // not the original payment's — and matched `''` whenever that returned null, so it hit
    // the wrong row or none at all.
    // There is also no correct row to repoint it at: the reversal carries only `ParentId`
    // (the original TransactionId) while intents are keyed by `provider_order_code`, and
    // `invoice_payment_intents` has no provider_ref column to join on. Cancelling would be
    // wrong regardless — the intent was genuinely fulfilled; the money came back afterwards.
    // Reversing settled books is the credit note's job.
    let paymentRow: { id: string; workspace_id: string | null } | null = null;
    if (parentId) {
      const { data: pay } = await db
        .from('payments')
        .select('id, workspace_id')
        .eq('provider', 'viva')
        .eq('provider_ref', parentId)
        .maybeSingle();
      paymentRow = (pay as { id: string; workspace_id: string | null } | null) ?? null;
    }
    // RF payments carry provider_ref 'viva-rf-<orderCode>', so the ParentId lookup
    // misses them and the flag had no recipient (audit L2). Fall back to the reversal
    // message's own order code when present.
    if (!paymentRow) {
      const revOrderCode = rawOrderCode(rawBody);
      if (revOrderCode) {
        const { data: rfPay } = await db
          .from('payments')
          .select('id, workspace_id')
          .eq('provider', 'viva')
          .eq('provider_ref', `viva-rf-${revOrderCode}`)
          .maybeSingle();
        paymentRow = (rfPay as { id: string; workspace_id: string | null } | null) ?? null;
      }
    }

    // "Flag it loudly for a human" was only ever a console.error — which reaches no human.
    // Emit the same payment_reversed event the Stripe path now emits, so the seeded default
    // flow puts it in front of the workspace's owners and admins.
    const amount = Number(data?.Amount ?? 0);
    const wsId = paymentRow?.workspace_id ?? null;
    const payload = {
      type: 'payment_reversed',
      reversal_kind: 'refund' as const,
      workspace_id: wsId,
      payment_id: paymentRow?.id ?? null,
      provider: 'viva',
      parent_transaction_id: parentId || null,
      amount: `${amount.toFixed(2)} EUR`,
      currency: 'EUR',
      title: `Refund received — ${amount.toFixed(2)} EUR`,
      body: 'Viva reversed a payment. The original payment is still allocated, so the invoice still reads as paid — issue a credit note to reverse it.',
      action_url: '/finance?tab=doc_payments',
    };
    /**
     * THE REVERSAL GOES IN THE BOOKS, NOT JUST IN A NOTIFICATION (#360 CB-7).
     *
     * Everything this branch did was announce: a console.error and a flow event, both of which
     * are `.catch(() => {})`. So money that LEFT the account left no durable trace at all — the
     * invoice still reads as paid (correct: reversing settled books from an unsigned message is
     * the credit note's job), but there was nothing to reconcile the credit note against, and
     * nothing at all if the notification failed to deliver.
     *
     * It lands in the bank feed as money OUT, unmatched, which is what it is. A person places it
     * against the credit note they raise.
     */
    if (wsId) {
      const feed = await upsertVivaFeedRow(db, wsId, {
        ref: `viva-reversal-${parentId || rawOrderCode(rawBody) || messageId}`,
        type: 'refund',
        direction: 'out',
        amount,
        currency: 'EUR',
        reference: parentId
          ? `Reversal of Viva transaction ${parentId}`
          : 'Viva reversal — original transaction not identified',
        matchedInvoiceId: null,
        paymentId: null,
      });
      if (!feed.ok) {
        // Refuse the acknowledgement: Viva retries, and a reversal nobody recorded is a hole in
        // the books that no later process can find.
        await settleDelivery('failed', { reason: 'reversal_not_recorded', parent_transaction_id: parentId });
        return json({ error: 'could not record the reversal' }, 500);
      }
    }

    if (wsId) {
      await emitFlowEventToWorkspaceRoles(wsId, ['owner', 'admin'], 'payment_reversed',
        (recipientUserId) => ({ ...payload, user_id: recipientUserId })).catch(() => {});
    } else {
      await emitFlowEvent('payment_reversed', payload).catch(() => {});
    }
    await settleDelivery('done', { outcome: 'reversal_recorded', parent_transaction_id: parentId });
    return json({ ok: true, recorded: true, outcome: 'reversal_recorded' });
  }

  // ─── RF / bank transfer settled (Account Transaction Created, 2054) ───────
  // A bank transfer produces NO card TransactionId, so the card read-back below cannot
  // apply. Instead this event just means "money moved on this merchant's wallet" — the
  // trigger to re-check any RF orders we're waiting on. We resolve each by polling the
  // ORDER state (StateId === 3 = Paid), which is keyed on the orderCode we already hold.
  if (eventTypeId === EVENT_ACCOUNT_TRANSACTION) {
    const rf = await settlePendingRfOrders(db, cfg, ctx);
    // Only a 2xx is "handled". A 500 leaves the claim takeable, so Viva's retry actually retries.
    await settleDelivery(rf.status < 300 ? 'done' : 'failed', { outcome: 'rf_sweep', status: rf.status });
    return rf;
  }

  // ─── Card payment succeeded (1796) ────────────────────────────────────────
  const transactionId = String(data?.TransactionId ?? '');
  if (!transactionId) {
    console.warn('[viva-webhooks] payment event without TransactionId', messageId);
    return json({ ok: true, ignored: true });
  }

  // *** THE SECURITY BOUNDARY ***
  // Re-read from Viva with the tenant's own credentials. Everything below uses the
  // authoritative response, never the POST body.
  let tx: Awaited<ReturnType<typeof retrieveVivaTransaction>>;
  try {
    tx = await retrieveVivaTransaction(transactionId, ctx);
  } catch (err) {
    // Non-2xx → Viva retries. Better a retry than recording an unverified payment.
    console.error('[viva-webhooks] read-back failed', transactionId, err);
    await settleDelivery('failed', { reason: 'read_back_failed' });
    return json({ error: 'could not verify the transaction with Viva' }, 502);
  }

  // 'F' Finished / 'C' Captured are the settled states.
  if (tx.statusId !== 'F' && tx.statusId !== 'C') {
    await settleDelivery('done', { outcome: 'not_settled', status_id: tx.statusId });
    return json({ ok: true, recorded: false, status_id: tx.statusId });
  }

  const orderCode = tx.orderCode ?? rawOrderCode(rawBody);
  if (!orderCode) {
    console.error('[viva-webhooks] no orderCode on verified transaction', transactionId);
    await settleDelivery('done', { outcome: 'no_order_code' });
    return json({ ok: true, ignored: true });
  }

  // Resolve OUR invoice from OUR intent row — never from anything Viva sent us.
  const { data: intent } = await db
    .from('invoice_payment_intents')
    .select('id, invoice_id, workspace_id, method, currency, amount')
    .eq('provider', 'viva')
    .eq('provider_order_code', orderCode)
    .maybeSingle();

  if (!intent) {
    /**
     * MONEY WE CANNOT PLACE IS STILL MONEY (#360 CB-5).
     *
     * This returned 200 `ignored`, and Viva stops retrying on a 2xx — so a verified, captured
     * card payment whose intent row is missing was collected and never recorded anywhere. The
     * intent row can genuinely be absent: #351 FE-2 found its insert is unchecked, so the
     * mapping may never have been written for a payment the customer completed.
     *
     * It goes into the bank feed as UNMATCHED money in. That is durable, visible, and
     * reconcilable by hand. Only if we cannot even do that do we refuse the acknowledgement, so
     * Viva keeps retrying rather than the payment vanishing.
     */
    console.warn(`[viva-webhooks] no intent for orderCode ${orderCode} (merchant ${merchantId}) — recording as unmatched`);
    const feed = await upsertVivaFeedRow(db, cfg.workspace_id, {
      ref: `viva-tx-${transactionId}`,
      type: 'card_payment',
      direction: 'in',
      amount: tx.amount,
      // No intent means no stored currency. Viva's `currencyCode` is the ISO 4217 NUMERIC
      // code ("978"), which is not what the feed stores — so the workspace's own default is
      // the honest answer, and the reference line says the amount is unplaced.
      currency: await workspaceDefaultCurrency(db, cfg.workspace_id),
      reference: `Order ${orderCode} — no matching invoice`,
      matchedInvoiceId: null,
      paymentId: null,
    });
    if (!feed.ok) {
      await settleDelivery('failed', { reason: 'unmatched_receipt_not_recorded', order_code: orderCode });
      return json({ error: 'could not record the unmatched receipt' }, 500);
    }
    await settleDelivery('done', { outcome: 'unmatched_receipt', order_code: orderCode });
    return json({ ok: true, recorded: false, outcome: 'unmatched_receipt' });
  }

  // Cross-tenant guard: the intent must belong to the same workspace the merchant maps to.
  if (intent.workspace_id !== cfg.workspace_id) {
    console.error(
      `[viva-webhooks] merchant ${merchantId} (ws ${cfg.workspace_id}) referenced an intent in ws ${intent.workspace_id} — refusing`,
    );
    return json({ ok: true, ignored: true }, 200);
  }

  /**
   * THE AMOUNT MUST BE THE AMOUNT WE ASKED FOR (#360 CB-8).
   *
   * `recordInvoicePayment` was called with whatever the read-back reported, with nothing
   * comparing it to the intent. The read-back is trustworthy — it comes from Viva's API under the
   * tenant's own credentials — but "trustworthy" is not "expected": an order paid for a different
   * amount than the one we created settles an invoice it does not cover, and there is no second
   * check anywhere downstream.
   *
   * A mismatch is not settled and not thrown away: it lands in the feed as unmatched money for a
   * person to place. Compared in cents, because these are floats.
   */
  const expected = Number(intent.amount ?? 0);
  const paid = Number(tx.amount ?? 0);
  if (expected > 0 && Math.round(expected * 100) !== Math.round(paid * 100)) {
    console.error(
      `[viva-webhooks] amount mismatch on order ${orderCode}: expected ${expected}, paid ${paid} — not settling`,
    );
    const feed = await upsertVivaFeedRow(db, cfg.workspace_id, {
      ref: `viva-tx-${transactionId}`,
      type: 'card_payment',
      direction: 'in',
      amount: paid,
      currency: intent.currency,
      reference: `Order ${orderCode} — paid ${paid.toFixed(2)}, expected ${expected.toFixed(2)}`,
      matchedInvoiceId: null,
      paymentId: null,
    });
    if (!feed.ok) {
      await settleDelivery('failed', { reason: 'amount_mismatch_not_recorded', order_code: orderCode });
      return json({ error: 'could not record the mismatched receipt' }, 500);
    }
    await settleDelivery('done', { outcome: 'amount_mismatch', expected, paid, order_code: orderCode });
    return json({ ok: true, recorded: false, outcome: 'amount_mismatch' });
  }

  const res = await recordInvoicePayment(db, intent.invoice_id, {
    provider: 'viva',
    providerRef: transactionId,
    providerLabel: 'Viva',
    // Amount comes from the verified read-back, in MAJOR units.
    amount: tx.amount,
    // Currency comes from OUR intent, not Viva: their `currencyCode` is the ISO 4217
    // NUMERIC code ("978"), which is not what `payments.currency` stores.
    currency: intent.currency,
    method: intent.method === 'bank_reference' ? 'bank_transfer' : 'card',
  });

  if (!res.ok) {
    // Let Viva retry — the money is real and we failed to book it.
    await settleDelivery('failed', { reason: 'ingestion_failed', error: res.error });
    return json({ error: `ingestion failed: ${res.error}` }, 500);
  }

  await db
    .from('invoice_payment_intents')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', intent.id);

  // Unified bank feed (#315): show this settlement alongside Revolut/Stripe money.
  await upsertVivaFeedRow(db, cfg.workspace_id, {
    ref: `viva-tx-${transactionId}`,
    type: intent.method === 'bank_reference' ? 'bank_transfer' : 'card_payment',
    direction: 'in',
    amount: tx.amount,
    currency: intent.currency,
    reference: `Order ${orderCode}`,
    matchedInvoiceId: intent.invoice_id,
    paymentId: res.paymentId ?? null,
  });

  await settleDelivery('done', { outcome: 'settled', order_code: orderCode, payment_id: res.paymentId ?? null });
  return json({
    ok: true,
    recorded: !res.duplicate,
    duplicate: !!res.duplicate,
    payment_id: res.paymentId,
  });
}));

/**
 * Mirror a Viva wallet movement into the unified bank feed (informational — settlement
 * itself always happens above through record-payment; the feed row just makes Viva money
 * visible next to Revolut and Stripe). Best-effort: a feed failure never fails a webhook.
 */
/**
 * The workspace's own base currency, for money that arrived with no intent to name one.
 *
 * Viva's `currencyCode` is the ISO 4217 NUMERIC code ("978"), which is not what
 * `payments.currency` or the feed store — so it cannot simply be copied across.
 */
async function workspaceDefaultCurrency(db: any, workspaceId: string): Promise<string> {
  const { data } = await db
    .from('finance_settings')
    .select('base_currency')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return String((data as { base_currency?: string } | null)?.base_currency || 'EUR').toUpperCase();
}

async function upsertVivaFeedRow(db: any, workspaceId: string, row: {
  ref: string;
  type: string;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  counterparty?: string | null;
  reference?: string | null;
  matchedInvoiceId?: string | null;
  paymentId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: acct } = await db
      .from('finance_bank_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('provider_slug', 'viva')
      .eq('is_active', true)
      .maybeSingle();
    const { error } = await db.from('revolut_bank_transactions').upsert({
      workspace_id: workspaceId,
      provider: 'viva',
      provider_ref: row.ref,
      transaction_id: row.ref,
      revolut_account_id: 'viva-wallet',
      bank_account_id: acct?.id ?? null,
      state: 'completed',
      type: row.type,
      direction: row.direction,
      amount: row.amount,
      currency: row.currency,
      booked_at: new Date().toISOString(),
      counterparty_name: row.counterparty ?? null,
      reference: row.reference ?? null,
      // `ignored` HIDES a row from the review queue — right for a fee or a payout we never
      // expected to match, wrong for money that arrived and could not be placed (#360 CB-5).
      // Unmatched money must be visible to somebody.
      match_status: row.matchedInvoiceId ? 'matched' : 'unmatched',
      matched_invoice_id: row.matchedInvoiceId ?? null,
      reconciled_payment_id: row.paymentId ?? null,
      raw: { source: 'viva-webhook' },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,provider,provider_ref' });
    if (error) {
      console.warn('[viva-webhooks] feed upsert failed:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[viva-webhooks] feed upsert threw:', message);
    return { ok: false, error: message };
  }
}

/**
 * RF / bank-transfer settlement.
 *
 * Triggered by an `Account Transaction Created` (2054) event, which says only "the wallet
 * balance changed" — it does NOT identify an order. So for each of this workspace's
 * still-pending bank-reference intents we poll the ORDER state and book the ones Viva now
 * reports Paid (StateId === 3). Most 2054s (card settlements, fees, payouts) find no
 * pending RF intents and cost one cheap query.
 *
 * providerRef is `viva-rf-<orderCode>` — a bank transfer has no card TransactionId, and the
 * orderCode is the stable unique key for this settlement, so it gives us idempotency the
 * same way the card TransactionId does.
 *
 * SETTLEMENT IS STILL THE READ-BACK, not the webhook body: the money is only booked after
 * Viva's own order API confirms StateId === 3.
 */
async function settlePendingRfOrders(db: any, cfg: any, ctx: any): Promise<Response> {
  // Newest-first + capped: without an explicit order, 50 immortal stale intents could
  // nondeterministically starve the genuinely-fresh RF that was just paid (audit M1).
  // The daily payment-intents janitor cancels intents whose invoice is no longer
  // payable, keeping this window small.
  const { data: pending } = await db
    .from('invoice_payment_intents')
    .select('id, invoice_id, provider_order_code, currency, status')
    .eq('provider', 'viva')
    .eq('workspace_id', cfg.workspace_id)
    .eq('method', 'bank_reference')
    .eq('status', 'pending')
    .not('provider_order_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!pending || pending.length === 0) {
    return json({ ok: true, settled: 0, reason: 'no pending RF orders' });
  }

  let settled = 0;
  /** Anything that did not complete. A non-empty list means this delivery must NOT be acked. */
  const failures: string[] = [];
  for (const intent of pending) {
    let order;
    try {
      order = await retrieveVivaOrder(String(intent.provider_order_code), ctx);
    } catch (err) {
      // Viva was unreachable for this order. Not a settlement failure — the order may not even
      // be paid — but the sweep did not cover what it was asked to, so it must not report as if
      // it had (#360 CB-6).
      console.error('[viva-webhooks] RF order retrieve failed', intent.provider_order_code, err);
      failures.push(`${intent.provider_order_code}: retrieve failed`);
      continue;
    }
    if (order.stateId !== VIVA_ORDER_STATE.PAID) continue;

    const res = await recordInvoicePayment(db, intent.invoice_id, {
      provider: 'viva',
      providerRef: `viva-rf-${intent.provider_order_code}`,
      providerLabel: 'Viva',
      amount: order.amount, // MAJOR units from the order read-back
      currency: intent.currency,
      method: 'bank_transfer',
      notes: `Bank transfer (RF) via Viva — order ${intent.provider_order_code}`,
    });
    if (!res.ok) {
      // MONEY RECEIVED AND UNBOOKED. This `continue` plus the 200 below told Viva the event was
      // handled, and Viva stops retrying on a 2xx — so a failed ingestion was permanent.
      console.error('[viva-webhooks] RF ingestion failed', intent.provider_order_code, res.error);
      failures.push(`${intent.provider_order_code}: ${res.error}`);
      continue;
    }
    const feed = await upsertVivaFeedRow(db, cfg.workspace_id, {
      ref: `viva-rf-${intent.provider_order_code}`,
      type: 'bank_transfer',
      direction: 'in',
      amount: order.amount,
      currency: intent.currency,
      reference: `RF order ${intent.provider_order_code}`,
      matchedInvoiceId: intent.invoice_id,
      paymentId: res.paymentId ?? null,
    });
    if (!feed.ok) failures.push(`${intent.provider_order_code}: feed row not written`);
    const { error: intentErr } = await db
      .from('invoice_payment_intents')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', intent.id);
    if (intentErr) failures.push(`${intent.provider_order_code}: intent not marked paid`);
    settled += 1;
  }

  /**
   * A 200 tells Viva the delivery is done and it stops retrying (#360 CB-6).
   *
   * Every failure above used to `continue` into an unconditional 200, so an unreachable order
   * API or a failed ingestion was permanent: money received, never booked, no retry, no record.
   * Anything that did not complete now refuses the acknowledgement, and Viva's 24 hourly retries
   * become the recovery mechanism they are meant to be.
   */
  if (failures.length > 0) {
    return json({ error: `RF settlement incomplete: ${failures.join('; ')}`, settled }, 500);
  }
  return json({ ok: true, settled, checked: pending.length });
}
