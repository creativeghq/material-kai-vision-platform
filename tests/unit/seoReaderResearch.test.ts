import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from './../helpers/stripComments';
import { guideQuery, isReaderQuestion, readerQuestions } from '../../supabase/functions/seo-api/handlers/reader-questions.ts';

const HANDLERS = join(process.cwd(), 'supabase/functions/seo-api/handlers');
const src = (f: string) => blankComments(readFileSync(join(HANDLERS, f), 'utf-8'));

describe('reader questions — what people ask, from the searches they type', () => {
  it.each([
    ['πόσο κοστίζει ένα έπιπλο μπάνιου', true],
    ['κρεμαστό ή δαπέδου έπιπλο μπάνιου', true],
    ['μπορώ να βάλω πλακάκια πάνω σε πλακάκια', true],
    ['έπιπλα μπάνιου με νιπτήρα', false],
    ['jysk επιπλα μπανιου', false],
  ])('el: %s → %s', (term, expected) => {
    expect(isReaderQuestion(term, 'el')).toBe(expected);
  });

  it('keeps the most-searched questions first and drops accent-only duplicates', () => {
    expect(readerQuestions([
      { term: 'πως καθαριζω πλακακια', searchVolume: 50 },
      { term: 'πώς καθαρίζω πλακάκια', searchVolume: 900 },
      { term: 'πλακάκια μπάνιου', searchVolume: 5000 },
      { term: 'ποιο είναι καλύτερο', searchVolume: 100 },
    ], 'el')).toEqual(['πώς καθαρίζω πλακάκια', 'ποιο είναι καλύτερο']);
  });

  it('asks for the guides with the topic in its "how to choose" form, per language', () => {
    expect(guideQuery('έπιπλα μπάνιου', 'el')).toBe('πώς να επιλέξω έπιπλα μπάνιου');
    expect(guideQuery('bathroom vanity', 'en')).toBe('how to choose bathroom vanity');
    expect(guideQuery('x', 'xx')).toBe('how to choose x');
  });
});

describe('research reads what readers ask, and the article is checked against it', () => {
  it('research fetches the AI Mode answer, reader questions and the guides', () => {
    const code = src('research.ts');
    expect(code).toContain('client.aiModeAnswer(');
    expect(code).toContain('research.readerQuestions = readerQuestions(');
    expect(code).toContain('research.guideContent = ');
  });

  it('the planner is told to cover each of them', () => {
    const code = src('plan.ts');
    for (const section of ['aiModeSection', 'questionsSection', 'guideSection']) {
      expect(code, section).toContain('${' + section + '}');
    }
  });

  it('the finished article is checked for coverage after the editor review', () => {
    const code = src('pipeline.ts');
    expect(code.indexOf('await reviewArticle(')).toBeLessThan(code.indexOf('await checkCoverage('));
  });

  it('a published-article check reserves before the paid AI Mode call', () => {
    const code = src('answer-check.ts');
    expect(code.indexOf('reserveStage(')).toBeGreaterThan(-1);
    expect(code.indexOf('reserveStage(')).toBeLessThan(code.indexOf('client.aiModeAnswer('));
  });
});
