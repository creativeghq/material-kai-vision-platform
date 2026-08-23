/**
 * Guard: the generated `llms.txt` advertises only pages that exist, and invents nothing.
 *
 * This file is published on a CUSTOMER's domain under the customer's name, which changes
 * what a bug costs. Two failure modes matter more than formatting:
 *
 *   - advertising a dead link, which destroys the only thing the file is for — an agent
 *     being able to trust every URL in it;
 *   - writing a description for a page nobody read, which is the exact fabrication an
 *     `llms.txt` exists to prevent, attributed to them rather than to us.
 *
 * Both are silent: the file is valid markdown either way.
 */
import { describe, expect, it } from 'vitest';
import { buildLlmsTxt, type LlmsTxtPage } from '../../src/utils/llmsTxt';

const page = (over: Partial<LlmsTxtPage> & { url: string }): LlmsTxtPage => ({
  title: null, description: null, http_status: 200, is_active: true, ...over,
});

const base = {
  siteName: 'Flobali',
  siteUrl: 'https://flobali.gr',
};

describe('llms.txt generation', () => {
  it('leads with the site name and an optional summary', () => {
    const out = buildLlmsTxt({ ...base, summary: 'Tiles and sanitary ware.', pages: [] });
    expect(out.split('\n')[0]).toBe('# Flobali');
    expect(out).toContain('> Tiles and sanitary ware.');
  });

  it('omits the summary line entirely when there is none — never a placeholder', () => {
    const out = buildLlmsTxt({ ...base, pages: [] });
    expect(out).not.toContain('>');
  });

  it('groups pages by their first path segment, root pages first', () => {
    const out = buildLlmsTxt({
      ...base,
      pages: [
        page({ url: 'https://flobali.gr/blog/a', title: 'A' }),
        page({ url: 'https://flobali.gr/about', title: 'About' }),
        page({ url: 'https://flobali.gr/blog/b', title: 'B' }),
      ],
    });
    expect(out.indexOf('## Main pages')).toBeLessThan(out.indexOf('## Blog'));
    expect(out).toContain('- [About](https://flobali.gr/about)');
  });

  it('titles a section from the customer\'s own URL vocabulary', () => {
    const out = buildLlmsTxt({
      ...base,
      pages: [page({ url: 'https://flobali.gr/product-guides/x', title: 'X' })],
    });
    expect(out).toContain('## Product Guides');
  });

  it('NEVER writes a description for a page that has none', () => {
    const out = buildLlmsTxt({
      ...base,
      pages: [page({ url: 'https://flobali.gr/x', title: 'X', description: null })],
    });
    expect(out).toContain('- [X](https://flobali.gr/x)');
    // Nothing after the link: no em-dash, no "no description", no invented sentence.
    expect(out).not.toMatch(/\(https:\/\/flobali\.gr\/x\):/);
  });

  it('uses the crawled description when there is one', () => {
    const out = buildLlmsTxt({
      ...base,
      pages: [page({ url: 'https://flobali.gr/x', title: 'X', description: 'Porcelain tile range.' })],
    });
    expect(out).toContain('- [X](https://flobali.gr/x): Porcelain tile range.');
  });

  it('excludes pages that 404 or have fallen out of the sitemap', () => {
    const out = buildLlmsTxt({
      ...base,
      pages: [
        page({ url: 'https://flobali.gr/gone', title: 'Gone', http_status: 404 }),
        page({ url: 'https://flobali.gr/dropped', title: 'Dropped', is_active: false }),
        page({ url: 'https://flobali.gr/live', title: 'Live' }),
      ],
    });
    expect(out).toContain('Live');
    expect(out).not.toContain('Gone');
    expect(out).not.toContain('Dropped');
  });

  it('says out loud when a section was truncated', () => {
    const pages = Array.from({ length: 8 }, (_, i) =>
      page({ url: `https://flobali.gr/blog/${i}`, title: `Post ${i}` }));
    const out = buildLlmsTxt({ ...base, pages, maxPerSection: 3 });
    expect(out).toContain('5 more page(s) in this section are not listed');
  });

  it('says there is nothing rather than emitting an empty, confident file', () => {
    const out = buildLlmsTxt({ ...base, pages: [] });
    expect(out).toContain('No crawled pages are available yet');
  });

  it('keeps a title with brackets or newlines from breaking the markdown list', () => {
    const out = buildLlmsTxt({
      ...base,
      pages: [page({ url: 'https://flobali.gr/x', title: 'Tiles [60x60]\nand more' })],
    });
    const line = out.split('\n').find((l) => l.includes('flobali.gr/x'))!;
    expect(line).toBe('- [Tiles (60x60) and more](https://flobali.gr/x)');
  });
});
