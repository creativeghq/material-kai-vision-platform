import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';
import {
  acceptedMonth, flightQueryKey, normalizeOffers, providerError, validateFlightParams,
} from '../../supabase/functions/_shared/travel/flight-offers';

const EDGE = 'supabase/functions/flight-search/index.ts';
const TOOLS = 'supabase/functions/_shared/tools/travel-tools.ts';
const UI = ['src/modules/travel/travelService.ts', 'src/modules/travel/components/FlightSearchPanel.tsx', 'src/modules/travel/components/BrightDataKeyCard.tsx'];

describe('flight search allowance (#398)', () => {
  it('the allowance has ONE derivation: SQL, read through the quota action', () => {
    const edge = strippedSource(EDGE);
    expect(edge).toContain("supabase.rpc('claim_flight_search'");
    expect(edge).toContain("supabase.rpc('workspace_flight_search_quota'");
    for (const f of [EDGE, TOOLS, ...UI]) {
      expect(strippedSource(f), `${f} restates the allowance`).not.toMatch(/(remaining|used|allowance)\s*[<>=!]=*\s*2\b|\b2\s*[<>]=?\s*(used|remaining)/);
    }
  });

  it('a made-up month is refused, the calendar month either side of UTC is accepted', () => {
    const now = Date.parse('2026-10-31T23:30:00Z');
    expect(acceptedMonth('2026-10', now)).toBe('2026-10');
    expect(acceptedMonth('2026-11', now)).toBe('2026-11');
    expect(acceptedMonth('2026-12', now)).toBeNull();
    expect(acceptedMonth('2025-10', now)).toBeNull();
    expect(acceptedMonth('nope', now)).toBeNull();
  });

  it('params are validated, and one route/date/party/cabin is one dedupe key', () => {
    expect(validateFlightParams({ origin: 'ath', destination: 'fco', departure: '2026-11-10' }, '2026-10-18'))
      .toMatchObject({ origin: 'ATH', destination: 'FCO', trip_type: 'one_way', adults: 1, cabin: 'economy' });
    expect(typeof validateFlightParams({ origin: 'ATH', destination: 'ATH', departure: '2026-11-10' }, '2026-10-18')).toBe('string');
    expect(typeof validateFlightParams({ origin: 'ATH', destination: 'FCO', departure: '2026-10-01' }, '2026-10-18')).toBe('string');
    expect(typeof validateFlightParams({ origin: 'ATH', destination: 'FCO', departure: '2026-11-10', return: '2026-11-01' }, '2026-10-18')).toBe('string');
    const a = validateFlightParams({ origin: 'ATH', destination: 'FCO', departure: '2026-11-10', adults: 2 }, '2026-10-18');
    const b = validateFlightParams({ origin: 'ath', destination: 'fco', departure: '2026-11-10', adults: 2 }, '2026-10-18');
    expect(typeof a).toBe('object');
    expect(flightQueryKey(a as never)).toBe(flightQueryKey(b as never));
  });

  it('a price comes from the provider amount and currency code, never parsed out of a symbol', () => {
    const offers = normalizeOffers([{
      flights: [
        { airline: 'Aegean', price: '189.00', currency: 'eur', stops: 0 },
        { airline: 'ITA', price: '€120', currency: 'EUR' },
        { airline: 'Sky', price: '99.5', currency: 'EURO' },
      ],
    }]);
    expect(offers.find((o) => o.airline === 'Aegean')).toMatchObject({ price: 189, currency: 'EUR' });
    expect(offers[0].airline).toBe('Sky');
    const ita = offers.find((o) => o.airline === 'ITA');
    expect(ita?.price).toBeNull();
    expect(offers.find((o) => o.airline === 'Sky')?.currency).toBeNull();
  });

  it('a response made only of error records is a failure, never "no fares"', () => {
    expect(providerError([{ error: 'blocked', input: {} }])).toMatch(/blocked/);
    expect(providerError([{ error: 'x' }, { flights: [] }])).toBeNull();
    expect(providerError([])).toBeNull();
  });

  it('a failed provider call settles the claim as failed, so it never counts', () => {
    const edge = strippedSource(EDGE);
    expect(edge).toMatch(/status: 'failed'/);
    expect(edge.indexOf("supabase.rpc('claim_flight_search'")).toBeLessThan(edge.indexOf('await runSearch('));
  });

  it('booking is never an agent tool, and both tools ask the travel module gate', () => {
    const tools = strippedSource(TOOLS);
    expect(tools).not.toMatch(/name: 'book_/);
    expect((tools.match(/moduleGate\(workspaceId, TRAVEL_MODULE\)/g) ?? []).length).toBe(2);
  });
});
