import { supabase } from '@/integrations/supabase/client';
import { parentSelect, pickDeclared } from './coerce';
import type { TemplateAdapter, TemplateChildSpec } from './types';

/**
 * The generic capture side of the template engine (issue #322).
 *
 * Every adapter declares WHICH columns it wants; this reads exactly those and nothing else, so a
 * new adapter cannot accidentally hoover up an id, a fiscal mark, a share token or a derived
 * total. The allowlist is also what tests/unit/templateRegistry.test.ts inspects — declaring the
 * fields as data rather than writing a bespoke `.select('a, b, c')` per adapter is what makes the
 * rule testable at all.
 *
 * Reads run under the caller's RLS, so you can only turn a record you can already see into a
 * template.
 */

/** A captured child row: the allowlisted columns plus a structural pointer that is NOT an id. */
export type CapturedChild = Record<string, unknown> & {
  /** Index of this row's parent within the same array; null for a root. Replaces parent_task_id. */
  parent_index?: number | null;
};

export async function captureParent<T extends Record<string, unknown>>(
  table: string,
  fields: readonly string[],
  sourceId: string,
): Promise<T> {
  // An EMPTY allowlist means "capture nothing from the parent" — never "capture everything".
  // PostgREST reads `select=` as `*`, so the query is skipped outright rather than sent.
  const select = parentSelect(fields);
  if (select === null) return {} as T;

  const { data, error } = await supabase
    .from(table as never)
    .select(select)
    .eq('id', sourceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${table} record not found (or not visible to you)`);
  return pickDeclared(data as Record<string, unknown>, fields) as T;
}

/**
 * Capture one child collection.
 *
 * When the spec declares a `hierarchy`, the real parent id is read only to rebuild the shape and
 * is then thrown away — the payload stores `parent_index` (a position within this array), never a
 * uuid. That is how a nested task tree survives a template without an id ever entering the payload.
 */
export async function captureChildren(spec: TemplateChildSpec, sourceId: string): Promise<CapturedChild[]> {
  const needsTree = !!spec.hierarchy;
  const cols = [...spec.fields];
  if (needsTree) cols.push(spec.hierarchy!.idField, spec.hierarchy!.parentField);

  let q = supabase.from(spec.table as never).select(cols.join(', ')).eq(spec.fk, sourceId);
  if (spec.orderBy) q = q.order(spec.orderBy, { ascending: true });
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  if (!needsTree) return rows.map((r) => pickDeclared(r, spec.fields));

  const { idField, parentField } = spec.hierarchy!;
  const indexById = new Map<string, number>();
  rows.forEach((r, i) => indexById.set(String(r[idField]), i));
  return rows.map((r) => {
    const out: CapturedChild = {};
    for (const f of spec.fields) out[f] = r[f] ?? null;
    const parent = r[parentField];
    out.parent_index = parent ? (indexById.get(String(parent)) ?? null) : null;
    return out;
  });
}

/**
 * Capture the parent plus every declared child collection, keyed by the child's table name.
 *
 * `P` is unconstrained: each adapter's payload interface names its optional fields explicitly
 * (`document_type?: string | null`), which is more useful at the call sites than an index
 * signature would be — and an index signature would also make a typo in a payload key legal.
 */
export async function captureRecord<P>(
  adapter: Pick<TemplateAdapter<never>, 'sourceTable' | 'captureFields' | 'captureChildren'>,
  sourceId: string,
): Promise<P> {
  const parent = await captureParent<Record<string, unknown>>(adapter.sourceTable, adapter.captureFields, sourceId);
  const out: Record<string, unknown> = { ...parent };
  for (const spec of adapter.captureChildren ?? []) {
    out[spec.table] = await captureChildren(spec, sourceId);
  }
  // Enforce the declaration on the way out too, not just in the query.
  return pickDeclared(
    out,
    adapter.captureFields,
    (adapter.captureChildren ?? []).map((c) => c.table),
  ) as P;
}

/**
 * Drop references to records the caller cannot see.
 *
 * A template captured in workspace A can be copied into workspace B (or simply outlive the
 * product it pointed at). Re-inserting a `product_id` blind would either dangle or surface another
 * tenant's catalogue row in B's quote. So every foreign reference is re-read under the CALLER's
 * RLS first, and anything that comes back empty is nulled — the line survives on its captured
 * description, the link does not.
 */
export async function filterVisibleIds(table: string, ids: (string | null | undefined)[]): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))];
  if (!wanted.length) return new Set();
  const { data, error } = await supabase.from(table as never).select('id').in('id', wanted);
  if (error) throw error;
  return new Set(((data ?? []) as unknown as { id: string }[]).map((r) => r.id));
}

// Payload coercion lives in ./coerce (dependency-free so it is unit-testable); re-exported here
// because every adapter already imports its capture helpers from this module.
export { childRows, depositPct, num, oneOf, pickDeclared, positiveQty, str } from './coerce';
