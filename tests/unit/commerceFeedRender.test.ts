import { describe, it, expect } from 'vitest';
import {
  renderGoogleFeed, renderSkroutzFeed, escapeXml, stripHtml, skroutzGaps,
  type FeedProduct,
} from '../../supabase/functions/_shared/commerce/feed-render';

const FULL: FeedProduct = {
  id: 'p1', sku: 'SKU-1', name: 'Tile "Aegean" & Co', description: '<p>Nice <b>tile</b></p>',
  link: 'https://app.example/store/x?product=p1', image: 'https://cdn.example/a.jpg',
  category: 'Tiles', brand: 'Acme', mpn: 'MPN-1', barcode: '5201234567890',
  price_gross: 24.8, vat_percent: 24, currency: 'EUR', in_stock: true, quantity: 5, weight_kg: 2.5,
};

describe('feed escaping', () => {
  it('escapes the five XML entities, and apos rather than HTML-style', () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  it('strips HTML, because Skroutz refuses it in ANY attribute', () => {
    expect(stripHtml('<p>Nice <b>tile</b></p>')).toBe('Nice tile');
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('caps the description at the length Skroutz accepts', () => {
    expect(stripHtml('x'.repeat(20000), 10000)).toHaveLength(10000);
  });

  it('never emits a raw ampersand from a product name', () => {
    const xml = renderSkroutzFeed([FULL], new Date('2026-01-02T03:04:05Z'));
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    expect(xml).toContain('Tile &quot;Aegean&quot; &amp; Co');
  });
});

describe('the two dialects are genuinely different documents', () => {
  it('Skroutz is <mywebstore>, not RSS', () => {
    const xml = renderSkroutzFeed([FULL], new Date('2026-01-02T03:04:05Z'));
    expect(xml).toContain('<mywebstore>');
    expect(xml).toContain('<created_at>2026-01-02 03:04</created_at>');
    expect(xml).not.toContain('<rss');
  });

  it('Google is RSS 2.0 with the g: namespace', () => {
    const xml = renderGoogleFeed([FULL], { title: 'T', link: 'https://app.example/store/x' });
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain('<g:id>SKU-1</g:id>');
    expect(xml).toContain('<g:price>24.80 EUR</g:price>');
  });

  it('Skroutz prices are VAT-INCLUSIVE and state the rate', () => {
    const xml = renderSkroutzFeed([FULL], new Date());
    expect(xml).toContain('<price_with_vat>24.80</price_with_vat>');
    expect(xml).toContain('<vat>24.00</vat>');
  });

  it('tells Google when no identifier exists rather than omitting it silently', () => {
    const xml = renderGoogleFeed([{ ...FULL, mpn: null, barcode: null }], { title: 'T', link: 'l' });
    expect(xml).toContain('<g:identifier_exists>no</g:identifier_exists>');
  });
});

describe('a product Skroutz would reject is named, not left to fail silently', () => {
  it('reports nothing missing for a complete product', () => {
    expect(skroutzGaps(FULL)).toEqual([]);
  });

  it('names every mandatory attribute the product cannot supply', () => {
    const gaps = skroutzGaps({ ...FULL, mpn: null, barcode: null, brand: null, image: null });
    expect(gaps).toEqual(expect.arrayContaining(['mpn', 'ean', 'manufacturer', 'image']));
  });

  it('counts a zero price as missing — Skroutz drops the product either way', () => {
    expect(skroutzGaps({ ...FULL, price_gross: 0 })).toContain('price');
  });
});
