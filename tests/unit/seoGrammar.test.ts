import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from './../helpers/stripComments';
vi.mock('../../supabase/functions/_shared/ai-client.ts', () => ({ callClaudeMessages: vi.fn() }));
vi.mock('../../supabase/functions/_shared/prompt-utils.ts', () => ({ getToolPrompt: vi.fn() }));
vi.mock('../../supabase/functions/_shared/config.ts', () => ({ getConfig: vi.fn() }));
vi.mock('../../supabase/functions/_shared/secrets.ts', () => ({ resolveSecret: vi.fn() }));
vi.mock('../../supabase/functions/seo-api/handlers/stage-billing.ts', () => ({}));

const { visibleProse, keepMatch, markdownSentenceAt, chunkText, checkAgreementEdit, validateAgreementEdits } = await import(
  '../../supabase/functions/seo-api/handlers/grammar.ts'
);

const src = blankComments(readFileSync(join(process.cwd(), 'supabase/functions/seo-api/handlers/grammar.ts'), 'utf-8'));

const match = (text: string, needle: string, over: Record<string, string> = {}) => ({
  offset: text.indexOf(needle),
  length: needle.length,
  message: 'issue',
  rule_id: 'GREEK_ART_FEM_MISSING_N',
  category: 'ORTHOGRAPHY',
  ...over,
});

describe('visibleProse', () => {
  const md = [
    '# Πλακάκια terrazzo',
    '',
    '> [!tldr]',
    '> - Δείτε τη [σειρά Terrazzo](https://ex.com/a) και **το σχέδιο**.',
    '![πλακάκι](https://ex.com/p.jpg)',
    '```',
    'κώδικας εδώ',
    '```',
    '| Παράμετρος | Τιμή |',
    '|---|---|',
    'Δείτε https://ex.com/x τώρα.',
  ].join('\n');
  const { text, at } = visibleProse(md);

  it('keeps what a reader sees and drops markup, URLs, targets, images and code', () => {
    expect(text).toContain('Πλακάκια terrazzo');
    expect(text).toContain('Δείτε τη σειρά Terrazzo και το σχέδιο.');
    expect(text).toContain('Δείτε τώρα.');
    for (const gone of ['https://', '](', '**', '[!tldr]', 'πλακάκι](', 'κώδικας', '---', '#']) expect(text).not.toContain(gone);
  });

  it('puts each line and table cell in its own paragraph', () => {
    expect(text).toMatch(/Παράμετρος\s*\n\n\s*Τιμή/);
  });

  it('maps every visible character back to the same character of the markdown', () => {
    for (let i = 0; i < text.length; i++) if (at[i] >= 0 && !/\s/.test(text[i])) expect(md[at[i]]).toBe(text[i]);
  });
});

describe('keepMatch', () => {
  it('keeps a grammar point in plain Greek prose', () => {
    const t = 'Σκουπίστε τα άλατα από τη ντουζιέρα.';
    expect(keepMatch(t, match(t, 'τη'))).toBe(true);
  });

  it('drops spelling, typography, punctuation, casing and optional-ν rules', () => {
    const t = 'Ο κατασκευαστής δεν δημοσιεύει τιμή.';
    expect(keepMatch(t, match(t, 'δεν', { rule_id: 'MORFOLOGIK_RULE_EL_GR', category: 'TYPOS' }))).toBe(false);
    expect(keepMatch(t, match(t, 'δεν', { rule_id: 'GREEK_PARTICLE_EXTRA_N_1' }))).toBe(false);
    expect(keepMatch(t, match(t, 'δεν', { rule_id: 'DOUBLE_PUNCTUATION', category: 'PUNCTUATION' }))).toBe(false);
    expect(keepMatch(t, match(t, 'δεν', { rule_id: 'UPPERCASE_SENTENCE_START', category: 'CASING' }))).toBe(false);
  });

  it('drops a match on or next to a Latin word', () => {
    const t = 'Δείτε τη σειρά Kos ή την TRAVERTINO σε όψη πέτρας.';
    expect(keepMatch(t, match(t, 'την', { rule_id: 'X', category: 'GRAMMAR' }))).toBe(false);
    expect(keepMatch(t, match(t, 'Kos', { rule_id: 'X', category: 'GRAMMAR' }))).toBe(false);
  });

  it('drops a capitalised name mid-sentence but keeps a sentence-initial word', () => {
    const t = 'Μια μπάνιο με τη Μαρμαροτεχνική Αθηνών.';
    expect(keepMatch(t, match(t, 'Μια μπάνιο', { rule_id: 'X', category: 'GRAMMAR' }))).toBe(true);
    expect(keepMatch(t, match(t, 'Μαρμαροτεχνική', { rule_id: 'X', category: 'GRAMMAR' }))).toBe(false);
  });
});

describe('markdownSentenceAt', () => {
  it('returns the raw sentence, markup included', () => {
    const md = 'Πρώτη πρόταση. Ο αρμός σχεδιάζει **το κάνναβο** και [εδώ](https://x.y/a). Τρίτη.\nΆλλη γραμμή.';
    expect(markdownSentenceAt(md, md.indexOf('κάνναβο'))).toBe('Ο αρμός σχεδιάζει **το κάνναβο** και [εδώ](https://x.y/a).');
    expect(markdownSentenceAt(md, md.indexOf('Άλλη'))).toBe('Άλλη γραμμή.');
  });
});

describe('chunkText', () => {
  it('splits on paragraph breaks and keeps offsets', () => {
    const t = 'α'.repeat(30) + '\n\n' + 'β'.repeat(30);
    const chunks = chunkText(t, 40);
    expect(chunks.map((c) => c.text).join('')).toBe(t);
    expect(chunks[1].start).toBe(30);
  });
});

describe('enforceGrammar — source guards', () => {
  it('loads both prompts from the database and hardcodes none', () => {
    expect(src).toMatch(/getToolPrompt\(\s*supabase,\s*'seo_grammar_fix'\s*\)/);
    expect(src).toMatch(/getToolPrompt\(\s*supabase,\s*'seo_grammar_agreement'\s*\)/);
    expect(src).not.toMatch(/system:\s*['"`]/);
  });

  it('reserves credits before any model call and settles after them', () => {
    const fn = src.indexOf('export async function enforceGrammar');
    const reserve = src.indexOf('reserveStage(', fn);
    const firstCall = src.indexOf('editCall(', fn);
    const settle = src.indexOf('settleStage(', fn);
    expect(reserve).toBeGreaterThan(fn);
    expect(firstCall).toBeGreaterThan(reserve);
    expect(settle).toBeGreaterThan(src.lastIndexOf('editCall(', settle));
    expect(src.slice(src.indexOf('async function editCall'), fn)).toContain('callClaudeMessages(');
    expect(src.slice(fn)).not.toContain('callClaudeMessages(');
    expect(src).toContain("opType: 'seo_grammar'");
  });

  it('validates agreement edits before applying them', () => {
    const fn = src.slice(src.indexOf('export async function enforceGrammar'));
    expect(fn.indexOf('validateAgreementEdits(')).toBeGreaterThan(0);
    expect(fn.indexOf('validateAgreementEdits(')).toBeLessThan(fn.indexOf('applyReviewEdits('));
  });

  it('constrains the reply by schema and never salvages a refusal or a truncated one', () => {
    expect(src).toMatch(/output_config:\s*\{\s*effort:\s*'low',\s*format:\s*\{\s*type:\s*'json_schema'/);
    expect(src).toMatch(/stop_reason === 'refusal' \|\| res\.stop_reason === 'max_tokens'/);
  });

  it('calls the internal-gated MIVAA route with the cron secret', () => {
    expect(src).toContain('/api/internal/text/grammar-check');
    expect(src).toMatch(/'x-cron-secret':\s*secret/);
  });
});

describe('checkAgreementEdit', () => {
  const md = 'Ο αρμός σχεδιάζει το κάνναβο.\n\nΜια μπάνιο σε μπεζ τόνους, με **ένα πορτοκαλί** [σειρά Kos](https://x.y/k).';
  const prose = visibleProse(md);
  const edit = (find: string, replace: string) => ({ find, replace, note: '' });

  it('accepts a word-form fix and returns the changed words', () => {
    expect(checkAgreementEdit(edit('σχεδιάζει το κάνναβο', 'σχεδιάζει τον κάνναβο'), prose, md))
      .toEqual({ ok: true, find: 'σχεδιάζει το κάνναβο', words: ['τον'] });
    expect(checkAgreementEdit(edit('Μια μπάνιο', 'Ένα μπάνιο'), prose, md)).toMatchObject({ ok: true, words: ['Ένα'] });
  });

  it('refuses a find that is absent or not unique', () => {
    expect(checkAgreementEdit(edit('το κάνναβη', 'τον κάνναβο'), prose, md)).toEqual({ ok: false, why: 'not in the prose' });
    expect(checkAgreementEdit(edit('το', 'τον'), prose, md)).toEqual({ ok: false, why: 'not unique' });
  });

  it('refuses rewording, added words and punctuation changes', () => {
    expect(checkAgreementEdit(edit('σε μπεζ τόνους', 'σε μπεζ αποχρώσεις'), prose, md)).toMatchObject({ ok: true });
    expect(checkAgreementEdit(edit('σε μπεζ τόνους', 'σε ανοιχτούς μπεζ τόνους'), prose, md)).toEqual({ ok: false, why: 'changes more than word forms' });
    expect(checkAgreementEdit(edit('μπεζ τόνους,', 'μπεζ τόνους;'), prose, md)).toEqual({ ok: false, why: 'changes more than word forms' });
  });

  it('refuses a change to a Latin word or a number', () => {
    expect(checkAgreementEdit(edit('σειρά Kos', 'σειρά Kós'), prose, md)).toEqual({ ok: false, why: 'changes a non-Greek word' });
  });

  it('refuses a find that crosses markup the reader never sees', () => {
    expect(checkAgreementEdit(edit('με ένα πορτοκαλί', 'με μια πορτοκαλί'), prose, md)).toEqual({ ok: false, why: 'spans markup' });
  });
});

describe('validateAgreementEdits', () => {
  const md = 'Ο αρμός σχεδιάζει το κάνναβο και Μια μπάνιο.';
  const rpc = vi.fn();
  const supabase = { rpc } as never;

  it('drops an edit that introduces a word the dictionary does not know, and keeps the rest', async () => {
    rpc.mockResolvedValueOnce({ data: ['κάνναβα'], error: null });
    const out = await validateAgreementEdits(supabase, [
      { find: 'το κάνναβο', replace: 'τον κάνναβα', note: '' },
      { find: 'Μια μπάνιο', replace: 'Ένα μπάνιο', note: 'neuter' },
      { find: 'Ο αρμός', replace: 'Ο αρμός', note: '' },
    ], md, 'ws');
    expect(rpc).toHaveBeenCalledWith('lexicon_unknown_words', expect.objectContaining({ p_language: 'el', p_words: ['τον', 'κάνναβα', 'Ένα'] }));
    expect(out.accepted).toEqual([{ find: 'Μια μπάνιο', replace: 'Ένα μπάνιο', note: 'neuter', mdFind: 'Μια μπάνιο' }]);
    expect(out.dropped.map((d) => d.why)).toEqual(['empty or unchanged', 'unknown word: κάνναβα']);
  });

  it('applies nothing when the dictionary cannot be asked', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    const out = await validateAgreementEdits(supabase, [{ find: 'Μια μπάνιο', replace: 'Ένα μπάνιο', note: '' }], md, null);
    expect(out.accepted).toEqual([]);
    expect(out.dropped[0].why).toMatch(/lexicon check failed/);
  });
});
