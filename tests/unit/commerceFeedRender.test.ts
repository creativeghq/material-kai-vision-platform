import { describe, it, expect } from 'vitest';
import {
  renderGoogleFeed, renderSkroutzFeed, renderBestPriceFeed, escapeXml, stripHtml, feedGaps, gapSummary,
  stockState,
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

describe('BestPrice is a third dialect, not the Skroutz one renamed', () => {
  it('is a <store> document with its own tag names', () => {
    const xml = renderBestPriceFeed([FULL], new Date('2026-01-02T03:04:05Z'));
    expect(xml).toContain('<store>');
    expect(xml).toContain('<date>2026-01-02 03:04</date>');
    expect(xml).toContain('<productId>SKU-1</productId>');
    expect(xml).toContain('<productURL>https://app.example/store/x?product=p1</productURL>');
    expect(xml).toContain('<category_path>Tiles</category_path>');
    expect(xml).toContain('<brand>Acme</brand>');
    expect(xml).not.toContain('<mywebstore>');
    expect(xml).not.toContain('<price_with_vat>');
  });

  it('prices are VAT-inclusive under a plain <price>, as BestPrice reads them', () => {
    expect(renderBestPriceFeed([FULL], new Date())).toContain('<price>24.80</price>');
  });

  it('escapes as strictly as the others — a raw ampersand invalidates the whole file', () => {
    const xml = renderBestPriceFeed([FULL], new Date());
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('omits <ean> and <weight> rather than sending an empty one', () => {
    const xml = renderBestPriceFeed([{ ...FULL, barcode: null, weight_kg: null }], new Date());
    expect(xml).not.toContain('<ean>');
    expect(xml).not.toContain('<weight>');
  });
});

describe('"nobody has counted this" is not "none left"', () => {
  it('reads an absent warehouse row as on order, and a counted zero as out of stock', () => {
    expect(stockState({ ...FULL, quantity: null })).toBe('on_order');
    expect(stockState({ ...FULL, quantity: 0 })).toBe('out_of_stock');
    expect(stockState({ ...FULL, quantity: 5 })).toBe('in_stock');
  });

  it('Google gets backorder for on-order — a distinct value from out of stock', () => {
    const onOrder = renderGoogleFeed([{ ...FULL, quantity: null }], { title: 'T', link: 'l' });
    expect(onOrder).toContain('<g:availability>backorder</g:availability>');
    expect(renderGoogleFeed([{ ...FULL, quantity: 0 }], { title: 'T', link: 'l' }))
      .toContain('<g:availability>out of stock</g:availability>');
  });

  it('Skroutz omits <quantity> when uncounted rather than claiming zero', () => {
    expect(renderSkroutzFeed([{ ...FULL, quantity: null }], new Date())).not.toContain('<quantity>');
    expect(renderSkroutzFeed([{ ...FULL, quantity: 0 }], new Date())).toContain('<quantity>0</quantity>');
  });

  it('BestPrice omits <stock> when uncounted — Y/N cannot say "not counted"', () => {
    expect(renderBestPriceFeed([{ ...FULL, quantity: null }], new Date())).not.toContain('<stock>');
    expect(renderBestPriceFeed([{ ...FULL, quantity: 0 }], new Date())).toContain('<stock>N</stock>');
  });

  it('an uncounted product still states a delivery expectation, not an empty availability', () => {
    expect(renderBestPriceFeed([{ ...FULL, quantity: null }], new Date()))
      .toContain('<availability>Κατόπιν παραγγελίας</availability>');
  });
});

describe('a product the destination would reject is named, not left to fail silently', () => {
  it('reports nothing missing for a complete product, in either strict dialect', () => {
    expect(feedGaps('skroutz', FULL)).toEqual([]);
    expect(feedGaps('bestprice', FULL)).toEqual([]);
  });

  it('names every mandatory attribute the product cannot supply', () => {
    const gaps = feedGaps('skroutz', { ...FULL, mpn: null, barcode: null, brand: null, image: null });
    expect(gaps).toEqual(expect.arrayContaining(['mpn', 'ean', 'manufacturer', 'image']));
  });

  it('counts a zero price as missing — the product is dropped either way', () => {
    expect(feedGaps('skroutz', { ...FULL, price_gross: 0 })).toContain('price');
  });

  it('holds BestPrice to ITS mandatory set: no EAN, no description, and brand is <brand>', () => {
    expect(feedGaps('bestprice', { ...FULL, barcode: null, description: null })).toEqual([]);
    expect(feedGaps('bestprice', { ...FULL, brand: null })).toContain('brand');
    expect(feedGaps('skroutz', { ...FULL, brand: null })).toContain('manufacturer');
  });

  it('says nothing about a dialect with no mandatory set, rather than inventing rejections', () => {
    expect(feedGaps('google', { ...FULL, mpn: null, brand: null })).toEqual([]);
    expect(gapSummary('google', [{ ...FULL, mpn: null }])).toEqual({ count: 0, byAttribute: {} });
  });

  it('summarises per attribute, counting a product once however many attributes it lacks', () => {
    const summary = gapSummary('bestprice', [
      FULL,
      { ...FULL, mpn: null },
      { ...FULL, mpn: null, image: null },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.byAttribute).toEqual({ mpn: 2, image: 1 });
  });
});
