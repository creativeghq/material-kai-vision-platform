import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readingEase } from '../../supabase/functions/seo-api/handlers/readability.ts';

/**
 * Three defects found by running the analyzer against the first article this platform ever
 * produced (88779ba1, 2,077 Greek words, 66/100) rather than by reading the code.
 *
 *  1. `affectedSection` was null on all eight fixes. The paragraph-length check had already
 *     ISOLATED the offending paragraphs and then threw them away, so the only way to act on
 *     "3 paragraphs exceed 80 words" was to rewrite the whole article.
 *  2. The auto-fix loop was gated on `reachableScore = overallScore + penalties-of-UNFIXABLE
 *     -fixes`, entered only when that was BELOW 70. That inverts: the more unfixable
 *     problems an article has, the higher its reachable score climbs and the less likely the
 *     fixer is to touch what it CAN fix. Measured: 66/100, five auto-fixable issues,
 *     `auto_fix: true`, `fix_iterations: 0`.
 *  3. `readabilityScore` was a hardcoded `null // Could be enhanced with Flesch-Kincaid`.
 *
 * All three are the same family: the analyzer knew something and did not say it.
 */

const ANALYZE = join(process.cwd(), 'supabase/functions/seo-api/handlers/analyze.ts');
const src = readFileSync(ANALYZE, 'utf-8');

describe('readingEase', () => {
  const ENGLISH = `
Porcelain tile is a ceramic product fired at high temperature. It absorbs very little water.
Builders use it for floors and walls. The price depends on size and finish. A basic tile is
cheap. A large format tile costs more because the press is bigger and more pieces crack.
Most homes use a mid range product. The cost per square metre is the number that matters.
`.repeat(3);

  const GREEK = `
Τα πλακάκια μπάνιου είναι κεραμικά ή πορσελανάτα δομικά υλικά που καλύπτουν τοίχους και
δάπεδα. Στην ελληνική αγορά οι τιμές ξεκινούν από περίπου οκτώ ευρώ ανά τετραγωνικό μέτρο.
Η μέση επιλογή ενός νοικοκυριού κινείται ρεαλιστικά σε υψηλότερα επίπεδα από αυτό το ποσό.
Η τιμή του καταλόγου δεν είναι η τιμή που πληρώνετε τελικά στο κατάστημα της περιοχής σας.
`.repeat(3);

  it('scores English prose on the 0–100 scale', () => {
    const score = readingEase(ENGLISH);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThan(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('refuses to score Greek rather than inventing a number', () => {
    // Flesch's constants are fitted to English. Run over Greek they still return a
    // confident, meaningless figure — and nothing downstream could tell it from a real
    // reading. The platform's FIRST article is Greek, so this is the common case here.
    expect(readingEase(GREEK)).toBeNull();
  });

  it('returns null rather than a wild score for something too short to measure', () => {
    expect(readingEase('# Title\n\nShort.')).toBeNull();
    expect(readingEase('')).toBeNull();
  });

  it('does not count markdown furniture as words', () => {
    // Headings, bullets and link syntax are not prose; counting them drags the sentence
    // length around and moves the score for a document nobody edited.
    const bare = readingEase(ENGLISH);
    const dressed = readingEase(
      ENGLISH.replace(/^/gm, '- ').replace(/tile/g, '[tile](https://example.com/a/very/long/url)'),
    );
    expect(bare).not.toBeNull();
    expect(dressed).not.toBeNull();
    expect(Math.abs(dressed! - bare!)).toBeLessThan(25);
  });

  it('is stable — the same text scores the same twice', () => {
    expect(readingEase(ENGLISH)).toBe(readingEase(ENGLISH));
  });
});

describe('a fix says what it can be applied to', () => {
  it('the type carries scope and a verbatim anchor', () => {
    const types = readFileSync(join(process.cwd(), 'supabase/functions/_shared/seo-types.ts'), 'utf-8');
    expect(types).toMatch(/scope\?: 'section' \| 'document' \| 'config';/);
    expect(types).toMatch(/anchor\?: string \| null;/);
  });

  it('the long-paragraph check anchors each paragraph it found', () => {
    // It had them in `longParagraphs` and set `affectedSection: null`.
    const check = src.slice(src.indexOf('const longParagraphs'), src.indexOf('// ── Check 14'));
    expect(check).toContain("scope: 'section'");
    expect(check).toContain('anchor: para');
  });

  it('the long-sentence check anchors the PARAGRAPH, not the sentence', () => {
    // A sentence has no unique position in the document and rewriting one in isolation
    // loses the flow either side of it.
    const check = src.slice(src.indexOf('const longSentences'), src.indexOf('// ── Check 15'));
    expect(check).toContain('anchor: para');
  });

  it('splits Greek sentences, which do not end in a full stop', () => {
    // Greek writes its question mark as `;` and its semicolon as `·`. An English-only
    // `[.!?]` split runs whole questions together and under-counts what it is measuring.
    expect(src).toMatch(/markdown\.split\(\/\[\.!\?;·;\]\+\//);
  });

  it('classifies every unclassified fix, defaulting to the one that offers no apply', () => {
    // A new check that forgets to declare a scope must degrade to "cannot be applied
    // surgically", never to "applied to the wrong paragraph".
    expect(src).toContain("fix.scope = fix.anchor ? 'section' : (FIX_SCOPE_BY_CATEGORY[fix.category] ?? 'document');");
  });

  it('marks the fixes no rewrite can close as config, not as fixable prose', () => {
    const map = src.slice(src.indexOf('const FIX_SCOPE_BY_CATEGORY'), src.indexOf('export async function handleAnalyze'));
    for (const cfg of ['meta_tags', 'provenance', 'firsthand_experience', 'intent_alignment']) {
      expect(map).toMatch(new RegExp(`${cfg}: 'config'`));
    }
  });

  it('caps how many Apply buttons one check can raise, and still reports the real count', () => {
    expect(src).toMatch(/const MAX_ANCHORED_FIXES_PER_CHECK = \d+;/);
    // Whatever is over the cap is still surfaced, naming the true total.
    expect(src).toContain('paragraphs exceed 80 words — ${MAX_ANCHORED_FIXES_PER_CHECK} listed individually above');
  });
});

describe('the score measures the article, not how many rows the analyzer emitted', () => {
  // Anchoring the long paragraphs individually turned one finding into four applicable
  // fixes plus an overflow summary — and the score of an article nobody had touched fell
  // from 66 to 48, because the loop subtracted a penalty per FIX. A derived number that
  // moves when the presentation changes is not measuring what it claims to.
  it('charges a finding once, however many places it was located', () => {
    expect(src).toContain('function totalPenalty(fixes: ContentFix[]): number {');
    expect(src).toContain('if (chargedGroups.has(fix.penaltyGroup)) continue;');
    expect(src).toContain('const score = Math.max(0, Math.min(100, 100 - totalPenalty(fixes)));');
    // The old per-fix subtraction must be gone, not merely bypassed.
    expect(src).not.toContain('score -= SEVERITY_PENALTY[fix.severity]');
  });

  it('groups every fix an anchored check splits apart', () => {
    // Each anchored row AND its overflow summary carry the group, or the summary is a
    // second charge for the problem the rows already paid for.
    expect((src.match(/penaltyGroup: 'readability:long-paragraphs'/g) ?? []).length).toBe(2);
    expect((src.match(/penaltyGroup: 'readability:long-sentences'/g) ?? []).length).toBe(2);
  });

  it('reachableScore uses the same grouped arithmetic as the score', () => {
    // Two ways of adding up penalties is two answers to one question — the money-derivation
    // rule, applied to a score.
    expect(src).toContain('return Math.min(100, analysis.overallScore + totalPenalty(unfixable));');
  });
});

describe('the auto-fix loop runs on the score the reader sees', () => {
  it('enters on overallScore, not on reachableScore', () => {
    expect(src).toContain('if (autoFix && analysis.overallScore < MIN_ACCEPTABLE_SCORE) {');
    expect(src).not.toContain('if (autoFix && reachableScore(analysis) < MIN_ACCEPTABLE_SCORE) {');
  });

  it('exits on the score the reader sees too', () => {
    const loop = src.slice(src.indexOf('for (let i = 0; i < maxIterations; i++)'));
    const body = loop.slice(0, loop.indexOf('const wordCount'));
    expect(body).toContain('if (analysis.overallScore >= MIN_ACCEPTABLE_SCORE) break;');
    expect(body).not.toContain('if (reachableScore(analysis) >= MIN_ACCEPTABLE_SCORE) break;');
  });

  it('stops paying when an iteration did not move the score', () => {
    // This is what actually prevents the incident the old gate was guessing at: burning
    // paid iterations re-editing prose whose remaining faults the loop cannot land. On
    // evidence, after a pass, rather than on a prediction made before any pass has run.
    const loop = src.slice(src.indexOf('for (let i = 0; i < maxIterations; i++)'));
    const body = loop.slice(0, loop.indexOf('const wordCount'));
    expect(body).toContain('const scoreBefore = analysis.overallScore;');
    expect(body).toContain('if (analysis.overallScore <= scoreBefore) {');
  });

  it('still breaks when there is nothing auto-fixable left', () => {
    const loop = src.slice(src.indexOf('for (let i = 0; i < maxIterations; i++)'));
    expect(loop.slice(0, 900)).toContain('if (autoFixableFixes.length === 0) break;');
  });
});
