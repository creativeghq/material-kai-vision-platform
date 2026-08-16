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
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

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
      const re = /\.from\(\s*['"]products['"]\s*\)[\s\S]{0,200}?\.select\(\s*['"]\*['"]([^)]*)\)/g;
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
    expect(customer!.src, 'the customer view must not ask for cost')
      .not.toMatch(/includeCost/);
  });
});
