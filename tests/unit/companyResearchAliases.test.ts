import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';
import { researchAliases } from '../../supabase/functions/_shared/crm/researchAliases';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const LEGAL = 'ΚΩΝ. ΑΝΤΩΝΙΟΥ  & ΣΙΑ Ο.Ε.';
const TRADE = 'ΦΕΡΝΙΜΠΑΘ';

describe('researchAliases', () => {
  it('leads with the Latin transliteration: ΑΑΔΕ holds ΦΕΡΝΙΜΠΑΘ, the web only knows furnibath.gr', () => {
    expect(researchAliases(LEGAL, TRADE)).toEqual(['fernibath', TRADE, LEGAL]);
  });

  it('never transliterates the legal name — ντ→d would render ΑΝΤΩΝΙΟΥ as "adoniou"', () => {
    expect(researchAliases(LEGAL, TRADE).join(' ')).not.toContain('adoniou');
  });

  it('keeps the legal name last, so the registry spelling stays searchable', () => {
    expect(researchAliases(LEGAL, TRADE).at(-1)).toBe(LEGAL);
  });

  it('returns the name alone when no trade name is distinct from it', () => {
    expect(researchAliases(LEGAL, null)).toEqual([LEGAL]);
    expect(researchAliases(LEGAL, '  ')).toEqual([LEGAL]);
    expect(researchAliases(LEGAL, 'ΚΩΝ. ΑΝΤΩΝΙΟΥ  & ΣΙΑ Ο.Ε.')).toEqual([LEGAL]);
  });

  it('transliterates a Cyrillic trade name too — the Greek mapping leaves it untouched', () => {
    expect(researchAliases('TOV AVERS-TEKHNO', 'Аверс-Техно')).toEqual(['Avers-Tehno', 'Аверс-Техно', 'TOV AVERS-TEKHNO']);
  });

  it('does not duplicate a trade name that is already Latin', () => {
    expect(researchAliases('Acme Holdings Ltd', 'Acme')).toEqual(['Acme', 'Acme Holdings Ltd']);
  });
});

describe('the trade name reaches the web search, which is the half that broke', () => {
  it('the orchestrator passes commercial_title into enrichCompany', () => {
    expect(blankComments(src('src/modules/crm/services/companyResearch.ts')))
      .toMatch(/enrichCompany\(\{[\s\S]{0,400}?tradeName:\s*\(merged\.commercial_title/);
  });

  it('the client service forwards it as trade_name', () => {
    expect(blankComments(src('src/services/companyEnrichService.ts'))).toMatch(/trade_name:\s*tradeName/);
  });

  it('the edge function reads trade_name and gives it to BOTH providers', () => {
    const s = blankComments(src('supabase/functions/company-enrich/index.ts'));
    expect(s).toMatch(/const tradeName = cleanStr\(body\?\.trade_name\)/);
    expect(s).toMatch(/enrichViaWebSearch\([^)]*tradeName\)/);
    expect(s).toMatch(/enrichViaApollo\([^)]*tradeName\)/);
  });

  it('builds the research query from the aliases, not the bare legal name', () => {
    const s = blankComments(src('supabase/functions/company-enrich/index.ts'));
    expect(s).toMatch(/const aliases = researchAliases\(name, tradeName\)/);
    expect(s).not.toMatch(/Research the business "\$\{name\}"/);
  });

  it('a registry refresh cannot revert an operator-corrected trade name', () => {
    expect(blankComments(src('src/modules/crm/services/companyResearch.ts')))
      .toMatch(/commercial_title:\s*isBlank\(existing\.commercial_title\)/);
  });
});
