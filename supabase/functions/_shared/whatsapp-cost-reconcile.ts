/** Close the loop on the one cost this platform could not see. */
import { ensureZernioSecrets, zernioApi, ZernioApiError } from './zernio.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

/** Meta needs a real sample before its average means anything. */
const MIN_VOLUME_TO_TRUST = 25;

export interface ReconcileRow {
  country: string;
  category: string;
  volume: number;
  costUsd: number | null;
}

export interface ReconcileResult {
  wabaId: string;
  rows: ReconcileRow[];
  costAvailable: boolean;
  /** Rates rewritten from Meta's own figures. */
  ratesUpdated: number;
  error?: string;
}

/** Meta's pricing categories, lowercased onto ours. `service` is free and never billed. */
function normaliseCategory(raw: string | null | undefined): string | null {
  const c = (raw ?? '').toLowerCase();
  if (c === 'marketing' || c === 'utility' || c === 'authentication' || c === 'service') return c;
  return null;
}

/**
 * Read one WhatsApp number's actual spend through Zernio, which proxies Meta's `pricing_analytics`
 * with its own Meta app — so no Meta token of ours is involved. MONTHLY points over a window that
 * crosses a month boundary arrive as two rows per country × category, hence the merge.
 */
export async function fetchWhatsAppPricing(
  zernioAccountId: string,
  start: Date,
  end: Date,
): Promise<{ rows: ReconcileRow[]; costAvailable: boolean }> {
  const query = (metricTypes: string) => zernioApi('GET', `/whatsapp/pricing-analytics?${new URLSearchParams({
    accountId: zernioAccountId,
    start: start.toISOString(),
    end: end.toISOString(),
    granularity: 'MONTHLY',
    dimensions: 'COUNTRY,PRICING_CATEGORY',
    metricTypes,
  }).toString()}`);

  let json;
  try {
    json = await query('COST,VOLUME');
  } catch (err) {
    // Meta 2388184: COST is withheld from a partner-billed WABA and refuses the whole request.
    // Zernio relays it as "access has been revoked", which it is not — volume still reads.
    if (!(err instanceof ZernioApiError) || !err.bodyText.includes('2388184')) throw err;
    json = await query('VOLUME');
  }
  const points = (json?.dataPoints ?? []) as Array<{
    country: string | null; pricingCategory: string | null; volume: number | null; cost: number | null;
  }>;

  const merged = new Map<string, ReconcileRow>();
  for (const p of points) {
    const category = normaliseCategory(p.pricingCategory);
    if (!category) continue;
    const country = String(p.country ?? '*').toUpperCase();
    const key = `${country}|${category}`;
    const row = merged.get(key) ?? { country, category, volume: 0, costUsd: null };
    row.volume += Number(p.volume ?? 0);
    if (p.cost != null) row.costUsd = (row.costUsd ?? 0) + Number(p.cost);
    merged.set(key, row);
  }

  const rows = [...merged.values()];
  return { rows, costAvailable: rows.some((r) => (r.costUsd ?? 0) > 0) };
}

/**
 * Reconcile one WABA: read Meta's figures, store the comparison, and correct the rate table.
 *
 * Returns rather than throws, because this runs unattended on a cron — a thrown error there is a
 * red job nobody reads, where a returned reason lands in the result the operator is looking at.
 */
export async function reconcileWaba(
  supabase: SupabaseLike,
  params: { wabaId: string; zernioAccountId: string; workspaceId: string | null; periodStart: Date; periodEnd: Date },
): Promise<ReconcileResult> {
  let fetched: { rows: ReconcileRow[]; costAvailable: boolean };
  try {
    await ensureZernioSecrets(supabase);
    fetched = await fetchWhatsAppPricing(params.zernioAccountId, params.periodStart, params.periodEnd);
  } catch (err) {
    return {
      wabaId: params.wabaId, rows: [], costAvailable: false, ratesUpdated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const startIso = params.periodStart.toISOString().slice(0, 10);
  const endIso = params.periodEnd.toISOString().slice(0, 10);
  let ratesUpdated = 0;

  // What we charged in the same window — from our own ledger, so the comparison is
  // billed-vs-actual rather than billed-vs-assumption.
  const { data: billed } = await supabase
    .from('ai_usage_logs')
    .select('credits_debited, metadata')
    .eq('model_name', 'whatsapp-template')
    .gte('created_at', params.periodStart.toISOString())
    .lt('created_at', params.periodEnd.toISOString());
  const billedRows = (billed ?? []) as Array<{ credits_debited: number; metadata: Record<string, unknown> | null }>;

  for (const row of fetched.rows) {
    const mine = billedRows
      .filter((r) => (r.metadata?.rate_country ?? '*') === row.country && r.metadata?.rate_category === row.category);

    const { error: reconErr } = await supabase.from('whatsapp_cost_reconciliation').upsert({
      waba_id: params.wabaId,
      workspace_id: params.workspaceId,
      period_start: startIso,
      period_end: endIso,
      country_code: row.country,
      category: row.category,
      volume: row.volume,
      cost_usd: row.costUsd,
      // Absent, not zero: a WABA on a partner credit line reports no cost, and $0 would read as a free month.
      cost_available: row.costUsd != null,
      billed_messages: mine.length,
      billed_credits: mine.reduce((n, r) => n + Number(r.credits_debited ?? 0), 0),
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'waba_id,period_start,period_end,country_code,category' });
    if (reconErr) console.error('[wa-reconcile] upsert failed', row.country, row.category, reconErr);

    // Self-correct the rate, but only from a sample worth believing.
    if (row.costUsd != null && row.volume >= MIN_VOLUME_TO_TRUST) {
      const actualPerMessage = row.costUsd / row.volume;
      const { error: rateErr } = await supabase.from('whatsapp_template_rates').upsert({
        country_code: row.country,
        category: row.category,
        cost_per_message_usd: Number(actualPerMessage.toFixed(5)),
        source_note: `Derived from Meta pricing_analytics via Zernio — ${row.volume} messages, ${startIso}..${endIso}.`,
        last_verified_at: new Date().toISOString(),
        derived_from_actuals: true,
        observed_volume: row.volume,
        active: true,
      }, { onConflict: 'country_code,category' });
      if (rateErr) console.error('[wa-reconcile] rate update failed', row.country, row.category, rateErr);
      else ratesUpdated++;
    }
  }

  return {
    wabaId: params.wabaId,
    rows: fetched.rows,
    costAvailable: fetched.costAvailable,
    ratesUpdated,
    ...(fetched.rows.length === 0
      ? { error: 'Meta returned no pricing rows for this window — nothing billable was sent.' }
      : !fetched.costAvailable
        ? { error: 'Meta reported volume but withheld COST. This WABA is on a Solution Partner credit line, so the actual charge has to come from the partner invoice.' }
        : {}),
  };
}
