import { describe, it, expect } from 'vitest';
import { extractContentImages } from '../../supabase/functions/_shared/page-images.ts';
import {
  applySiteAssetRules,
  countSiteLinks,
} from '../../supabase/functions/seo-api/handlers/site-assets.ts';

const PAGE = 'https://materialshub.gr/el/proionta/plakakia/atlas-concorde';

describe('extractContentImages — what an article may lift from one of our pages', () => {
  it('keeps described, photo-sized images as absolute https URLs', () => {
    const html = `
      <img src="/assets/brave.webp" alt="Πλακάκια Atlas Concorde Brave — πέτρα, 75×150 cm" width="760" height="760">
      <img src="https://media.materialshub.gr/products/norde.webp" alt="Norde">`;
    expect(extractContentImages(html, PAGE)).toEqual([
      { src: 'https://materialshub.gr/assets/brave.webp', alt: 'Πλακάκια Atlas Concorde Brave — πέτρα, 75×150 cm' },
      { src: 'https://media.materialshub.gr/products/norde.webp', alt: 'Norde' },
    ]);
  });

  it('drops decorative, logo, icon-sized and SVG images', () => {
    const html = `
      <img src="/a.webp" alt="">
      <img src="/brands/daikin.webp" alt="Λογότυπο Daikin" width="209" height="44">
      <img src="/x/materialshub-logo.png" alt="MaterialsHub">
      <img src="/thumb.webp" alt="tiny" width="80" height="80">
      <img src="/icons/visa.svg" alt="Visa">
      <img src="/deco.webp" alt="deco" aria-hidden="true">`;
    expect(extractContentImages(html, PAGE)).toEqual([]);
  });

  it('decodes numeric entities, so a WordPress query string survives', () => {
    const html = '<img src="https://site.gr/img.jpg?w=1024&#038;h=768" alt="Kitchen&#8217;s island">';
    expect(extractContentImages(html, 'https://site.gr/')).toEqual([
      { src: 'https://site.gr/img.jpg?w=1024&h=768', alt: 'Kitchen’s island' },
    ]);
  });
});

describe('applySiteAssetRules — the published article points only at what exists', () => {
  const live = new Set(['https://materialshub.gr/el/proionta/plakakia', 'https://materialshub.gr/el/idees/lebites-aeriou']);
  const photos = new Set(['https://media.materialshub.gr/products/norde.webp']);

  it('removes a page URL pasted as a photo, and a photo placed twice keeps its first place', () => {
    const md = [
      'Intro.',
      '',
      '![Norde](https://media.materialshub.gr/products/norde.webp)',
      '',
      '![Deck](https://materialshub.gr/athens/deck-exoterikou-chorou)',
      '',
      'Text.',
      '',
      '![Norde again](https://media.materialshub.gr/products/norde.webp)',
    ].join('\n');
    const out = applySiteAssetRules(md, 'materialshub.gr', live, photos);
    expect(out.removedImages).toBe(2);
    expect(out.markdown.match(/!\[/g)).toHaveLength(1);
    expect(out.markdown).not.toContain('athens/deck');
  });

  it('unwraps a link to a page of ours that does not exist, and leaves other sites alone', () => {
    const md = 'See [tiles](https://materialshub.gr/el/proionta/plakakia/) and [made up](https://www.materialshub.gr/el/invented) '
      + 'and [AADE](https://www.aade.gr/x).';
    const out = applySiteAssetRules(md, 'materialshub.gr', live, photos);
    expect(out.unlinked).toBe(1);
    expect(out.markdown).toBe(
      'See [tiles](https://materialshub.gr/el/proionta/plakakia/) and made up and [AADE](https://www.aade.gr/x).',
    );
  });
});

describe('applySiteAssetRules — one link per page', () => {
  it('keeps the first link to a page and unwraps repeats', () => {
    const live = new Set(['https://materialshub.gr/el/proionta/plakakia']);
    const md = '[one](https://materialshub.gr/el/proionta/plakakia) then [two](https://materialshub.gr/el/proionta/plakakia/)';
    const out = applySiteAssetRules(md, 'materialshub.gr', live, new Set());
    expect(out.unlinked).toBe(1);
    expect(out.markdown).toBe('[one](https://materialshub.gr/el/proionta/plakakia) then two');
  });
});

describe('countSiteLinks — real links to our own pages are internal links', () => {
  it('counts links to the site host (www or not), never images or other hosts', () => {
    const md = '[a](https://materialshub.gr/a) [b](https://www.materialshub.gr/b) ![c](https://materialshub.gr/c.webp) [d](https://x.gr/d)';
    expect(countSiteLinks(md, 'https://materialshub.gr')).toBe(2);
    expect(countSiteLinks(md, null)).toBe(0);
  });
});
