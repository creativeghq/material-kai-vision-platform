/**
 * Factory Propagation Utilities
 *
 * Shared helpers for propagating factory metadata across products
 * that share the same scope (source_document_id, scrape_session_id, etc.).
 *
 * The canonical factory data lives in two places (always kept in sync):
 *   - products.metadata['factory']  — full nested object (canonical)
 *   - products.metadata['factory_name'] / ['factory_group_name'] — backward-compat flat fields
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Factory object shape ──────────────────────────────────────────────────────

export interface FactoryObject {
  factory_name?:        string;
  factory_group_name?:  string;
  address?:             string;
  city?:                string;
  country?:             string;
  postal_code?:         string;
  phone?:               string;
  email?:               string;
  website?:             string;
  country_of_origin?:   string;
  founded_year?:        number | string;
  company_type?:        string;
  linkedin_url?:        string;
  employee_count?:      number | string;
}

// Fields counted towards the completeness score (denominator = 9)
const COMPLETENESS_FIELDS: (keyof FactoryObject)[] = [
  'factory_name', 'city', 'country', 'address', 'phone',
  'email', 'website', 'country_of_origin', 'employee_count',
];

/** Returns 0.0–1.0. A score >= 0.9 skips enrichment. */
export function factoryCompletenessScore(factory: FactoryObject | null | undefined): number {
  if (!factory) return 0;
  const filled = COMPLETENESS_FIELDS.filter(f => {
    const v = factory[f];
    return v !== undefined && v !== null && String(v).trim() !== '';
  }).length;
  return filled / COMPLETENESS_FIELDS.length;
}

/** Merge two factory objects, preferring non-empty values from `preferred`. */
export function mergeFactory(
  base: FactoryObject,
  preferred: FactoryObject,
): FactoryObject {
  const result: FactoryObject = { ...base };
  for (const [k, v] of Object.entries(preferred)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      (result as any)[k] = v;
    }
  }
  return result;
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

type ScopeColumn = 'source_document_id' | 'scrape_session_id' | 'workspace_id';

/**
 * Find the most complete `metadata.factory` object across all products
 * in a given scope (e.g. all products from the same PDF document).
 */
async function findBestFactoryInScope(
  supabase: SupabaseClient,
  scopeColumn: ScopeColumn,
  scopeValue: string,
): Promise<FactoryObject | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, metadata')
    .eq(scopeColumn, scopeValue)
    .not('metadata', 'is', null);

  if (error || !data || data.length === 0) return null;

  let best: FactoryObject | null = null;
  let bestScore = 0;

  for (const row of data) {
    const factory = (row.metadata as any)?.factory as FactoryObject | undefined;
    if (!factory) continue;
    const score = factoryCompletenessScore(factory);
    if (score > bestScore) {
      bestScore = score;
      best = factory;
    }
  }

  return best;
}

/**
 * Propagate factory data to all products in a scope that are missing it.
 * Merges rather than overwrites — existing partial data is preserved.
 *
 * @returns number of products updated
 */
export async function propagateFactoryFieldsInScope(
  supabase: SupabaseClient,
  scopeColumn: ScopeColumn,
  scopeValue: string,
): Promise<number> {
  const best = await findBestFactoryInScope(supabase, scopeColumn, scopeValue);
  if (!best || factoryCompletenessScore(best) === 0) return 0;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, metadata')
    .eq(scopeColumn, scopeValue)
    .not('metadata', 'is', null);

  if (error || !products) return 0;

  let updated = 0;

  for (const product of products) {
    const meta     = ((product.metadata as any) ?? {}) as Record<string, unknown>;
    const existing = (meta.factory ?? {}) as FactoryObject;

    // Skip if already complete
    if (factoryCompletenessScore(existing) >= 0.9) continue;

    const merged = mergeFactory(existing, best);

    // Write back: nested factory object + flat backward-compat fields
    const newMeta = {
      ...meta,
      factory:             merged,
      factory_name:        merged.factory_name        ?? meta.factory_name,
      factory_group_name:  merged.factory_group_name  ?? meta.factory_group_name,
    };

    const { error: updateErr } = await supabase
      .from('products')
      .update({ metadata: newMeta })
      .eq('id', product.id);

    if (!updateErr) updated++;
  }

  return updated;
}

/**
 * Write a factory object onto a single product, syncing flat fields too.
 * Safe to call with a partial object — only non-empty values are written.
 */
export async function writeFactoryToProduct(
  supabase: SupabaseClient,
  productId: string,
  factory: FactoryObject,
): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('products')
    .select('metadata')
    .eq('id', productId)
    .single();

  if (fetchErr || !data) return;

  const meta     = ((data.metadata as any) ?? {}) as Record<string, unknown>;
  const existing = (meta.factory ?? {}) as FactoryObject;
  const merged   = mergeFactory(existing, factory);

  const newMeta = {
    ...meta,
    factory:             merged,
    factory_name:        merged.factory_name        ?? meta.factory_name,
    factory_group_name:  merged.factory_group_name  ?? meta.factory_group_name,
  };

  await supabase.from('products').update({ metadata: newMeta }).eq('id', productId);
}
