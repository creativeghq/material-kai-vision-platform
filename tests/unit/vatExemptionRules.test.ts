/**
 * The 0%-VAT exemption suggester.
 *
 * Neither Novus nor AADE derives the exemption cause — they only validate the one you send — so
 * this table is the platform's own reading of the rule, and it is the kind of thing that rots
 * silently: a wrong cause still produces a well-formed document, transmits fine, and is wrong only
 * on the tax return.
 *
 * What these tests pin is the SHAPE of the judgement, not tax advice: that the same destination
 * answers differently for goods and services, that an unverified VAT number is never treated as
 * B2B proof, that a missing country produces no suggestion rather than an invented cross-border
 * sale, and that anything uncertain is reported `low` so the UI cannot auto-apply it.
 */
import { describe, expect, it } from 'vitest';

import { suggestVatExemption } from '@/modules/finance/utils/vatExemptionRules';

const GREEK_SELLER = { sellerCountry: 'GR' as const };
const euBusiness = (supply: 'goods' | 'services' | 'unknown' = 'goods') => ({
  ...GREEK_SELLER, buyerCountry: 'DE', buyerVatNumber: 'DE811907980', buyerVatValidated: true, supply,
});

describe('suggestVatExemption', () => {
  describe('domestic', () => {
    it('suggests no exemption for a Greek buyer — VAT simply applies', () => {
      const s = suggestVatExemption({ ...GREEK_SELLER, buyerCountry: 'GR', supply: 'goods' });

      expect(s.code).toBeNull();
      expect(s.confidence).toBe('high');
      expect(s.caveat).toMatch(/art\. 22|39a/);
    });

    it('treats the GR address code and the EL VAT prefix as the same country', () => {
      // Greece is the one country where ISO and VAT prefix diverge. Miss this and every domestic
      // sale reads as cross-border and gets handed an export exemption.
      const iso = suggestVatExemption({ sellerCountry: 'GR', buyerCountry: 'EL', supply: 'goods' });
      const prefix = suggestVatExemption({ sellerCountry: 'EL', buyerCountry: 'GR', supply: 'goods' });

      expect(iso.code).toBeNull();
      expect(prefix.code).toBeNull();
      expect(iso.rationale).toMatch(/domestic/i);
      expect(prefix.rationale).toMatch(/domestic/i);
    });
  });

  describe('EU B2B', () => {
    it('suggests art. 28 (14) for goods to a VIES-verified business', () => {
      const s = suggestVatExemption(euBusiness('goods'));

      expect(s.code).toBe(14);
      expect(s.confidence).toBe('high');
      expect(s.label).toMatch(/art\. 28/);
    });

    it('suggests art. 14 (4) for services — the same buyer, a different answer', () => {
      const s = suggestVatExemption(euBusiness('services'));

      expect(s.code).toBe(4);
      expect(s.confidence).toBe('high');
    });

    it('drops to low confidence and says so when goods-vs-services is unknown', () => {
      const s = suggestVatExemption(euBusiness('unknown'));

      expect(s.code).toBe(14);
      expect(s.confidence).toBe('low');
      expect(s.caveat).toMatch(/service/i);
    });
  });

  describe('an unverified VAT number is not B2B proof', () => {
    it('does not treat an unvalidated VAT number as an intra-community supply', () => {
      const s = suggestVatExemption({
        ...GREEK_SELLER, buyerCountry: 'DE', buyerVatNumber: 'DE811907980',
        buyerVatValidated: false, supply: 'goods',
      });

      expect(s.code).not.toBe(14);
      expect(s.confidence).toBe('low');
      expect(s.caveat).toMatch(/VIES/i);
    });

    it('routes an EU consumer buying goods to distance sales, at low confidence', () => {
      const s = suggestVatExemption({ ...GREEK_SELLER, buyerCountry: 'FR', supply: 'goods' });

      expect(s.code).toBe(29);
      expect(s.confidence).toBe('low');
    });

    it('suggests NO exemption for services to an EU consumer', () => {
      const s = suggestVatExemption({ ...GREEK_SELLER, buyerCountry: 'FR', supply: 'services' });

      expect(s.code).toBeNull();
    });
  });

  describe('outside the EU', () => {
    it('suggests art. 24 (8) for exported goods', () => {
      const s = suggestVatExemption({ ...GREEK_SELLER, buyerCountry: 'US', supply: 'goods' });

      expect(s.code).toBe(8);
      expect(s.confidence).toBe('high');
      expect(s.caveat).toMatch(/evidence|proof/i);
    });

    it('suggests art. 14 (4) for services, not the export cause', () => {
      const s = suggestVatExemption({ ...GREEK_SELLER, buyerCountry: 'US', supply: 'services' });

      expect(s.code).toBe(4);
    });
  });

  describe('refuses to guess', () => {
    it('suggests nothing when the customer has no country — the real state of most records', () => {
      // ΚΩΣΤΑΣ ΑΛΕΞΙΟΥ, the customer on ORD-2026-0005, has neither country nor VAT number.
      const s = suggestVatExemption({ ...GREEK_SELLER, buyerCountry: null, buyerVatNumber: null });

      expect(s.code).toBeNull();
      expect(s.confidence).toBe('low');
      expect(s.rationale).toMatch(/no country/i);
    });

    it('declines entirely for a non-Greek issuer rather than applying Greek articles', () => {
      const s = suggestVatExemption({ sellerCountry: 'DE', buyerCountry: 'US', supply: 'goods' });

      expect(s.code).toBeNull();
      expect(s.rationale).toMatch(/Greek issuer only/i);
    });
  });

  it('only ever returns codes that exist in the ΑΑΔΕ catalog', () => {
    const cases: Array<Parameters<typeof suggestVatExemption>[0]> = [
      { ...GREEK_SELLER, buyerCountry: 'GR', supply: 'goods' },
      euBusiness('goods'), euBusiness('services'), euBusiness('unknown'),
      { ...GREEK_SELLER, buyerCountry: 'FR', supply: 'goods' },
      { ...GREEK_SELLER, buyerCountry: 'US', supply: 'goods' },
      { ...GREEK_SELLER, buyerCountry: 'US', supply: 'services' },
      { ...GREEK_SELLER, buyerCountry: 'US', supply: 'unknown' },
    ];

    for (const c of cases) {
      const s = suggestVatExemption(c);
      if (s.code != null) {
        expect(s.code, `${JSON.stringify(c)} produced an out-of-range cause`).toBeGreaterThanOrEqual(1);
        expect(s.code).toBeLessThanOrEqual(31);
        // A code with no label is a code myDATA does not know.
        expect(s.label, `cause ${s.code} is not in the catalog`).toBeTruthy();
      }
    }
  });
});
