import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  SECTION_LABELS,
  findFaqSection,
  findConclusionLine,
  isConclusionHeading,
  isFaqHeading,
  isQuestionHeading,
  scriptLanguage,
  sectionLabelsFor,
  stripAccents,
} from '../../src/services/seo/articleSections';
import { insertFaqEntry } from '../../supabase/functions/seo-api/handlers/faq-insert.ts';
import { outputLanguageBlock } from '../../supabase/functions/seo-api/handlers/output-language.ts';

/** An article written in Greek came out with two English headings in the middle of it. */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

/**
 * The file with its comments removed.
 *
 * These checks look for a pattern that must not RUN, and the comment explaining why it must not
 * run quotes it verbatim — so a source-text assertion fails on its own explanation. (It did,
 * first try.) Stripping the prose is what lets the comment stay honest about what it replaced.
 */
const codeOf = (p: string) => stripComments(read(p));

describe('a section label is both writable and readable', () => {
  // The whole point of one table: you cannot add a language the writer can use and the reader
  // cannot find. Every entry proves itself.
  for (const [code, labels] of Object.entries(SECTION_LABELS)) {
    it(`${code}: its own FAQ and closing labels are recognised`, () => {
      expect(isFaqHeading(labels.faq), `${labels.faq} must read as an FAQ heading`).toBe(true);
      expect(isConclusionHeading(labels.conclusion)).toBe(true);
      for (const alias of labels.faqAliases) expect(isFaqHeading(alias), alias).toBe(true);
      for (const alias of labels.conclusionAliases) expect(isConclusionHeading(alias), alias).toBe(true);
    });

    it(`${code}: it has a placeholder note to write under a new heading`, () => {
      // "Add section" writes this INTO the customer's article, under a heading already in their
      // language. An English sentence there is the same defect one button along.
      expect(labels.todo.answer.trim().length).toBeGreaterThan(10);
      expect(labels.todo.cover.trim().length).toBeGreaterThan(10);
      if (code !== 'en') {
        expect(labels.todo.answer, 'left as the English copy').not.toBe(SECTION_LABELS.en.todo.answer);
        expect(labels.todo.cover, 'left as the English copy').not.toBe(SECTION_LABELS.en.todo.cover);
      }
    });

    it(`${code}: the FAQ label is not also a closing label`, () => {
      // They pick different sections. An overlap would make `insertFaqEntry` insert an FAQ above
      // itself, and the structural pass skip the section it is looking for.
      expect(isConclusionHeading(labels.faq)).toBe(false);
      expect(isFaqHeading(labels.conclusion)).toBe(false);
    });
  }
});

describe('recognising the FAQ heading', () => {
  it('accepts the keyword-bearing form the planner actually produces', () => {
    // Verbatim from the stored plan of article 9bf2b2a1. The old viewer regex was ANCHORED
    // (`^##\s+frequently asked questions\s*$`), so it rejected this even in English.
    expect(isFaqHeading('Συχνές Ερωτήσεις (FAQ) για πλακάκια μπάνιου Θεσσαλονίκη')).toBe(true);
    expect(isFaqHeading('Frequently Asked Questions About Bathroom Tiles')).toBe(true);
  });

  it('folds accents and final sigma', () => {
    // `ς` and `σ` are the same letter in two positions and `toLowerCase` keeps them apart.
    expect(stripAccents('Συχνές Ερωτήσεις')).toBe(stripAccents('ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ'));
    expect(isFaqHeading('ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ')).toBe(true);
    expect(isFaqHeading('Συχνές ερωτήσεις:')).toBe(true);
  });

  it('does not promote an ordinary body heading', () => {
    for (const h of ['Τιμές πλακιδίων', 'How to lay a tile', 'Κόστος τοποθέτησης', 'Fazitplan']) {
      expect(isFaqHeading(h), h).toBe(false);
    }
  });

  it('knows a Greek question mark', () => {
    // Greek ends a question with `;`. A test for `?` alone answers "no" for every question in
    // the language this platform actually writes in — which is how the AEO score silently
    // counted zero Q&A pairs in an article full of them.
    expect(isQuestionHeading('Ποιες είναι οι μέσες τιμές;')).toBe(true);
    expect(isQuestionHeading('What does a tile cost?')).toBe(true);
    expect(isQuestionHeading('Τιμές πλακιδίων')).toBe(false);
  });
});

describe('finding the section in a real article', () => {
  const greek = [
    '# Πλακάκια μπάνιου Θεσσαλονίκη',
    '',
    'Εισαγωγή.',
    '',
    '## Τύποι πλακιδίων',
    '',
    'Κείμενο.',
    '',
    '## Συχνές Ερωτήσεις',
    '',
    '### Ποιες είναι οι μέσες τιμές;',
    '',
    'Απάντηση.',
    '',
    '## Συμπέρασμα',
    '',
    'Κλείσιμο.',
    '',
  ].join('\n');

  it('finds a Greek FAQ section by its name', () => {
    const faq = findFaqSection(greek);
    expect(faq?.headingText).toBe('Συχνές Ερωτήσεις');
    expect(faq?.matchedBy).toBe('label');
    // The section ends AT the conclusion, so the accordion does not swallow the closing copy.
    expect(greek.split('\n')[faq!.endLine]).toBe('## Συμπέρασμα');
  });

  it('finds the Greek conclusion', () => {
    expect(greek.split('\n')[findConclusionLine(greek)]).toBe('## Συμπέρασμα');
  });

  it('takes the LAST closing heading, not the first', () => {
    // "Summary" / "Σύνοψη" / "Riepilogo" are ordinary words for a mid-article H2, and callers use
    // this to mean "put the new material above the closing copy". Taking the first match files a
    // new section above a cost summary halfway up the page and leaves the real conclusion below
    // everything — the placement this was added to avoid.
    const withMidSummary = [
      '# Οδηγός',
      '',
      '## Σύνοψη κόστους',
      '',
      'Πίνακας.',
      '',
      '## Τοποθέτηση',
      '',
      'Κείμενο.',
      '',
      '## Συμπέρασμα',
      '',
      'Κλείσιμο.',
    ].join('\n');
    expect(withMidSummary.split('\n')[findConclusionLine(withMidSummary)]).toBe('## Συμπέρασμα');
  });

  it('falls back to the SHAPE when no heading names an FAQ', () => {
    // A language the table does not list. An H2 whose children are all question-shaped is an FAQ
    // section in any alphabet, and finding it beats rendering the questions as flat prose.
    const unlisted = [
      '# Otázky',
      '',
      '## Ceny dlaždic',
      '',
      'Text.',
      '',
      '## Na co se ptáte',
      '',
      '### Kolik stojí dlaždice?',
      '',
      'Odpověď.',
      '',
      '### Jak vybrat dlaždice?',
      '',
      'Odpověď.',
      '',
    ].join('\n');
    const faq = findFaqSection(unlisted);
    expect(faq?.headingText).toBe('Na co se ptáte');
    expect(faq?.matchedBy).toBe('structure');
  });

  it('does not invent an FAQ out of a how-to section', () => {
    // One question-shaped step among ordinary ones is a section, not an FAQ. Promoting it would
    // render half a chapter as an accordion.
    const howTo = [
      '# Οδηγός',
      '',
      '## Βήματα',
      '',
      '### Πόσο κοστίζει;',
      '',
      'Κείμενο.',
      '',
      '### Επιλέξτε κόλλα',
      '',
      'Κείμενο.',
      '',
    ].join('\n');
    expect(findFaqSection(howTo)).toBeNull();
  });

  it('prefers the named section over a question-shaped one elsewhere', () => {
    const both = [
      '## Βήματα',
      '',
      '### Πόσο κοστίζει;',
      '',
      '### Τι χρειάζομαι;',
      '',
      '## Συχνές Ερωτήσεις',
      '',
      '### Ποια είναι η διαφορά;',
      '',
    ].join('\n');
    expect(findFaqSection(both)?.headingText).toBe('Συχνές Ερωτήσεις');
  });
});

describe('naming a section we have to create ourselves', () => {
  it('uses the language the article was commissioned in', () => {
    expect(sectionLabelsFor('el').faq).toBe('Συχνές Ερωτήσεις');
    expect(sectionLabelsFor('el-GR').faq).toBe('Συχνές Ερωτήσεις');
    expect(sectionLabelsFor('es').faq).toBe('Preguntas Frecuentes');
  });

  it('falls back to the script when the language was never recorded', () => {
    // Every article written before `language_code` was stored on the row.
    const greekBody = 'Τα πλακάκια μπάνιου στη Θεσσαλονίκη ξεκινούν από 10 ευρώ το τετραγωνικό μέτρο.';
    expect(scriptLanguage(greekBody)).toBe('el');
    expect(sectionLabelsFor(null, greekBody).faq).toBe('Συχνές Ερωτήσεις');
  });

  it('never guesses a language from the latin alphabet', () => {
    // Spanish, Italian and English are one script. Answering "en" for all three is how a Spanish
    // article gets an English heading — the defect this module exists to remove.
    expect(scriptLanguage('Los azulejos de baño en Tesalónica cuestan desde diez euros el metro.')).toBeNull();
    expect(sectionLabelsFor(null, 'plain english body copy about tiles and prices').faq)
      .toBe('Frequently Asked Questions');
  });

  it('creates the FAQ above the LAST closing heading', () => {
    const noFaq = [
      '# Τίτλος', '', '## Σύνοψη τιμών', '', 'Πίνακας.', '', '## Συμπέρασμα', '', 'Κλείσιμο.', '',
    ].join('\n');
    const out = insertFaqEntry(noFaq, 'Ερώτηση;', 'Απάντηση.', sectionLabelsFor('el'));
    const lines = out.markdown.split('\n');
    expect(lines.indexOf('## Συχνές Ερωτήσεις')).toBeGreaterThan(lines.indexOf('## Σύνοψη τιμών'));
    expect(lines.indexOf('## Συχνές Ερωτήσεις')).toBeLessThan(lines.indexOf('## Συμπέρασμα'));
  });

  it('writes a GREEK heading into a Greek article that has no FAQ yet', () => {
    // The one path where WE choose the words. Defaulting to English here reintroduces the whole
    // defect from the other end, on the article the user is looking at.
    const noFaq = '# Τίτλος\n\nΚείμενο.\n\n## Συμπέρασμα\n\nΚλείσιμο.\n';
    const out = insertFaqEntry(noFaq, 'Ερώτηση;', 'Απάντηση.', sectionLabelsFor('el'));
    expect(out.createdSection).toBe(true);
    expect(out.heading).toBe('Συχνές Ερωτήσεις');
    const lines = out.markdown.split('\n');
    expect(lines.indexOf('## Συχνές Ερωτήσεις')).toBeLessThan(lines.indexOf('## Συμπέρασμα'));
  });

  it('adds to a Greek FAQ section without renaming it', () => {
    const greek = '# Τίτλος\n\n## Συχνές Ερωτήσεις\n\n### Πρώτη;\n\nΑπάντηση.\n\n## Συμπέρασμα\n\nΤέλος.\n';
    const out = insertFaqEntry(greek, 'Δεύτερη;', 'Απάντηση δύο.', sectionLabelsFor('el'));
    expect(out.createdSection).toBe(false);
    expect(out.heading).toBe('Συχνές Ερωτήσεις');
    const lines = out.markdown.split('\n');
    expect(lines.indexOf('### Δεύτερη;')).toBeGreaterThan(lines.indexOf('### Πρώτη;'));
    expect(lines.indexOf('### Δεύτερη;')).toBeLessThan(lines.indexOf('## Συμπέρασμα'));
  });
});

describe('no reader keys off the English label any more', () => {
  it('the viewer has no FAQ heading regex of its own', () => {
    const viewer = read('src/components/features/ai/SEOArticleViewer.tsx');
    expect(viewer).toContain("from '@/services/seo/articleSections'");
    // The exact line that shipped: English-only AND anchored, so it rejected even the English
    // keyword-bearing heading. It matched nothing the moment the prompt was fixed.
    expect(
      /const FAQ_HEADING_REGEX\s*=/.test(codeOf('src/components/features/ai/SEOArticleViewer.tsx')),
      'the viewer is deciding for itself which H2 is the FAQ again',
    ).toBe(false);
  });

  it('analyze asks the shared locator instead of scanning for a substring', () => {
    const analyze = read('supabase/functions/seo-api/handlers/analyze.ts');
    expect(analyze).toContain("from '../../_shared/seo/articleSections.generated.ts'");
    // Both sites. One decided whether to raise "FAQ section not found but planned"; the other
    // was worth five points of the AEO score.
    expect(
      /includes\('frequently asked'\)/.test(codeOf('supabase/functions/seo-api/handlers/analyze.ts')),
      'analyze is back to testing the whole document for an English phrase',
    ).toBe(false);
  });

  it('the FAQ insert path takes the heading from the caller, not from a constant', () => {
    const insert = read('supabase/functions/seo-api/handlers/faq-insert.ts');
    const faq = read('supabase/functions/seo-api/handlers/faq.ts');
    expect(insert).toContain("from '../../_shared/seo/articleSections.generated.ts'");
    expect(faq, 'the handler must pass the article language through').toContain('sectionLabelsFor(');
  });

  it('the Add-section buttons write the article\u2019s language, not English', () => {
    // Both buttons pasted `_TODO: answer this \u2014 searchers ask it and this article does not._`
    // into the markdown, verbatim, under a Greek heading.
    const viewer = codeOf('src/components/features/ai/SEOArticleViewer.tsx');
    expect(viewer).toContain('labels.todo.answer');
    expect(viewer).toContain('labels.todo.cover');
    expect(
      /_TODO: /.test(viewer),
      'an English placeholder is being written into the article again',
    ).toBe(false);
  });

  it('a new section goes ABOVE the closing one', () => {
    // It was `${md}\n\n${snippet}` \u2014 every added section landed below the conclusion and its
    // call to action, which is the placement `insertFaqEntry` exists to avoid.
    const viewer = codeOf('src/components/features/ai/SEOArticleViewer.tsx');
    expect(viewer).toContain('findConclusionLine(md)');
  });

  it('the pipeline records the language the article was commissioned in', () => {
    // It reached the stages and was thrown away, so nothing that touches the article afterwards
    // could know what language to write a new heading in.
    const pipeline = read('supabase/functions/seo-api/handlers/pipeline.ts');
    expect(pipeline).toContain('language_code: body.language_code');
    expect(pipeline).toContain('stages_data: { extra: { language_code:');
  });
});

describe('the model is told the section labels are translated too', () => {
  const block = outputLanguageBlock('el');

  it('names the structural headings explicitly', () => {
    // Without this, the instruction "write every word in Greek" loses to "H2 heading exactly:
    // Frequently Asked Questions" — which is what actually happened, twice, in production.
    expect(block).toContain('Frequently Asked Questions');
    expect(block).toContain('Conclusion');
    expect(block).toMatch(/purpose, not the words to print/i);
  });

  it('stays silent for English and for an unset language', () => {
    expect(outputLanguageBlock('en')).toBe('');
    expect(outputLanguageBlock(null)).toBe('');
    expect(outputLanguageBlock('')).toBe('');
  });
});
