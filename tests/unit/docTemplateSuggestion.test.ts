import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchTemplates, significantTokens } from '../../supabase/functions/_shared/template-match';
import { stripComments } from '../helpers/stripComments';

const KEPT = [
  { id: 'racecar', title: 'Growth Plan — Racecar Framework' },
  { id: 'audit', title: 'Site Audit' },
  { id: 'onboard', title: 'Employee Onboarding Checklist' },
];

describe('matchTemplates', () => {
  it('matches a request sharing two title words', () => {
    expect(matchTemplates('Growth plan for Materials Bank', KEPT).map((t) => t.id)).toEqual(['racecar']);
  });

  it('matches one word that is half the template title', () => {
    expect(matchTemplates('Audit of the Athens showroom', KEPT).map((t) => t.id)).toEqual(['audit']);
  });

  it('does not match on a single word of a longer title', () => {
    expect(matchTemplates('Marketing plan Q4', KEPT)).toEqual([]);
  });

  it('ignores generic words like template and document', () => {
    expect(significantTokens('New document template for the team')).toEqual(['team']);
    expect(matchTemplates('Meeting notes', KEPT)).toEqual([]);
  });

  it('folds accents and plurals', () => {
    expect(significantTokens('Audits Ελέγχου')).toEqual(['audit', 'ελεγχου']);
  });
});

describe('manage_docs create checks templates before it writes', () => {
  const src = stripComments(readFileSync('supabase/functions/_shared/tools/docs-tools.ts', 'utf8'));
  const create = src.slice(src.indexOf("action === 'create'"), src.indexOf("action === 'suggest_edit'"));

  it('runs the match before the insert, with both escape hatches', () => {
    const match = create.indexOf('matchTemplates(');
    expect(match).toBeGreaterThan(-1);
    expect(match).toBeLessThan(create.indexOf(".from('workspace_docs').insert("));
    expect(create).toContain("status: 'template_available'");
    expect(create).toMatch(/!skip_template/);
    expect(create).toMatch(/if \(template_id\)/);
  });
});
