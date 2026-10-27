export interface RegistryField {
  name: string;
  field_type: string;
  dropdown_options: string[] | null;
  validation_rules: Record<string, unknown> | null;
}

export interface ReplyValue { key: string; value: string; evidence: string }

export interface ProductIdentity {
  name: string;
  sku: string | null;
  external_sku: string | null;
}

export interface Claim { field: string; value: string | number | boolean; evidence: string }
export interface Rejection { field: string; why: string }

const squash = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const alnum = (s: string): string => squash(s).replace(/[^\p{L}\p{N}]+/gu, '');

/** The page must carry the product's own name or article code; a brand homepage never does. */
export function pageNamesProduct(page: string, p: ProductIdentity): boolean {
  const hay = alnum(page);
  const needles = [p.name, p.external_sku, p.sku]
    .filter((x): x is string => typeof x === 'string' && x.trim().length >= 3)
    .map(alnum)
    .filter((x) => x.length >= 3);
  return needles.some((n) => hay.includes(n));
}

/** A quote counts only if it appears in the page, whitespace and case aside. */
export function quoteInPage(page: string, quote: string): boolean {
  const q = squash(quote);
  return q.length >= 3 && squash(page).includes(q);
}

const NUMBER = /-?\d+(?:[.,]\d+)?/;

function parseNumber(raw: string): { n: number; rest: string } | null {
  const m = raw.match(NUMBER);
  if (!m) return null;
  const n = Number(m[0].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return { n, rest: raw.replace(m[0], '').replace(/\s/g, '').toLowerCase() };
}

/** The registry's own type and rules decide a value; the model never does. */
export function coerceValue(f: RegistryField, raw: string): { ok: true; value: string | number | boolean } | { ok: false; why: string } {
  const text = raw.trim();
  if (!text) return { ok: false, why: 'empty' };
  const rules = f.validation_rules ?? {};
  switch (f.field_type) {
    case 'number': {
      const parsed = parseNumber(text);
      if (!parsed) return { ok: false, why: 'not a number' };
      const unit = typeof rules.unit === 'string' ? rules.unit.toLowerCase().replace(/\s/g, '') : '';
      if (parsed.rest && unit && parsed.rest !== unit) return { ok: false, why: `unit '${parsed.rest}' is not '${unit}'` };
      if (typeof rules.min === 'number' && parsed.n < rules.min) return { ok: false, why: 'below the registry minimum' };
      if (typeof rules.max === 'number' && parsed.n > rules.max) return { ok: false, why: 'above the registry maximum' };
      return { ok: true, value: parsed.n };
    }
    case 'boolean': {
      const t = squash(text);
      if (['yes', 'true', 'y'].includes(t)) return { ok: true, value: true };
      if (['no', 'false', 'n'].includes(t)) return { ok: true, value: false };
      return { ok: false, why: 'not yes/no' };
    }
    case 'dropdown': {
      const hit = (f.dropdown_options ?? []).find((o) => squash(o) === squash(text));
      return hit ? { ok: true, value: hit } : { ok: false, why: 'not one of the allowed options' };
    }
    default: {
      const max = typeof rules.max_length === 'number' ? rules.max_length : 500;
      if (text.length > max) return { ok: false, why: 'longer than the registry allows' };
      if (typeof rules.pattern === 'string') {
        try { if (!new RegExp(rules.pattern).test(text)) return { ok: false, why: 'does not match the registry pattern' }; }
        catch { return { ok: false, why: 'registry pattern is unreadable' }; }
      }
      return { ok: true, value: text };
    }
  }
}

/** The quote must also contain what it is quoted for, so a real sentence cannot vouch for a made-up value. */
const NEGATION = /\b(no|not|non|never|without|false|none)\b|όχι|οχι|✗|✘|×/u;
const AFFIRMATION = /\b(yes|true)\b|ναι|✓|✔/u;
const KNOWN_UNITS = new Set([
  'mm', 'cm', 'm', 'km', 'in', 'inch', 'ft', 'µm', 'kg', 'g', 'lb', 'lbs', 'oz', 't', 'l', 'ml', '%',
  'db', 'hz', 'kw', 'w', 'v', 'a', 'mpa', 'n', 'kn', 'm²', 'm2', 'cm²', '°c', '°f',
]);
const NAME_UNIT = /_(kg|g|mm|cm|m|db|kw|w|v|hz|l)$/;

/** The unit a registry number is kept in: its own rule, else the suffix its name carries. */
function expectedUnit(f: RegistryField): string {
  const rule = f.validation_rules?.unit;
  if (typeof rule === 'string' && rule.trim()) return rule.toLowerCase().replace(/\s/g, '');
  return NAME_UNIT.exec(f.name)?.[1] ?? '';
}

function quoteSupports(f: RegistryField, value: string | number | boolean, quote: string): boolean {
  const q = squash(quote);
  if (f.field_type === 'boolean') {
    return value === true ? !NEGATION.test(q) : NEGATION.test(q) && !AFFIRMATION.test(q);
  }
  if (f.field_type === 'number') {
    const digits = String(value).replace('.', '[.,]');
    const hit = new RegExp(`(?<!\\d[.,]?)${digits}(?![.,]?\\d)\\s*([^\\s\\d.,;:()]+)?`).exec(q);
    if (!hit) return false;
    const unit = (hit[1] ?? '').replace(/[.,;:)]+$/, '');
    const want = expectedUnit(f);
    return !(want && unit && KNOWN_UNITS.has(unit) && unit !== want);
  }
  return q.includes(squash(String(value)));
}

/** Everything that stops a model reply becoming a claim. Returns what survived and why the rest did not. */
export function acceptClaims(
  reply: { product_match: string; match_evidence: string; values?: ReplyValue[] },
  page: string,
  fields: RegistryField[],
  identity: ProductIdentity,
): { claims: Claim[]; rejected: Rejection[]; abstained: string | null } {
  if (reply.product_match !== 'exact') return { claims: [], rejected: [], abstained: `page is ${reply.product_match}` };
  if (!quoteInPage(page, reply.match_evidence)) return { claims: [], rejected: [], abstained: 'match evidence is not on the page' };
  if (!pageNamesProduct(page, identity)) return { claims: [], rejected: [], abstained: 'page does not name this product' };

  const byName = new Map(fields.map((f) => [f.name, f]));
  const claims: Claim[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();
  for (const row of reply.values ?? []) {
    const f = byName.get(row.key);
    if (!f) { rejected.push({ field: row.key, why: 'not a field asked for' }); continue; }
    if (seen.has(row.key)) { rejected.push({ field: row.key, why: 'stated twice' }); continue; }
    seen.add(row.key);
    if (!quoteInPage(page, row.evidence)) { rejected.push({ field: row.key, why: 'quote is not on the page' }); continue; }
    const v = coerceValue(f, row.value);
    if (!v.ok) { rejected.push({ field: row.key, why: v.why }); continue; }
    if (!quoteSupports(f, v.value, row.evidence)) { rejected.push({ field: row.key, why: 'quote does not contain the value' }); continue; }
    claims.push({ field: row.key, value: v.value, evidence: row.evidence.trim().slice(0, 300) });
  }
  return { claims, rejected, abstained: null };
}
