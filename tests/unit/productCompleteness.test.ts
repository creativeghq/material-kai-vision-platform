import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const PAGE = 'src/pages/MaterialComparePage.tsx';
const TYPES = 'src/integrations/supabase/types.ts';

describe('completeness is derived, never stored', () => {
  it('the page reads the derivation, not a column', () => {
    const code = blankComments(read(PAGE));
    expect(code).toMatch(/rpc\('product_completeness'/);
    expect(code, 'a stored copy is a cache with nothing to refresh it')
      .not.toMatch(/completeness_score/);
  });

  it('products carries no completeness_score column to drift from it', () => {
    const types = read(TYPES);
    const productsBlock = types.slice(
      types.indexOf('      products: {'),
      types.indexOf('      products: {') + 12000,
    );
    expect(productsBlock).not.toMatch(/completeness_score/);
  });

  it('an absent score renders as a dash, never as 0%', () => {
    const code = blankComments(read(PAGE));
    const bar = code.match(/function ScoreBar\([\s\S]*?\n\}/);
    expect(bar, 'ScoreBar should exist').not.toBeNull();
    expect(bar![0], 'null must short-circuit before any percentage is computed')
      .toMatch(/value === null\) return/);
    const nullReturn = bar![0].indexOf('value === null) return');
    const pctCalc = bar![0].indexOf('Math.round');
    expect(nullReturn).toBeLessThan(pctCalc);
  });

  it('an unrecognised category is labelled rather than scored silently', () => {
    const code = blankComments(read(PAGE));
    expect(code).toMatch(/category_not_in_registry/);
  });
});
