/**
 * Nothing asks the browser's Postgres for a whole `products` row (#368 follow-up).
 *
 * WHAT THIS IS ABOUT. `products` is not an ordinary catalogue table. Alongside name and
 * metadata it carries `cost`, `cost_currency`, `cost_source`, `cost_updated_at`,
 * `markup_percent`, `supplier_company_id`, `attributes_raw` (the raw supplier feed),
 * `quality_metrics` and `import_batch_id`. Its only SELECT policy is
 * `is_workspace_member(workspace_id)` — and membership includes `end_user` project clients,
 * `employee`, `warehouse_staff` and everyone else in the workspace. So `select('*')` is not a
 * convenience: it is a decision to hand every one of those columns to whoever is on the page.
 *
 * WHY RENDER-SIDE SCRUBBING IS NOT THE ANSWER, and why this test exists rather than a review
 * note. Every site fixed here scrubbed properly before rendering — `convertToDisplayProduct`
 * sets `wholesale: 0` under a comment naming the previous leak, and the admin modal wrapper
 * rebuilds an explicit object. The page looked correct in all of them. The row had already
 * crossed the wire and was sitting in React state, which no amount of reading the JSX reveals.
 *
 * The four that were live when this was written:
 *   QuotesService.getQuote / getQuoteRequests   `product:products(*)` — the CUSTOMER quote page
 *   ProductsTab                                 `select('*')`, 20 rows a page
 *   UnifiedProcessingMonitor ×2                 `select('*', {count})` with no `head`, unbounded,
 *                                               to collect `id` and nothing else
 *   PDFDocumentDetails                          `select('*')` to render four fields
 *
 * SCOPE. Source text only. It cannot see a wide read built at runtime from a variable, and it
 * says nothing about the server — `get_product_detail()` is the gated single-product read and
 * lives in `pg_proc`, not in this repo.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (p.includes('node_modules')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old shape never counts as the old shape. */
const blankComments = (src: string) =>
  sharedBlankComments(src);

const FILES = walk(join(ROOT, 'src')).map((f) => ({
  rel: relative(ROOT, f).split(sep).join('/'),
  src: blankComments(readFileSync(f, 'utf8')),
}));

describe('reads of the products table are projected', () => {
  it('scanned a real tree', () => {
    // An inert walk reports "clean" exactly like a clean codebase does.
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES.some((f) => f.src.includes("from('products')"))).toBe(true);
  });

  it("no select('*') on products returns rows", () => {
    // `head: true` asks for a COUNT and returns no rows, so it is not a read of the data and is
    // allowed. Without it — which is the easy mistake — the same call downloads every row.
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      // `[^;]` — not `[\s\S]` — so the gap cannot run past the end of the query it belongs to.
      // A PostgREST chain contains no semicolon, so this costs nothing and closes a false
      // positive that depended on LINE ENDINGS: in `PDFDocumentDetails.tsx` a correctly
      // projected products read sits 198 characters before an unrelated `document_chunks`
      // `.select('*')`, so the old span matched under LF and missed under CRLF. It passed on
      // every Windows checkout and failed in CI, where it blocked the deploy from #368 onward
      // while three commits' worth of `deploy-functions` jobs were quietly skipped.
      const re = /\.from\(\s*['"]products['"]\s*\)[^;]{0,200}?\.select\(\s*['"]\*['"]([^)]*)\)/g;
      for (const m of src.matchAll(re)) {
        if (/head\s*:\s*true/.test(m[1])) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      'products carries cost, markup_percent, supplier_company_id and attributes_raw, and its '
      + 'RLS grant is plain workspace membership. List the columns the surface renders, or use '
      + "the get_product_detail RPC.\n" + offenders.join('\n'),
    ).toEqual([]);
  });

  it('no embedded products(*) inside another table\'s select', () => {
    // The one this scanner was written for was invisible to a `from('products')` search: it is
    // an EMBED on quote_items, `select('*, product:products(*)')`, and it backed the customer
    // quote page.
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      const re = /[:(]\s*products\s*\(\s*\*\s*\)/g;
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      'an embedded products(*) is the same whole row, reached through a join.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('nothing names a withheld cost column in a products read', () => {
    // #358 made this enforceable rather than advisory: `authenticated` has no SELECT privilege on
    // `products.cost`, `cost_currency`, `cost_updated_at`, `cost_source`, `markup_percent` or
    // `attributes_raw` at all, and `get_product_costs` is the only browser-reachable path to them.
    // Naming one in a select or an embed no longer over-shares — it fails the WHOLE query with
    // "permission denied for column", taking the surface with it. This test is here so that shows
    // up in CI rather than on the screen of whoever opens the page.
    const WITHHELD = ['cost', 'cost_currency', 'cost_updated_at', 'cost_source', 'markup_percent', 'attributes_raw'];
    const offenders: string[] = [];
    for (const { rel, src } of FILES) {
      if (rel.endsWith('productDetailService.ts')) continue; // the RPC wrapper names them in types
      // Direct reads, and embeds of products inside another table's select.
      const re = /(\.from\(\s*['"]products['"]\s*\)[^;]{0,240}?\.select\(\s*[`'"]([^`'"]*)|[:(]\s*products\s*\(\s*([^)]*)\))/g;
      for (const m of src.matchAll(re)) {
        const cols = (m[2] ?? m[3] ?? '').split(',').map((c) => c.trim().split(':').pop()!.trim());
        const bad = WITHHELD.filter((w) => cols.includes(w));
        if (bad.length) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${rel}:${line} — ${bad.join(', ')}`);
        }
      }
    }
    expect(
      offenders,
      'These name a column `authenticated` cannot select, so the query returns a permission error '
      + 'rather than data. Read the cost basis through productDetailService.costs(), which calls '
      + 'get_product_costs and gates on is_workspace_sell_side.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the cost basis is reachable only through the gated RPC', () => {
    const svc = FILES.find((f) => f.rel.endsWith('services/productDetailService.ts'));
    expect(svc, 'productDetailService.ts not found').toBeTruthy();
    expect(svc!.src, 'the gated cost read is gone — nothing can show margin').toContain('get_product_costs');
    // A failed or withheld read is an EMPTY map: cost unknown, rendered as a dash. Never zeros.
    expect(svc!.src, 'a failed cost read no longer returns an empty map').toMatch(/return new Map\(\)/);
  });

  it('the customer quote page does not ask for cost; the seller page does', () => {
    // Both pages call the same service method. The difference has to stay visible, because the
    // failure mode is silent in both directions: drop it on the admin page and the below-cost
    // guardrail stops seeing a cost for lines with no snapshot; add it on the customer page and
    // procurement cost is back in the customer's browser with nothing on screen to show it.
    const admin = FILES.find((f) => f.rel.endsWith('QuoteDetailAdminPage.tsx'));
    const customer = FILES.find((f) => f.rel.endsWith('QuoteDetailCustomerPage.tsx'));
    expect(admin, 'QuoteDetailAdminPage.tsx not found').toBeTruthy();
    expect(customer, 'QuoteDetailCustomerPage.tsx not found').toBeTruthy();

    expect(admin!.src, 'the seller view needs the live cost for margin and the guardrail')
      .toMatch(/getQuote\([^)]*includeCost:\s*true/);
    // …and `includeCost` must still reach the gated RPC, not a column on the embed (#358).
    const quotes = FILES.find((f) => f.rel.endsWith('services/QuotesService.ts'));
    expect(quotes!.src, 'QuotesService no longer resolves the product cost through the gated RPC')
      .toMatch(/productDetailService\.costs\(/);
    expect(customer!.src, 'the customer view must not ask for cost')
      .not.toMatch(/includeCost/);
  });
});
