/** Update article: tenancy, billing order, prompt source, the free path, and the pure staleness rules. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';
import {
  factTokens, findOutdated, monthStamps, numberValue, statementsOf,
} from '../../supabase/functions/seo-api/handlers/update-rules.ts';
import { weeklySeries } from '../../src/components/features/ai/gscWeeklySeries';

const ROOT = process.cwd();
const SRC = blankComments(readFileSync(join(ROOT, 'supabase/functions/seo-api/handlers/update-article.ts'), 'utf8'));
const INDEX = blankComments(readFileSync(join(ROOT, 'supabase/functions/seo-api/index.ts'), 'utf8'));
const fn = SRC.slice(SRC.indexOf('export async function handleUpdateArticle('));

describe('update_article handler — source guards', () => {
  it('is routed', () => {
    expect(INDEX).toMatch(/update_article: handleUpdateArticle/);
  });

  it('derives the user from the JWT and loads the article through loadOwnedArticle', () => {
    expect(fn).toMatch(/await authenticate\(req\)/);
    expect(fn).toMatch(/loadOwnedArticle\(supabase, userId, articleId\)/);
    expect(fn.indexOf('loadOwnedArticle(')).toBeLessThan(fn.indexOf('callClaudeMessages('));
    expect(SRC).not.toMatch(/body\.(workspace_id|user_id)/);
    expect(SRC).not.toMatch(/\.\.\.body\b/);
  });

  it('reserves before the model call, settles after the write, refunds on failure', () => {
    const reserve = fn.indexOf('reserveStage(');
    const call = fn.indexOf('callClaudeMessages(');
    const write = fn.indexOf(".from('seo_articles')\n      .update(");
    const settle = fn.indexOf('settleStage(');
    expect(reserve).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(reserve);
    expect(write).toBeGreaterThan(call);
    expect(settle).toBeGreaterThan(write);
    expect(fn).toMatch(/refundStage\(/);
    expect(fn).toMatch(/opType: 'seo_update'/);
  });

  it('loads its prompt from the database and constrains the reply with a JSON schema', () => {
    expect(fn).toMatch(/getToolPrompt\(supabase, 'seo_article_updater'\)/);
    expect(fn).toMatch(/model: UPDATE_MODEL/);
    expect(SRC).toMatch(/UPDATE_MODEL = 'claude-sonnet-5'/);
    expect(fn).toMatch(/output_config: \{ format: \{ type: 'json_schema'/);
    expect(fn).toMatch(/stop_reason === 'refusal' \|\| res\.stop_reason === 'max_tokens'/);
  });

  it('reads due-ness from seo_article_freshness, never its own interval', () => {
    expect(fn).toMatch(/from\('seo_article_freshness'\)/);
    expect(fn).toMatch(/refreshDue: due\?\.is_due === true/);
    expect(SRC).not.toMatch(/86_?400_?000/);
  });

  it('makes no model call when nothing is outdated', () => {
    const gate = fn.indexOf('if (items.length) {');
    expect(gate).toBeGreaterThan(fn.indexOf('findOutdated('));
    expect(gate).toBeLessThan(fn.indexOf('reserveStage('));
    expect(gate).toBeLessThan(fn.indexOf('callClaudeMessages('));
  });

  it('writes proposals through the shared suggestion helpers', () => {
    expect(fn).toMatch(/pickSuggestionItems\(/);
    expect(fn).toMatch(/validateSuggestion\(markdown, proposal\)/);
    expect(fn).toMatch(/basis: basisOf\(item\)/);
    expect(fn).toMatch(/mergeSuggestions\(/);
    expect(fn).toMatch(/source: 'update'/);
    expect(fn.indexOf('validateSuggestion(')).toBeLessThan(fn.indexOf(".from('seo_articles')\n      .update("));
    expect(fn).toMatch(/\.update\(\{\s+last_reviewed_at: reviewedAt,\s+refresh_notified_at: null,/);
    expect(fn).not.toMatch(/extra: \{[^}]*last_reviewed_at/);
    expect(fn).toMatch(/update_report: report/);
  });
});

describe('update rules', () => {
  const page = (url: string, content: string, live = true) => ({ url, title: null, content, live });
  const now = new Date('2026-10-12T09:00:00Z');

  it('reads European and English number formats', () => {
    expect(numberValue('21,60')).toBe(21.6);
    expect(numberValue('1.234,50')).toBe(1234.5);
    expect(numberValue('21.60')).toBe(21.6);
    expect(numberValue('1.200')).toBe(1200);
  });

  it('finds prices, sizes and month stamps in Greek and English', () => {
    const t = factTokens('Η σειρά σε 60×120 cm έχει τιμή €21,60/τ.μ. και πάχος 11 mm.');
    expect(t.prices).toEqual([21.6]);
    expect(t.dims).toEqual(['60.00x120.00']);
    expect(t.sizes).toEqual([11]);
    expect(monthStamps('Τιμές Σεπτεμβρίου 2026')).toEqual([2026 * 12 + 9]);
    expect(monthStamps('as of October 2026')).toEqual([2026 * 12 + 10]);
  });

  it('splits prose into verbatim statements and skips headings and images', () => {
    const md = '# Title\n\n![x](https://a/b.jpg)\n\nFirst sentence is long enough here. Second sentence is long enough too.';
    expect(statementsOf(md)).toEqual(['First sentence is long enough here.', 'Second sentence is long enough too.']);
  });

  it('flags a price the linked page no longer states, and not one it still states', () => {
    const md = 'Η [σειρά Terrazzo](https://site.gr/p/terrazzo) κοστίζει €21,60/τ.μ. σε 60×120 cm.\n\nΗ [σειρά Stone](https://site.gr/p/stone) κοστίζει €30,00/τ.μ. σε 60×60 cm.';
    const { outdated, checked } = findOutdated({
      markdown: md,
      pages: [page('https://site.gr/p/terrazzo', 'Τιμή 24,90 € ανά τ.μ. 60x120'), page('https://site.gr/p/stone', 'Τιμή 30,00 € 60 x 60')],
      now, refreshDue: false, intervalDays: 90,
    });
    expect(checked).toBe(2);
    expect(outdated).toHaveLength(1);
    expect(outdated[0].reasons.join()).toMatch(/€21\.60/);
  });

  it('flags a gone page, an old month stamp, and time-sensitive text only in an old article', () => {
    const md = 'Δείτε τη [σειρά](https://site.gr/p/gone) με τιμή €10,00 σήμερα.\n\nΟι τιμές ισχύουν για Αύγουστο 2026 στο κατάστημα.\n\nΤο πρόγραμμα επιδότησης φέτος καλύπτει τα κουφώματα.';
    const fresh = findOutdated({ markdown: md, pages: [page('https://site.gr/p/gone', '', false)], now, refreshDue: false, intervalDays: 90 });
    expect(fresh.outdated.map((o) => o.reasons.join())).toEqual([
      expect.stringMatching(/no longer on the site/),
      expect.stringMatching(/dated 2026-08/),
    ]);
    const old = findOutdated({ markdown: md, pages: [], now, refreshDue: true, intervalDays: 90 });
    expect(old.outdated.some((o) => /time-sensitive/.test(o.reasons.join()))).toBe(true);
  });

  it('finds nothing in an article with no checkable statements, so no model call is made', () => {
    const md = 'Τα πλακάκια terrazzo είναι ανθεκτικά και εύκολα στον καθαρισμό τους.';
    expect(findOutdated({ markdown: md, pages: [], now, refreshDue: false, intervalDays: 90 }).outdated).toEqual([]);
  });
});

describe('weeklySeries', () => {
  it('sums daily rows into Monday-start weeks, oldest first', () => {
    const w = weeklySeries([
      { date: '2026-10-07', clicks: 1, impressions: 10 },
      { date: '2026-10-05', clicks: 2, impressions: 5 },
      { date: '2026-09-30', clicks: 0, impressions: 3 },
    ]);
    expect(w).toEqual([
      { week: '2026-09-28', clicks: 0, impressions: 3 },
      { week: '2026-10-05', clicks: 3, impressions: 15 },
    ]);
  });
});
