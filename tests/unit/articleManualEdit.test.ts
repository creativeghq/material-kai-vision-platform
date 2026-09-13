/**
 * A writer can edit the article, and the score follows the text.
 *
 * The viewer could apply the model's fixes and revert them, and offered no way to change a word
 * yourself. The trap in adding one is anti-regression rule 4: save and re-score as two calls lets
 * the body land while the score does not, and the screen then shows a confident number next to
 * text it was never computed from. A wrong score is a valid number, so nothing raises.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const HANDLER = read('supabase/functions/seo-api/handlers/reanalyze.ts');
const VIEWER = read('src/components/features/ai/SEOArticleViewer.tsx');
const ACCESS = read('supabase/functions/seo-api/handlers/article-access.ts');

describe('save and re-score are one call', () => {
  it('the viewer sends the body to reanalyze, and writes nowhere else', () => {
    expect(VIEWER).toMatch(/action: 'reanalyze', article_id: article\.id, markdown_content: next/);
    // A direct `.from('seo_articles').update({ markdown_content` in the save path would be the
    // second write this design exists to remove.
    const save = VIEWER.slice(VIEWER.indexOf('const saveMarkdown'), VIEWER.indexOf('const reanalyze'));
    expect(save).not.toMatch(/from\('seo_articles'\)/);
  });

  it('the handler scores the body it is about to write, not the stored one', () => {
    // `markdown` must resolve to the EDIT when there is one; scoring the row and saving the edit
    // would return a number computed from the text the writer just replaced.
    expect(HANDLER).toMatch(/const markdown = edited \?\? article\.markdown_content \?\? '';/);
    const analyse = HANDLER.indexOf('analyzeContent(');
    const write = HANDLER.indexOf('persistAnalysis(');
    expect(analyse).toBeGreaterThan(-1);
    expect(analyse, 'the analysis must be computed before the write it is stored with').toBeLessThan(write);
  });

  it('the new body and its revert snapshot go in the SAME statement', () => {
    const cols = /const columns = edited === null \? \{\} : \{([\s\S]*?)\};/.exec(HANDLER);
    expect(cols, 'the edit is no longer written through persistAnalysis columns').toBeTruthy();
    expect(cols![1]).toMatch(/markdown_content: edited/);
    expect(cols![1], 'a hand edit must be revertible like an applied fix').toMatch(/previous_markdown: article\.markdown_content/);
    expect(cols![1]).toMatch(/previous_markdown_at: capturedAt/);
  });
});

describe('a score that could not be computed is stated, not implied', () => {
  it('an article with no plan still saves the edit', () => {
    // Refusing outright would throw away what the writer typed.
    expect(HANDLER).toMatch(/if \(edited === null\) return jsonResponse\(\{ success: false, error: noPlan \}/);
    expect(HANDLER).toMatch(/saved: true, scored: false, score_unavailable: noPlan/);
  });

  it('the viewer says so rather than leaving the old number beside new text', () => {
    expect(VIEWER).toMatch(/data\.data\.scored === false/);
    expect(VIEWER).toMatch(/score_unavailable/);
  });

  it('the stale render is dropped, so the rendered view cannot show the replaced text', () => {
    const save = VIEWER.slice(VIEWER.indexOf('const saveMarkdown'), VIEWER.indexOf('const reanalyze'));
    expect(save).toMatch(/html_content: null/);
  });
});

describe('the editor does not lose work', () => {
  it('a failed save keeps the draft on screen', () => {
    expect(VIEWER).toMatch(/if \(!r\.ok\) \{ setSaveError\([\s\S]{0,60}?\); return; \}/);
    // The draft is only cleared AFTER the ok path.
    const commit = VIEWER.slice(VIEWER.indexOf('const commitEdit'), VIEWER.indexOf('const commitEdit') + 700);
    expect(commit.indexOf('setSaveError(r.error'), 'the failure branch is gone').toBeGreaterThan(-1);
    expect(commit.indexOf('setDraft(null)')).toBeGreaterThan(commit.indexOf('setSaveError(r.error'));
  });

  it('refuses to save an empty article', () => {
    expect(HANDLER).toMatch(/An article cannot be saved empty/);
    expect(VIEWER).toMatch(/disabled=\{saving \|\| !draft\?\.trim\(\)\}/);
  });
});

describe('the stored word count follows the body', () => {
  it('every analysis write sets it from the analysis that just counted', () => {
    // Nothing on the apply-fix or reanalyse path touched it, so the viewer printed the
    // pipeline's original figure over a body that had been rewritten since.
    expect(ACCESS).toMatch(/word_count: analysis\.wordCount,/);
  });
});
