import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const EDGE = read('supabase/functions/quote-buy-prices/index.ts');
const PAGE = read('src/modules/quotes/pages/QuoteDetailAdminPage.tsx');
const CUSTOMER_PAGE = read('src/modules/quotes/pages/QuoteDetailCustomerPage.tsx');
const PDF = read('src/modules/quotes/services/QuotePDFService.ts');

describe('buy prices answer to user_can_see_quote_buy_prices, asked as the caller', () => {
  it('quote-buy-prices gates on the rule as the user, before reading price lists', () => {
    const gate = EDGE.indexOf("asUser.rpc('user_can_see_quote_buy_prices'");
    expect(gate).toBeGreaterThan(-1);
    expect(EDGE).not.toMatch(/userHasWorkspaceCapability/);
    expect(gate).toBeLessThan(EDGE.indexOf("rpc('resolve_purchase_prices'"));
    expect(gate).toBeLessThan(EDGE.indexOf('debitExternalServiceCredits('));
  });

  it('the operator page shows buy prices only when the rule says yes, hidden until it answers', () => {
    expect(PAGE).toMatch(/rpc\('user_can_see_quote_buy_prices'/);
    expect(PAGE).toMatch(/useState\(false\);\s*const showCost = salesCanSeeCost && costAllowed;/);
    expect(PAGE).not.toMatch(/\{salesCanSeeCost &&/);
  });

  it('nothing the customer sees reads a cost', () => {
    for (const src of [CUSTOMER_PAGE, PDF]) {
      expect(src).not.toMatch(/quote_item_costs|quote_costs|cost_snapshot|findBuyPrices/);
    }
  });
});
