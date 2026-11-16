import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { supplierLinesNote } from '../../supabase/functions/_shared/tools/price-supplier-lines';

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

  it('a cited source stays verifiable from the price rows after the documents are deleted', () => {
    expect(TOOLS).toMatch(/from\('kb_price_rows'\)\s*\.select\('kb_doc_id, doc_slug'\)/);
  });

  it('a supplier named with no matching item answers with that supplier\'s product lines, never a guessed price', () => {
    expect(TOOLS).toMatch(/rpc\('price_supplier_hints'/);
    expect(TOOLS).toMatch(/supplier_product_lines:/);
    const SEARCH = stripComments(
      readFileSync(join(__dirname, '..', '..', 'supabase/functions/_shared/tools/search-tools.ts'), 'utf8').replace(/\r\n/g, '\n'),
    );
    expect(SEARCH).toMatch(/rpc\('price_supplier_hints'/);
  });

  it('a named supplier\'s collections are attached even when the resolver returned rows, from one note', () => {
    expect(LOOKUP).not.toMatch(/resolvedPrices\.length === 0\)\s*\{\s*const \{ data: sh \} = await sb\.rpc\('price_supplier_hints'/);
    expect(LOOKUP).toMatch(/supplier_product_lines_note: supplierLinesNote\(supplierLines, resolvedPrices\)/);
    const SEARCH = stripComments(
      readFileSync(join(__dirname, '..', '..', 'supabase/functions/_shared/tools/search-tools.ts'), 'utf8').replace(/\r\n/g, '\n'),
    );
    expect(SEARCH).toMatch(/supplier_product_lines_note = supplierLinesNote\(lines, priced \?\? \[\]\)/);
  });

  it('rows from other suppliers are never read as "no price list for the one named"', () => {
    const del = [{ supplier: 'Del Conca' }];
    expect(supplierLinesNote([], [{ supplier: 'Izida 1894' }])).toBeUndefined();
    expect(supplierLinesNote(del, [])).toMatch(/no price row matched/);
    expect(supplierLinesNote(del, [{ supplier: 'Izida 1894' }])).toMatch(/Del Conca, whose price list IS on file/);
    expect(supplierLinesNote(del, [{ supplier: 'Del Conca' }])).toMatch(/collection CODE/);
  });

  it('a price question to knowledge_base_search is answered from the same resolver, admin only', () => {
    const SEARCH = stripComments(
      readFileSync(join(__dirname, '..', '..', 'supabase/functions/_shared/tools/search-tools.ts'), 'utf8').replace(/\r\n/g, '\n'),
    );
    const block = SEARCH.slice(SEARCH.indexOf("rpc('resolve_purchase_prices'") - 400, SEARCH.indexOf("rpc('resolve_purchase_prices'") + 200);
    expect(block).toMatch(/if \(isAdmin && /);
    expect(SEARCH).toMatch(/resolved_prices_note/);
  });
});
