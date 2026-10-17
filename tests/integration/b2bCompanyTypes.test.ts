import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient } from './_harness';
import { B2B_COMPANY_TYPES, B2B_COMPANY_TYPES_VOCABULARY } from '../../src/config/b2bCompanyTypes';

const suite = hasCreds ? describe : describe.skip;

const TYPE_WORDS = /manufactur|factor(y|ies)|producer|distributor|wholesal|importer|exporter|retailer|showroom|contractor|installer|stock trader/i;

suite('B2B company types · vocabulary rows and prompt rows', () => {
  let svc: SupabaseClient;
  beforeAll(() => { svc = serviceClient(); });

  it('every key has an active row with a definition, a core-business test and terms for each market language', async () => {
    const [{ data: rows, error }, { data: markets, error: mErr }] = await Promise.all([
      svc.from('reference_vocabularies').select('value, metadata').eq('vocabulary_key', B2B_COMPANY_TYPES_VOCABULARY).eq('active', true),
      svc.from('reference_vocabularies').select('value, metadata').eq('vocabulary_key', 'sourcing_markets').eq('active', true),
    ]);
    expect(error ?? mErr).toBeNull();
    const languages = [...new Set((markets ?? []).map((m: any) => m.metadata?.language_code).filter(Boolean))] as string[];
    expect(languages.length).toBeGreaterThan(10);

    const byKey = new Map((rows ?? []).map((r: any) => [r.value, r.metadata ?? {}]));
    const problems: string[] = [];
    for (const key of B2B_COMPANY_TYPES) {
      const m = byKey.get(key) as Record<string, any> | undefined;
      if (!m) { problems.push(`${key}: no row`); continue; }
      if (typeof m.definition !== 'string' || !m.definition) problems.push(`${key}: no definition`);
      if (typeof m.core_business_test !== 'string' || !m.core_business_test) problems.push(`${key}: no core_business_test`);
      for (const lang of languages) {
        const terms = m.terms_by_language?.[lang];
        if (!Array.isArray(terms) || terms.length === 0) problems.push(`${key}: no terms for ${lang}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('the generic query and system prompt rows contain no company-type word', async () => {
    const { data, error } = await svc.from('prompts')
      .select('category, prompt_text')
      .eq('prompt_type', 'tool')
      .in('category', ['b2b_company_query', 'b2b_company_search', 'b2b_company_record'])
      .eq('is_active', true);
    expect(error).toBeNull();
    expect((data ?? []).map((r: any) => r.category).sort()).toEqual(['b2b_company_query', 'b2b_company_record', 'b2b_company_search']);
    for (const r of data ?? []) {
      expect(TYPE_WORDS.test(r.prompt_text ?? ''), `${r.category} names a company type`).toBe(false);
    }
  });
});
