import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const TOOLS = stripComments(
  readFileSync(join(__dirname, '..', '..', 'supabase/functions/_shared/tools/price-tools.ts'), 'utf8').replace(/\r\n/g, '\n'),
);
const LOOKUP = TOOLS.slice(0, TOOLS.indexOf('createSubmitPriceProposalTool'));

describe('price_lookup → SQL resolver', () => {
  it('asks the database for the purchase price instead of leaving the arithmetic to the model', () => {
    expect(LOOKUP).toMatch(/rpc\('resolve_purchase_prices'/);
    expect(LOOKUP).toMatch(/resolved_prices: resolvedPrices/);
  });

  it('a failed document search is an error, never "no price on file", and the resolver still answers', () => {
    expect(LOOKUP).toMatch(/kbFailure\(/);
    expect(LOOKUP).toMatch(/branch_status\?\.kb_docs/);
    expect(LOOKUP).not.toMatch(/success: false,\s*error: `Knowledge Base search failed/);
  });

  it('a list price is never presented as the purchase price', () => {
    expect(LOOKUP).toMatch(/Do NOT present it as the purchase price/);
  });
});
