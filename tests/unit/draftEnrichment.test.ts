import { describe, it, expect } from 'vitest';
import {
  acceptClaims, coerceValue, pageNamesProduct, quoteInPage, type RegistryField,
} from '../../supabase/functions/_shared/draft-enrichment';

const F = (name: string, field_type: string, extra: Partial<RegistryField> = {}): RegistryField => ({
  name, field_type, dropdown_options: null, validation_rules: null, ...extra,
});
const fields = [
  F('water_absorption', 'number', { validation_rules: { unit: '%', min: 0, max: 100 } }),
  F('slip_rating', 'dropdown', { dropdown_options: ['R9', 'R10', 'R11'] }),
  F('frost_resistant', 'boolean'),
  F('edge_type', 'text'),
];
const identity = { name: 'Nova Grey', sku: null, external_sku: 'NV-6060-G' };
const page = 'Nova Grey porcelain tile NV-6060-G. Water absorption: 0.5 % . Slip resistance R10. Frost resistant: yes. Rectified edge.';
const reply = (values: any[], over: Record<string, unknown> = {}) =>
  ({ product_match: 'exact', match_evidence: 'Nova Grey porcelain tile', values, ...over });

describe('draft enrichment: what may become a claim', () => {
  it('accepts a stated value whose quote is on the page and contains it', () => {
    const r = acceptClaims(reply([
      { key: 'water_absorption', value: '0.5 %', evidence: 'Water absorption: 0.5 %' },
      { key: 'slip_rating', value: 'r10', evidence: 'Slip resistance R10' },
      { key: 'frost_resistant', value: 'Yes', evidence: 'Frost resistant: yes' },
    ]), page, fields, identity);
    expect(r.claims.map((c) => [c.field, c.value])).toEqual([
      ['water_absorption', 0.5], ['slip_rating', 'R10'], ['frost_resistant', true],
    ]);
    expect(r.rejected).toEqual([]);
  });

  it('abstains entirely unless the page is the exact product', () => {
    for (const m of ['family_or_other', 'unclear']) {
      const r = acceptClaims(reply([{ key: 'edge_type', value: 'Rectified', evidence: 'Rectified edge' }], { product_match: m }), page, fields, identity);
      expect(r.claims).toEqual([]);
      expect(r.abstained).toContain(m);
    }
  });

  it('abstains when the page never names the product, however sure the model is', () => {
    const home = 'Welcome to Nova Tiles. Water absorption 0.5 % across our range.';
    const r = acceptClaims(reply([{ key: 'water_absorption', value: '0.5 %', evidence: 'Water absorption 0.5 %' }], { match_evidence: 'Welcome to Nova Tiles' }), home, fields, identity);
    expect(r.claims).toEqual([]);
    expect(r.abstained).toBe('page does not name this product');
  });

  it('rejects a quote that is not on the page', () => {
    const r = acceptClaims(reply([{ key: 'edge_type', value: 'Pressed', evidence: 'Pressed edge' }]), page, fields, identity);
    expect(r.claims).toEqual([]);
    expect(r.rejected[0].why).toBe('quote is not on the page');
  });

  it('rejects a real sentence offered for a value it does not contain', () => {
    const r = acceptClaims(reply([{ key: 'water_absorption', value: '0.1 %', evidence: 'Water absorption: 0.5 %' }]), page, fields, identity);
    expect(r.claims).toEqual([]);
    expect(r.rejected[0].why).toBe('quote does not contain the value');
  });

  it('keeps a digit inside a longer number from vouching for a shorter one', () => {
    const r = acceptClaims(reply([{ key: 'water_absorption', value: '5 %', evidence: 'Water absorption: 0.5 %' }]), page, fields, identity);
    expect(r.claims).toEqual([]);
  });

  it('drops keys nobody asked for, and a field stated twice', () => {
    const r = acceptClaims(reply([
      { key: 'cost_price', value: '3', evidence: 'Rectified edge' },
      { key: 'edge_type', value: 'Rectified', evidence: 'Rectified edge' },
      { key: 'edge_type', value: 'Rectified', evidence: 'Rectified edge' },
    ]), page, fields, identity);
    expect(r.claims.map((c) => c.field)).toEqual(['edge_type']);
    expect(r.rejected.map((x) => x.why)).toEqual(['not a field asked for', 'stated twice']);
  });
});

describe('draft enrichment: registry types decide the value', () => {
  it('refuses a unit that is not the registry unit, accepts a bare number', () => {
    expect(coerceValue(fields[0], '0.5 mm')).toMatchObject({ ok: false });
    expect(coerceValue(fields[0], '0,5')).toEqual({ ok: true, value: 0.5 });
  });
  it('refuses a number outside the registry range', () => {
    expect(coerceValue(fields[0], '140 %')).toMatchObject({ ok: false });
  });
  it('refuses a dropdown value that is not an option, and a boolean that is not yes/no', () => {
    expect(coerceValue(fields[1], 'R12')).toMatchObject({ ok: false });
    expect(coerceValue(fields[2], 'sometimes')).toMatchObject({ ok: false });
  });
});

describe('draft enrichment: identity helpers', () => {
  it('finds the product by article code even when the name is formatted differently', () => {
    expect(pageNamesProduct('Item nv 6060-g in stock', { name: 'Other', sku: null, external_sku: 'NV-6060-G' })).toBe(true);
    expect(pageNamesProduct('Brand homepage', identity)).toBe(false);
  });
  it('matches quotes ignoring case and whitespace only', () => {
    expect(quoteInPage('Frost   resistant:\nYES', 'frost resistant: yes')).toBe(true);
    expect(quoteInPage('Frost resistant', 'ab')).toBe(false);
  });
});

describe('draft enrichment: the quote must agree with the value, not just contain it', () => {
  const frost = [F('frost_resistant', 'boolean')];
  const thick = [F('thickness_mm', 'number', { validation_rules: { unit: 'mm' } }), F('weight_kg', 'number')];
  const p = 'Nova Grey tile NV-6060-G. Frost resistant: no. Not suitable outdoors. Thickness: 2 cm. Weight 12.5 lb. Rectified.';
  const one = (key: string, value: string, evidence: string, fs: RegistryField[]) =>
    acceptClaims({ product_match: 'exact', match_evidence: 'Nova Grey tile', values: [{ key, value, evidence }] }, p, fs, identity);

  it('refuses a yes when the quote says no, or negates the sentence', () => {
    expect(one('frost_resistant', 'yes', 'Frost resistant: no', frost).claims).toEqual([]);
    expect(one('frost_resistant', 'yes', 'Not suitable outdoors', frost).claims).toEqual([]);
  });

  it('accepts a no that the quote states, and a bare positive feature line', () => {
    expect(one('frost_resistant', 'no', 'Frost resistant: no', frost).claims[0]?.value).toBe(false);
    const badge = 'Nova Grey tile NV-6060-G. Frost resistant. Rectified.';
    const r = acceptClaims({ product_match: 'exact', match_evidence: 'Nova Grey tile', values: [{ key: 'frost_resistant', value: 'yes', evidence: 'Frost resistant' }] }, badge, frost, identity);
    expect(r.claims[0]?.value).toBe(true);
  });

  it('refuses a number whose quoted unit is not the registry unit', () => {
    const r = one('thickness_mm', '2', 'Thickness: 2 cm', thick);
    expect(r.claims).toEqual([]);
    expect(r.rejected[0].why).toBe('quote does not contain the value');
  });

  it('takes the unit from the field name when the registry has no unit rule', () => {
    expect(one('weight_kg', '12.5', 'Weight 12.5 lb', thick).claims).toEqual([]);
    const kg = acceptClaims({ product_match: 'exact', match_evidence: 'Nova Grey tile', values: [{ key: 'weight_kg', value: '12.5', evidence: 'Weight 12.5 kg' }] }, 'Nova Grey tile NV-6060-G. Weight 12.5 kg', thick, identity);
    expect(kg.claims[0]?.value).toBe(12.5);
  });
});
