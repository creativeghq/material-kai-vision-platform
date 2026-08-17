/**
 * Guard: the seller's cost basis is not a column on a row the customer can read, and quote money
 * is derived in SQL. (Audit #358 — PQ-2, PQ-6, PQ-13, PQ-14.)
 *
 * `quotes.margin_pct` and `quote_items.cost_snapshot*` sat on rows the customer legitimately
 * reads: `consolidated_quotes_select_public` grants on `auth.uid() = user_id` (a customer IS the
 * user_id of their own quote request) and `quote_items_select` granted on bare workspace
 * membership, which the `client` role a project customer is issued satisfies. A row-level policy
 * cannot say "this principal may read this row but not these columns", which is precisely why
 * `check_security_invariants()` reported the schema clean while the exposure was real.
 *
 * The columns moved to `quote_costs` / `quote_item_costs`, gated on `is_workspace_sell_side`.
 * These assertions are over source text, because the failure mode is a future edit re-adding the
 * old names to a `quote_items` write — which would be a valid query returning a 200 either way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const QUOTES_SERVICE = 'src/modules/quotes/services/QuotesService.ts';
const PDF_SERVICE = 'src/modules/quotes/services/QuotePDFService.ts';
const QUOTE_TOOLS = 'supabase/functions/_shared/tools/quote-tools.ts';
const PLAN_ENGINE = 'supabase/functions/project-plan-engine/index.ts';
const TEMPLATE_SCHEMA = 'src/services/templates/schema.ts';
const TEMPLATE_ADAPTERS = 'src/services/templates/adapters.ts';

/**
 * Every payload that becomes a `quote_items` row.
 *
 * Two of these are not `.from('quote_items')` call sites: the agent tool builds its payload in
 * `resolveLine` and inserts it later, and the plan engine builds its rows in `buildQuoteItems`.
 * Matching on the insert call alone would have found neither, so the named builder is the anchor.
 */
const QUOTE_ITEM_PAYLOADS: Array<{ file: string; anchor: string; end: string }> = [
  { file: QUOTES_SERVICE, anchor: "from('quote_items')\n      .insert({", end: '} as any)' },
  { file: QUOTE_TOOLS, anchor: 'const payload: Record<string, unknown> = {', end: '\n  };' },
  { file: PLAN_ENGINE, anchor: 'function buildQuoteItems', end: '\n}' },
  { file: TEMPLATE_ADAPTERS, anchor: 'const items = rows.map((r) => ({', end: '}));' },
];

function payloadBlocks(): Array<{ file: string; block: string }> {
  const out: Array<{ file: string; block: string }> = [];
  for (const { file, anchor, end } of QUOTE_ITEM_PAYLOADS) {
    const src = read(file);
    let from = 0;
    let found = 0;
    for (;;) {
      const start = src.indexOf(anchor, from);
      if (start === -1) break;
      const stop = src.indexOf(end, start + anchor.length);
      out.push({ file, block: src.slice(start, stop === -1 ? start + 4000 : stop) });
      from = start + anchor.length;
      found += 1;
    }
    // An anchor that stops matching means the payload was restructured and this guard went blind.
    expect(found, `no quote_items payload found in ${file} — the anchor "${anchor}" no longer matches`)
      .toBeGreaterThan(0);
  }
  return out;
}

describe('PQ-2 — the cost basis is not a column on a customer-readable row', () => {
  it('no quote_items payload carries a cost snapshot', () => {
    for (const { file, block } of payloadBlocks()) {
      expect(block, `${file} writes cost_snapshot into a quote_items payload again — that row is readable by the customer`)
        .not.toMatch(/cost_snapshot/);
    }
  });

  it('the quote row is never written with a margin_pct', () => {
    for (const rel of [QUOTES_SERVICE, TEMPLATE_ADAPTERS, TEMPLATE_SCHEMA]) {
      // `p_margin_pct` is the generate_client_quote RPC argument — the markup is chosen by the
      // operator and stored by the function into quote_costs. It is the COLUMN that must not
      // come back.
      const bare = read(rel).replace(/p_margin_pct/g, '');
      expect(bare, `${rel} sets margin_pct on a quote again — it lives in quote_costs, which only the sell side reads`)
        .not.toMatch(/margin_pct/);
    }
  });

  it('the quote template captures neither the markup nor a derived total', () => {
    const src = read(TEMPLATE_SCHEMA);
    const quoteBlock = src.slice(src.indexOf('  quote: {'), src.indexOf('  project: {'));
    expect(quoteBlock.length, 'the quote template block could not be located').toBeGreaterThan(100);
    for (const banned of ['margin_pct', 'extras_total', 'grand_total', 'subtotal', 'line_total']) {
      expect(quoteBlock, `the quote template captures ${banned} — a stored payload is untrusted input`)
        .not.toContain(banned);
    }
  });

  it('QuotesService reads the cost basis from its own table, and treats a failure as unknown', () => {
    const src = read(QUOTES_SERVICE);
    expect(src, 'getQuoteItemCosts is gone — the admin page has no cost to show')
      .toContain('getQuoteItemCosts');
    expect(src, 'the cost read no longer names quote_item_costs').toContain("from('quote_item_costs')");
    const fn = src.slice(src.indexOf('async getQuoteItemCosts'), src.indexOf('async updateQuote'));
    // A failed read must return an empty map (cost unknown, rendered as a dash), never zeros.
    expect(fn, 'a failed cost read no longer returns an empty map').toMatch(/return new Map\(\)/);
  });
});

describe('PQ-6 — SQL derives quote money, TypeScript formats it', () => {
  it('no quote_items payload carries a line_total', () => {
    for (const { file, block } of payloadBlocks()) {
      expect(
        block,
        `${file} writes line_total again — it is a generated column, and a client-computed total is ` +
        'the exact shape "the operator approves one number and the ledger records another"',
      ).not.toMatch(/line_total\s*:/);
    }
  });

  it('the pricing RPC payload carries only the prices the operator typed', () => {
    const src = read(PDF_SERVICE);
    const call = src.slice(src.indexOf("rpc('reprice_quote_items'"));
    const payload = call.slice(0, call.indexOf('p_vat_rate'));
    expect(payload.length, 'the reprice call could not be located').toBeGreaterThan(50);
    expect(payload, 'reprice_quote_items is being handed a line_total again').not.toContain('line_total');
    for (const kept of ['unit_price', 'discounted_price']) {
      expect(payload, `${kept} was dropped from the reprice payload — the save would clear it`).toContain(kept);
    }
  });

  it('nothing reads a cached extras_total off the quote row', () => {
    for (const rel of [QUOTES_SERVICE, 'src/modules/quotes/pages/QuoteDetailCustomerPage.tsx']) {
      expect(
        read(rel),
        `${rel} reads or writes quotes.extras_total again — the cache had one writer and it missed ` +
        'the delete path, so removing an accepted extra left the total overstated',
      ).not.toMatch(/quote(Data)?\??\.extras_total/);
    }
    expect(read(QUOTES_SERVICE), 'recalculateQuoteExtrasTotal is back — get_quote_totals derives it')
      .not.toContain('recalculateQuoteExtrasTotal');
    expect(read(QUOTES_SERVICE), 'getQuoteTotals is gone — the pages have nothing derived to read')
      .toContain('async getQuoteTotals');
  });

  it("the customer's upsell decision goes through the RPC, not a direct UPDATE", () => {
    const src = read(QUOTES_SERVICE);
    expect(src, 'the decision no longer goes through set_quote_upsell_decision')
      .toContain('set_quote_upsell_decision');
    // A direct update would also let the customer rewrite metadata.custom_price, which is what
    // get_quote_totals prices the extra from.
    expect(src, "quote_upsells is being updated directly again — that row carries the extra's PRICE")
      .not.toMatch(/from\('quote_upsells'\)\s*\.update\(/);
  });

  it('the public share page signs and shows DERIVED totals, not the stamped columns', () => {
    const src = read('supabase/functions/quote-public-share/index.ts');
    expect(src, 'quote-public-share no longer derives its totals').toContain("rpc('get_quote_totals'");
    const select = src.slice(src.indexOf(".from('quotes')"), src.indexOf(".eq('public_share_token'"));
    expect(select.length, 'the share page quote select could not be located').toBeGreaterThan(50);
    for (const stale of ['subtotal', 'vat_amount', 'grand_total', 'extras_total']) {
      expect(select, `the share page selects the stamped ${stale} again — it is stale between repricings`)
        .not.toContain(stale);
    }
  });
});

describe('PQ-13 / PQ-14 — a candidate list is scoped, and money input is validated', () => {
  const src = read('src/modules/projects/services/projectsService.ts');
  const fnBody = (name: string) => {
    const start = src.indexOf(`async ${name}(`);
    expect(start, `${name} is gone from projectsService`).toBeGreaterThan(-1);
    const next = src.indexOf('\n  async ', start + 10);
    return src.slice(start, next === -1 ? src.length : next);
  };

  it("the attach picker is scoped to the project's workspace", () => {
    const body = fnBody('listAttachableFinance');
    const tables = [...body.matchAll(/\.from\('(invoices|supplier_bills)'\)/g)];
    expect(tables.length, 'the picker stopped querying invoices / supplier_bills').toBe(2);
    for (const m of tables) {
      const chain = body.slice(m.index!, m.index! + 400);
      expect(chain, `${m[1]} is queried without a workspace filter — RLS spans every tenant the caller belongs to`)
        .toMatch(/\.eq\('workspace_id'/);
    }
    expect(body, 'the payable candidates are no longer flagged as related to this project')
      .toMatch(/projectSuppliers/);
  });

  it('the CRM pickers are scoped to the active workspace and fail closed', () => {
    for (const name of ['searchCompanies', 'searchContacts', 'searchProducts']) {
      const body = fnBody(name);
      expect(body, `${name} no longer scopes by workspace — the picker offers another tenant's records`)
        .toMatch(/\.eq\('workspace_id', ws\)/);
      expect(body, `${name} widens instead of failing closed when no workspace resolves`)
        .toMatch(/if \(!ws\) return \[\];/);
    }
  });

  it('the room budget rollup surfaces its read error instead of reporting zero spent', () => {
    const body = fnBody('getRoomBudgetSummary');
    expect(
      body,
      'the rollup discards its error again — every room then renders at zero spent, which reads as good news',
    ).toMatch(/throw itemsError/);
  });

  it('a project product price cannot be saved negative', () => {
    const tab = read('src/modules/projects/components/tabs/ProductsTab.tsx');
    expect(tab, 'the sold-price guard no longer rejects a negative').toMatch(/sold < 0/);
    expect(tab, 'quantity is back to `Number(qty) || 1`, which turns 0 into 1 and accepts -3')
      .not.toMatch(/Number\(qty\)\s*\|\|\s*1/);
  });
});

describe('PQ-9 — internal site photos are not served by public URL', () => {
  const src = read('src/modules/projects/services/siteService.ts');

  it('the photo bucket is private and the URL is signed', () => {
    expect(src, 'site photos are back in a public-read bucket')
      .not.toMatch(/SITE_PHOTO_BUCKET\s*=\s*'generation-images'/);
    expect(src, 'getPublicUrl is back — a defect photo of a client\'s home needs no session to open')
      .not.toContain('getPublicUrl');
    expect(src, 'the signed-URL reader is gone').toContain('createSignedUrls');
  });

  it('uploads are validated before they are sent', () => {
    const fn = src.slice(src.indexOf('async function uploadPhotos'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body, 'the MIME allowlist is no longer checked').toMatch(/ALLOWED_PHOTO_TYPES/);
    expect(body, 'the size cap is no longer checked').toMatch(/MAX_PHOTO_BYTES/);
  });
});
