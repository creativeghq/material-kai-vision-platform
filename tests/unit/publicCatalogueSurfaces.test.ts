import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import {
  listingKey, normaliseVariantKey, productVatPct, variantAttrsFromKey, PUBLIC_PRODUCT_STATUS,
} from '../../supabase/functions/_shared/commerce/public-catalogue';
import { productImages } from '../../supabase/functions/_shared/product-media';

const read = (p: string) =>
  blankComments(readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'));

const STOREFRONT = read('supabase/functions/finance-storefront/index.ts');
const FEED = read('supabase/functions/product-feed/index.ts');
const EMBED = read('supabase/functions/products-3d-api/index.ts');
const DATASHEET = read('supabase/functions/product-datasheet-pdf/index.ts');
const PUBLIC_SURFACES = { STOREFRONT, FEED, EMBED };

describe('#494 B13 — a public surface publishes only active products', () => {
  it('the published status is active', () => {
    expect(PUBLIC_PRODUCT_STATUS).toBe('active');
  });

  for (const [name, src] of Object.entries(PUBLIC_SURFACES)) {
    it(`${name} filters the joined product on status in the query`, () => {
      expect(src).toMatch(/products!inner\(/);
      expect(src).toMatch(/\.eq\('product\.status', PUBLIC_PRODUCT_STATUS\)/);
    });
  }

  it('storefront checkout re-checks the status, not only browse', () => {
    const checkout = STOREFRONT.slice(STOREFRONT.indexOf("action === 'checkout'"));
    expect(checkout).toMatch(/\.eq\('product\.status', PUBLIC_PRODUCT_STATUS\)/);
  });
});

describe('one VAT derivation for every public price', () => {
  it('maps a product VAT category to its percent, else the workspace default', () => {
    expect(productVatPct('2', 24)).toBe(13);
    expect(productVatPct(null, 17)).toBe(17);
    expect(productVatPct('', 24)).toBe(24);
  });

  for (const [name, src] of Object.entries(PUBLIC_SURFACES)) {
    it(`${name} derives VAT through the shared helper`, () => {
      expect(src).toMatch(/productVatPct\(/);
      expect(src, 'a second read of default_vat_rate is a second derivation').not.toMatch(/default_vat_rate/);
      expect(src).not.toMatch(/vatPctForCat\(/);
    });
  }

  it('storefront VAT is per line and the header is summed from the lines', () => {
    expect(STOREFRONT).toMatch(/vat_amount: round2\(netValue \* vatPct \/ 100\)/);
    expect(STOREFRONT).toMatch(/totalVat = round2\(lines\.reduce\(\(s, l\) => s \+ l\.vat_amount, 0\)\)/);
  });
});

describe('variants are carried, never collapsed onto product_id', () => {
  it('listingKey separates a variant from its base row', () => {
    expect(listingKey('p1', null)).toBe('p1');
    expect(listingKey('p1', 'color=white')).not.toBe(listingKey('p1', null));
    expect(normaliseVariantKey('  ')).toBeNull();
  });

  it('variantAttrsFromKey inverts SQL _variant_key', () => {
    expect(variantAttrsFromKey('color=white;size=60x60')).toEqual({ color: 'white', size: '60x60' });
  });

  it('storefront prices a cart line by product AND variant', () => {
    expect(STOREFRONT).toMatch(/priceByListing\.get\(listingKey\(it\.product_id, it\.variant_key\)\)/);
    expect(STOREFRONT).not.toMatch(/priceById/);
  });

  it('the embed resolves the base row or a named variant, never maybeSingle over all rows', () => {
    expect(EMBED).toMatch(/anyPublished\(\)\.is\('variant_key', null\)/);
    expect(EMBED).toMatch(/publishedQuery\(variantKey\)/);
  });

  it('the feed emits a distinct id per variant row', () => {
    expect(FEED).toMatch(/id: variantKey \? String\(r\.id\) : String\(p\.id\)/);
  });
});

describe('product-feed never publishes a guess', () => {
  it('an unpriced product is withheld and counted, never priced at 0', () => {
    expect(FEED).not.toMatch(/list_price \?\? 0/);
    expect(FEED).toMatch(/unpriced \+= 1/);
    expect(FEED).toMatch(/p_gap_count: gaps\.count \+ unpriced/);
  });

  it('a failed price read is a 5xx, not an empty feed', () => {
    expect(FEED).toMatch(/if \(error\) throw new HttpError\(500/);
  });

  it('selection is in the query and the read is paginated, not capped then filtered', () => {
    expect(FEED).not.toMatch(/\.limit\(5000\)/);
    expect(FEED).toMatch(/\.range\(from, from \+ PAGE_SIZE - 1\)/);
    expect(FEED).toMatch(/q\.in\('product_id', wanted\)/);
    expect(FEED).toMatch(/q\.in\('product\.category_id', wanted\)/);
  });
});

describe('PDF-ingested images reach public surfaces', () => {
  it('associations come first, metadata is the fallback, a variant prefers its own', () => {
    const assoc = [
      { url: 'https://x/base.png', variant_key: null },
      { url: 'https://x/white.png', variant_key: 'color=white' },
    ];
    expect(productImages(assoc, { image_url: 'https://x/meta.png' }))
      .toEqual(['https://x/base.png', 'https://x/white.png', 'https://x/meta.png']);
    expect(productImages(assoc, null, 'color=white')[0]).toBe('https://x/white.png');
    expect(productImages(undefined, { image_url: 'https://x/meta.png' })).toEqual(['https://x/meta.png']);
  });

  for (const [name, src] of Object.entries(PUBLIC_SURFACES)) {
    it(`${name} reads image_product_associations through the shared helper`, () => {
      expect(src).toMatch(/associatedImagesByProduct\(/);
      expect(src).not.toMatch(/imagesFromMetadata\(|imageFromMetadata\(/);
    });
  }
});

describe('the datasheet is built from the field registry', () => {
  it('reads metadata, where PDF ingest writes', () => {
    expect(DATASHEET).toMatch(/product\.metadata/);
  });

  it('labels come from the registry per category', () => {
    expect(DATASHEET).toMatch(/from\('material_metadata_fields'\)/);
    expect(DATASHEET).toMatch(/label_by_category\?\.\[categoryKey\]/);
    expect(DATASHEET).toMatch(/aliases/);
  });

  it('sensitivity is the SQL verdict per key in ONE call, and an unanswered key is withheld', () => {
    expect(DATASHEET).not.toMatch(/rpc\('is_internal_product_field'/);
    expect(DATASHEET).toMatch(/rpc\('redact_internal_product_fields', \{/);
    expect(DATASHEET).toMatch(/new Set\(!redactErr && kept && typeof kept === 'object' \? Object\.keys\(kept as Json\) : \[\]\)/);
    expect(DATASHEET).toMatch(/values\.filter\(\(v\) => publicKeys\.has\(v\.field\.field_name\)\)/);
  });
});

describe('variant labels are read in one batched call per surface', () => {
  it.each([['storefront', STOREFRONT], ['feed', FEED]])('%s calls get_variant_labels, never variant_label per row', (_n, src) => {
    expect(src).toMatch(/rpc\('get_variant_labels', \{\s*p_rows:/);
    expect(src).not.toMatch(/rpc\('variant_label'/);
  });
});
