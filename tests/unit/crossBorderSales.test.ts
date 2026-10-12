import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { saleRegimeForCountry } from '@/lib/vatCountries';
import { mydataIncomeClassificationType, mydataIncomeClassificationCategory } from '@/services/fiscal/fiscalVocabulary';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

describe('#377 ViDA gap 1 — a sale to a buyer outside Greece is a cross-border document', () => {
  it('derives the regime from the buyer country, ISO or VAT prefix alike', () => {
    expect(saleRegimeForCountry('GR', true)).toBe('domestic');
    expect(saleRegimeForCountry('EL', true)).toBe('domestic');
    expect(saleRegimeForCountry(null, true)).toBe('domestic');
    expect(saleRegimeForCountry('BG', true)).toBe('intra_community');
    expect(saleRegimeForCountry('de', null)).toBe('intra_community');
    expect(saleRegimeForCountry('CH', true)).toBe('export');
    expect(saleRegimeForCountry('US', true)).toBe('export');
  });

  it('a consumer abroad stays domestic: OSS distance sales are not modelled, so nothing invents a 1.2 for them', () => {
    expect(saleRegimeForCountry('DE', false)).toBe('domestic');
  });

  it('classifies cross-border income as foreign sales, never as domestic wholesale', () => {
    expect(mydataIncomeClassificationType('1.2')).toBe('E3_561_005');
    expect(mydataIncomeClassificationType('2.2')).toBe('E3_561_005');
    expect(mydataIncomeClassificationType('1.3')).toBe('E3_561_006');
    expect(mydataIncomeClassificationType('2.3')).toBe('E3_561_006');
    expect(mydataIncomeClassificationType('1.1')).toBe('E3_561_001');
    expect(mydataIncomeClassificationCategory('2.2')).toBe('category1_3');
    expect(mydataIncomeClassificationCategory('1.2')).toBe('category1_1');
  });

  it('a product\'s stored domestic code never overrides the cross-border classification', () => {
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    expect(builder).toMatch(/isCrossBorderDoc \? incType : productIncomeType\(prod\) \?\? incType/);
  });

  it('names the counterpart for a buyer outside Greece', () => {
    expect(read('supabase/functions/_shared/fiscal/novus.ts'))
      .toMatch(/statesGoods \|\| \(counterpart\.country && counterpart\.country !== 'GR'\) \? \{ name:/);
  });

  it('refuses to issue a cross-border document that contradicts its buyer, carries Greek VAT, or lacks a VIES check', () => {
    const fn = read('supabase/functions/finance-issue-invoice/index.ts');
    const gate = fn.slice(fn.indexOf('const crossBorder = CROSS_BORDER_TYPES[docType]'));
    expect(gate).toMatch(/saleRegimeForCountry\(country, true\)/);
    expect(gate).toMatch(/\.gt\('vat_percent', 0\)/);
    expect(gate).toMatch(/crossBorder === 'intra_community' && !\(isCompany && buyer\.vat_validated === true\)/);
    expect(fn).toContain("'1.2': 'intra_community', '2.2': 'intra_community', '1.3': 'export', '2.3': 'export'");
  });
});

describe("#377 ViDA gap 2 — a party's Peppol electronic address", () => {
  it("is looked up in the Peppol Directory through the SSRF guard, inside the caller's CRM scope", () => {
    const h = read('supabase/functions/crm-api/handlers/companies-api-handler.ts');
    const route = h.slice(h.indexOf("path[1] === 'peppol-lookup'"));
    expect(route.slice(0, 800)).toMatch(/!scopeAllows\(scope, company\.workspace_id\)/);
    expect(route).toMatch(/fetchTextGuarded\(\s*`https:\/\/directory\.peppol\.eu\/search\/1\.0\/json/);
    expect(route).toMatch(/peppol_checked_at: new Date\(\)\.toISOString\(\)/);
  });
});
