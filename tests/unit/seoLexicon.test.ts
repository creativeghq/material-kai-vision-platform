import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from './../helpers/stripComments';
vi.mock('../../supabase/functions/_shared/ai-client.ts', () => ({ callClaudeMessages: vi.fn() }));
vi.mock('../../supabase/functions/_shared/prompt-utils.ts', () => ({ getToolPrompt: vi.fn() }));
vi.mock('../../supabase/functions/seo-api/handlers/stage-billing.ts', () => ({}));

const { applyLexiconEdits, fixGreekPunctuation, replaceWordInProse, visibleGreekWords } = await import('../../supabase/functions/seo-api/handlers/lexicon.ts');

const src = blankComments(readFileSync(join(process.cwd(), 'supabase/functions/seo-api/handlers/lexicon.ts'), 'utf-8'));

describe('fixGreekPunctuation', () => {
  it('ends a Greek question with the Greek question mark', () => {
    expect(fixGreekPunctuation('Πόσο κοστίζει ένα έπιπλο μπάνιου? Αρκετά.')).toBe('Πόσο κοστίζει ένα έπιπλο μπάνιου; Αρκετά.');
    expect(fixGreekPunctuation('## Τι είναι το terrazzo?')).toBe('## Τι είναι το terrazzo;');
  });

  it('counts a link\'s text but not its target', () => {
    expect(fixGreekPunctuation('Θέλετε [έπιπλα](https://ex.com/a?b=1)?')).toBe('Θέλετε [έπιπλα](https://ex.com/a?b=1);');
  });

  it('never touches Latin text, URLs or code', () => {
    const md = 'What is a vanity? See https://ex.com/search?q=νιπτήρας and `τι?` too.\n```\nτι είναι?\n```';
    expect(fixGreekPunctuation(md)).toBe(md);
  });

  it('hyphenates a doubled Greek word, and only a Greek one', () => {
    expect(fixGreekPunctuation('Οδηγός βήμα βήμα για την τοποθέτηση.')).toBe('Οδηγός βήμα-βήμα για την τοποθέτηση.');
    expect(fixGreekPunctuation('step step and βήμα-βήμα')).toBe('step step and βήμα-βήμα');
  });
});

describe('visibleGreekWords', () => {
  it('reads the prose, not URLs, image or link targets, code or callout tags', () => {
    const md = [
      '> [!tip] Τα πλακάκια θέλουν αρμόστοκο.',
      '![πετρώματι](https://ex.com/υποθήμενος.jpg)',
      'Δείτε τα [έπιπλα μπάνιου](https://ex.com/επιπλα-μπανιου) και `χρυσαίους` κώδικα.',
    ].join('\n');
    const words = visibleGreekWords(md);
    expect(words).toEqual(expect.arrayContaining(['Τα', 'πλακάκια', 'αρμόστοκο', 'Δείτε', 'έπιπλα', 'μπάνιου', 'κώδικα']));
    for (const w of ['πετρώματι', 'υποθήμενος', 'επιπλα', 'χρυσαίους']) expect(words).not.toContain(w);
  });

  it('skips capitals, elisions and abbreviations, and lists each word once', () => {
    const words = visibleGreekWords('ΕΠΙΠΛΑ ΜΠΑΝΙΟΥ σ\' αυτό το πλάτος 60 εκ. π.χ. αυτό');
    expect(words).toEqual(['αυτό', 'το', 'πλάτος']);
  });
});

describe('enforceLexicon — source guards', () => {
  it('loads its prompt from the database', () => {
    expect(src).toMatch(/getToolPrompt\(\s*supabase,\s*'seo_lexicon_fix'\s*\)/);
    expect(src).not.toMatch(/system:\s*['"`]/);
  });

  it('reserves credits before the model call and settles after it', () => {
    const reserve = src.indexOf('reserveStage(');
    const call = src.indexOf('callClaudeMessages(', src.indexOf('export async function enforceLexicon'));
    const settle = src.indexOf('settleStage(', call);
    expect(reserve).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(reserve);
    expect(settle).toBeGreaterThan(call);
    expect(src).toContain("opType: 'seo_lexicon'");
  });

  it('constrains the reply by schema and never salvages a refusal or a truncated one', () => {
    expect(src).toMatch(/output_config:\s*\{\s*(effort:\s*'low',\s*)?format:\s*\{\s*type:\s*'json_schema'/);
    expect(src).toMatch(/stop_reason === 'refusal' \|\| res\.stop_reason === 'max_tokens'/);
  });
});

describe('a dictionary correction', () => {
  it('fixes every occurrence of a misspelt word in the prose, never inside a link target', () => {
    const md = 'Ρεκτιφιαρισμένα πλακάκια. Τα ρεκτιφιαρισμένα [πλακάκια](https://tiles.example/ρεκτιφιαρισμένα) είναι ίσια.';
    const out = replaceWordInProse(md, 'ρεκτιφιαρισμένα', 'ρεκτιφιέ');
    expect(out.count).toBe(2);
    expect(out.markdown).toBe('Ρεκτιφιέ πλακάκια. Τα ρεκτιφιέ [πλακάκια](https://tiles.example/ρεκτιφιαρισμένα) είναι ίσια.');
  });

  it('applies a repeated one-word edit and says why any other edit was dropped', () => {
    const out = applyLexiconEdits('Το φορμά και το φορμά. Ένα κείμενο.', [
      { find: 'φορμά', replace: 'φορμά', kind: 'lexicon' },
      { find: 'φορμά', replace: 'φόρμα', kind: 'lexicon' },
      { find: 'δεν υπάρχει εδώ', replace: 'κάτι', kind: 'lexicon' },
    ], new Set(['φορμά']));
    expect(out.markdown).toBe('Το φόρμα και το φόρμα. Ένα κείμενο.');
    expect(out.corrected).toEqual([{ from: 'φορμά', to: 'φόρμα' }]);
    expect(out.skipped.map((s) => s.why)).toEqual(['empty or unchanged', 'text not found']);
  });

  it('approved glossary lessons are applied before the model is asked', () => {
    expect(src.indexOf('approvedGlossary(supabase')).toBeLessThan(src.indexOf('callClaudeMessages('));
  });
});

describe('what the guides cover', () => {
  it('uses the sections most guides share, and each guide\'s own sections when they share none', async () => {
    const { guideSectionsToCover } = await import('../../supabase/functions/seo-api/handlers/coverage.ts');
    const label = (l: string) => ({ label: l, pages: 1 });
    expect(guideSectionsToCover({ read: 4, common: [{ label: 'Αντοχή', pages: 3 }], distinctive: [label('Τιμές')] } as never)).toEqual(['Αντοχή']);
    expect(guideSectionsToCover({ read: 4, common: [], distinctive: [label('Τιμές'), label('Αρμόστοκοι')] } as never)).toEqual(['Τιμές', 'Αρμόστοκοι']);
    expect(guideSectionsToCover(undefined)).toEqual([]);
  });
});

describe('a dictionary fix never spreads to a word the dictionary did not flag', () => {
  it('a one-word edit of a correct word applies only where it is unique', () => {
    const md = 'Ένα μεγάλο πλακάκι. Ένα μεγάλο σπίτι.';
    const out = applyLexiconEdits(md, [{ find: 'μεγάλο', replace: 'μεγάλη', kind: 'lexicon' }], new Set(['ρεκτιφιαρισμένα']));
    expect(out.markdown).toBe(md);
    expect(out.skipped.map((s) => s.why)).toEqual(['text not unique']);
  });
});
