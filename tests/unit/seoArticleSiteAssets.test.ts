import { describe, it, expect } from 'vitest';
import { extractContentImages } from '../../supabase/functions/_shared/page-images.ts';
import {
  applyReviewEdits,
  applySiteAssetRules,
  countSiteLinks,
  imageAlts,
  pageFacts,
  pagesNamedIn,
  slugNameWords,
  slugTerms,
} from '../../supabase/functions/seo-api/handlers/site-assets.ts';
import { foreignWords, latinTerms } from '../../supabase/functions/seo-api/handlers/foreign-words.ts';

const PAGE = 'https://tiles.example/el/proionta/plakakia/atlas-concorde';

describe('extractContentImages — what an article may lift from one of our pages', () => {
  it('keeps described, photo-sized images as absolute https URLs', () => {
    const html = `
      <img src="/assets/brave.webp" alt="Πλακάκια Atlas Concorde Brave — πέτρα, 75×150 cm" width="760" height="760">
      <img src="https://media.tiles.example/products/norde.webp" alt="Norde">`;
    expect(extractContentImages(html, PAGE)).toEqual([
      { src: 'https://tiles.example/assets/brave.webp', alt: 'Πλακάκια Atlas Concorde Brave — πέτρα, 75×150 cm', display_width: 760 },
      { src: 'https://media.tiles.example/products/norde.webp', alt: 'Norde' },
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
  const live = new Set(['https://tiles.example/el/proionta/plakakia', 'https://tiles.example/el/idees/lebites-aeriou']);
  const photos = new Map([['https://media.tiles.example/products/norde.webp', 'Γκρι πορσελανάτο πλακάκι τύπου πέτρας']]);

  it('removes a page URL pasted as a photo, and a photo placed twice keeps its first place', () => {
    const md = [
      'Intro.',
      '',
      '![Norde](https://media.tiles.example/products/norde.webp)',
      '',
      '![Deck](https://tiles.example/athens/deck-exoterikou-chorou)',
      '',
      'Text.',
      '',
      '![Norde again](https://media.tiles.example/products/norde.webp)',
    ].join('\n');
    const out = applySiteAssetRules(md, 'tiles.example', live, photos);
    expect(out.removedImages).toBe(2);
    expect(out.markdown.match(/!\[/g)).toHaveLength(1);
    expect(out.markdown).not.toContain('athens/deck');
  });

  it('unwraps a link to a page of ours that does not exist, keeps an official site and unwraps any other', () => {
    const md = 'See [tiles](https://tiles.example/el/proionta/plakakia/) and [made up](https://www.tiles.example/el/invented) '
      + 'and [the programme](https://exoikonomo.gov.gr/x) and [a shop](https://www.aade-shop.gr/x).';
    const out = applySiteAssetRules(md, 'tiles.example', live, photos);
    expect(out.unlinked).toBe(2);
    expect(out.markdown).toBe(
      'See [tiles](https://tiles.example/el/proionta/plakakia/) and made up and [the programme](https://exoikonomo.gov.gr/x) and a shop.',
    );
  });
});

describe('applySiteAssetRules — a photo is published with what it shows, never a caption', () => {
  it('replaces the writer alt with the checked description and drops the caption under it', () => {
    const photos = new Map([['https://tiles.example/assets/hero-2.webp', 'Έπιπλο μπάνιου με φωτιζόμενο καθρέπτη']]);
    const md = [
      '![Εφαρμογή στεγανωτικής μεμβράνης](https://tiles.example/assets/hero-2.webp)',
      '*Η στεγανοποίηση πριν την πλακόστρωση είναι προϋπόθεση.*',
      '',
      'Κείμενο.',
    ].join('\n');
    const out = applySiteAssetRules(md, 'tiles.example', new Set(), photos);
    expect(out.markdown).toBe('![Έπιπλο μπάνιου με φωτιζόμενο καθρέπτη](https://tiles.example/assets/hero-2.webp)\n\nΚείμενο.');
  });

  it('leaves an ordinary italic sentence that is not directly under a photo', () => {
    const md = 'Κείμενο.\n*Σημείωση σε πλάγια.*';
    expect(applySiteAssetRules(md, 'tiles.example', new Set(), new Map()).markdown).toBe(md);
  });
});

describe('foreignWords — English left in a Greek article', () => {
  it('lists lower-case Latin words, not brand names, allowed terms, URLs or callout tags', () => {
    const md = [
      '# Πλακάκια μπάνιου',
      '> [!tldr]',
      '> Ένα accent τοίχος με [Bisazza Marmo Lux](https://tiles.example/el/proionta/plakakia/bisazza-marmo-lux).',
      'Ντουζιέρα walk-in, terrazzo και spa αισθητική, πλάκες 120x260 cm, χρώμα Sage Green.',
      '![Πλακάκι](https://media.tiles.example/products/x-slab.webp)',
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

describe('pageFacts — what a page states, not its navigation', () => {
  it('keeps content lines and drops the title, menus and button rows', () => {
    const text = [
      'Cersanit Marinel Πλακάκια — Τιμή ανά τ.μ. | MaterialsHub',
      'Συμβουλευτική Προϊόντα Σειρές Πλατφόρμα Ιδέες Εταιρεία Επικοινωνία EN Κατάλογος Πλατφόρμα →',
      'Ζητήστε Τιμή Καλέστε Τώρα',
      'Η σειρά Marinel είναι πλακάκι της Cersanit , κατασκευασμένο στην Πολωνία.',
      'Κυκλοφορεί σε δύο επιφάνειες: γυαλιστερό και ανάγλυφο.',
    ].join('\n');
    expect(pageFacts(text)).toBe(
      'Η σειρά Marinel είναι πλακάκι της Cersanit , κατασκευασμένο στην Πολωνία.\nΚυκλοφορεί σε δύο επιφάνειες: γυαλιστερό και ανάγλυφο.',
    );
    expect(pageFacts(null)).toBeNull();
  });
});

describe('applyReviewEdits — the editor fixes words, never links', () => {
  const md = 'Η Aparici είναι ιταλικό εργοστάσιο. Δείτε τη [σειρά Marinel](https://tiles.example/el/proionta/plakakia/cersanit-marinel) σε ματ.';

  it('applies an edit whose text occurs exactly once', () => {
    const out = applyReviewEdits(md, [{ find: 'Η Aparici είναι ιταλικό εργοστάσιο.', replace: 'Η Aparici είναι ισπανικό εργοστάσιο.', kind: 'wrong_fact' }]);
    expect(out.applied).toHaveLength(1);
    expect(out.markdown).toContain('ισπανικό');
  });

  it('refuses an edit that would drop a link, or text that is absent', () => {
    const out = applyReviewEdits(md, [
      { find: 'Δείτε τη [σειρά Marinel](https://tiles.example/el/proionta/plakakia/cersanit-marinel) σε ματ.', replace: 'Η σειρά Marinel είναι γυαλιστερή.', kind: 'wrong_fact' },
      { find: 'δεν υπάρχει', replace: 'x', kind: 'language' },
    ]);
    expect(out.applied).toHaveLength(0);
    expect(out.skipped.map((s) => s.why)).toEqual(['would drop a link or image', 'text not found']);
    expect(out.markdown).toBe(md);
  });

  it('keeps the link when the edit carries it over', () => {
    const out = applyReviewEdits(md, [{
      find: 'Δείτε τη [σειρά Marinel](https://tiles.example/el/proionta/plakakia/cersanit-marinel) σε ματ.',
      replace: 'Δείτε τη [σειρά Marinel](https://tiles.example/el/proionta/plakakia/cersanit-marinel), γυαλιστερή και ανάγλυφη.',
      kind: 'wrong_fact',
    }]);
    expect(out.applied).toHaveLength(1);
  });
});

describe('applySiteAssetRules — one link per page', () => {
  it('keeps the first link to a page and unwraps repeats', () => {
    const live = new Set(['https://tiles.example/el/proionta/plakakia']);
    const md = '[one](https://tiles.example/el/proionta/plakakia) then [two](https://tiles.example/el/proionta/plakakia/)';
    const out = applySiteAssetRules(md, 'tiles.example', live, new Map());
    expect(out.unlinked).toBe(1);
    expect(out.markdown).toBe('[one](https://tiles.example/el/proionta/plakakia) then two');
  });
});

describe('countSiteLinks — real links to our own pages are internal links', () => {
  it('counts links to the site host (www or not), never images or other hosts', () => {
    const md = '[a](https://tiles.example/a) [b](https://www.tiles.example/b) ![c](https://tiles.example/c.webp) [d](https://x.gr/d)';
    expect(countSiteLinks(md, 'https://tiles.example')).toBe(2);
    expect(countSiteLinks(md, null)).toBe(0);
  });
});

describe('slugTerms — an article topic as the words of our URL slugs', () => {
  it.each([
    ['πλακάκια terrazzo', ['plakakia', 'terrazzo']],
    ['έπιπλα μπάνιου', ['epipla', 'mpaniou']],
    ['πλακάκια εξωτερικού χώρου', ['plakakia', 'exoterikou', 'chorou']],
    ['είδη υγιεινής', ['eidi', 'ygieinis']],
    ['ιδέες για την κουζίνα', ['idees', 'kouzina']],
  ])('%s', (keyword, expected) => {
    expect(slugTerms(keyword)).toEqual(expected);
  });
});

describe('which of our pages a review section uses', () => {
  const pages = [
    { url: 'https://tiles.example/el/proionta/plakakia/cersanit-terrazzo-stone-2-0', images: [{ src: 'https://cdn.x/c.webp' }] },
    { url: 'https://tiles.example/el/proionta/plakakia/pamesa-terrazzo', images: [] },
    { url: 'https://tiles.example/el/proionta/plakakia/typou-terrazzo', images: [] },
  ];

  it('reads a page name from its slug', () => {
    expect(slugNameWords(pages[0].url)).toEqual(['cersanit', 'terrazzo', 'stone']);
  });

  it('counts a link, a photo, or every slug word named in the prose', () => {
    expect(pagesNamedIn('Η σειρά Terrazzo Stone 2.0 της Cersanit φτάνει R11.', pages).map((p) => p.url)).toEqual([pages[0].url]);
    expect(pagesNamedIn('![x](https://cdn.x/c.webp)', pages)).toHaveLength(1);
    expect(pagesNamedIn(`[κατηγορία](${pages[2].url})`, pages).map((p) => p.url)).toEqual([pages[2].url]);
    expect(pagesNamedIn('Τα πλακάκια terrazzo ταιριάζουν σε μπάνιο.', pages), 'a shared word alone names nothing').toEqual([]);
  });

  it('lists every photo by its source', () => {
    expect([...imageAlts('![Ένα μπάνιο](https://a/1.webp) και ![](https://a/2.webp)')]).toEqual([
      ['https://a/1.webp', 'Ένα μπάνιο'], ['https://a/2.webp', ''],
    ]);
  });
});
