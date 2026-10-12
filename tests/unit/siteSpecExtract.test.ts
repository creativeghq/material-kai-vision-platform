import { describe, it, expect } from 'vitest';
import {
  extractContentLinks,
  extractSpecs,
  parseAmount,
} from '../../supabase/functions/crawl-user-website/spec-extract.ts';
import { blankedSource } from '../helpers/sourceIndex';

const PAGE = 'https://shop.example/products/oak-chair';
const NOW = new Date('2026-10-12T08:00:00Z');

const page = (main: string, head = '') =>
  `<html><head>${head}</head><body><header><nav><a href="/cart">Cart</a></nav></header>`
  + `<main>${main}</main><footer><dl><dt>Phone</dt><dd>123</dd></dl></footer></body></html>`;

describe('extractSpecs — the facts a page states about itself', () => {
  it('reads a two-column spec table with the site\'s own labels', () => {
    const html = page(`
      <h1>Oak chair</h1>
      <table><caption>Specifications</caption>
        <tr><th>Material:</th><td>Solid  oak</td></tr>
        <tr><th>Seat height</th><td>45 cm</td></tr>
        <tr><td>Weight</td><td>—</td></tr>
      </table>`);
    expect(extractSpecs(html, PAGE, NOW)).toEqual({
      source: 'table',
      attributes: { Material: 'Solid oak', 'Seat height': '45 cm' },
      price: null,
      extracted_at: '2026-10-12T08:00:00.000Z',
    });
  });

  it('turns a variant table into one value list per column header', () => {
    const html = page(`
      <table><thead><tr><th>Size</th><th>Finish</th><th>Price</th></tr></thead>
        <tbody>
          <tr><td>60×60 cm</td><td>Matt</td><td>€34,90</td></tr>
          <tr><td>60×120 cm</td><td>Matt</td><td>€41,50</td></tr>
        </tbody></table>`);
    const specs = extractSpecs(html, PAGE, NOW);
    expect(specs?.attributes).toEqual({ Size: '60×60 cm, 60×120 cm', Finish: 'Matt', Price: '€34,90, €41,50' });
    expect(specs?.price).toEqual({ amount: 34.9, currency: 'EUR' });
  });

  it('reads a definition list and keeps the page language', () => {
    const html = page(`<dl><dt>Πάχος</dt><dd>9 mm</dd><dt>Χρώματα</dt><dd>Λευκό</dd><dd>Γκρι</dd></dl>`);
    expect(extractSpecs(html, PAGE, NOW)?.attributes).toEqual({ Πάχος: '9 mm', Χρώματα: 'Λευκό, Γκρι' });
  });

  it('reads a key: value list and ignores an ordinary bullet list', () => {
    const html = page(`
      <ul><li>Width: 50 cm</li><li>Depth: 52 cm</li></ul>
      <ul><li>Free delivery</li><li>Made to order</li><li>Note: ask us</li></ul>`);
    expect(extractSpecs(html, PAGE, NOW)?.attributes).toEqual({ Width: '50 cm', Depth: '52 cm' });
  });

  it('skips the spec card of another product listed on the page', () => {
    const html = page(`
      <dl><dt>Material</dt><dd>Oak</dd></dl>
      <section><article><h3><a href="/products/pine-chair">Pine chair</a></h3>
        <dl><dt>Material</dt><dd>Pine</dd><dt>Colour</dt><dd>Natural</dd></dl></article></section>`);
    expect(extractSpecs(html, PAGE, NOW)?.attributes).toEqual({ Material: 'Oak' });
  });

  it('takes JSON-LD Product fields and the offer price', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Shop' },
        {
          '@type': 'Product', name: 'Oak chair', sku: 'OC-1', brand: { '@type': 'Brand', name: 'Woodco' },
          additionalProperty: [{ '@type': 'PropertyValue', name: 'Seat height', value: 45, unitText: 'cm' }],
          offers: { '@type': 'Offer', price: '129.00', priceCurrency: 'eur' },
        },
      ],
    };
    const html = page('<p>No table here.</p>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
    expect(extractSpecs(html, PAGE, NOW)).toEqual({
      source: 'jsonld',
      attributes: { name: 'Oak chair', brand: 'Woodco', sku: 'OC-1', 'Seat height': '45 cm' },
      price: { amount: 129, currency: 'EUR' },
      extracted_at: '2026-10-12T08:00:00.000Z',
    });
  });

  it('marks a page with both sources as mixed and lets JSON-LD win a shared label', () => {
    const ld = { '@type': 'Product', name: 'Oak chair', offers: [{ price: 99, priceCurrency: 'USD' }] };
    const html = page('<table><tr><th>name</th><td>Other</td></tr><tr><th>Legs</th><td>4</td></tr></table>',
      `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
    const specs = extractSpecs(html, PAGE, NOW);
    expect(specs?.source).toBe('mixed');
    expect(specs?.attributes).toEqual({ name: 'Oak chair', Legs: '4' });
    expect(specs?.price).toEqual({ amount: 99, currency: 'USD' });
  });

  it('returns null for a page that states nothing — site chrome does not count', () => {
    const html = page('<h1>About us</h1><p>We sell chairs.</p>',
      '<script type="application/ld+json">{"@type":"Organization","name":"Shop"}</script>');
    expect(extractSpecs(html, PAGE, NOW)).toBeNull();
  });

  it('survives malformed JSON-LD', () => {
    const html = page('<dl><dt>Legs</dt><dd>4</dd></dl>', '<script type="application/ld+json">{oops</script>');
    expect(extractSpecs(html, PAGE, NOW)?.attributes).toEqual({ Legs: '4' });
  });
});

describe('parseAmount', () => {
  it.each([
    ['34,90', 34.9], ['1.234,50', 1234.5], ['1,234.50', 1234.5], ['129', 129], ['1.299', 1299], ['0', null], ['abc', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });
});

describe('extractContentLinks — what a category page links to', () => {
  it('keeps same-site links from the main content only, absolute and de-duplicated', () => {
    const html = page(`
      <a href="/products/pine-chair">Pine</a>
      <a href="https://www.shop.example/products/ash-chair#reviews">Ash</a>
      <a href="/products/pine-chair">Pine again</a>
      <a href="${PAGE}">Self</a>
      <a href="https://other.example/x">Elsewhere</a>
      <a href="mailto:hi@shop.example">Mail</a>`);
    expect(extractContentLinks(html, PAGE)).toEqual([
      'https://shop.example/products/pine-chair',
      'https://www.shop.example/products/ash-chair',
    ]);
  });

  it('is capped', () => {
    const links = Array.from({ length: 10 }, (_, i) => `<a href="/p/${i}">${i}</a>`).join('');
    expect(extractContentLinks(page(links), PAGE, 3)).toHaveLength(3);
  });
});

describe('crawler wiring', () => {
  const src = blankedSource('supabase/functions/crawl-user-website/index.ts');

  it('the direct read extracts specs and links, and the page write stores them', () => {
    expect(src).toMatch(/specs:\s*extractSpecs\(html, url\)/);
    expect(src).toMatch(/links_to:\s*extractContentLinks\(html, url\)/);
    expect(src).toMatch(/s\.links_to \? \{ specs: s\.specs \?\? null, links_to: s\.links_to, specs_checked_at: now \}/);
  });

  it('the spec backfill never reaches Firecrawl and never debits', () => {
    const start = src.indexOf('async function backfillSpecs');
    const body = src.slice(start, src.indexOf('Deno.serve(', start));
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('fetchGuarded(');
    expect(body).not.toMatch(/scrapePage|firecrawlScrape|scrapeMarkdown|debit_credits|chargeCronUser/);
  });

  it('the extractor is import-free', () => {
    expect(blankedSource('supabase/functions/crawl-user-website/spec-extract.ts')).not.toMatch(/^\s*import\s/m);
  });
});
