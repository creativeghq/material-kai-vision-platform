/**
 * A configuration survives the quote, and the document says what was chosen (#375).
 *
 * `add_configuration_to_quote` turned a saved configuration into a QUOTE line. Everything after
 * that dropped it, in four ways that share one property: none of them errors.
 *
 *  1. The choices were written into `quote_items.selected_attributes` — the column that means
 *     VARIANT IDENTITY everywhere else. `_variant_key()` turns `{"Frame colour":"Black"}` into
 *     `frame colour=black`, and `_resolve_warehouse_item` and `get_product_price_for_workspace`
 *     both take that for a real variant. So a configured line asked the warehouse for stock of a
 *     variant that does not exist — and the resolver's `p_create` path would have minted the row
 *     rather than fail.
 *  2. `product_configuration_id` lived only on `quote_items`, so the order and the invoice born
 *     from that quote could not name the configuration or re-price it.
 *  3. `update_warehouse` defaults true, so accepting the quote reserved warehouse stock for a
 *     made-to-order assembly.
 *  4. The option labels lived in `quote_items.notes`, which the conversion does not copy. The
 *     order, the invoice and the customer's PDF said only the product name while the price
 *     included the deltas — a document whose total the reader cannot account for (rule 1c).
 *
 * The SQL half of this is verified by a rolled-back probe against the live database (quote →
 * order → invoice, asserting each carries the snapshot and that the order line is not
 * stock-moving); SQL in this project is never committed, so this file guards the TypeScript half:
 * the pricing branch that must not fall through, and the two renderers that must print it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  configuredOptionsLabel,
  lineDetailLabel,
} from '../../src/modules/finance/invoice-templates/configuredOptions';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const ORDERS = 'src/modules/finance/services/ordersService.ts';
const INVOICE_PDF = 'supabase/functions/finance-invoice-pdf/index.ts';
const QUOTE_FETCHER = 'supabase/functions/generate-quote-pdf/data-fetcher.ts';
const SOURCE = 'src/modules/finance/invoice-templates/configuredOptions.ts';

describe('#375 — what the line prints', () => {
  it('renders the frozen snapshot, group by group', () => {
    const snapshot = [
      { group_label: 'Frame colour', value_label: 'Black', price_delta: 25 },
      { group_label: 'Handle', value_label: 'Brass', price_delta: 40 },
    ];
    expect(configuredOptionsLabel(snapshot)).toBe('Frame colour: Black · Handle: Brass');
  });

  it('says null — not an empty string — when the line is not configured', () => {
    // A caller has to be able to tell "no options" from "options that rendered to nothing", or it
    // cannot decide whether to fall back to what it printed before.
    expect(configuredOptionsLabel([])).toBeNull();
    expect(configuredOptionsLabel(null)).toBeNull();
    expect(configuredOptionsLabel('[]')).toBeNull();
    expect(configuredOptionsLabel([{ price_delta: 5 }])).toBeNull();
  });

  it('prints the variant AND the configuration, because a line can have both', () => {
    const cfg = [{ group_label: 'Handle', value_label: 'Brass' }];
    expect(lineDetailLabel('Nero / 60x60', cfg)).toBe('Nero / 60x60 · Handle: Brass');
    expect(lineDetailLabel('Nero / 60x60', [])).toBe('Nero / 60x60');
    expect(lineDetailLabel(null, cfg)).toBe('Handle: Brass');
    expect(lineDetailLabel(null, [])).toBe('');
  });

  it('both customer documents render it', () => {
    // The invoice composes line detail in exactly one place (`variantOf`), and the quote in one
    // (`variant_label`), which is why neither needed a change at its render sites.
    expect(src(INVOICE_PDF)).toMatch(/lineDetailLabel\(variant, it\?\.configured_options\)/);
    expect(src(QUOTE_FETCHER)).toMatch(/lineDetailLabel\(variantLabels\[item\.id\] \?\? null, item\.configured_options\)/);
  });

  it("the operator's screen says what the customer's document says", () => {
    // The PDF prints the options; the order line beside it printed the product name and an empty
    // variant picker. Same fact, two surfaces — and the one the operator uses to answer "what did
    // they order?" was the one that did not know.
    const panel = src('src/modules/finance/components/OrdersPanel.tsx');
    expect(panel).toMatch(/configuredOptionsLabel\(l\.configured_options\)/);
    // Read-only on purpose: the price was frozen from these choices, so editing them here would
    // change what the customer was quoted without re-pricing it.
    expect(panel).not.toMatch(/onChange=\{[^}]*configured_options/);
  });

  it('the order-item select carries the columns the screen and the re-price need', () => {
    // ORDER_ITEM_SELECT is an explicit list — its own comment says a column added later is
    // invisible until someone adds it. That is the fail-closed default, and also the trap.
    const orders = src(ORDERS);
    const list = orders.slice(orders.indexOf('const ORDER_ITEM_SELECT'), orders.indexOf("].join(', ')"));
    expect(list).toMatch(/'configured_options'/);
    expect(list).toMatch(/'product_configuration_id'/);
  });

  it('the quote fetcher actually selects the column it renders', () => {
    // Its query is an explicit column list, so a renderer added without the column reads
    // `undefined` and prints nothing — with no error anywhere. This is the whole failure mode.
    const fetcher = src(QUOTE_FETCHER);
    const select = fetcher.slice(fetcher.indexOf("from('quote_items')"));
    expect(select.slice(0, select.indexOf('`', select.indexOf('.select(`') + 10))).toMatch(/configured_options/);
  });
});

describe('#375 — a configured line does not fall through to the plain price', () => {
  it('resolveLinePricing has an explicit configured branch', () => {
    const orders = src(ORDERS);
    expect(orders).toMatch(/optionValueIds\?: string\[\] \| null;/);
    expect(orders).toMatch(/rpc\('get_configured_product_price'/);
  });

  it('the branch comes BEFORE the standard resolver', () => {
    // Order, not presence: a configured branch after the standard call is not a branch. Falling
    // through drops every delta and re-prices the line at the plain product price — a smaller
    // number that is a perfectly valid one, so nothing raises.
    const orders = src(ORDERS);
    const fn = orders.slice(orders.indexOf('async resolveLinePricing('));
    const configured = fn.indexOf("get_configured_product_price");
    const standard = fn.indexOf("rpc('get_product_price_for_workspace'");
    expect(configured).toBeGreaterThan(-1);
    expect(standard).toBeGreaterThan(-1);
    expect(configured).toBeLessThan(standard);
  });

  it('an invalid combination has no price, and a failure refuses rather than falls through', () => {
    const orders = src(ORDERS);
    const fn = orders.slice(orders.indexOf('async resolveLinePricing('));
    const branch = fn.slice(fn.indexOf('const optionIds'), fn.indexOf("rpc('get_product_price_for_workspace'"));
    // A combination the rules forbid must not carry a sellable number.
    expect(branch).toMatch(/is_valid === false/);
    // And the catch must return, not fall past — the standard resolver would answer confidently
    // with the unconfigured price, which is exactly what this branch exists to prevent.
    expect(branch).toMatch(/catch \{[\s\S]*?return \{ unit_price: null/);
  });

  it('nothing sums price_delta in TypeScript', () => {
    // The sibling of configuratorMoneyDerivation.test.ts, applied to the line path: the deltas
    // are added by `get_configured_product_price`, and a second sum here would be a second
    // derivation of a money quantity that agrees today and drifts later.
    for (const file of [ORDERS, INVOICE_PDF, QUOTE_FETCHER, SOURCE]) {
      const text = src(file);
      expect(text, `${file} adds up price_delta`).not.toMatch(/price_delta\s*[)+]/);
      expect(text, `${file} reduces over price_delta`).not.toMatch(/reduce\([^)]*price_delta/);
    }
  });
});
