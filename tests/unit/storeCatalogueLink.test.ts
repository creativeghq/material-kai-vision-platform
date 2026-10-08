import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { parseProductPage } from '../../supabase/functions/_shared/product-page';
import {
  fromShopifyProduct, fromWooProduct, htmlToText, netPrice,
} from '../../supabase/functions/_shared/commerce/product-pull';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

describe('reading a product off its own page', () => {
  it('reads schema.org Product JSON-LD, even inside an @graph, with its offer and size', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{ '@type': 'WebPage' }, {
        '@type': 'Product', name: 'Oslo chair', sku: 'OS-1', gtin13: '5200000000011',
        image: ['https://cdn.example/oslo.jpg', 'http://insecure.example/x.jpg'],
        brand: { '@type': 'Brand', name: 'Nordform' },
        width: { '@type': 'QuantitativeValue', value: 820, unitCode: 'MMT' },
        height: '75 cm',
        offers: { '@type': 'Offer', price: '489.00', priceCurrency: 'EUR' },
      }],
    })}</script></head></html>`;
    const p = parseProductPage(html, 'https://shop.example/oslo');
    expect(p).toMatchObject({
      source: 'json-ld', name: 'Oslo chair', sku: 'OS-1', gtin: '5200000000011', brand: 'Nordform',
      price: 489, currency: 'EUR', widthCm: 82, heightCm: 75, images: ['https://cdn.example/oslo.jpg'],
    });
  });

  it('falls back to Open Graph price tags', () => {
    const html = '<meta property="og:title" content="Brass lamp"><meta content="159" property="product:price:amount">'
      + '<meta property="product:price:currency" content="EUR"><meta property="og:image" content="https://cdn.example/l.jpg">';
    expect(parseProductPage(html, 'https://shop.example/l')).toMatchObject({
      source: 'open-graph', name: 'Brass lamp', price: 159, currency: 'EUR',
    });
  });

  it('a page with neither says so, instead of inventing a product', () => {
    expect(parseProductPage('<html><title>Hi</title></html>', 'https://x.example').source).toBe('none');
  });

  it('a broken JSON-LD block is skipped, not fatal', () => {
    const html = '<script type="application/ld+json">{not json</script><meta property="og:title" content="Ok">';
    expect(parseProductPage(html, 'https://x.example').name).toBe('Ok');
  });
});

describe('a store product in our shape', () => {
  it('Shopify: every variant, https images only, a page URL from the handle', () => {
    const p = fromShopifyProduct({
      id: 11, title: 'Oslo chair', handle: 'oslo', body_html: '<p>Solid oak</p><script>x()</script>',
      images: [{ src: 'https://cdn.shopify.com/a.jpg' }, { src: 'http://bad' }],
      variants: [{ id: 21, sku: 'OS-1', barcode: '52', price: '489.00' }, { id: 22, sku: 'OS-2', price: '519' }],
    }, 'https://shop.example/');
    expect(p).toMatchObject({
      externalProductId: '11', url: 'https://shop.example/products/oslo', description: 'Solid oak',
      images: ['https://cdn.shopify.com/a.jpg'],
    });
    expect(p!.variants.map((v) => v.variantId)).toEqual(['21', '22']);
  });

  it('WooCommerce: a barcode from meta_data', () => {
    const p = fromWooProduct({ id: 7, name: 'Lamp', sku: 'L-1', price: '159', permalink: 'https://w.example/lamp', meta_data: [{ key: '_gtin', value: '5201' }] });
    expect(p!.variants[0]).toEqual({ variantId: null, sku: 'L-1', barcode: '5201', price: 159 });
  });

  it('our list prices are net: a store price with tax is converted, one without is kept', () => {
    expect(netPrice(124, true, 24)).toBe(100);
    expect(netPrice(100, false, 24)).toBe(100);
    expect(netPrice(null, true, 24)).toBeNull();
  });

  it('store HTML becomes text and never keeps a script', () => {
    expect(htmlToText('<b>A</b><script>evil()</script> &amp; B')).toBe('A & B');
  });
});

describe('the writers link before they create, and never overwrite what exists', () => {
  const sync = read('supabase/functions/store-products-sync/index.ts');
  const fromUrl = read('supabase/functions/product-from-url/index.ts');

  it('both ask the one matcher before inserting a product', () => {
    for (const src of [sync, fromUrl]) {
      expect(src.indexOf("rpc('match_external_product'")).toBeGreaterThan(-1);
      expect(src.indexOf("rpc('match_external_product'")).toBeLessThan(src.indexOf(".from('products').insert("));
    }
  });

  it('a matched product is never updated by the store sync', () => {
    expect(sync).not.toMatch(/\.from\('products'\)\.update\(/);
    expect(sync).not.toMatch(/\.from\('product_prices'\)\.(update|upsert)\(/);
  });

  it('new store products arrive unpublished drafts', () => {
    expect(sync).toMatch(/status: 'draft'/);
    expect(sync).toMatch(/storefront_published: false/);
  });

  it('the connection workspace is checked against the caller', () => {
    expect(sync).toMatch(/userCanAccessWorkspace\(admin, userId, conn\.workspace_id\)/);
    expect(fromUrl).toMatch(/userCanAccessWorkspace\(admin, userId, workspaceId\)/);
  });

  it('the page is fetched through the SSRF guard', () => {
    expect(fromUrl).toMatch(/fetchTextGuarded\(/);
    expect(fromUrl).not.toMatch(/\bfetch\(url/);
  });
});
