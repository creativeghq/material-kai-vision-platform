import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import { todayLocalISO } from '@/utils/datetime';
import type { FlightCabin, FlightSearchMode, FlightTripType } from './travelVocabulary';

export interface FlightOffer {
  airline: string | null;
  flight_number: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  duration_minutes: number | null;
  stops: number | null;
  price: number | null;
  currency: string | null;
}

export interface FlightSearch {
  id: string;
  status: 'pending' | 'ok' | 'failed';
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  trip_type: FlightTripType;
  adults: number;
  cabin: FlightCabin;
  key_source: 'root' | 'operator' | 'byok';
  offers: FlightOffer[];
  offer_count: number;
  error: string | null;
  created_at: string;
}

export interface FlightQuota {
  mode: FlightSearchMode;
  used: number | null;
  allowance: number | null;
  remaining: number | null;
  reason: string;
}

export interface FlightSearchInput {
  origin: string;
  destination: string;
  departure: string;
  return?: string;
  adults: number;
  cabin: FlightCabin;
}

export class FlightSearchRefused extends Error {
  constructor(message: string, readonly code: string | null, readonly quota: FlightQuota | null) { super(message); }
}

async function call<T>(body: Record<string, unknown>, fallback: string): Promise<{ status: 'ok' | 'collecting'; data: T }> {
  const today = todayLocalISO();
  const { data, error } = await supabase.functions.invoke('flight-search', { body: { ...body, today, local_month: today.slice(0, 7) } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const payload = ctx ? await ctx.clone().json().catch(() => null) : null;
    if (payload?.code === 'quota_exhausted') throw new FlightSearchRefused(payload.error, payload.code, payload.quota ?? null);
    throw new Error(await edgeErrorMessage(error, fallback));
  }
  if (data?.success === false) throw new FlightSearchRefused(String(data.error ?? fallback), data.code ?? null, data.quota ?? null);
  return { status: data?.data?.still_collecting ? 'collecting' : 'ok', data: data.data as T };
}

export const travelService = {
  async quota(workspaceId: string): Promise<FlightQuota> {
    return (await call<FlightQuota>({ action: 'quota', workspace_id: workspaceId }, 'Could not read the search allowance')).data;
  },
  async search(workspaceId: string, input: FlightSearchInput) {
    const r = await call<{ cached: boolean; search: FlightSearch }>({
      action: 'search', workspace_id: workspaceId, ...input, return: input.return ?? '',
    }, 'Flight search failed');
    return { collecting: r.status === 'collecting', cached: r.data.cached, search: r.data.search };
  },
  async saveKey(workspaceId: string, apiKey: string): Promise<void> {
    await call({ action: 'credentials', workspace_id: workspaceId, api_key: apiKey }, 'Could not save the key');
  },
  async disconnect(workspaceId: string): Promise<void> {
    await call({ action: 'credentials', workspace_id: workspaceId, disconnect: true }, 'Could not disconnect');
  },
  async credential(workspaceId: string): Promise<{ key_hint: string | null; enabled: boolean; verified_at: string | null } | null> {
    const { data, error } = await supabase.from('workspace_travel_credentials' as never)
      .select('key_hint, enabled, verified_at').eq('workspace_id', workspaceId).maybeSingle();
    if (error) throw error;
    return (data as { key_hint: string | null; enabled: boolean; verified_at: string | null } | null) ?? null;
  },
};
