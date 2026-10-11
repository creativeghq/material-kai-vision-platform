import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';

const HANDLERS = join(process.cwd(), 'supabase/functions/seo-api/handlers');
const src = (f: string) => blankComments(readFileSync(join(HANDLERS, f), 'utf-8'));

describe('SEO stages bill what they cost', () => {
  it.each(['research.ts', 'plan.ts', 'write.ts', 'apply-fix.ts', 'faq.ts'])(
    '%s reserves, settles and refunds through stage-billing, with no flat price left',
    (file) => {
      const code = src(file);
      expect(code).toContain('reserveStage(');
      expect(code).toContain('settleStage(');
      expect(code).toContain('refundStage(');
      expect(code, 'a flat per-stage price is back').not.toMatch(/const \w*CREDIT_COST = \d+/);
      expect(code.indexOf('reserveStage('), 'settled before reserving').toBeLessThan(code.indexOf('settleStage('));
    },
  );

  it.each(['plan.ts', 'write.ts', 'apply-fix.ts', 'faq.ts'])('%s prices the model call by its tokens', (file) => {
    const code = src(file);
    expect(code).toMatch(/tokenCredits\(supabase, result\.model, result\.usage\)/);
    expect(code).toMatch(/workspaceId: workspaceId \?\? undefined/);
  });

  it('the review reserves every section up front and settles once to the tokens used', () => {
    const code = src('review.ts');
    expect(code.indexOf('reserveStage(')).toBeGreaterThan(-1);
    expect(code.indexOf('reserveStage(')).toBeLessThan(code.indexOf('callClaudeMessages('));
    expect(code).toMatch(/settleStage\(supabase, wallet, ceiling, actual/);
  });

  it('the analysis reports and never rewrites the article', () => {
    const code = src('analyze.ts');
    expect(code, 'a model call in the analyzer is a rewrite path').not.toMatch(/generateWith\w+\(|callClaudeMessages\(/);
    expect(code).not.toMatch(/auto_fix|applyFixes/);
    expect(src('pipeline.ts')).not.toMatch(/auto_fix|autoFix/);
  });

  it('research settles to provider-reported DataForSEO spend, never a guess', () => {
    const code = src('research.ts');
    expect(code).toMatch(/client\.spentUsd \* 1000/);
    expect(code, 'an unpriced DataForSEO call must keep the ceiling').toMatch(/client\.unpricedCalls > 0/);
  });

  it('the editor review is the last pass over the text; only the score is computed after it', () => {
    const code = src('pipeline.ts');
    const review = code.indexOf('await reviewArticle(');
    const analyze = code.indexOf("callStage('analyze'");
    expect(review).toBeGreaterThan(-1);
    expect(review).toBeLessThan(analyze);
    expect(code.indexOf("callStage('analyze'", analyze + 1), 'a second analyze pass').toBe(-1);
  });

  it('another company\'s brand or a retailer is never reported as something the article misses', () => {
    const code = src('analyze.ts');
    expect(code).toMatch(/!namesSomeoneElse\(e, ownTerms\)/);
    expect(code).toMatch(/relatedSearches \|\| \[\]\)\.filter\(\(t\) => !namesSomeoneElse\(t, ownTerms\)\)/);
    expect(src('pipeline.ts'), 'Google queries carry competitor names; they are not our terms').not.toMatch(/recommendedSecondaries\.map\(termOf\)/);
  });

  it('the review fixes what it finds: no pending list, and the title and meta are reviewed too', () => {
    const code = src('review.ts');
    expect(code).not.toMatch(/unresolved/);
    expect(code).toContain('applyMetaEdits(opts.meta, metaEdits)');
    expect(src('pipeline.ts')).toContain('Object.assign(plan, reviewed.meta)');
  });

  it('a corrected photo description is kept by the article and by the cached check', () => {
    const code = src('pipeline.ts');
    expect(code.indexOf('saveCorrectedPhotoDescriptions(')).toBeGreaterThan(-1);
    expect(code.indexOf('saveCorrectedPhotoDescriptions(')).toBeLessThan(code.indexOf('enforceSiteAssets(supabase, websiteId, website?.url ?? null, reviewed.markdown'));
  });

  it('the pipeline refuses a short wallet before research is paid for', () => {
    const code = src('pipeline.ts');
    const preflight = code.indexOf("rpc('preflight_credits'");
    const insert = code.indexOf(".from('seo_articles')\n      .insert(");
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(insert);
  });
});
