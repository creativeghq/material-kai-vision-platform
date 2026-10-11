import { describe, it, expect } from 'vitest';
import { extractContentImages } from '../../supabase/functions/_shared/page-images.ts';
import {
  applySiteAssetRules,
  countSiteLinks,
} from '../../supabase/functions/seo-api/handlers/site-assets.ts';
import { foreignWords, latinTerms } from '../../supabase/functions/seo-api/handlers/foreign-words.ts';

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
  const photos = new Map([['https://media.materialshub.gr/products/norde.webp', 'Γκρι πορσελανάτο πλακάκι τύπου πέτρας']]);

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

describe('applySiteAssetRules — a photo is published with what it shows, never a caption', () => {
  it('replaces the writer alt with the checked description and drops the caption under it', () => {
    const photos = new Map([['https://materialshub.gr/assets/hero-2.webp', 'Έπιπλο μπάνιου με φωτιζόμενο καθρέπτη']]);
    const md = [
      '![Εφαρμογή στεγανωτικής μεμβράνης](https://materialshub.gr/assets/hero-2.webp)',
      '*Η στεγανοποίηση πριν την πλακόστρωση είναι προϋπόθεση.*',
      '',
      'Κείμενο.',
    ].join('\n');
    const out = applySiteAssetRules(md, 'materialshub.gr', new Set(), photos);
    expect(out.markdown).toBe('![Έπιπλο μπάνιου με φωτιζόμενο καθρέπτη](https://materialshub.gr/assets/hero-2.webp)\n\nΚείμενο.');
  });

  it('leaves an ordinary italic sentence that is not directly under a photo', () => {
    const md = 'Κείμενο.\n*Σημείωση σε πλάγια.*';
    expect(applySiteAssetRules(md, 'materialshub.gr', new Set(), new Map()).markdown).toBe(md);
  });
});

describe('foreignWords — English left in a Greek article', () => {
  it('lists lower-case Latin words, not brand names, allowed terms, URLs or callout tags', () => {
    const md = [
      '# Πλακάκια μπάνιου',
      '> [!tldr]',
      '> Ένα accent τοίχος με [Bisazza Marmo Lux](https://materialshub.gr/el/proionta/plakakia/bisazza-marmo-lux).',
      'Ντουζιέρα walk-in, terrazzo και spa αισθητική, πλάκες 120x260 cm, χρώμα Sage Green.',
      '![Πλακάκι](https://media.materialshub.gr/products/x-slab.webp)',
    ].join('\n');
    expect(foreignWords(md)).toEqual(['accent', 'walk-in']);
  });

  it('never flags a protected term: our slug vocabulary and the target searches', () => {
    const md = 'Πλακάκια porcelain και travertine σε μπάνιο με accent τοίχο και ντουζιέρα walk-in.';
    const protectedTerms = new Set(['porcelain', 'travertine', 'walk']);
    expect(foreignWords(md, protectedTerms)).toEqual(['accent', 'walk-in']);
    expect(foreignWords(md, new Set([...protectedTerms, 'in']))).toEqual(['accent']);
  });

  it('latinTerms keeps a hyphenated term whole and in parts', () => {
    expect(latinTerms('πλακάκια book-match και Terrazzo, cm')).toEqual(['book-match', 'book', 'match', 'terrazzo']);
  });

  it('says nothing about an article written in Latin script', () => {
    expect(foreignWords('# Bathroom tiles\nAn accent wall with a walk-in shower.')).toEqual([]);
  });
});

describe('applySiteAssetRules — one link per page', () => {
  it('keeps the first link to a page and unwraps repeats', () => {
    const live = new Set(['https://materialshub.gr/el/proionta/plakakia']);
    const md = '[one](https://materialshub.gr/el/proionta/plakakia) then [two](https://materialshub.gr/el/proionta/plakakia/)';
    const out = applySiteAssetRules(md, 'materialshub.gr', live, new Map());
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
