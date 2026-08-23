/**
 * Close the loop on the one cost this platform could not see.
 *
 * WhatsApp template messages are billed by Meta straight to the WABA. They never appear on
 * Zernio's invoice, so every figure in the product was priced off a seeded guess — and the guess
 * is what decides whether template resale runs at ~33% margin or at a loss.
 *
 * Meta exposes the answer itself: `GET /{WABA_ID}/pricing_analytics` returns COST and VOLUME by
 * country and pricing category. We already store the WABA id on the channel, so this reads the
 * real number back, writes it beside what we charged, and rewrites the rate table from it.
 *
 * Two things it refuses to smooth over:
 *  - Meta withholds COST for a WABA on a Solution Partner's credit line. That comes back as
 *    absent, not zero, and is recorded as `cost_available: false`. A zero-cost month and an
 *    unreported one look identical in a total and mean opposite things.
 *  - A rate is only rewritten from a meaningful sample. One delivered message in a country is an
 *    anecdote, and letting it overwrite the rate would make pricing lurch on noise.
 */
import { resolveSecret } from './secrets.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

const GRAPH_VERSION = 'v26.0';

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
function normaliseCategory(raw: string | undefined): string | null {
  const c = (raw ?? '').toLowerCase();
  if (c === 'marketing' || c === 'utility' || c === 'authentication' || c === 'service') return c;
  return null;
}

/**
 * Read one WABA's actual spend for a window.
 *
 * `dimensions` asks Meta to break the answer down; without them it returns one grand total, which
 * is useless for a rate table that is keyed on country and category.
 */
export async function fetchMetaPricing(
  token: string,
  wabaId: string,
  startMs: number,
  endMs: number,
): Promise<{ rows: ReconcileRow[]; costAvailable: boolean }> {
  const params = new URLSearchParams({
    start: String(Math.floor(startMs / 1000)),
    end: String(Math.floor(endMs / 1000)),
    granularity: 'MONTHLY',
    metric_types: JSON.stringify(['COST', 'VOLUME']),
    dimensions: JSON.stringify(['COUNTRY', 'PRICING_CATEGORY']),
    access_token: token,
  });

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(wabaId)}/pricing_analytics?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Meta pricing_analytics ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();

  const points = (json?.data?.[0]?.data_points ?? json?.data ?? []) as Array<Record<string, unknown>>;
  const rows: ReconcileRow[] = [];
  let anyCost = false;

  for (const p of points) {
    const category = normaliseCategory(p.pricing_category as string);
    if (!category) continue;
    const cost = p.cost == null ? null : Number(p.cost);
    if (cost != null && cost > 0) anyCost = true;
    rows.push({
      country: String(p.country ?? '*').toUpperCase(),
      category,
      volume: Number(p.volume ?? 0),
      costUsd: cost,
    });
  }

  return { rows, costAvailable: anyCost };
}

/**
 * Reconcile one WABA: read Meta, store the comparison, and correct the rate table.
 *
 * Returns rather than throws on a missing token, because the whole point is that this runs
 * unattended on a cron — a thrown error there is a red job nobody reads, where a returned reason
 * lands in the result the operator is looking at.
 */
export async function reconcileWaba(
  supabase: SupabaseLike,
  params: { wabaId: string; workspaceId: string | null; periodStart: Date; periodEnd: Date },
): Promise<ReconcileResult> {
  // resolveSecret answers with provenance, not a bare string — env beats platform_secrets, and
  // which one won matters when an operator swears they pasted the token.
  const resolved = await resolveSecret(supabase, 'META_WABA_ACCESS_TOKEN');
  const token = resolved.value;
  if (!token) {
    return {
      wabaId: params.wabaId,
      rows: [],
      costAvailable: false,
      ratesUpdated: 0,
      error: 'META_WABA_ACCESS_TOKEN is not set — template rates are still running on the seeded guesses.',
    };
  }

  let fetched: { rows: ReconcileRow[]; costAvailable: boolean };
  try {
    fetched = await fetchMetaPricing(token, params.wabaId, params.periodStart.getTime(), params.periodEnd.getTime());
  } catch (err) {
    return {
      wabaId: params.wabaId, rows: [], costAvailable: false, ratesUpdated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const startIso = params.periodStart.toISOString().slice(0, 10);
  const endIso = params.periodEnd.toISOString().slice(0, 10);
  let ratesUpdated = 0;

  for (const row of fetched.rows) {
    // What we charged for the same country, category and window — from our own ledger, so the
    // comparison is billed-vs-actual rather than billed-vs-assumption.
    const { data: billed } = await supabase
      .from('ai_usage_logs')
      .select('credits_debited, metadata')
      .eq('model_name', 'whatsapp-template')
      .gte('created_at', params.periodStart.toISOString())
      .lt('created_at', params.periodEnd.toISOString());

    const mine = ((billed ?? []) as Array<{ credits_debited: number; metadata: Record<string, unknown> | null }>)
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
      // Absent, not zero. A WABA on the partner's credit line reports no cost at all, and
      // recording that as $0 would read as a free month.
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
        source_note: `Derived from Meta pricing_analytics — ${row.volume} messages, ${startIso}..${endIso}.`,
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
      ? { error: 'Meta returned no pricing rows for this window — either nothing was sent, or the token cannot read this WABA.' }
      : !fetched.costAvailable
        ? { error: 'Meta reported volume but withheld COST. This WABA is on a Solution Partner credit line, so the actual charge has to come from the partner invoice.' }
        : {}),
  };
}
