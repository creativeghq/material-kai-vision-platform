/** Article Suggestions: billing order, prompt source, tenancy and the pure validation rules. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';
import {
  applySuggestion, mergeSuggestions, pickSuggestionItems, validateSuggestion, MAX_SUGGESTION_ITEMS,
  type ArticleSuggestion,
} from '../../supabase/functions/seo-api/handlers/suggestion-rules.ts';

const SRC = blankComments(readFileSync(join(process.cwd(), 'supabase/functions/seo-api/handlers/suggestions.ts'), 'utf8'));

function body(name: string): string {
  const start = SRC.indexOf(`export async function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = SRC.indexOf('export async function ', start + 10);
  return SRC.slice(start, next === -1 ? undefined : next);
}

describe('suggestions handler — source guards', () => {
  it('reserves credits before the model call and settles after it', () => {
    const fn = body('handleSuggestions');
    const reserve = fn.indexOf('reserveStage(');
    const call = fn.indexOf('callClaudeMessages(');
    const settle = fn.indexOf('settleStage(');
    expect(reserve).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(reserve);
    expect(settle).toBeGreaterThan(call);
    expect(fn).toMatch(/refundStage\(/);
    expect(fn).toMatch(/opType: 'seo_suggestions'/);
  });

  it('loads its prompt from the database and constrains the reply with a JSON schema', () => {
    const fn = body('handleSuggestions');
    expect(fn).toMatch(/getToolPrompt\(supabase, 'seo_suggestion_writer'\)/);
    expect(fn).toMatch(/output_config: \{ format: \{ type: 'json_schema'/);
    expect(fn).toMatch(/stop_reason === 'refusal' \|\| res\.stop_reason === 'max_tokens'/);
  });

  it('validates every proposal before storing it', () => {
    const fn = body('handleSuggestions');
    expect(fn.indexOf('validateSuggestion(')).toBeGreaterThan(fn.indexOf('callClaudeMessages('));
    expect(fn.indexOf('validateSuggestion(')).toBeLessThan(fn.indexOf("from('seo_articles')\n      .update"));
  });

  it('apply re-validates against the current text and snapshots before writing', () => {
    const fn = body('handleSuggestionApply');
    const validate = fn.indexOf('validateSuggestion(');
    const apply = fn.indexOf('applySuggestion(');
    const snapshot = fn.indexOf('previous_markdown: markdown');
    const write = fn.indexOf('persistAnalysis(');
    expect(validate).toBeGreaterThan(-1);
    expect(fn).toMatch(/409/);
    expect(apply).toBeGreaterThan(validate);
    expect(snapshot).toBeGreaterThan(apply);
    expect(write).toBeGreaterThan(snapshot);
    expect(fn).not.toMatch(/reserveStage\(|callClaudeMessages\(/);
  });

  it('every action derives the user from the JWT and loads the article through loadOwnedArticle', () => {
    expect(SRC).toMatch(/const auth = await authenticate\(req\)/);
    expect(body('handleSuggestions')).toMatch(/loadOwnedArticle\(supabase, userId, articleId\)/);
    expect(SRC).toMatch(/loadOwnedArticle\(supabase, who\.userId, articleId\)/);
    expect(body('handleSuggestionApply')).toMatch(/loadSuggestion\(req, body\)/);
    expect(body('handleSuggestionDismiss')).toMatch(/loadSuggestion\(req, body\)/);
    expect(SRC).not.toMatch(/body\.workspace_id/);
  });

  it('never spreads the request body into a write', () => {
    expect(SRC).not.toMatch(/\.\.\.body\b/);
    expect(SRC).not.toMatch(/\.\.\.\s*r\b/);
  });
});

describe('validateSuggestion / applySuggestion', () => {
  const md = '# Title\n\nFirst paragraph here.\n\n## Section\n\nSecond paragraph, longer.\nIts second line.\n\n## End\n\nBye.';

  it('accepts a unique anchor and refuses a missing or repeated one', () => {
    expect(validateSuggestion(md, { kind: 'replace', find: 'First paragraph', replace: 'Opening' })).toBeNull();
    expect(validateSuggestion(md, { kind: 'replace', find: 'Nope', replace: 'x' })).toMatch(/not in the article/);
    expect(validateSuggestion(md, { kind: 'replace', find: 'paragraph', replace: 'x' })).toMatch(/more than once/);
    expect(validateSuggestion(md, { kind: 'insert', after: '', markdown: 'x' })).toMatch(/no anchor/);
    expect(validateSuggestion(md, { kind: 'insert', after: 'Bye.', markdown: '  ' })).toMatch(/no new text/);
    expect(validateSuggestion(md, { kind: 'replace', find: 'Bye.', replace: 'Bye.' })).toMatch(/identical/);
    expect(validateSuggestion(md, { kind: 'insert', after: 'Bye.', markdown: 'First paragraph here.' })).toMatch(/already/);
  });

  it('replaces exactly the anchor, treating $ in the new text literally', () => {
    expect(applySuggestion(md, { kind: 'replace', find: 'Bye.', replace: 'Costs $& and $1.' }))
      .toBe(md.replace('Bye.', () => 'Costs $& and $1.'));
  });

  it('inserts after the paragraph the anchor ends in, never inside it', () => {
    const out = applySuggestion(md, { kind: 'insert', after: 'Second paragraph, longer.', markdown: 'New block.' });
    expect(out).toContain('Its second line.\n\nNew block.\n\n## End');
  });

  it('appends at the end when the anchor is in the last paragraph', () => {
    const out = applySuggestion(md, { kind: 'insert', after: 'Bye.', markdown: '### Q?\n\nA.' });
    expect(out.endsWith('Bye.\n\n### Q?\n\nA.\n')).toBe(true);
  });
});

describe('pickSuggestionItems / mergeSuggestions', () => {
  const md = 'One unique paragraph.\n\nRepeated.\n\nRepeated.';

  it('de-duplicates, drops settled items and analysis fixes whose anchor is not unique', () => {
    const items = pickSuggestionItems([
      { source: 'coverage', point: 'Care tips' },
      { source: 'answer_check', point: 'care  TIPS' },
      { source: 'coverage', point: 'Dismissed point' },
      { source: 'analysis', point: 'Shorten', anchor: 'Repeated.' },
      { source: 'analysis', point: 'Shorten', anchor: 'One unique paragraph.' },
    ], md, [{ basis: 'Dismissed point', status: 'dismissed' }]);
    expect(items).toHaveLength(2);
    expect(items.filter((i) => /care/i.test(i.point))).toHaveLength(1);
    expect(items.some((i) => i.point === 'Dismissed point')).toBe(false);
    expect(items.some((i) => i.anchor === 'Repeated.')).toBe(false);
  });

  it('caps the list, smallest edit first', () => {
    const items = pickSuggestionItems(
      Array.from({ length: 20 }, (_, i) => ({ source: 'coverage' as const, point: `Point ${'x'.repeat(i)}` })),
      md, [],
    );
    expect(items).toHaveLength(MAX_SUGGESTION_ITEMS);
    expect(items[0].point).toBe('Point ');
  });

  it('replaces older pending suggestions and keeps applied/dismissed history', () => {
    const s = (id: string, status: ArticleSuggestion['status']): ArticleSuggestion => ({
      id, status, source: 'coverage', title: id, kind: 'insert', after: 'a', markdown: 'b', basis: id, created_at: '',
    });
    const merged = mergeSuggestions([s('old', 'pending'), s('done', 'applied'), s('no', 'dismissed')], [s('new', 'pending')]);
    expect(merged.map((m) => m.id)).toEqual(['done', 'no', 'new']);
  });
});
