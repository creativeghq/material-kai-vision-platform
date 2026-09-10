/**
 * ONE address derivation, and ONE way to build a Google Maps link.
 *
 * THE SHAPE THIS EXISTS TO STOP. An address is stored as loose parts and every surface that
 * shows one has to put them back together. There were already four hand-rolled versions of
 * that join when this landed — `crm.service.formatAddressLine`, the CRM address-unit row, the
 * finance Establishments row (which joined with spaces and no commas, so "Ermou 15 10563
 * Athens" ran together), and the invoice party builder — and each one made a different call
 * about where the street number goes. A wrong address is a valid string: nothing throws, no
 * typecheck fails, and the two renderings of one address sit on the same screen looking equally
 * authoritative.
 *
 * The map link is the same shape one step further on. `https://google.com/maps/...?query=` is
 * easy enough to type inline that it will be typed inline, and the copy that forgets
 * `encodeURIComponent` breaks on the first Greek street name — which is most of them here.
 *
 * So: the derivation is `src/utils/address.ts`, and the scan at the bottom fails when a second
 * copy appears.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  streetLine,
  formatAddressOneLine,
  formatAddressLines,
  hasMappableAddress,
  addressMapsQuery,
  googleMapsUrl,
  googleMapsDirectionsUrl,
} from '@/utils/address';

const GREEK = {
  street: 'ΙΑΣΩΝΙΔΟΥ',
  street_number: '17',
  postal_code: '56334',
  city: 'ΕΛΕΥΘΕΡΙΟ',
  state: 'Central Macedonia',
  country: 'Greece',
  country_code: 'EL',
};

describe('address derivation', () => {
  it('puts the street number after the street, and separates the rest with commas', () => {
    expect(streetLine(GREEK)).toBe('ΙΑΣΩΝΙΔΟΥ 17');
    expect(formatAddressOneLine(GREEK)).toBe('ΙΑΣΩΝΙΔΟΥ 17, 56334, ΕΛΕΥΘΕΡΙΟ, Greece');
  });

  it('reads the legacy free-text `address` column when there is no `street`', () => {
    // Older rows put the whole street line in `address`; a formatter that only knows `street`
    // renders those as a postcode and a city with no street at all.
    expect(formatAddressOneLine({ address: 'Ermou 15', city: 'Athens' })).toBe('Ermou 15, Athens');
    expect(streetLine({ address: 'Ermou', street_number: '15' })).toBe('Ermou 15');
  });

  it('drops absent parts instead of rendering a gap', () => {
    expect(formatAddressOneLine({ city: 'Athens' })).toBe('Athens');
    expect(formatAddressOneLine({})).toBe('');
    expect(formatAddressOneLine({ street: '   ', city: 'Athens' })).toBe('Athens');
    expect(formatAddressLines(GREEK)).toEqual(['ΙΑΣΩΝΙΔΟΥ 17', '56334 ΕΛΕΥΘΕΡΙΟ', 'Central Macedonia', 'Greece']);
  });

  it('falls back to the ISO country code when there is no country name', () => {
    // A property listing stores `country_code` and no `country`. Dropping the country from the
    // query lets Google place a Greek street name in whichever country the words look like.
    expect(addressMapsQuery({ street: 'Ermou', street_number: '15', city: 'Athens', country_code: 'EL' }))
      .toBe('Ermou 15, Athens, GR');
    // The name wins when both are present — "Greece" is what the operator typed.
    expect(addressMapsQuery(GREEK)).toContain('Greece');
    expect(addressMapsQuery(GREEK)).not.toContain(', GR');
  });

  it('keeps the state OUT of the one-liner and IN the maps query', () => {
    // On screen the περιφέρεια after the town is noise (it is derived from the ΤΚ). In a maps
    // query it is a disambiguating token, and Google is the one reading it.
    expect(formatAddressOneLine(GREEK)).not.toContain('Central Macedonia');
    expect(addressMapsQuery(GREEK)).toContain('Central Macedonia');
  });
});

describe('mappability', () => {
  it('a country on its own is not an address', () => {
    // The failure this prevents: a pin that opens a map of Greece looks exactly like a pin
    // that worked, so the operator believes they have checked something they have not.
    expect(hasMappableAddress({ country: 'Greece', country_code: 'EL' })).toBe(false);
    expect(googleMapsUrl({ country: 'Greece' })).toBeNull();
    expect(googleMapsUrl(null)).toBeNull();
    expect(googleMapsUrl({})).toBeNull();
    expect(googleMapsDirectionsUrl({ country: 'Greece' })).toBeNull();
  });

  it('a street, a city or a postcode is enough', () => {
    expect(hasMappableAddress({ street: 'Ermou' })).toBe(true);
    expect(hasMappableAddress({ city: 'Athens' })).toBe(true);
    expect(hasMappableAddress({ postal_code: '10563' })).toBe(true);
  });
});

describe('google maps url', () => {
  it('percent-encodes the query — Greek street names are the common case here', () => {
    const url = googleMapsUrl(GREEK)!;
    expect(url.startsWith('https://www.google.com/maps/search/?api=1&query=')).toBe(true);
    expect(url).not.toContain('ΙΑΣΩΝΙΔΟΥ');
    expect(decodeURIComponent(url.split('query=')[1])).toBe(addressMapsQuery(GREEK));
  });

  it('prefers the most exact identifier available', () => {
    // cid > lat/lng > place_id + text > text. Each later form is a guess at the one before it.
    const withCid = googleMapsUrl(GREEK, { cid: '123', lat: 40.6, lng: 22.9, place_id: 'p1' })!;
    expect(withCid).toBe('https://www.google.com/maps?cid=123');

    const withCoords = googleMapsUrl(GREEK, { lat: 40.6401, lng: 22.9444, place_id: 'p1' })!;
    expect(withCoords).toBe('https://www.google.com/maps/search/?api=1&query=40.6401%2C22.9444');

    const withPlace = googleMapsUrl(GREEK, { place_id: 'ChIJ_x' })!;
    expect(withPlace).toContain('&query_place_id=ChIJ_x');
  });

  it('ignores a 0,0 coordinate pair and falls back to the address', () => {
    // Null Island, in the Gulf of Guinea: what an unset pair defaults to, and a pin there is
    // indistinguishable from a real answer.
    const url = googleMapsUrl(GREEK, { lat: 0, lng: 0 })!;
    expect(decodeURIComponent(url)).toContain('ΙΑΣΩΝΙΔΟΥ 17');
  });

  it('treats an empty, null or non-numeric coordinate as absent, not as zero', () => {
    expect(decodeURIComponent(googleMapsUrl(GREEK, { lat: '', lng: '' })!)).toContain('ΙΑΣΩΝΙΔΟΥ 17');
    // Half a coordinate pair is not a location — it must not become "22.9, 0".
    expect(googleMapsUrl(GREEK, { lat: null, lng: 22.9 })).not.toContain('22.9%2C');
    expect(googleMapsUrl(GREEK, { lat: 'north', lng: 'east' })).not.toContain('NaN');
    // A numeric string is a coordinate: form state carries them as strings.
    expect(googleMapsUrl(GREEK, { lat: '40.64', lng: '22.94' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=40.64%2C22.94',
    );
  });
});

// ── Anti-drift scan ──────────────────────────────────────────────────────────

const SRC = join(process.cwd(), 'src');
const UTIL = join('src', 'utils', 'address.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('no second copy', () => {
  const files = walk(SRC).map((f) => ({ path: relative(process.cwd(), f), src: readFileSync(f, 'utf8') }));

  it('the scan sees the tree it thinks it does', () => {
    // A path typo would make every assertion below vacuously true — the silent-zero shape
    // applied to a guard test.
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.path === UTIL)).toBe(true);
  });

  it('only the util builds a Google Maps URL', () => {
    const offenders = files
      .filter((f) => f.path !== UTIL)
      .filter((f) => /(google\.com\/maps|maps\.google\.|maps\.app\.goo\.gl)/.test(f.src))
      .map((f) => f.path);
    expect(
      offenders,
      'build the link with googleMapsUrl() from @/utils/address — a hand-rolled one drops the ' +
      'encoding and breaks on the first Greek street name',
    ).toEqual([]);
  });

  it('nothing re-joins the address parts by hand', () => {
    // The exact shape of the four copies this replaced: an array literal of the address
    // columns, filtered and joined. Matching on the literal is crude and that is the point —
    // it catches the copy-paste, which is how every one of them arrived.
    const pattern = /\[\s*[\w.?]*\b(address|street)\b[^\]]{0,160}\b(postal_code|postcode)\b[^\]]{0,80}\]\s*\n?\s*\.?\s*filter\(Boolean\)/;
    const offenders = files
      .filter((f) => f.path !== UTIL)
      .filter((f) => pattern.test(f.src))
      .map((f) => f.path);
    expect(
      offenders,
      'use formatAddressOneLine() / formatAddressLines() from @/utils/address',
    ).toEqual([]);
  });

  it('the util stays out of the data layer so any layer can use it', () => {
    // It is pulled by components, services and a page; an import of the supabase client — or of
    // anything that reaches one — would drag the whole data layer into each of them. Its one
    // dependency is the country-code table, which is pure data.
    const imports = [...readFileSync(join(process.cwd(), UTIL), 'utf8').matchAll(/^import .*?from '([^']+)'/gm)]
      .map((m) => m[1]);
    expect(imports).toEqual(['@/lib/countryCodes']);
  });

  it('the country-code table is import-free, because it is byte-mirrored to Deno', () => {
    // Vite resolves `@/`, Deno resolves by URL: a single import makes the mirror unbuildable in
    // the runtime it was copied into, and the failure surfaces at request time, not at build.
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'countryCodes.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
