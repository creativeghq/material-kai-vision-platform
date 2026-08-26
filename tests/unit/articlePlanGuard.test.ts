import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  missingArticlePlanFields,
  ANALYZE_PLAN_FIELDS,
  WRITE_PLAN_FIELDS,
} from '../../supabase/functions/seo-api/handlers/article-plan-guard.ts';

/**
 * `seo-api` took an `ArticlePlan` off the request body and checked only that the KEY was
 * present. `ArticlePlan` is a TypeScript interface, so the body is `any` at the boundary
 * and nothing typechecked it — the first thing to notice a half-built plan was
 * `plan.primaryKeyword.toLowerCase()` throwing, which surfaced as a 500 on what was
 * really a malformed request.
 *
 * The two properties that matter here:
 *   1. a plan missing a hard-dereferenced field is REJECTED (or the 500 comes back), and
 *   2. a plan that works today is still ACCEPTED (a guard that rejects valid requests is
 *      worse than the crash it replaced).
 */

const VALID_PLAN = {
  title: 'Porcelain vs ceramic tile',
  metaTitle: 'Porcelain vs ceramic',
  metaDescription: 'Which to choose and why.',
  slug: 'porcelain-vs-ceramic',
  primaryKeyword: 'porcelain tile',
  secondaryKeywords: ['ceramic tile', 'floor tile'],
  lsiKeywords: ['glazed', 'unglazed'],
  sections: [{ heading: 'Intro', subsections: [] }],
  targetWordCount: 1800,
  searchIntent: 'commercial',
  recommendedSchema: ['Article'],
  featuredSnippetTarget: null,
  faqQuestions: ['Which is harder?'],
  entityMentions: ['PEI rating'],
  citationSources: [],
  statisticalClaims: [],
};

describe('missingArticlePlanFields', () => {
  it('accepts a complete plan for both handlers', () => {
    expect(missingArticlePlanFields(VALID_PLAN, ANALYZE_PLAN_FIELDS)).toEqual([]);
    expect(missingArticlePlanFields(VALID_PLAN, WRITE_PLAN_FIELDS)).toEqual([]);
  });

  it('names the field behind the reported 500s', () => {
    // "Cannot read properties of undefined (reading 'toLowerCase')" — analyze.ts:280
    const { primaryKeyword: _pk, ...noPrimary } = VALID_PLAN;
    expect(missingArticlePlanFields(noPrimary, ANALYZE_PLAN_FIELDS)).toContain('primaryKeyword');

    // "Cannot read properties of undefined (reading 'slice')" — analyze.ts:337
    const { secondaryKeywords: _sk, ...noSecondary } = VALID_PLAN;
    expect(missingArticlePlanFields(noSecondary, ANALYZE_PLAN_FIELDS)).toContain('secondaryKeywords');
  });

  it('reports every gap at once rather than one per round trip', () => {
    const gaps = missingArticlePlanFields({ title: 'x' }, ANALYZE_PLAN_FIELDS);
    expect(gaps).toEqual(
      expect.arrayContaining([
        'primaryKeyword', 'slug', 'metaTitle', 'metaDescription',
        'secondaryKeywords', 'faqQuestions', 'entityMentions', 'targetWordCount',
      ]),
    );
    expect(gaps).not.toContain('title');
  });

  it('accepts empty strings and empty arrays — "no secondary keywords" is a real plan', () => {
    const sparse = { ...VALID_PLAN, secondaryKeywords: [], faqQuestions: [], entityMentions: [], metaDescription: '' };
    expect(missingArticlePlanFields(sparse, ANALYZE_PLAN_FIELDS)).toEqual([]);
  });

  it('accepts a null featuredSnippetTarget, which the type declares nullable', () => {
    // `write` falls back to the SERP signal, so requiring this would reject working plans.
    expect(missingArticlePlanFields({ ...VALID_PLAN, featuredSnippetTarget: null }, WRITE_PLAN_FIELDS)).toEqual([]);
  });

  it('rejects a wrong TYPE, not just an absent key', () => {
    // `plan.targetWordCount * 0.85` on a string yields NaN comparisons — every article
    // silently reported as the wrong length rather than anything throwing.
    expect(missingArticlePlanFields({ ...VALID_PLAN, targetWordCount: '1800' }, ANALYZE_PLAN_FIELDS))
      .toContain('targetWordCount');
    expect(missingArticlePlanFields({ ...VALID_PLAN, secondaryKeywords: 'ceramic tile' }, ANALYZE_PLAN_FIELDS))
      .toContain('secondaryKeywords');
  });

  it('rejects non-objects without throwing', () => {
    for (const bad of [null, undefined, 'plan', 42, []]) {
      expect(missingArticlePlanFields(bad, ANALYZE_PLAN_FIELDS).length).toBeGreaterThan(0);
    }
  });

  it('requires exactly what each handler dereferences, per handler', () => {
    // Requiring the UNION would reject plans that work: `analyze` never reads `sections`,
    // `write` never reads `slug`. Handler-specific lists are the point of two specs.
    const { sections: _s, lsiKeywords: _l, ...noWriteOnlyFields } = VALID_PLAN;
    expect(missingArticlePlanFields(noWriteOnlyFields, ANALYZE_PLAN_FIELDS)).toEqual([]);

    const { slug: _sl, metaTitle: _mt, metaDescription: _md, ...noAnalyzeOnlyFields } = VALID_PLAN;
    expect(missingArticlePlanFields(noAnalyzeOnlyFields, WRITE_PLAN_FIELDS)).toEqual([]);
  });
});

describe('the handlers actually call the guard, before the debit', () => {
  // A guard nothing invokes is the same as no guard. And invoking it AFTER `debit_credits`
  // would bill the caller for a request that was malformed — the refund path exists, but
  // not charging is better than charging and refunding.
  const HANDLERS = ['analyze.ts', 'write.ts'] as const;

  it.each(HANDLERS)('%s validates the plan shape before debiting credits', (file) => {
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/seo-api/handlers', file),
      'utf-8',
    );
    const guardAt = src.indexOf('missingArticlePlanFields(');
    const debitAt = src.indexOf("'debit_credits'");

    expect(guardAt, `${file} never calls missingArticlePlanFields`).toBeGreaterThan(-1);
    expect(debitAt, `${file} no longer calls debit_credits — update this test`).toBeGreaterThan(-1);
    expect(guardAt, `${file} validates the plan AFTER debiting`).toBeLessThan(debitAt);
  });
});
