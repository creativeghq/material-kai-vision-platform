/**
 * Factory propagation: share the most complete `metadata.factory` object between products of
 * the SAME manufacturer inside one workspace-bound scope. `metadata.factory` is canonical;
 * `factory_name` / `factory_group_name` are flat mirrors kept in sync.
 */

import type { DbClient } from '../supabase-client.ts';

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

function isFilled(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

/** Copy `source` values only into fields `target` leaves empty — never overwrites. */
export function fillEmptyFactoryFields(target: FactoryObject, source: FactoryObject): FactoryObject {
  const result: FactoryObject = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (isFilled(v) && !isFilled((result as Record<string, unknown>)[k])) {
      (result as Record<string, unknown>)[k] = v;
    }
  }
  return result;
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

export const FACTORY_SCOPE_COLUMNS = ['source_document_id'] as const;
export type FactoryScopeColumn = typeof FACTORY_SCOPE_COLUMNS[number];

export function isFactoryScopeColumn(v: unknown): v is FactoryScopeColumn {
  return typeof v === 'string' && (FACTORY_SCOPE_COLUMNS as readonly string[]).includes(v);
}

export function factoryNameKey(meta: Record<string, unknown>): string {
  const factory = (meta.factory ?? {}) as FactoryObject;
  const name = factory.factory_name ?? meta.factory_name;
  return typeof name === 'string' ? name.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

interface ScopedProduct { id: string; metadata: Record<string, unknown> }

/**
 * Pure planner: for each manufacturer in the scope pick its most complete factory object and
 * fill only the EMPTY fields of that manufacturer's other products. A product with no
 * manufacturer name inherits only when the scope holds exactly one manufacturer.
 */
export function planFactoryPropagation(products: ScopedProduct[]): Array<{ id: string; metadata: Record<string, unknown> }> {
  const best = new Map<string, { factory: FactoryObject; score: number }>();
  for (const p of products) {
    const key = factoryNameKey(p.metadata);
    if (!key) continue;
    const factory = (p.metadata.factory ?? {}) as FactoryObject;
    const score = factoryCompletenessScore(factory);
    const cur = best.get(key);
    if (!cur || score > cur.score) best.set(key, { factory, score });
  }
  const soleKey = best.size === 1 ? [...best.keys()][0] : null;

  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  for (const p of products) {
    const key = factoryNameKey(p.metadata) || soleKey;
    if (!key) continue;
    const source = best.get(key);
    if (!source || source.score === 0) continue;
    const existing = (p.metadata.factory ?? {}) as FactoryObject;
    if (factoryCompletenessScore(existing) >= 0.9) continue;
    const merged = fillEmptyFactoryFields(existing, source.factory);
    if (JSON.stringify(merged) === JSON.stringify(existing)) continue;
    updates.push({
      id: p.id,
      metadata: {
        ...p.metadata,
        factory: merged,
        factory_name: merged.factory_name ?? p.metadata.factory_name,
        factory_group_name: merged.factory_group_name ?? p.metadata.factory_group_name,
      },
    });
  }
  return updates;
}

/**
 * Propagate factory data within `scopeColumn = scopeValue`, bounded to `workspaceId`.
 * Throws on an unknown scope column or a failed read; returns the number of rows updated.
 */
export async function propagateFactoryFieldsInScope(
  supabase: DbClient,
  workspaceId: string,
  scopeColumn: FactoryScopeColumn,
  scopeValue: string,
): Promise<number> {
  if (!workspaceId) throw new Error('propagateFactoryFieldsInScope: workspaceId is required');
  if (!isFactoryScopeColumn(scopeColumn)) throw new Error(`Unsupported scope column: ${String(scopeColumn)}`);

  const { data, error } = await supabase
    .from('products')
    .select('id, metadata')
    .eq('workspace_id', workspaceId)
    .eq(scopeColumn, scopeValue)
    .not('metadata', 'is', null);
  if (error) throw new Error(`Factory propagation read failed: ${error.message}`);

  const products = (data ?? []).map((r: { id: string; metadata: unknown }) => ({
    id: r.id,
    metadata: ((r.metadata ?? {}) as Record<string, unknown>),
  }));

  const before = new Map(products.map((p) => [p.id, p.metadata]));
  const restale: string[] = [];
  let updated = 0;
  for (const u of planFactoryPropagation(products)) {
    if (await setFactoryKeys(supabase, workspaceId, u.id, u.metadata)) {
      updated++;
      if (embeddingNamesChanged(before.get(u.id) ?? {}, u.metadata)) restale.push(u.id);
    }
  }
  await reembedLazily(workspaceId, restale);
  return updated;
}

/** The only metadata keys factory propagation owns. A whole-object update would drop a concurrent edit to any other. */
const FACTORY_KEYS = ['factory', 'factory_name', 'factory_group_name'] as const;

async function setFactoryKeys(
  supabase: DbClient,
  workspaceId: string,
  productId: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const patch: Record<string, unknown> = {};
  for (const k of FACTORY_KEYS) if (metadata[k] !== undefined) patch[k] = metadata[k];
  const { data, error } = await supabase.rpc('set_product_metadata_keys', {
    p_workspace: workspaceId, p_product: productId, p_patch: patch,
  });
  return !error && data === true;
}

/** Loaded on first use: this module's pure planners are imported by tests that have no Deno runtime. */
async function reembedLazily(workspaceId: string, productIds: string[]): Promise<void> {
  const { reembedProducts } = await import('../mivaa-admin.ts');
  await reembedProducts(workspaceId, productIds);
}

/** factory_name and factory_group_name are part of the text a product is embedded from. */
function embeddingNamesChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const names = (m: Record<string, unknown>) => `${String(m.factory_name ?? '')}|${String(m.factory_group_name ?? '')}`;
  return names(before) !== names(after);
}

/** Write a factory object onto one product of `workspaceId`, syncing the flat fields. */
export async function writeFactoryToProduct(
  supabase: DbClient,
  workspaceId: string,
  productId: string,
  factory: FactoryObject,
): Promise<boolean> {
  const { data, error: fetchErr } = await supabase
    .from('products')
    .select('metadata')
    .eq('id', productId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (fetchErr || !data) return false;

  const meta     = ((data.metadata as Record<string, unknown> | null) ?? {});
  const existing = (meta.factory ?? {}) as FactoryObject;
  const merged   = mergeFactory(existing, factory);

  const newMeta = {
    ...meta,
    factory:             merged,
    factory_name:        merged.factory_name        ?? meta.factory_name,
    factory_group_name:  merged.factory_group_name  ?? meta.factory_group_name,
  };

  if (!(await setFactoryKeys(supabase, workspaceId, productId, newMeta))) return false;
  if (embeddingNamesChanged(meta, newMeta)) await reembedLazily(workspaceId, [productId]);
  return true;
}
