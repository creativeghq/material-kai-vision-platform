/**
 * Variant coverage guard (#374).
 *
 * The bug this exists to stop: `get_product_price_for_workspace` has been fully variant-aware in
 * SQL since #347 phase 7 — `_pricing_cost`, `_pricing_retail` and `get_product_price_break` all
 * take `p_variant_key` and fall back to the product-wide row when it is null. But only ONE of the
 * seven client call sites passed it. So a Nero surcharge you configured was honoured on the order
 * line and nowhere else: not on the quote the customer reads, not on the invoice, not in the
 * marketplace. Nothing failed. The line just quietly priced the base row.
 *
 * That is the same shape as the five money derivations: a valid number, produced by a correct
 * engine that was asked the wrong question. No typecheck can see it (a wrong price is a valid
 * `number`) and no integrity check can see it (the stored data is perfect).
 *
 * The same applies to the two tables where "which variant" is the row's identity:
 * `product_prices` (two rows for one product are different PRICES, not duplicates) and
 * `warehouse_items` (two rows are different PHYSICAL STOCK). A client write that omits
 * `variant_key` silently means "the row that applies to any variant" — which is right for a
 * product with no variants and wrong for every other one.
 *
 * SCOPE — read before assuming a clean run means the invariant holds.
 * This scans REPO FILES, so it sees the TypeScript half only. This project's SQL is applied via
 * the Supabase MCP and never committed (CLAUDE.md), so a function body lives in `pg_proc` and is
 * invisible here. The SQL half of #374 — every stock writer resolving its row through
 * `_resolve_warehouse_item`, and `mark_invoice_issued` / `generate_order_from_invoice` grouping
 * by variant — is guarded in SQL, not here. A green run says nothing about it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import { variantKey, formatVariantKey, availabilityKey } from '@/services/lineIdentityRules';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(e) && !e.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = walk(join(ROOT, 'src')).map((f) => ({
  path: relative(ROOT, f).split(sep).join('/'),
  // Comments blanked (offsets preserved) so a mention in prose — or a commented-out argument —
  // never satisfies the check. Several of these files discuss the resolver at length.
  text: blankComments(readFileSync(f, 'utf8')),
}));

/**
 * The object literal passed to a call, by balancing braces from the call site. Regex alone cannot
 * do this: every one of these payloads contains nested objects and ternaries.
 */
function callPayload(text: string, callIndex: number): string {
  const open = text.indexOf('{', callIndex);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open);
}

/**
 * The single supabase-js statement beginning at `.from('x')`.
 *
 * Bounded at the next `.from(` or the end of the statement, because a fixed character window
 * spills into whatever comes next — and these files chain several table calls inside one
 * `Promise.all([...])`. A window that reaches the NEXT statement reports a select as an insert
 * and a neighbouring `.maybeSingle()` as this table's, which is a guard that cries wolf and gets
 * deleted. Verified against servicesService / deliveryNotesService / PosPage, where all three of
 * those false positives actually occurred.
 */
function statementAt(text: string, fromIndex: number): string {
  const rest = text.slice(fromIndex + 1, fromIndex + 4000);
  const next = rest.indexOf('.from(');
  const semi = rest.indexOf(';');
  const ends = [next, semi].filter((n) => n >= 0);
  const end = ends.length ? Math.min(...ends) : rest.length;
  return text.slice(fromIndex, fromIndex + 1 + end);
}

function callSites(needle: string): Array<{ path: string; payload: string }> {
  const found: Array<{ path: string; payload: string }> = [];
  for (const f of SOURCES) {
    let from = 0;
    for (;;) {
      const i = f.text.indexOf(needle, from);
      if (i < 0) break;
      found.push({ path: f.path, payload: callPayload(f.text, i) });
      from = i + needle.length;
    }
  }
  return found;
}

describe('#374 — every pricing call site prices the VARIANT', () => {
  it('finds the call sites at all (a rename must fail loudly, not silently pass)', () => {
    expect(callSites("rpc('get_product_price_for_workspace'").length).toBeGreaterThanOrEqual(7);
  });

  it('passes p_variant_key to get_product_price_for_workspace everywhere', () => {
    const offenders = callSites("rpc('get_product_price_for_workspace'")
      .filter((c) => !c.payload.includes('p_variant_key'))
      .map((c) => c.path);
    expect(
      offenders,
      'These price a product-wide row even when the line has chosen a variant. The resolver already '
        + 'falls back correctly when the key is null, so passing it is always safe: '
        + offenders.join(', '),
    ).toEqual([]);
  });

  it('passes p_variant_key to the quantity-break resolvers', () => {
    for (const needle of ["rpc('get_product_price_break'", "rpc('get_supplier_price_break'"]) {
      const offenders = callSites(needle)
        .filter((c) => !c.payload.includes('p_variant_key'))
        .map((c) => c.path);
      expect(offenders, `${needle} without p_variant_key: ${offenders.join(', ')}`).toEqual([]);
    }
  });
});

describe('#374 — a row whose identity IS the variant always states it', () => {
  it('never writes product_prices without variant_key', () => {
    // `.from('product_prices').upsert({...})` / `.insert({...})`. The unique index is
    // (workspace_id, product_id, variant_key) NULLS NOT DISTINCT, so omitting the column does not
    // fail — it silently targets the "applies to any variant" row.
    const offenders: string[] = [];
    for (const f of SOURCES) {
      const needle = `.from('product_prices')`;
      let from = 0;
      for (;;) {
        const i = f.text.indexOf(needle, from);
        if (i < 0) break;
        from = i + needle.length;
        const stmt = statementAt(f.text, i);
        for (const verb of ['upsert', 'insert']) {
          const v = stmt.indexOf(`.${verb}(`);
          if (v < 0) continue;
          const payload = callPayload(stmt, v);
          if (!payload.includes('variant_key')) offenders.push(`${f.path} (${verb})`);
        }
      }
    }
    expect(
      [...new Set(offenders)],
      'Writes a price row without saying which variant it is for: ' + offenders.join(', '),
    ).toEqual([]);
  });

  it('never inserts warehouse_items without variant_key', () => {
    const offenders: string[] = [];
    for (const f of SOURCES) {
      const needle = `.from('warehouse_items')`;
      let from = 0;
      for (;;) {
        const i = f.text.indexOf(needle, from);
        if (i < 0) break;
        from = i + needle.length;
        const stmt = statementAt(f.text, i);
        const v = stmt.indexOf('.insert(');
        if (v < 0) continue;
        const payload = callPayload(stmt, v);
        if (!payload.includes('variant_key')) offenders.push(f.path);
      }
    }
    expect(
      [...new Set(offenders)],
      'Creates stock without saying which variant it is: ' + offenders.join(', '),
    ).toEqual([]);
  });

  it('reads a single product_prices row with a variant filter, never a bare maybeSingle', () => {
    // Two price rows for one product are legal now. `.maybeSingle()` RAISES on multiple rows, so
    // an unfiltered single-row read is not merely imprecise — it breaks the screen the first time
    // anybody uses the feature.
    const offenders: string[] = [];
    for (const f of SOURCES) {
      const needle = `.from('product_prices')`;
      let from = 0;
      for (;;) {
        const i = f.text.indexOf(needle, from);
        if (i < 0) break;
        from = i + needle.length;
        const stmt = statementAt(f.text, i);
        const single = stmt.includes('.maybeSingle(') || stmt.includes('.single(');
        if (single && !stmt.includes('variant_key')) offenders.push(f.path);
      }
    }
    expect(
      [...new Set(offenders)],
      'Single-row price read with no variant filter — raises once a variant price exists: '
        + offenders.join(', '),
    ).toEqual([]);
  });
});

describe('formatVariantKey — display only, and never the field names', () => {
  it('renders values, joined', () => {
    expect(formatVariantKey('available_sizes=60x60;color=nero')).toBe('60x60 · nero');
    expect(formatVariantKey('finish=matte')).toBe('matte');
  });

  it('is null for the row that applies to any variant', () => {
    expect(formatVariantKey(null)).toBeNull();
    expect(formatVariantKey('')).toBeNull();
    expect(formatVariantKey(undefined)).toBeNull();
  });

  it('never leaks a registry field name into the UI', () => {
    // The names a user sees are `label_by_category` and differ per category; spelling them here
    // would be the hardcoded label map #368 was about.
    const out = formatVariantKey(variantKey({ available_sizes: '60x60', body_material: 'rattan' }));
    expect(out).not.toContain('available_sizes');
    expect(out).not.toContain('body_material');
    expect(out).toBe('60x60 · rattan');
  });

  it('survives a value containing the separator characters', () => {
    // Operator-authored values are not sanitised, and the display must not throw or truncate.
    expect(formatVariantKey('color=blue=green')).toBe('blue=green');
  });
});

describe('availabilityKey — one key per (product, variant) and no collisions', () => {
  it('separates a chosen variant from the product-wide lookup', () => {
    expect(availabilityKey('p1', 'color=nero')).not.toBe(availabilityKey('p1', null));
  });

  it('does not collide when a variant value could forge a separator', () => {
    // A plain string join is how two different pairs end up on one key: the variant key is
    // operator-authored text, so any separator is a character it may itself contain.
    expect(availabilityKey('a', 'b')).not.toBe(availabilityKey('a"', 'b'));
    expect(availabilityKey('p1', 'x')).not.toBe(availabilityKey('p1x', null));
  });

  it('is stable for the same pair', () => {
    expect(availabilityKey('p1', 'color=nero')).toBe(availabilityKey('p1', 'color=nero'));
    expect(availabilityKey('p1', undefined)).toBe(availabilityKey('p1', null));
  });
});

/**
 * Phase 6 — the customer's copy shows what they chose.
 *
 * Every document renderer built its line detail from `selected_color` + `selected_size`, the two
 * projected columns, so forty-eight other identity axes were chosen, priced, stored and never
 * printed. The fiscal path meanwhile folded the whole attribute map into the name it transmits,
 * so AADE received a more specific description than the customer's own page.
 *
 * These live in `supabase/functions/`, which `npm run typecheck` does not cover (tsconfig excludes
 * it) — so a regression here is invisible to the main typecheck and only `typecheck:edge` or this
 * would see it.
 */
describe('#374 Phase 6 — document renderers print the whole variant', () => {
  const RENDERERS = [
    'supabase/functions/generate-quote-pdf/index.ts',
    'supabase/functions/generate-quote-pdf/data-fetcher.ts',
    'supabase/functions/finance-invoice-pdf/index.ts',
    'supabase/functions/quote-public-share/index.ts',
  ];

  it('each renderer derives the variant rather than re-joining two columns', () => {
    const missing = RENDERERS.filter((rel) => {
      let text: string;
      try {
        text = blankComments(readFileSync(join(ROOT, rel), 'utf8'));
      } catch {
        return true; // a renderer that moved must fail loudly, not silently pass
      }
      return !text.includes('variant_label');
    });
    expect(
      missing,
      'Prints only selected_color/selected_size, so a finish or wood species never reaches the '
        + 'page: ' + missing.join(', '),
    ).toEqual([]);
  });

  it('the two projected columns survive as a FALLBACK, not as the source', () => {
    // A legacy line with no attribute map must still print what it always did. The point is that
    // the pair is now the fallback branch, never the only branch.
    const text = blankComments(
      readFileSync(join(ROOT, 'supabase/functions/finance-invoice-pdf/index.ts'), 'utf8'),
    );
    expect(text).toContain('_variant_label');
    expect(text).toContain('selected_color');
  });
});

/**
 * Phase 7 — a variant is chosen, not guessed.
 *
 * `AddProductsSheet` seeded `sizes[0]` / `colors[0]` on add: the first entry of a list, so a tile
 * that comes in four colours had one picked on the operator's behalf. It then read as a decision —
 * the line printed that colour, priced that variant and reserved its stock.
 *
 * Exactly ONE candidate is a different case: that is a fact about the product, not a choice, which
 * is why `get_line_identity_options` withholds single-option fields from the picker entirely. So
 * the rule is `=== 1`, and `> 0` is the bug.
 */
describe('#374 Phase 7 — no first-of-list variant guess', () => {
  it('AddProductsSheet seeds an axis only when the product offers exactly one value', () => {
    const text = blankComments(
      readFileSync(join(ROOT, 'src/modules/quotes/components/AddProductsSheet.tsx'), 'utf8'),
    );
    expect(text).toContain('sizes.length === 1');
    expect(text).toContain('colors.length === 1');
    expect(
      /(sizes|colors)\.length > 0/.test(text),
      'A `.length > 0` seed is the first-of-list guess this phase removed.',
    ).toBe(false);
  });

  it('NewInvoiceDialog never seeds from the first of several variants', () => {
    const text = blankComments(
      readFileSync(join(ROOT, 'src/modules/finance/components/NewInvoiceDialog.tsx'), 'utf8'),
    );
    expect(
      text.includes('firstVariant'),
      'An invoice is a fiscal record; pre-answering which colour it bills for is not a default.',
    ).toBe(false);
    expect(text).toContain('soleVariant');
  });
});
