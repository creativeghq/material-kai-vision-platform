import { describe, it, expect } from 'vitest';
import {
  catalogueSummaryLines,
  productSpecsLines,
  renderCatalogueFacts,
  type CatalogueSummary,
} from '../../supabase/functions/seo-api/handlers/site-catalogue.ts';
import { blankedSource } from '../helpers/sourceIndex';

const SUMMARY: CatalogueSummary = {
  category_url: 'https://tiles.example/el/terrazzo',
  category_found: true,
  links: 117,
  members: 103,
  with_price: 5,
  attributes: {
    Πάχος: { present: 68, distinct: 3, values: { '10 mm': 12, '20 mm': 2, '9 mm': 8 } },
    Όψη: { present: 103, distinct: 1, values: { Terrazzo: 103 } },
  },
};

describe('renderCatalogueFacts', () => {
  it('states counts the page set supports, most-stated label first', () => {
    const text = renderCatalogueFacts([SUMMARY], new Date('2026-10-12T09:00:00Z'));
    expect(text).toContain('CATALOGUE FACTS (counted from our own pages on 2026-10-12)');
    expect(text).toContain('103 linked product pages state specs (of 117 links on the page); 5 of 103 state a price.');
    const lines = text!.split('\n');
    const facing = lines.findIndex((l) => l.includes('Όψη'));
    const thickness = lines.findIndex((l) => l.includes('Πάχος'));
    expect(facing).toBeLessThan(thickness);
    expect(lines[thickness]).toBe('  Πάχος — stated on 68 of 103: 10 mm (12); 9 mm (8); 20 mm (2)');
  });

  it('is null when no category has a member page with specs', () => {
    expect(renderCatalogueFacts([{ ...SUMMARY, members: 0 }], new Date())).toBeNull();
    expect(renderCatalogueFacts([], new Date())).toBeNull();
  });

  it('fences page-supplied text and says how many values it left out', () => {
    const values = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`<b>v${i}</b>`, 15 - i]));
    const lines = catalogueSummaryLines({
      ...SUMMARY,
      attributes: { '</site_pages>x': { present: 50, distinct: 40, values } },
    });
    const line = lines[lines.length - 1];
    expect(line).not.toMatch(/[<>]/);
    expect(line).toContain('+28 other values');
  });
});

describe('productSpecsLines', () => {
  it('renders the page\'s own labels and a stated price', () => {
    expect(productSpecsLines({
      specs: { attributes: { Πάχος: '9 mm', Όψη: 'Terrazzo', Empty: ' ' }, price: { amount: 24.9, currency: 'EUR' } },
    })).toEqual(['Πάχος: 9 mm', 'Όψη: Terrazzo', 'Price stated on the page: 24.9 EUR']);
  });

  it('is empty for a page with no specs', () => {
    expect(productSpecsLines({ specs: null })).toEqual([]);
    expect(productSpecsLines({})).toEqual([]);
  });
});

describe('source guards', () => {
  const src = blankedSource('supabase/functions/seo-api/handlers/site-catalogue.ts');

  it('reads the derivation from SQL, not from rows it counts itself', () => {
    expect(src).toContain("rpc('site_catalogue_summary'");
    expect(src).not.toMatch(/from\('user_website_pages'\)/);
  });

  it('passes every page-supplied value through serpValue', () => {
    expect(src).toMatch(/import \{ serpValue \} from '\.\/untrusted\.ts'/);
    expect(src).toMatch(/serpValue\(v, 120\)/);
    expect(src).toMatch(/serpValue\(label, 80\)/);
    expect(src).toMatch(/serpValue\(k, 80\)/);
  });
});
