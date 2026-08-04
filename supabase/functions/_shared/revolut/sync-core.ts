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
  listTransactions,
  revolutHosts,
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

    return { ok: true, workspaceId, fetched: all.length, upserted, webhookFailures };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await service
      .from('workspace_revolut_config')
      .update({ last_sync_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId);
    return { ok: false, workspaceId, fetched: 0, upserted: 0, error: msg };
  }
}
