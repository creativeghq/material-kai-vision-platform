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

  it('the auto-fix loop settles every pass to its real cost', () => {
    const code = src('analyze.ts');
    expect(code).not.toMatch(/const FIX_CREDIT_COST/);
    expect(code).toMatch(/tokenCredits\(supabase, fix\.model, fix\.usage\)/);
  });

  it('research settles to provider-reported DataForSEO spend, never a guess', () => {
    const code = src('research.ts');
    expect(code).toMatch(/client\.spentUsd \* 1000/);
    expect(code, 'an unpriced DataForSEO call must keep the ceiling').toMatch(/client\.unpricedCalls > 0/);
  });

  it('the editor review is the last pass over the text: auto-fix before it, only a re-score after', () => {
    const code = src('pipeline.ts');
    const autoFix = code.indexOf('auto_fix: autoFix }');
    const review = code.indexOf('await reviewArticle(');
    const rescore = code.indexOf('auto_fix: false }');
    expect(autoFix).toBeGreaterThan(-1);
    expect(autoFix).toBeLessThan(review);
    expect(review).toBeLessThan(rescore);
  });

  it('the auto-fixer is never asked to add citations it has not read', () => {
    const code = src('analyze.ts');
    for (const marker of ["suggestion: 'Add [SOURCE:", 'citations referencing the same authoritative sources']) {
      const at = code.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      expect(code.slice(at, at + 400)).toMatch(/autoFixable: false/);
    }
  });

  it('the pipeline refuses a short wallet before research is paid for', () => {
    const code = src('pipeline.ts');
    const preflight = code.indexOf("rpc('preflight_credits'");
    const insert = code.indexOf(".from('seo_articles')\n      .insert(");
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(insert);
  });
});
