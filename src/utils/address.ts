/**
 * Postal-address derivations — ONE implementation, shared by every surface that
 * shows an address.
 *
 * The platform stores an address as loose parts (`street` / `street_number` /
 * `postal_code` / `city` / `state` / `country`, plus a legacy free-text `address`
 * that older rows put the whole street line into). Turning those parts back into
 * something a human — or Google Maps — can read is a DERIVATION, and it was
 * about to be written a fourth time. `formatAddressLine` in `crm.service.ts`
 * delegates here so there is exactly one answer to "what does this address say".
 *
 * Deliberately dependency-free apart from the country-code table (itself import-free
 * and mirrored to Deno): it is pure string work with no dependency on the supabase
 * client, so a component can pull it without dragging the CRM service in.
 */
import { isoCountryCode } from '@/lib/countryCodes';

/**
 * The shape every address-bearing row in the platform shares. Every field is
 * optional because most of them genuinely are — a party may be nothing but a
 * city, and a formatter that assumes otherwise renders "undefined, undefined".
 */
export interface AddressLike {
  /** Legacy free-text street line. Older rows carry the whole street here. */
  address?: string | null;
  street?: string | null;
  street_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  country_code?: string | null;
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** "ΙΑΣΩΝΙΔΟΥ 17" — the street line, whichever of the two shapes the row uses. */
export function streetLine(a: AddressLike): string {
  return [clean(a.street) || clean(a.address), clean(a.street_number)].filter(Boolean).join(' ').trim();
}

/**
 * One-line summary: street, postal code, city, country.
 *
 * `state` is deliberately OUT: it is derived from the ΤΚ for Greek parties and
 * repeating "Central Macedonia" after "56334 ΕΛΕΥΘΕΡΙΟ" tells the reader nothing
 * they cannot already see. It IS included in the maps query below, where a
 * disambiguating token is worth having.
 */
export function formatAddressOneLine(a: AddressLike): string {
  return [streetLine(a), clean(a.postal_code), clean(a.city), clean(a.country)]
    .filter(Boolean)
    .join(', ');
}

/** Multi-line form for a panel: street / postal + city / state / country. */
export function formatAddressLines(a: AddressLike): string[] {
  return [
    streetLine(a),
    [clean(a.postal_code), clean(a.city)].filter(Boolean).join(' '),
    clean(a.state),
    clean(a.country),
  ].filter(Boolean);
}

/**
 * Is there enough here to point at a place?
 *
 * A country alone is not an address — "Greece" opens a map of Greece, which is
 * a link that looks like it worked and did nothing. Require a street or a
 * settlement (city / postal code) before offering the map action at all.
 */
export function hasMappableAddress(a: AddressLike | null | undefined): boolean {
  if (!a) return false;
  return Boolean(streetLine(a) || clean(a.city) || clean(a.postal_code));
}

/**
 * The query string handed to Google Maps — the full address INCLUDING state.
 *
 * Falls back to the ISO country code when there is no country NAME. Several tables store one
 * without the other (a property listing has `country_code` and no `country` at all), and a
 * query that drops the country entirely puts a Greek street name in whichever country Google
 * decides the rest of the words look most like. `isoCountryCode` is what turns the stored VAT
 * code `EL` into the `GR` Google knows.
 */
export function addressMapsQuery(a: AddressLike): string {
  const country = clean(a.country) || (isoCountryCode(a.country_code) ?? '');
  return [streetLine(a), clean(a.postal_code), clean(a.city), clean(a.state), country]
    .filter(Boolean)
    .join(', ');
}

/** A finite number, or null — `''`, `NaN` and `undefined` are all "we do not have one". */
function finite(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? (n as number) : null;
}

/**
 * A Google Maps URL for this address, or null when there is nothing to point at.
 *
 * Precedence is most-exact-first, because each later form is a guess at the one
 * before it:
 *   `cid` / `place_id` — Google's own id for THAT listing
 *   `lat`/`lng`        — a surveyed point (a property listing carries one)
 *   the address text   — Google's best guess, which for a warehouse on an
 *                        industrial road is frequently a different building
 *
 * Uses the documented `maps/search/?api=1` entry point — stable, needs no API
 * key, and works on desktop web, Android and iOS (where it hands off to the app).
 */
export function googleMapsUrl(
  a: AddressLike | null | undefined,
  ids?: { place_id?: string | null; cid?: string | null; lat?: number | string | null; lng?: number | string | null },
): string | null {
  const cid = clean(ids?.cid);
  if (cid) return `https://www.google.com/maps?cid=${encodeURIComponent(cid)}`;

  const lat = finite(ids?.lat);
  const lng = finite(ids?.lng);
  // 0,0 is Null Island in the Gulf of Guinea — the value an unset coordinate pair
  // takes when something defaulted it, and a map pin there looks like a real answer.
  if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
  }

  if (!hasMappableAddress(a)) return null;
  const query = addressMapsQuery(a as AddressLike);
  if (!query) return null;

  const placeId = clean(ids?.place_id);
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return placeId ? `${base}&query_place_id=${encodeURIComponent(placeId)}` : base;
}

/**
 * The same place on Google's *Street View* / directions entry point. Kept next to
 * the search URL so a second surface never hand-rolls its own `google.com/maps?`
 * string with a differently-encoded query.
 */
export function googleMapsDirectionsUrl(a: AddressLike | null | undefined): string | null {
  if (!hasMappableAddress(a)) return null;
  const query = addressMapsQuery(a as AddressLike);
  if (!query) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
