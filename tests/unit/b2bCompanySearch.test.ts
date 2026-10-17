/** B2B research: the company type is part of the request, and a match needs proof (#473). */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { strippedSource } from '../helpers/sourceIndex';
import { B2B_COMPANY_TYPES, B2B_RECORDED_COMPANY_TYPES } from '../../src/config/b2bCompanyTypes';
import {
  classifyCompanyRows,
  companyTypeDefinitions,
  CompanyTypeNotConfigured,
  normaliseCompanyTypes,
  normaliseKeywords,
  renderCompanyTypesClause,
  renderNativeTerms,
} from '../../supabase/functions/_shared/b2b-company-query.ts';
import type { VocabularyTerm } from '../../supabase/functions/_shared/vocabularies.ts';

const ROOT = process.cwd();
const B2B = strippedSource(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts'));
const FLOW = strippedSource(join(ROOT, 'supabase/functions/flow-engine/index.ts'));

const typeRow = (value: string, terms: Record<string, string[]> = {}): VocabularyTerm => ({
  value,
  label: value,
  group_key: null,
  group_label: null,
  sort_order: 0,
  metadata: {
    definition: `${value} definition`,
    core_business_test: `${value} test`,
    counter_examples: ['a lookalike'],
    terms_by_language: terms,
  },
});
const market = (value: string, language_code: string, language_name: string): VocabularyTerm => ({
  value, label: value, group_key: 'g', group_label: 'G', sort_order: 0, metadata: { language_code, language_name },
});

describe('the company-type vocabulary', () => {
  it('a recorded row may be any requested type, or other — nothing else', () => {
    expect([...B2B_RECORDED_COMPANY_TYPES]).toEqual([...B2B_COMPANY_TYPES, 'other']);
  });

  it('the search tool takes the type as an enum from the mirrored vocabulary, never a typed list', () => {
    expect(B2B).toMatch(/company_types:\s*z\.array\(z\.enum\(B2B_COMPANY_TYPES\)\)/);
    expect(B2B).toMatch(/from '\.\.\/b2bCompanyTypes\.generated\.ts'/);
  });

  it('an unknown or empty request narrows to the vocabulary, defaulting to manufacturer', () => {
    expect(normaliseCompanyTypes(undefined)).toEqual(['manufacturer']);
    expect(normaliseCompanyTypes(['nonsense'])).toEqual(['manufacturer']);
    expect(normaliseCompanyTypes('stock_trader, distributor')).toEqual(['stock_trader', 'distributor']);
    expect(normaliseKeywords('outlet, , stock lots')).toEqual(['outlet', 'stock lots']);
  });

  it('a requested type with no vocabulary row is REFUSED, never searched without its definition', () => {
    expect(() => companyTypeDefinitions([typeRow('manufacturer')], ['stock_trader'])).toThrow(CompanyTypeNotConfigured);
  });
});

describe('the query is rendered from the rows', () => {
  const defs = companyTypeDefinitions(
    [typeRow('stock_trader', { it: ['prezzi di stock', 'fine serie'], da: ['restpartier'] })],
    ['stock_trader'],
  );

  it('carries each type\'s definition, core-business test and counter-examples', () => {
    const clause = renderCompanyTypesClause(defs);
    expect(clause).toContain('stock_trader definition');
    expect(clause).toContain('stock_trader test');
    expect(clause).toContain('a lookalike');
  });

  it('crosses the market language with the type\'s trade terms', () => {
    expect(renderNativeTerms(defs, [market('Italy', 'it', 'Italian')])).toBe('- Italian: prezzi di stock, fine serie');
    expect(renderNativeTerms(defs, [market('Poland', 'pl', 'Polish')])).toBe('');
  });

  it('no caller reads the retired manufacturer-only prompt rows or builds its own query', () => {
    for (const [name, src] of [['b2b-tools', B2B], ['flow-engine', FLOW]] as const) {
      expect(src.includes("'b2b_manufacturer_query'"), `${name} reads b2b_manufacturer_query`).toBe(false);
      expect(/getToolPrompt\([^)]*'b2b_manufacturer_search'/.test(src), `${name} reads the manufacturer system prompt`).toBe(false);
      expect(src.includes('renderCompanySearch('), `${name} must render through renderCompanySearch`).toBe(true);
    }
  });
});

describe('a match needs evidence (rule 3: a value or a stated reason)', () => {
  const known = new Set(['known.it']);
  const toDomain = (u: string | null | undefined) => String(u ?? '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const row = (over: Record<string, unknown>) => ({
    company_name: 'X', domain: 'x.it', website: null, company_type: 'stock_trader', type_evidence: 'Vendiamo stock di fine serie', ...over,
  });

  it('keeps a requested type quoted from its own site', () => {
    const { matches, unverified } = classifyCompanyRows([row({})], ['stock_trader'], known, toDomain);
    expect(matches).toHaveLength(1);
    expect(unverified).toHaveLength(0);
    expect(matches[0].is_manufacturer).toBe(false);
  });

  it('returns a row with no quote, or the wrong type, as unverified WITH the reason', () => {
    const { matches, unverified } = classifyCompanyRows(
      [row({ type_evidence: null }), row({ company_type: 'retailer_showroom' }), row({ company_type: 'other' })],
      ['stock_trader'], known, toDomain,
    );
    expect(matches).toHaveLength(0);
    expect(unverified).toHaveLength(3);
    for (const u of unverified) expect(typeof u.unverified_reason).toBe('string');
  });

  it('derives is_manufacturer for current readers and flags domains already in the CRM', () => {
    const { matches } = classifyCompanyRows(
      [row({ company_type: 'manufacturer', domain: 'known.it' })], ['manufacturer'], known, toDomain,
    );
    expect(matches[0].is_manufacturer).toBe(true);
    expect(matches[0].already_in_crm).toBe(true);
  });

  it('the structured record requires a type and its evidence on every row', () => {
    const schema = B2B.slice(B2B.indexOf('const RECORD_COMPANIES_TOOL'), B2B.indexOf('strict: true', B2B.indexOf('const RECORD_COMPANIES_TOOL')));
    expect(schema).toMatch(/name:\s*'record_companies'/);
    const itemRequired = schema.indexOf('required: [');
    const required = schema.slice(itemRequired, schema.indexOf(']', itemRequired));
    for (const f of ['company_type', 'type_evidence', 'brands_carried', 'confidence']) {
      expect(required.includes(`'${f}'`), `${f} must be required on every recorded row`).toBe(true);
    }
  });
});
