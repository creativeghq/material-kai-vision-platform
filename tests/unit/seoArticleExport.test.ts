import { describe, it, expect } from 'vitest';
import { renderArticleHtml } from '@/services/seo/articleHtml';
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
  '| Δείκτης | Χρήση |',
  '|---|---|',
  '| R11 | Βεράντα |',
  '',
  '> [!definition] HPL',
  '> Φύλλο υψηλής πίεσης.',
  '',
  '1. Πρώτο βήμα',
  '',
  '- Κουκκίδα',
  '',
  '<script>alert(1)</script>',
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
  html_content: '<p>STALE-SNAPSHOT</p>',
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
  const out = buildArticleExport(ARTICLE, { html: renderArticleHtml(MD), now: new Date('2026-10-11T12:00:00Z') });

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
    expect(out.images).toEqual([{ alt: 'Πλακάκι Kappa', src: 'https://media.materialshub.gr/products/kappa.webp', width: null, height: null }]);
    expect(out.links.internal.map((l) => l.url)).toEqual([
      'https://materialshub.gr/el/proionta/plakakia',
      'https://www.materialshub.gr/el/idees/x',
    ]);
    expect(out.links.external.map((l) => l.url)).toEqual(['https://www.aade.gr/']);
  });

  it('renders HTML from the current markdown, never the stored pipeline snapshot', () => {
    const html = out.content.html ?? '';
    expect(JSON.stringify(out)).not.toContain('STALE-SNAPSHOT');
    expect(buildArticleExport(ARTICLE).content.html).toBeNull();
    expect(html).toContain('<table>');
    expect(html).toContain('<td>R11</td>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<ul>');
    expect(html).toMatch(/<aside class="callout callout-tldr"[^>]*>\s*<p>Σύνοψη\.<\/p>/);
    expect(html).toContain('<p class="callout-title">HPL</p>');
    expect(html).not.toContain('[!');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<a href="https://www.aade.gr/">AADE</a>');
  });

  it('keeps a callout title with inline markup, and drops what a CMS cannot publish', () => {
    const html = renderArticleHtml([
      '> [!key] **Grip rating**',
      '> Body text.',
      '',
      '![insecure](http://example.com/x.png)',
      '',
      'See [INTERNAL: κουζίνα](kitchen-tiles).',
    ].join('\n'));
    expect(html).toContain('<p class="callout-title"><strong>Grip rating</strong></p>');
    expect(html).toContain('<p>Body text.</p>');
    expect(html).not.toContain('<img');
    expect(html).toContain('See κουζίνα.');
  });

  it('states the real size of each photo in the JSON and the HTML when the pipeline recorded it', () => {
    const src = 'https://media.materialshub.gr/products/kappa.webp';
    const sized = buildArticleExport({ ...ARTICLE, photo_sizes: { [src]: { width: 1600, height: 1067 } } });
    expect(sized.images[0]).toMatchObject({ src, width: 1600, height: 1067 });
    expect(sized.open_graph).toMatchObject({ image: src, image_width: 1600, image_height: 1067 });
    expect(renderArticleHtml(`![Kappa](${src})`, { [src]: { width: 1600, height: 1067 } }))
      .toContain(`<img src="${src}" alt="Kappa" width="1600" height="1067"/>`);
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
