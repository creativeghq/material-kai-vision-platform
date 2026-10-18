/** Travel tools — find a flight, and cost it onto the user's trip card as a planned line (#398). Booking is never a tool. */

const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
import { moduleGate } from './module-gate.ts';
import { serviceClient } from '../supabase-client.ts';
import { FLIGHT_CABINS, FLIGHT_CABIN_LABELS, type FlightCabin } from '../travel/travelVocabulary.generated.ts';

const TRAVEL_MODULE = 'travel';

async function callFlightSearch(body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/flight-search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(140_000),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

export const createSearchFlightsTool = (userId: string, workspaceId: string, today: string, onChunk?: (c: any) => void) =>
  tool(async ({ origin, destination, departure, return_date, adults, cabin }) => {
    const denied = await moduleGate(workspaceId, TRAVEL_MODULE);
    if (denied) {
      onChunk?.({ type: 'flight_offers_card', status: 'failed', error: JSON.parse(denied).error });
      return denied;
    }
    const { status, json } = await callFlightSearch({
      action: 'search', user_id: userId, workspace_id: workspaceId, local_month: today.slice(0, 7), today,
      origin, destination, departure, return: return_date ?? '', adults: adults ?? 1, cabin: cabin ?? 'economy',
    });
    if (!json?.success) {
      const error = json?.error || `Flight search failed (HTTP ${status}).`;
      onChunk?.({ type: 'flight_offers_card', status: json?.code === 'quota_exhausted' ? 'quota_exhausted' : 'failed', error, quota: json?.quota ?? null });
      return JSON.stringify({ success: false, code: json?.code, error });
    }
    const s = json.data.search;
    onChunk?.({
      type: 'flight_offers_card', status: json.data.still_collecting ? 'collecting' : s.status,
      search_id: s.id, origin: s.origin, destination: s.destination, departure_date: s.departure_date,
      return_date: s.return_date, adults: s.adults, cabin: s.cabin, cached: json.data.cached, offers: s.offers ?? [],
    });
    if (json.data.still_collecting) {
      return JSON.stringify({ success: true, still_collecting: true, search_id: s.id, message: 'The provider is still collecting fares. Ask again in a minute; the same search will not count twice.' });
    }
    return JSON.stringify({
      success: true, search_id: s.id, cached: json.data.cached, offer_count: s.offer_count,
      cheapest: (s.offers ?? []).slice(0, 5).map((o: any, i: number) => ({ index: i, airline: o.airline, flight_number: o.flight_number, departure_time: o.departure_time, arrival_time: o.arrival_time, stops: o.stops, price: o.price, currency: o.currency })),
      note: 'Fares are what Google Flights showed now; nothing is booked. To cost one onto a trip card, call add_flight_to_trip_card with search_id and the offer index.',
    });
  }, {
    name: 'search_flights',
    description: 'Search Google Flights fares for a route and dates (3-letter IATA airport codes). Read-only: it finds prices, it never books. Two successful searches a month are free unless the workspace has its own Bright Data key; the same search within 24 hours is free.',
    schema: z.object({
      origin: z.string().describe('Origin airport, 3-letter IATA code, e.g. ATH'),
      destination: z.string().describe('Destination airport, 3-letter IATA code, e.g. FCO'),
      departure: z.string().describe('Outbound date, YYYY-MM-DD'),
      return_date: z.string().optional().describe('Return date, YYYY-MM-DD. Leave out for one way.'),
      adults: z.number().int().optional().describe('Passengers, 1 to 9 (default 1)'),
      cabin: z.enum(FLIGHT_CABINS).optional().describe('Cabin class (default economy)'),
    }),
  });

export const createAddFlightToTripCardTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async ({ search_id, offer_index, card_id }) => {
    const denied = await moduleGate(workspaceId, TRAVEL_MODULE);
    if (denied) return denied;
    const sb = serviceClient();
    const { data: search } = await sb.from('flight_searches')
      .select('id, origin, destination, departure_date, cabin, adults, offers, status')
      .eq('id', search_id).eq('workspace_id', workspaceId).maybeSingle();
    if (!search || search.status !== 'ok') return JSON.stringify({ success: false, error: 'That flight search was not found or has no results.' });
    const offer = (search.offers as any[])?.[offer_index];
    if (!offer) return JSON.stringify({ success: false, error: `There is no offer ${offer_index} in that search.` });
    if (!(offer.price > 0) || !offer.currency) return JSON.stringify({ success: false, error: 'That offer has no price in a known currency, so it cannot be costed.' });

    let q = sb.from('trip_expense_reports').select('id, title, status').eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'draft');
    q = card_id ? q.eq('id', card_id) : q.order('created_at', { ascending: false }).limit(1);
    const { data: cards } = await q;
    const card = cards?.[0];
    if (!card) return JSON.stringify({ success: false, error: 'No draft trip card of yours to add it to. Create one first.' });

    const { error } = await sb.from('trip_expense_items').insert({
      report_id: card.id, expense_date: search.departure_date, category: 'transport',
      vendor: offer.airline, amount: offer.price, estimated_amount: offer.price, currency: offer.currency,
      description: `Flight ${search.origin}→${search.destination}${offer.flight_number ? ` · ${offer.flight_number}` : ''} · ${FLIGHT_CABIN_LABELS[search.cabin as FlightCabin] ?? search.cabin}${search.adults > 1 ? ` · ${search.adults} pax` : ''}`,
      commitment: 'planned', flight_search_id: search.id, payment_method: 'personal',
    });
    if (error) return JSON.stringify({ success: false, error: `Could not add the flight: ${error.message}` });
    onChunk?.({ type: 'trip_expense_added', data: { card_id: card.id } });
    return JSON.stringify({
      success: true, card_id: card.id, card_title: card.title,
      message: 'Added as a PLANNED line (an estimate, nothing booked). Submit the card to ask finance for approval; once approved, book it and enter the real price on the card (Finance → Trip Cards, or My Expenses).',
    });
  }, {
    name: 'add_flight_to_trip_card',
    description: 'Put one fare from a search_flights result onto the user\'s draft trip card as a PLANNED line, so finance can approve it before anyone books. Never books a ticket.',
    schema: z.object({
      search_id: z.string().describe('search_id returned by search_flights'),
      offer_index: z.number().int().describe('Index of the offer in that search (0 = cheapest)'),
      card_id: z.string().optional().describe('Draft trip card id; defaults to the user\'s latest draft card'),
    }),
  });
