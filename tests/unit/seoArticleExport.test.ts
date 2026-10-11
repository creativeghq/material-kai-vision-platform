import { describe, it, expect } from 'vitest';
import { buildArticleExport, articleExportFilename, ARTICLE_EXPORT_SCHEMA } from '@/services/seo/articleExport';
import { marketForCountry, countryForLocation } from '../../supabase/functions/seo-api/handlers/market.ts';

const MD = [
  '# Πλακάκια μπάνιου 2026',
  '',
  'Τα πλακάκια μπάνιου το 2026 στρέφονται σε [φυσικές υφές](https://materialshub.gr/el/proionta/plakakia).',
  '',
  '> [!tldr]',
  '> Σύνοψη.',
  '',
  '## Χρώματα',
  '',
  '![Πλακάκι Kappa](https://media.materialshub.gr/products/kappa.webp)',
  '',
  'Δείτε [τον οδηγό](https://www.materialshub.gr/el/idees/x) και [AADE](https://www.aade.gr/).',
  '',
  '### Ερώτηση;',
].join('\n');

const ARTICLE = {
  id: 'a1',
  title: 'Πλακάκια μπάνιου 2026',
  slug: 'plakakia-mpaniou-2026',
  target_keyword: 'πλακάκια μπάνιου',
  secondary_keywords: ['χρώματα για πλακάκια μπάνιου'],
  markdown_content: MD,
  html_content: '<h1>x</h1>',
  meta_title: 'Πλακάκια μπάνιου 2026: Τάσεις',
  meta_description: 'Τάσεις, χρώματα και ιδέες.',
  language_code: 'el',
  location_code: 2300,
  site_url: 'https://materialshub.gr',
  seo_score: '78',
  faq_schema: [{ question: 'Ερώτηση;', answer: 'Απάντηση.' }],
  credits_used: 88.4,
  credits_by_stage: { research: 26.1, plan: 8.2, write: 52.1, analyze: 2 },
};

describe('buildArticleExport — one portable document per article', () => {
  const out = buildArticleExport(ARTICLE, new Date('2026-10-11T12:00:00Z'));

  it('carries title, meta, slug and a URL suggestion on the article site', () => {
    expect(out.schema).toBe(ARTICLE_EXPORT_SCHEMA);
    expect(out.title).toBe('Πλακάκια μπάνιου 2026');
    expect(out.meta).toEqual({ title: 'Πλακάκια μπάνιου 2026: Τάσεις', description: 'Τάσεις, χρώματα και ιδέες.' });
    expect(out.url_suggestion).toBe('https://materialshub.gr/plakakia-mpaniou-2026');
    expect(out.open_graph.locale).toBe('el_GR');
    expect(out.open_graph.image).toBe('https://media.materialshub.gr/products/kappa.webp');
  });

  it('keeps the full markdown and derives outline, images and links from it', () => {
    expect(out.content.markdown).toBe(MD);
    expect(out.outline.map((h) => h.level)).toEqual([1, 2, 3]);
    expect(out.images).toEqual([{ alt: 'Πλακάκι Kappa', src: 'https://media.materialshub.gr/products/kappa.webp' }]);
    expect(out.links.internal.map((l) => l.url)).toEqual([
      'https://materialshub.gr/el/proionta/plakakia',
      'https://www.materialshub.gr/el/idees/x',
    ]);
    expect(out.links.external.map((l) => l.url)).toEqual(['https://www.aade.gr/']);
  });

  it('reports the score and what the article cost', () => {
    expect(out.scores.seo).toBe(78);
    expect(out.cost.credits_used).toBe(88.4);
    expect(out.faq).toHaveLength(1);
  });

  it('prefers the live URL once the article is published', () => {
    const live = buildArticleExport({ ...ARTICLE, published_url: 'https://materialshub.gr/el/idees/p' });
    expect(live.url_suggestion).toBe('https://materialshub.gr/el/idees/p');
  });

  it('names the file after the slug', () => {
    expect(articleExportFilename(ARTICLE)).toBe('plakakia-mpaniou-2026.json');
    expect(articleExportFilename({ id: 'abc', slug: null })).toBe('abc.json');
  });
});

describe('marketForCountry — an article with no market follows the business, never a silent US', () => {
  it('maps the business country to a DataForSEO location and language', () => {
    expect(marketForCountry('GR')).toEqual({ location_code: 2300, language_code: 'el' });
    expect(marketForCountry('EL')).toEqual({ location_code: 2300, language_code: 'el' });
    expect(marketForCountry('cy')).toEqual({ location_code: 2196, language_code: 'el' });
  });

  it('answers null rather than guessing', () => {
    expect(marketForCountry(null)).toBeNull();
    expect(marketForCountry('ZZ')).toBeNull();
    expect(countryForLocation(2300)).toBe('GR');
    expect(countryForLocation(1)).toBeNull();
  });
});
