import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGapsGains, coversTerm, normalizeText } from '../../supabase/functions/seo-api/handlers/gaps.ts';
import { insertFaqEntry, isFaqHeading } from '../../supabase/functions/seo-api/handlers/faq-insert.ts';

/**
 * Two panels that looked finished and told the reader nothing true.
 *
 * GAPS/GAINS listed competitor PAGE TITLES. `Gap: ΨΑΡΑΔΕΛΛΗΣ | ΠΛΑΚΑΚΙΑ` meant "a rival's brand
 * name does not appear in your text", so acting on it meant writing about a competitor; and the
 * two figures beside every row —
 *
 *     competitorCount: 3,   // Approximate
 *     relevanceScore: 0.6,
 *
 * — were the same constants on every row of every article ever produced. Nothing could see it: a
 * hardcoded number is a valid number, and the panel rendered them faithfully.
 *
 * THE FAQ could not be added to at all. The only route in appended `## <question>` plus a TODO to
 * the BOTTOM of the document — after the conclusion, outside the FAQ block the viewer renders as
 * an accordion, and invisible to `faq_schema`, which is what a FAQPage rich result is built from.
 */

const ROOT = process.cwd();
const HANDLERS = join(ROOT, 'supabase/functions/seo-api/handlers');

describe('coverage matching survives Greek', () => {
  // The old test was `body.includes(topic.toLowerCase().slice(0, 20))` — a raw 20-character
  // prefix against text that is accented and inflected. Every Greek keyword read as missing.
  const body = normalizeText(
    'Τα πλακάκια μπάνιου στη Θεσσαλονίκη ξεκινούν από 10€. Δείτε τις τιμές των πλακιδίων.',
  );

  it('matches an unaccented keyword against accented body text', () => {
    // The keyword tool returns "πλακακια"; the article says "πλακάκια".
    expect(coversTerm(body, 'πλακακια μπανιου')).toBe(true);
  });

  it('matches across inflection', () => {
    // "πλακιδίων" is the genitive plural of the same word the keyword uses.
    expect(coversTerm(body, 'πλακακια θεσσαλονικη')).toBe(true);
  });

  it('does not match a term the article never mentions', () => {
    expect(coversTerm(body, 'ειδη υγιεινησ')).toBe(false);
    expect(coversTerm(body, 'πλακακια κουζινας')).toBe(false);
  });

  it('ignores short tokens rather than failing on word order', () => {
    expect(coversTerm(body, 'οι τιμες')).toBe(true);
  });
});

describe('a gap is a topic, not a competitor page title', () => {
  const markdown = '# Πλακάκια μπάνιου\n\nΟι τιμές των πλακιδίων ξεκινούν από 10€ ανά τετραγωνικό.';
  const sources = {
    keyTerms: [
      { term: 'πλακακια τιμες', searchVolume: 320, opportunityScore: 80 },
      { term: 'ξεπουλημα πλακακια θεσσαλονικη', searchVolume: 140, opportunityScore: 60 },
      { term: 'ειδη υγιεινησ θεσσαλονικη', searchVolume: 0, opportunityScore: 20 },
    ],
    competitors: [
      { title: 'Πλακάκια τιμές Θεσσαλονίκη', domain: 'psaradellis.gr' },
      { title: 'Πλακάκια μπάνιου τιμές', domain: 'ravenna.gr' },
      { title: 'Praktiker πλακάκια', domain: 'praktiker.gr' },
    ],
    questions: [{ question: 'Πόσο κοστίζει η τοποθέτηση;' }],
  };

  const result = buildGapsGains(markdown, sources);

  it('never emits a competitor page title as a topic', () => {
    const titles = sources.competitors.map((c) => c.title);
    for (const t of result.all) {
      expect(titles, `"${t.topic}" is a competitor's page title, not a topic`).not.toContain(t.topic);
    }
  });

  it('says where each topic came from', () => {
    expect(result.all.every((t) => !!t.source)).toBe(true);
    expect(result.all.filter((t) => t.source === 'keyword')).toHaveLength(3);
    expect(result.all.filter((t) => t.source === 'question')).toHaveLength(1);
  });

  it('carries the real search volume, and null rather than a fake zero', () => {
    const covered = result.all.find((t) => t.topic === 'πλακακια τιμες');
    expect(covered?.searchVolume).toBe(320);
    // Upstream coerces a missing volume to 0, so 0 and "unknown" arrive identical. Neither is a
    // number to rank by — it travels as null and the UI says "no volume data".
    expect(result.all.find((t) => t.topic === 'ειδη υγιεινησ θεσσαλονικη')?.searchVolume).toBeNull();
    expect(result.all.find((t) => t.source === 'question')?.searchVolume).toBeNull();
  });

  it('counts the competitors that actually mention the term', () => {
    // Not the flat 3 every row used to carry. Two of the three ranked titles say "πλακάκια
    // τιμές"; none of them mentions a clearance sale.
    expect(result.all.find((t) => t.topic === 'πλακακια τιμες')?.competitorCount).toBe(2);
    expect(result.all.find((t) => t.topic === 'ξεπουλημα πλακακια θεσσαλονικη')?.competitorCount).toBe(0);
    const counts = new Set(result.all.map((t) => t.competitorCount));
    expect(counts.size, 'every row has the same competitor count — it is hardcoded again').toBeGreaterThan(1);
  });

  it('splits gap from gain on what the article actually says', () => {
    expect(result.gains.map((t) => t.topic)).toContain('πλακακια τιμες');
    expect(result.gaps.map((t) => t.topic)).toContain('ξεπουλημα πλακακια θεσσαλονικη');
    expect(result.gapCount + result.gainCount).toBe(result.all.length);
  });

  it('labels a query that names a competitor brand instead of recommending it', () => {
    // "πρακτικερ πλακακια μπανιου" is the highest-volume term the real research found — and it is
    // Praktiker's brand. Offering it as a gap to fill is telling the customer to write about a
    // competitor, so it is shown and labelled rather than dropped or silently recommended.
    const brandy = buildGapsGains('# Άρθρο', {
      keyTerms: [{ term: 'πρακτικερ πλακακια μπανιου', searchVolume: 720 }],
      competitors: [{ title: 'Praktiker', domain: 'praktiker.gr' }],
    });
    expect(brandy.all[0].competitorBrand).toBe(true);
  });

  it('does not label an ordinary keyword as a brand', () => {
    expect(result.all.find((t) => t.topic === 'ξεπουλημα πλακακια θεσσαλονικη')?.competitorBrand).toBeUndefined();
  });

  it('puts the biggest opportunity first, and unsized topics last', () => {
    const vols = result.gaps.map((t) => t.searchVolume);
    const sized = vols.filter((v): v is number => v !== null);
    expect([...sized].sort((a, b) => b - a)).toEqual(sized);
    if (vols.includes(null)) expect(vols.indexOf(null)).toBe(sized.length);
  });

  it('only counts a competitor heading the SERP agrees on', () => {
    // One competitor using a heading is that competitor's editorial choice; two is a convention.
    const shared = buildGapsGains('# Άρθρο', {
      competitors: [
        { title: 'A', domain: 'a.gr', headings: ['Τρόποι τοποθέτησης', 'Μόνο εδώ'] },
        { title: 'B', domain: 'b.gr', headings: ['Τρόποι τοποθέτησης'] },
      ],
    });
    const topics = shared.all.map((t) => t.topic);
    expect(topics).toContain('Τρόποι τοποθέτησης');
    expect(topics).not.toContain('Μόνο εδώ');
  });

  it('emits nothing at all when the research carried nothing, rather than inventing rows', () => {
    const empty = buildGapsGains('# Άρθρο', {});
    expect(empty.all).toEqual([]);
    expect(empty.gapCount).toBe(0);
  });

  it('the old competitor-title derivation is gone from the pipeline', () => {
    const pipeline = readFileSync(join(HANDLERS, 'pipeline.ts'), 'utf-8');
    expect(pipeline).not.toMatch(/gaps\.push\(comp\.title\)/);
    expect(pipeline).not.toMatch(/competitorCount: 3/);
    expect(pipeline, 'the pipeline must use the shared derivation').toContain("from './gaps.ts'");
  });

  it('Re-analyse rebuilds them, so the fix reaches articles written before today', () => {
    const reanalyze = readFileSync(join(HANDLERS, 'reanalyze.ts'), 'utf-8');
    expect(reanalyze).toContain('buildGapsGains(markdown, research)');
    expect(reanalyze).toContain('gaps_gains_data');
  });
});

describe('an FAQ entry goes into the FAQ section', () => {
  const article = [
    '# Τίτλος',
    '',
    'Εισαγωγή.',
    '',
    '## Frequently Asked Questions',
    '',
    '### Πρώτη ερώτηση;',
    '',
    'Πρώτη απάντηση.',
    '',
    '## Conclusion',
    '',
    'Κλείσιμο.',
    '',
  ].join('\n');

  it('lands inside the FAQ block, not at the end of the document', () => {
    const out = insertFaqEntry(article, 'Δεύτερη ερώτηση;', 'Δεύτερη απάντηση.');
    const lines = out.markdown.split('\n');
    const entry = lines.indexOf('### Δεύτερη ερώτηση;');
    const conclusion = lines.indexOf('## Conclusion');
    expect(entry).toBeGreaterThan(lines.indexOf('### Πρώτη ερώτηση;'));
    expect(entry, 'the entry must sit ABOVE the conclusion, inside the FAQ').toBeLessThan(conclusion);
    expect(out.createdSection).toBe(false);
    expect(out.heading).toBe('Frequently Asked Questions');
  });

  it('keeps everything else byte-identical', () => {
    const out = insertFaqEntry(article, 'Δεύτερη;', 'Απάντηση.');
    const removed = out.markdown
      .replace('\n### Δεύτερη;\n\nΑπάντηση.\n', '')
      .replace(/\n{3,}/g, '\n\n');
    expect(removed.trim()).toBe(article.replace(/\n{3,}/g, '\n\n').trim());
  });

  it('creates the section before the conclusion when the article has no FAQ', () => {
    const noFaq = '# Τίτλος\n\nΚείμενο.\n\n## Conclusion\n\nΚλείσιμο.\n';
    const out = insertFaqEntry(noFaq, 'Ερώτηση;', 'Απάντηση.');
    const lines = out.markdown.split('\n');
    expect(out.createdSection).toBe(true);
    expect(lines.indexOf('## Frequently Asked Questions')).toBeLessThan(lines.indexOf('## Conclusion'));
    // An FAQ after the closing paragraph reads as an afterthought and pushes the call to action
    // off the end of the page.
    expect(lines.indexOf('### Ερώτηση;')).toBeLessThan(lines.indexOf('## Conclusion'));
  });

  it('appends when there is no conclusion either', () => {
    const out = insertFaqEntry('# Τίτλος\n\nΚείμενο.\n', 'Ερώτηση;', 'Απάντηση.');
    expect(out.createdSection).toBe(true);
    expect(out.markdown).toContain('### Ερώτηση;');
  });

  it('recognises the FAQ heading in the article’s own language', () => {
    // The writer currently emits the English heading even in a Greek article. Matching the
    // localised forms too costs nothing and stops this breaking the day that is fixed.
    for (const h of ['FAQ', 'faqs', 'Frequently Asked Questions', 'Συχνές Ερωτήσεις', 'Preguntas Frecuentes']) {
      expect(isFaqHeading(h), `${h} should be an FAQ heading`).toBe(true);
    }
    for (const h of ['Conclusion', 'Τιμές', 'Frequently Asked Questions About Tiles']) {
      expect(isFaqHeading(h), `${h} is not the FAQ heading`).toBe(false);
    }
  });

  it('the handler keeps faq_schema in step with the body', () => {
    // They are one fact. A page that claims an FAQ it does not show — or shows one it does not
    // claim — is the disagreement this prevents.
    const faq = readFileSync(join(HANDLERS, 'faq.ts'), 'utf-8');
    expect(faq).toContain('faq_schema: [...pairs, { question, answer }]');
    expect(faq).toContain('previous_markdown: markdown');
  });

  it('refuses a duplicate rather than adding it twice', () => {
    const faq = readFileSync(join(HANDLERS, 'faq.ts'), 'utf-8');
    expect(faq).toContain('That question is already in the FAQ.');
  });

  it('a hand-written answer costs nothing', () => {
    // The debit sits inside `if (!answer)`, so typing your own answer never reaches the model.
    const faq = readFileSync(join(HANDLERS, 'faq.ts'), 'utf-8');
    const debitAt = faq.indexOf('debit_credits');
    const guardAt = faq.indexOf('if (!answer) {');
    expect(guardAt).toBeGreaterThan(-1);
    expect(debitAt, 'the debit must sit inside the generate-an-answer branch').toBeGreaterThan(guardAt);
  });

  it('and the prompt comes from the database', () => {
    const faq = readFileSync(join(HANDLERS, 'faq.ts'), 'utf-8');
    expect(faq).toContain("getGenerationPrompt(supabase, 'seo_faq_answer_user')");
  });
});
