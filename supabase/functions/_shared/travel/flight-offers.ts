/** Flight search input rules and Bright Data output normalization. Import-free so the unit tests load it directly. */

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departure: string;
  return: string;
  trip_type: 'one_way' | 'round_trip';
  adults: number;
  cabin: 'economy' | 'premium_economy' | 'business' | 'first';
}

export interface FlightOffer {
  airline: string | null;
  flight_number: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  duration_minutes: number | null;
  stops: number | null;
  price: number | null;
  currency: string | null;
  price_raw: string | null;
}

/** The caller's local month, accepted only if it is the UTC month of now give or take a day: anything else is a made-up month. */
export function acceptedMonth(month: unknown, now = Date.now()): string | null {
  const m = String(month ?? '');
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const near = new Set([-14, 0, 14].map((h) => new Date(now + h * 3_600_000).toISOString().slice(0, 7)));
  return near.has(m) ? m : null;
}

const CABINS = new Set(['economy', 'premium_economy', 'business', 'first']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validated params, or the sentence saying what is wrong. `today` is the caller's local date. */
export function validateFlightParams(raw: Record<string, unknown>, today: string): FlightSearchParams | string {
  const origin = String(raw.origin ?? '').trim().toUpperCase();
  const destination = String(raw.destination ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return 'origin and destination must be 3-letter IATA airport codes, e.g. ATH, FCO.';
  if (origin === destination) return 'origin and destination are the same airport.';
  const departure = String(raw.departure ?? '').trim();
  const ret = String(raw.return ?? '').trim();
  if (!DATE.test(departure)) return 'departure must be a date, YYYY-MM-DD.';
  if (departure < today) return 'departure is in the past.';
  const tripType = ret ? 'round_trip' : 'one_way';
  if (raw.trip_type && raw.trip_type !== tripType) {
    return raw.trip_type === 'round_trip' ? 'a return trip needs a return date.' : 'a one-way trip has no return date.';
  }
  if (ret && (!DATE.test(ret) || ret < departure)) return 'return must be a date on or after departure, YYYY-MM-DD.';
  const adults = Number(raw.adults ?? 1);
  if (!Number.isInteger(adults) || adults < 1 || adults > 9) return 'adults must be a whole number from 1 to 9.';
  const cabin = String(raw.cabin ?? 'economy');
  if (!CABINS.has(cabin)) return 'cabin must be economy, premium_economy, business or first.';
  return { origin, destination, departure, return: ret, trip_type: tripType, adults, cabin: cabin as FlightSearchParams['cabin'] };
}

/** The dedupe key: the same route, dates, party and cabin is one search for 24 hours. */
export function flightQueryKey(p: FlightSearchParams): string {
  return [p.origin, p.destination, p.departure, p.return || '-', p.adults, p.cabin].join('|');
}

/** A price is a plain number in the provider's own field; a string with a symbol in it is not parsed. */
function plainAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const s = String(v ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);

/** The provider's own error, when every record it returned is an error record rather than a result. */
export function providerError(records: unknown): string | null {
  const list = Array.isArray(records) ? records as Record<string, unknown>[] : [];
  if (!list.length) return null;
  const errors = list.filter((r) => r && typeof r === 'object' && (r.error || r.error_code) && !Array.isArray(r.flights));
  if (errors.length !== list.length) return null;
  const first = errors[0];
  return `The provider could not collect fares: ${String(first.error ?? first.error_code).slice(0, 200)}`;
}

/** Bright Data returns search records each holding `flights`; flatten, keep the provider's currency code, cheapest first. */
export function normalizeOffers(records: unknown): FlightOffer[] {
  const list = Array.isArray(records) ? records : [];
  const offers: FlightOffer[] = [];
  for (const rec of list) {
    const flights = Array.isArray((rec as { flights?: unknown })?.flights) ? (rec as { flights: unknown[] }).flights : [rec];
    for (const f of flights as Record<string, unknown>[]) {
      if (!f || typeof f !== 'object') continue;
      const currency = str(f.currency)?.toUpperCase() ?? null;
      offers.push({
        airline: str(f.airline),
        flight_number: str(f.flight_number),
        departure_time: str(f.departure_time),
        arrival_time: str(f.arrival_time),
        duration_minutes: int(f.duration_minutes),
        stops: int(f.stops),
        price: plainAmount(f.price),
        currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
        price_raw: f.price == null ? null : String(f.price),
      });
    }
  }
  return offers
    .filter((o) => o.airline || o.flight_number)
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}
