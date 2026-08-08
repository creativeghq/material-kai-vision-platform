/**
 * Payload coercion for the template engine (issue #322) — deliberately dependency-free so it can
 * be unit-tested without the Supabase client.
 *
 * A template payload is stored jsonb: it is exactly as trustworthy as whatever wrote it — a
 * hand-edited template, an older adapter, a seeded starter with a typo. Two consequences, both
 * handled here rather than at each call site:
 *
 *  - **A value a CHECK constraint rejects must not reach the insert.** It would fail *partway
 *    through* building a record and leave half a project behind. `oneOf` returns null for anything
 *    outside the accepted set, so the row lands with a default instead of aborting the import.
 *  - **A missing or malformed value must not become `NaN` or `"undefined"`.** `num`/`str` narrow
 *    to something the column will accept.
 */

/**
 * Coerce an unknown jsonb value to a finite number, or a fallback.
 *
 * The explicit rejections matter more than the happy path: `Number(null)`, `Number('')`,
 * `Number([])` and `Number(false)` are all **0**, so a plain `Number(v) || fallback` turns a
 * missing quantity into a zero rather than into the default the caller asked for.
 */
export const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'object' || typeof v === 'boolean') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Coerce an unknown jsonb value to a trimmed non-empty string, or null. */
export const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

/** Narrow an unknown value to one of an enum's accepted members, else null. */
export const oneOf = <T extends string>(allowed: readonly T[]) => {
  const set = new Set<string>(allowed);
  return (v: unknown): T | null => {
    const s = str(v);
    return s && set.has(s) ? (s as T) : null;
  };
};

/** `quote_items_quantity_check` is `quantity > 0`; a template line with 0 must not abort the insert. */
export const positiveQty = (v: unknown): number => {
  const n = num(v, 1);
  return n > 0 ? n : 1;
};

/** `quotes_deposit_pct_check`: null, or greater than 0 and at most 100. */
export const depositPct = (v: unknown): number | null => {
  if (v == null) return null;
  const n = num(v, 0);
  return n > 0 && n <= 100 ? n : null;
};

/**
 * The PostgREST `select=` clause for an allowlist — or `null` when there is nothing to select.
 *
 * `fields.join(', ')` on an empty array is `''`, and PostgREST treats `?select=` as **`*`**:
 * verified against the live API, which returned every column of the row. That turns an empty
 * allowlist — the strongest possible declaration, used by `hr_onboarding` precisely because its
 * parent is an employee record — into "capture the whole employee", salary and AMKA and PIN hash
 * included. The declaration said one thing and the query did the opposite.
 *
 * `null` means: do not issue the query at all.
 */
export const parentSelect = (fields: readonly string[]): string | null =>
  (fields.length ? fields.join(', ') : null);

/**
 * Keep only the keys an adapter declared.
 *
 * Belt and braces on top of `parentSelect`: the allowlist is enforced on the way OUT of the query
 * as well as on the way in, so a wider-than-expected response (an embedded relation, a future
 * PostgREST quirk, a hand-written capture) still cannot widen what gets stored.
 */
export const pickDeclared = (
  row: Record<string, unknown>,
  fields: readonly string[],
  childTables: readonly string[] = [],
): Record<string, unknown> => {
  const allowed = new Set<string>([...fields, ...childTables]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (allowed.has(k)) out[k] = v;
  return out;
};

/** Read a child array out of an untrusted payload without assuming anything about its shape. */
export const childRows = (payload: Record<string, unknown>, table: string): Record<string, unknown>[] => {
  const v = payload[table];
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[]) : [];
};
