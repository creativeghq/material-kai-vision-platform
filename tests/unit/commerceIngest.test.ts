import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { normaliseMoney, MONEY_TOLERANCE } from '../../supabase/functions/_shared/commerce/money';
import { normaliseStoreUrl, readVerifiedWebhook, WebhookRefusal } from '../../supabase/functions/_shared/commerce/verify';
import { fromShopify, fromWooCommerce, ADAPTERS } from '../../supabase/functions/_shared/commerce/adapters';
import { fromSkroutz } from '../../supabase/functions/_shared/commerce/skroutz';
import { generateWebhookSecret, WOO_UNSAFE_SECRET } from '../../src/modules/commerce/webhookSecret';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const CONN = { id: 'c1', platform: 'shopify', vat_number_key: 'vat_number', invoice_request_key: 'wants_invoice' };

describe('§12.4 gross vs net — our reading is checked against theirs', () => {
  it('reads a tax-exclusive payload and reconciles with the stated totals', () => {
    const m = normaliseMoney(
      [{ name: 'A', qty: 2, unit_price: 50, vat_percent: 24 }],
      { total: 124, vat: 24 },
      false,
    );
    expect(m.net).toBe(100);
    expect(m.vat).toBe(24);
    expect(m.reconciles).toBe(true);
  });

  it('reads a tax-INCLUSIVE payload and still reconciles', () => {
    const m = normaliseMoney(
      [{ name: 'A', qty: 2, unit_price: 62, vat_percent: 24 }],
      { total: 124, vat: 24 },
      true,
    );
    expect(m.net).toBe(100);
    expect(m.vat).toBe(24);
    expect(m.reconciles).toBe(true);
  });

  it('CATCHES a gross/net inversion instead of transmitting it', () => {
    const wrong = normaliseMoney(
      [{ name: 'A', qty: 2, unit_price: 62, vat_percent: 24 }],
      { total: 124, vat: 24 },
      false,
    );
    expect(wrong.reconciles).toBe(false);
    expect(wrong.totalDelta).toBeGreaterThan(MONEY_TOLERANCE);
  });

  it('refuses to reconcile when the VAT disagrees even though the gross total matches', () => {
    const m = normaliseMoney(
      [{ name: 'A', qty: 2, unit_price: 50, vat_percent: 24 }],
      { total: 124, vat: 13 },
      false,
    );
    expect(m.totalDelta).toBeLessThanOrEqual(MONEY_TOLERANCE);
    expect(m.vatDelta).toBeGreaterThan(MONEY_TOLERANCE);
    expect(m.reconciles).toBe(false);
  });

  it('carries shipping as a taxed revenue line, so its VAT is counted', () => {
    const o = fromShopify({
      id: 7, currency: 'EUR', taxes_included: false, total_price: '136.40', total_tax: '26.40',
      line_items: [{ title: 'A', quantity: 2, price: '50.00', tax_lines: [{ rate: 0.24 }] }],
      shipping_lines: [{ price: '10.00', tax_lines: [{ price: '2.40' }] }],
    }, CONN, null);
    expect(o.lines.map((l) => l.name)).toContain('Shipping');
    expect(o.totals.net).toBe(110);
    expect(o.totals.vat).toBe(26.4);
    expect(o.reconciles).toBe(true);
  });

  it('sums EVERY Shopify tax line, not just the first', () => {
    const o = fromShopify({
      id: 8, currency: 'EUR', taxes_included: false, total_price: '124.00', total_tax: '24.00',
      line_items: [{ title: 'A', quantity: 2, price: '50.00',
        tax_lines: [{ rate: 0.17 }, { rate: 0.07 }] }],
    }, CONN, null);
    expect(o.lines[0].vat_percent).toBeCloseTo(24, 5);
    expect(o.reconciles).toBe(true);
  });

  it('cannot reconcile when the platform states no total — unknown is not agreement', () => {
    const m = normaliseMoney([{ name: 'A', qty: 1, unit_price: 100, vat_percent: 24 }], {}, false);
    expect(m.totalDelta).toBeNull();
    expect(m.reconciles).toBe(false);
  });
});

describe('§12.5 the document decision withholds when it cannot be resolved', () => {
  const base = { id: 1, currency: 'EUR', total_price: '124.00', total_tax: '24.00', taxes_included: false,
    line_items: [{ title: 'A', quantity: 2, price: '50.00', tax_lines: [{ rate: 0.24 }] }] };

  it('never falls back to a receipt when no key is configured', () => {
    const o = fromShopify(base, { id: 'c', platform: 'shopify' }, 'orders/create');
    expect(o.document_request).toBeNull();
    expect(o.document_request_reason).toMatch(/no vat-number or invoice-request key/i);
  });

  it('withholds when an invoice was asked for but no VAT number resolved', () => {
    const o = fromShopify(
      { ...base, note_attributes: [{ name: 'wants_invoice', value: 'true' }] },
      CONN, 'orders/create',
    );
    expect(o.document_request).toBeNull();
    expect(o.document_request_reason).toMatch(/no vat number resolved/i);
  });

  it('resolves to an invoice when the configured key holds a VAT number', () => {
    const o = fromShopify(
      { ...base, note_attributes: [{ name: 'vat_number', value: '123456789' }] },
      CONN, 'orders/create',
    );
    expect(o.document_request).toBe('invoice');
  });
});

describe('§12.6 a line-item product id is a claim, not a fact', () => {
  it('passes a well-formed uuid through for the SQL tenancy check', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const o = fromShopify({
      id: 2, currency: 'EUR', total_price: '124.00', total_tax: '24.00', taxes_included: false,
      line_items: [{ title: 'A', quantity: 2, price: '50.00', tax_lines: [{ rate: 0.24 }],
        properties: [{ name: '_materialkai_product_id', value: id }] }],
    }, CONN, null);
    expect(o.lines[0].product_id).toBe(id);
  });

  it('drops anything that is not a uuid rather than rejecting the order', () => {
    const o = fromShopify({
      id: 3, currency: 'EUR', total_price: '124.00', total_tax: '24.00', taxes_included: false,
      line_items: [{ title: 'A', quantity: 2, price: '50.00', tax_lines: [{ rate: 0.24 }],
        properties: [{ name: '_materialkai_product_id', value: "'; drop table products; --" }] }],
    }, CONN, null);
    expect(o.lines[0].product_id).toBeNull();
    expect(o.lines).toHaveLength(1);
  });
});

describe('§12.2 a WooCommerce webhook secret cannot hold what Woo decodes', () => {
  it('generates from a URL-safe alphabet only', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateWebhookSecret()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('rejects each of the five characters Woo entity-decodes', () => {
    for (const ch of ['&', "'", '"', '<', '>']) {
      expect(WOO_UNSAFE_SECRET.test(`abc${ch}def`)).toBe(true);
    }
    expect(WOO_UNSAFE_SECRET.test('abcDEF-123_xyz')).toBe(false);
  });
});

describe('§12.3 the Woo source header is compared to the connection', () => {
  it('normalises scheme, case, www and trailing slash away', () => {
    expect(normaliseStoreUrl('https://WWW.Shop.gr/')).toBe('shop.gr');
    expect(normaliseStoreUrl('http://shop.gr')).toBe('shop.gr');
    expect(normaliseStoreUrl('shop.gr')).toBe('shop.gr');
    expect(normaliseStoreUrl('')).toBeNull();
  });

  it('does not collapse two different stores onto one', () => {
    expect(normaliseStoreUrl('https://a.example.com')).not.toBe(normaliseStoreUrl('https://b.example.com'));
  });
});

describe('§12.1 nothing in the commerce path can obtain a body without verifying it', () => {
  it('no commerce file calls req.json()', () => {
    const dirs = [
      join(ROOT, 'supabase/functions/_shared/commerce'),
      join(ROOT, 'supabase/functions/store-orders-webhook'),
    ];
    const offenders = dirs.flatMap((d) => walk(d)).filter((f) => /\breq\.json\s*\(/.test(readFileSync(f, 'utf8')));
    expect(
      offenders.map((f) => relative(ROOT, f)),
      'The signature must be computed over the exact bytes received; any parse before that changes '
      + 'them and every signature fails. Use readVerifiedWebhook(), which returns the PARSED body.',
    ).toEqual([]);
  });

  it('the verifier fails closed on a missing secret', () => {
    const src = readFileSync(join(ROOT, 'supabase/functions/_shared/commerce/verify.ts'), 'utf8');
    expect(src).toMatch(/503/);
    expect(src).toMatch(/timingSafeEqual/);
  });
});

describe('WooCommerce line money', () => {
  it('derives a per-line rate from the tax Woo states, and reconciles', () => {
    const o = fromWooCommerce({
      id: 9, number: '9', currency: 'EUR', status: 'processing',
      total: '124.00', total_tax: '24.00', shipping_total: '0.00',
      line_items: [{ name: 'A', quantity: 2, total: '100.00', total_tax: '24.00', sku: 'X' }],
    }, { id: 'c', platform: 'woocommerce' }, 'order.created');
    expect(o.lines[0].vat_percent).toBe(24);
    expect(o.totals.net).toBe(100);
    expect(o.reconciles).toBe(true);
  });
});

describe('the verifier against a real signature', () => {
  const SECRET = 'abcDEF-123_xyz';
  const BODY = JSON.stringify({ id: 1, total: '10.00' });

  async function sign(secret: string, raw: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
    return Buffer.from(new Uint8Array(sig)).toString('base64');
  }

  const conn = { id: 'c', workspace_id: 'w', platform: 'shopify', webhook_secret: SECRET };

  function req(body: string, headers: Record<string, string>) {
    return new Request('https://example.test/hook', { method: 'POST', body, headers });
  }

  it('accepts a genuine delivery', async () => {
    const { body } = await readVerifiedWebhook(
      req(BODY, { 'x-shopify-hmac-sha256': await sign(SECRET, BODY) }), conn, 'shopify');
    expect(body.id).toBe(1);
  });

  it('rejects a body mutated by one byte', async () => {
    const good = await sign(SECRET, BODY);
    await expect(readVerifiedWebhook(
      req(BODY.replace('10.00', '99.00'), { 'x-shopify-hmac-sha256': good }), conn, 'shopify'),
    ).rejects.toThrow(WebhookRefusal);
  });

  it('fails CLOSED when the connection has no secret', async () => {
    await expect(readVerifiedWebhook(
      req(BODY, { 'x-shopify-hmac-sha256': 'whatever' }), { ...conn, webhook_secret: null }, 'shopify'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('refuses a WooCommerce delivery whose source header is ABSENT, not just mismatched', async () => {
    const woo = { ...conn, platform: 'woocommerce', store_url: 'https://shop.gr' };
    const sig = await sign(SECRET, BODY);
    await expect(readVerifiedWebhook(
      req(BODY, { 'x-wc-webhook-signature': sig }), woo, 'woocommerce'),
    ).rejects.toMatchObject({ status: 404 });

    const ok = await readVerifiedWebhook(
      req(BODY, { 'x-wc-webhook-signature': sig, 'x-wc-webhook-source': 'https://www.shop.gr/' }),
      woo, 'woocommerce');
    expect(ok.body.id).toBe(1);
  });
});

describe('Skroutz states what the buyer asked for, so nothing is inferred', () => {
  const base = {
    code: 'SK-1', state: 'open', currency: 'EUR', paid: true,
    total_price: 124, vat_amount: 24,
    line_items: [{ product_name: 'Tile', quantity: 2, unit_price: 62, vat: 24, shop_uid: 'SKU-9' }],
  };

  it('maps each invoice_document to the document we can actually issue', () => {
    for (const [asked, expected] of Object.entries({
      receipt: 'receipt', invoice: 'invoice', invoice_39a: 'invoice_39a', invoice_vies: 'invoice_vies',
    })) {
      const o = fromSkroutz({ ...base, invoice_document: asked }, { id: 'c', platform: 'skroutz' }, null);
      expect(o.document_request).toBe(expected);
    }
  });

  it('withholds on a value it does not recognise, rather than guessing a receipt', () => {
    const o = fromSkroutz({ ...base, invoice_document: 'something_new' }, { id: 'c', platform: 'skroutz' }, null);
    expect(o.document_request).toBeNull();
    expect(o.document_request_reason).toMatch(/not a document we can issue/i);
  });

  it('reads Skroutz prices as VAT-INCLUSIVE, which is what their spec states', () => {
    const o = fromSkroutz({ ...base, invoice_document: 'receipt' }, { id: 'c', platform: 'skroutz' }, null);
    expect(o.totals.net).toBe(100);
    expect(o.totals.vat).toBe(24);
    expect(o.reconciles).toBe(true);
  });

  it('carries the order CODE as the external id, because that is what every call takes', () => {
    const o = fromSkroutz({ ...base, invoice_document: 'receipt' }, { id: 'c', platform: 'skroutz' }, null);
    expect(o.external_order_id).toBe('SK-1');
    expect(o.external_state).toBe('open');
  });

  it('is reachable from the shared adapter map, so the webhook does not fall through to generic', () => {
    expect(ADAPTERS.skroutz).toBe(fromSkroutz);
  });
});
