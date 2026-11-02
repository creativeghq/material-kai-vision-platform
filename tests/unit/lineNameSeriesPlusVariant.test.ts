/** A document line is named series + chosen variant ("Ardenza Gold 60x120"), derived once in SQL. */
import { describe, it, expect } from 'vitest';

import { blankedSource } from '../helpers/sourceIndex';
import {
  composeLineName,
  nameCarries,
  partsNotInName,
} from '@/modules/finance/invoice-templates/lineName';

/**
 * The truth table SQL `public.compose_line_name` returned when it was applied (2026-11-02):
 * `select compose_line_name(base, values)` for each row gave exactly the third column.
 */
const TRUTH: Array<[string, string[], string | null]> = [
  ['Ardenza', ['Gold', '60x120'], 'Ardenza Gold 60x120'],
  ['Ardenza 60x120', ['Gold', '60x120'], 'Ardenza 60x120 Gold'],
  ['  Ardenza   Golden ', ['gold', 'Gold'], 'Ardenza Golden gold'],
  ['', ['Gold'], null],
  ['Ardenza', [], 'Ardenza'],
  ['Ardenza', ['  ', 'Matt  Black'], 'Ardenza Matt Black'],
  ['ΑΡΝΤΕΝΖΑ Χρυσό', ['χρυσό'], 'ΑΡΝΤΕΝΖΑ Χρυσό'],
];

describe('composeLineName — twin of SQL compose_line_name', () => {
  it.each(TRUTH)('%j + %j → %j', (base, values, expected) => {
    expect(composeLineName(base, values)).toBe(expected);
  });

  it('matches whole words only, so "Gold" is not hidden by "Golden"', () => {
    expect(nameCarries('Ardenza Golden', 'Gold')).toBe(false);
    expect(nameCarries('Ardenza Gold 60x120', 'gold')).toBe(true);
  });

  it('a renderer prints beside the name only what the name does not carry', () => {
    expect(partsNotInName('Ardenza Gold 60x120', ['Gold', '60x120'])).toEqual([]);
    expect(partsNotInName('Ardenza', ['Gold', null, ''])).toEqual(['Gold']);
    expect(partsNotInName(undefined, ['Gold'])).toEqual(['Gold']);
  });
});

describe('the transmitted description is the printed one (rule 1c)', () => {
  const builder = blankedSource('supabase/functions/_shared/fiscal/invoice-builder.ts');

  it('the myDATA envelope sends the stored line description verbatim', () => {
    expect(builder).toMatch(/description:\s*it\.description \?\? 'Item',/);
    expect(builder).not.toMatch(/composeLineDescription/);
  });

  it('the envelope never rebuilds a name from the variant columns', () => {
    expect(builder).not.toMatch(/color:\s*it\.selected_color/);
    expect(builder).not.toMatch(/attributes:\s*it\.selected_attributes/);
  });
});

describe('quote surfaces name a line from SQL, never from bare products.name', () => {
  const SQL_NAMED: Array<[string, RegExp]> = [
    ['supabase/functions/generate-quote-pdf/data-fetcher.ts', /product_name:\s*lineNames\[item\.id\]\s*\|\|/],
    ['supabase/functions/quote-public-share/index.ts', /name:\s*lineNames\[it\.id\]\s*\|\|/],
  ];

  it.each(SQL_NAMED)('%s asks get_line_names and prefers its answer', (file, preferred) => {
    const text = blankedSource(file);
    expect(text).toMatch(/rpc\('get_line_names',/);
    expect(text).toMatch(preferred);
  });

  it('the quote editor asks SQL and only composes a name locally while that answer is pending', () => {
    const text = blankedSource('src/modules/quotes/components/QuoteItemsList.tsx');
    expect(text).toMatch(/lineIdentityService\.lineNames\(/);
    expect(text).toMatch(/lineNames\.get\(item\.id\)\s*\?\?\s*composeLineName\(/);
  });

  it('the service calls the one RPC', () => {
    expect(blankedSource('src/services/lineIdentityService.ts')).toMatch(/rpc\('get_line_names',/);
  });
});

describe('a renderer does not print the variant twice', () => {
  const RENDERERS = [
    'supabase/functions/finance-invoice-pdf/index.ts',
    'supabase/functions/generate-quote-pdf/index.ts',
    'supabase/functions/generate-quote-pdf/data-fetcher.ts',
    'src/modules/finance/invoice-templates/renderData.ts',
    'src/pages/PublicQuotePage.tsx',
    'src/modules/quotes/components/QuoteItemsList.tsx',
  ];

  it.each(RENDERERS)('%s filters the variant detail through partsNotInName', (file) => {
    expect(blankedSource(file)).toMatch(/partsNotInName\(/);
  });

  it('no renderer prints selected_size / selected_color raw beside the name', () => {
    const raw = /\{\s*(it|item)\.selected_(size|color)\s*&&/;
    const offenders = RENDERERS.filter((f) => raw.test(blankedSource(f)));
    expect(offenders).toEqual([]);
  });
});
