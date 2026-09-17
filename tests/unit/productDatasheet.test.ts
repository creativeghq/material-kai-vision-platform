import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const FN = blankComments(
  readFileSync(join(process.cwd(), 'supabase/functions/product-datasheet-pdf/index.ts'), 'utf8')
    .replace(/\r\n/g, '\n'),
);

describe('the datasheet is the supplier’s document, not the catalogue reader’s', () => {
  it('refuses the catalogue tier, because the PDF carries the workspace letterhead', () => {
    expect(FN).toMatch(/tier !== 'internal' && tier !== 'member'/);
    expect(FN, 'a refusal must be 404, never 403').toMatch(/tier !== 'member'\) return json\(\{ error: 'Not found' \}, 404\)/);
  });

  it('authorization comes from the RPC running as the caller, not from this function', () => {
    const rpc = FN.slice(FN.indexOf('get_product_detail') - 300, FN.indexOf('get_product_detail'));
    expect(rpc).toMatch(/asUser/);
  });
});

describe('an internal field never reaches a customer copy', () => {
  it('the denylist pattern is FETCHED, not restated in this file', () => {
    expect(FN).toMatch(/rpc\('internal_product_field_pattern'\)/);
    expect(FN, 'a hand-written copy of the denylist drifts from the DB')
      .not.toMatch(/wholesale\|margin|markup\|profit/);
  });

  it('an unreadable or missing pattern withholds everything', () => {
    expect(FN).toMatch(/catch \{\s*isInternal = \(\) => true;/);
    expect(FN).toMatch(/if \(!patternText\) isInternal = \(\) => true;/);
  });
});

describe('the document is built once and not cached', () => {
  it('reuses the shared branded renderer rather than a second idea of the brand', () => {
    expect(FN).toMatch(/renderBrandedDocument/);
    expect(FN).toMatch(/fetchBrandingConfig/);
  });

  it('a render or storage failure is reported, never returned as an empty link', () => {
    expect(FN).toMatch(/Could not render the datasheet/);
    expect(FN).toMatch(/Could not store the datasheet/);
    expect(FN).toMatch(/Could not sign the datasheet/);
  });
});
