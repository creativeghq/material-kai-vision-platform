/**
 * Revolut transaction sync core — shared by `revolut-sync` (cron) and the interactive
 * "Sync now" action in `revolut-api`, so both paths are ONE implementation.
 *
 * Silver-layer only: this upserts raw statement lines into `revolut_bank_transactions`
 * (deduped on workspace + "<txid>:<legid>"). It never touches `payments` — reconciliation
 * into the money tables is a separate, explicit step through the record-payment path.
 */

// deno-lint-ignore-file no-explicit-any

import {
  getRevolutAccessToken,
  issuerDomainFrom,
  listAccounts,
  listTransactions,
  revolutHosts,
  revolutJson,
  type RevolutConfigRow,
  type RevolutTransaction,
} from './client.ts';

export interface SyncResult {
  ok: boolean;
  workspaceId: string;
  fetched: number;
  upserted: number;
  /** Failed webhook deliveries Revolut reports for this workspace's subscription. */
  webhookFailures?: number;
  /** Reconciliation pass that ran after the pull (#315 phase 2). */
  autoMatched?: number;
  suggested?: number;
  error?: string;
}

/** Map one transaction leg to a `revolut_bank_transactions` row. */
export function legToRow(workspaceId: string, tx: RevolutTransaction, leg: RevolutTransaction['legs'][number], bankAccountByRevolutId: Map<string, string>) {
  return {
    workspace_id: workspaceId,
    bank_account_id: bankAccountByRevolutId.get(leg.account_id) ?? null,
    revolut_account_id: leg.account_id,
    provider_ref: `${tx.id}:${leg.leg_id}`,
    transaction_id: tx.id,
    leg_id: leg.leg_id,
    state: tx.state,
    type: tx.type,
    direction: leg.amount >= 0 ? 'in' : 'out',
    // MAJOR units, positive; direction carries the sign (record-payment convention).
    amount: Math.abs(leg.amount),
    currency: leg.currency,
    booked_at: tx.completed_at ?? tx.created_at,
    counterparty_name: tx.counterparty?.name ?? tx.merchant?.name ?? null,
    reference: tx.reference ?? leg.description ?? null,
    // Slim raw: enough to debug a mapping without persisting the whole payload per leg.
    raw: { id: tx.id, type: tx.type, state: tx.state, created_at: tx.created_at },
    updated_at: new Date().toISOString(),
  };
}

/**
 * Auto-provision a finance_bank_accounts row per active Revolut pocket (#315: connecting
 * a provider must never leave the user with a manual "add bank" step). Existing mappings
 * are respected; IBAN/BIC are filled best-effort from the account's bank details.
 */
export async function ensureRevolutBankAccounts(service: any, cfg: RevolutConfigRow): Promise<void> {
  const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');
  const accounts = await listAccounts(service, cfg, issuer);
  const mapping = await loadAccountMapping(service, cfg.workspace_id);
  for (const acc of accounts) {
    if (acc.state !== 'active' || mapping.has(acc.id)) continue;
    let iban: string | null = null;
    let bic: string | null = null;
    try {
      const details = await revolutJson<Array<{ iban?: string; bic?: string }>>(
        service, cfg, issuer, `/accounts/${acc.id}/bank-details`,
      );
      const d = (details ?? []).find((x) => x.iban) ?? (details ?? [])[0];
      iban = d?.iban ?? null;
      bic = d?.bic ?? null;
    } catch { /* pocket rows are still useful without bank details */ }
    const { error } = await service.from('finance_bank_accounts').insert({
      workspace_id: cfg.workspace_id,
      name: `Revolut ${acc.currency}`,
      kind: 'bank',
      currency: acc.currency,
      provider_slug: 'revolut',
      revolut_account_id: acc.id,
      iban,
      account_ref: bic,
      is_active: true,
      // The EUR pocket's IBAN goes straight onto invoices — customers can pay by plain
      // transfer and the feed reconciles it. Other currencies stay off by default
      // (toggleable in Settings → Bank accounts).
      show_on_invoice: !!iban && acc.currency === 'EUR',
      notes: 'Auto-created from the connected Revolut account.',
    });
    if (error && !/duplicate|unique/i.test(error.message ?? '')) {
      console.warn('[revolut-sync] pocket provisioning failed:', error.message);
    }
  }
}

/**
 * Card-spend alerts (#315 idea 5): emit ONE `card_spend_threshold` flow event per card
 * payment of ≥ €100 (hardcoded floor — flows can filter higher via the amount payload).
 * Called after both ingestion paths (webhook + sync); the stamp makes it idempotent.
 */
export async function notifyCardSpends(service: any, workspaceId: string): Promise<number> {
  const { data: rows } = await service
    .from('revolut_bank_transactions')
    .select('id, amount, currency, counterparty_name, reference, booked_at')
    .eq('workspace_id', workspaceId)
    .eq('type', 'card_payment')
    .eq('direction', 'out')
    .gte('amount', 100)
    .is('spend_notified_at', null)
    .gte('booked_at', new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
    .limit(50);
  if (!rows?.length) return 0;

  const { data: owner } = await service
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!owner?.user_id) return 0;

  const { emitFlowEvent } = await import('../flow-events.ts');
  let sent = 0;
  for (const tx of rows as any[]) {
    await emitFlowEvent('card_spend_threshold', {
      user_id: owner.user_id,
      type: 'card_spend_threshold',
      title: 'Large card spend',
      body: `${String(tx.currency).toUpperCase()} ${Number(tx.amount).toFixed(2)} at ${tx.counterparty_name ?? tx.reference ?? 'unknown merchant'}.`,
      action_url: '/finance?tab=settings&section=banks',
      workspace_id: workspaceId,
      amount: Number(tx.amount),
      currency: String(tx.currency).toUpperCase(),
      merchant: tx.counterparty_name ?? null,
    }).catch((err: unknown) => console.warn('[revolut/cards] spend emit failed:', err instanceof Error ? err.message : err));
    await service.from('revolut_bank_transactions')
      .update({ spend_notified_at: new Date().toISOString() })
      .eq('id', tx.id);
    sent++;
  }
  return sent;
}

/** The workspace's revolut_account_id → finance_bank_accounts.id mapping. */
export async function loadAccountMapping(service: any, workspaceId: string): Promise<Map<string, string>> {
  const { data } = await service
    .from('finance_bank_accounts')
    .select('id, revolut_account_id')
    .eq('workspace_id', workspaceId)
    .not('revolut_account_id', 'is', null);
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.revolut_account_id as string, row.id as string);
  return map;
}

/**
 * Pull transactions since the watermark (first run: 365 days back) and upsert.
 * Explicit failure marker: `last_sync_error` on the config row; never a silent zero.
 */
export async function syncWorkspaceRevolut(service: any, cfg: RevolutConfigRow): Promise<SyncResult> {
  const workspaceId = cfg.workspace_id;
  try {
    if (!cfg.refresh_token) throw new Error('not connected (no refresh token)');
    if (!cfg.oauth_redirect_uri) throw new Error('missing oauth_redirect_uri — re-run setup');
    const issuer = issuerDomainFrom(cfg.oauth_redirect_uri);

    // 1-hour overlap so a transaction created moments before the last pull isn't skipped.
    const from = cfg.sync_watermark
      ? new Date(new Date(cfg.sync_watermark).getTime() - 3600_000).toISOString()
      : new Date(Date.now() - 365 * 24 * 3600_000).toISOString();

    // Provision pocket rows before loading the mapping so first-sync lines land against
    // real bank accounts instead of null. Tolerant: a provisioning fault must not block
    // the pull.
    try { await ensureRevolutBankAccounts(service, cfg); } catch (err) {
      console.warn('[revolut-sync] ensure accounts failed:', err instanceof Error ? err.message : err);
    }
    const mapping = await loadAccountMapping(service, workspaceId);

    // Newest-first pages; walk backwards via `to` until a short page or the cap.
    const all: RevolutTransaction[] = [];
    let to: string | undefined;
    for (let page = 0; page < 20; page++) {
      const batch = await listTransactions(service, cfg, issuer, { from, to, count: 500 });
      all.push(...batch);
      if (batch.length < 500) break;
      to = batch[batch.length - 1].created_at;
    }

    const rows = all.flatMap((tx) => (tx.legs ?? []).map((leg) => legToRow(workspaceId, tx, leg, mapping)));
    let upserted = 0;
    // Chunked upserts; onConflict updates state so pending → completed transitions land.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await service
        .from('revolut_bank_transactions')
        .upsert(chunk, { onConflict: 'workspace_id,provider_ref' });
      if (error) throw new Error(`upsert failed: ${error.message}`);
      upserted += chunk.length;
    }

    // Webhook-failure visibility (#315 scope pt 5): ask Revolut which deliveries failed.
    // The sync that just ran IS the heal (it re-pulled everything the webhook missed);
    // the count is surfaced so the ops probe can alert on chronic failure.
    let webhookFailures = 0;
    if (cfg.webhook_id) {
      try {
        const v2 = revolutHosts(cfg.environment).api.replace('/api/1.0', '/api/2.0');
        const token = await getRevolutAccessToken(service, cfg, issuer);
        const res = await fetch(`${v2}/webhooks/${cfg.webhook_id}/failed-events?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const events = await res.json();
          webhookFailures = Array.isArray(events) ? events.length : 0;
          if (webhookFailures > 0) {
            console.warn(`[revolut-sync] ${workspaceId}: ${webhookFailures} failed webhook deliveries reported`);
          }
        }
      } catch { /* visibility only — never fail the sync over it */ }
    }

    const maxCreated = all.reduce(
      (acc, tx) => (tx.created_at > acc ? tx.created_at : acc),
      cfg.sync_watermark ?? from,
    );
    await service
      .from('workspace_revolut_config')
      .update({
        sync_watermark: maxCreated,
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('workspace_id', workspaceId);

    // Match what just landed. A matcher fault must not fail the sync — the rows are
    // safely persisted and the next pass (or a manual reconcile) retries.
    let autoMatched = 0, suggested = 0;
    try {
      const { reconcileWorkspaceRevolut, reconcileOutgoingRevolut } = await import('./reconcile.ts');
      const rec = await reconcileWorkspaceRevolut(service, workspaceId);
      autoMatched = rec.autoMatched;
      suggested = rec.suggested;
      if (rec.errors.length) console.warn(`[revolut-sync] ${workspaceId} reconcile errors:`, rec.errors.slice(0, 3));
      const outRec = await reconcileOutgoingRevolut(service, workspaceId);
      autoMatched += outRec.settled;
      if (outRec.errors.length) console.warn(`[revolut-sync] ${workspaceId} outgoing errors:`, outRec.errors.slice(0, 3));
    } catch (err) {
      console.warn('[revolut-sync] reconcile pass failed:', err instanceof Error ? err.message : err);
    }
    try { await notifyCardSpends(service, workspaceId); } catch { /* alerts never block the pull */ }

    return { ok: true, workspaceId, fetched: all.length, upserted, webhookFailures, autoMatched, suggested };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service
      .from('workspace_revolut_config')
      .update({ last_sync_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId);
    return { ok: false, workspaceId, fetched: 0, upserted: 0, error: msg };
  }
}
