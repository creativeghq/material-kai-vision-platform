/** flight-search — Google Flights fares via Bright Data, on the workspace's own key or the free monthly allowance (#398). */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
import { acceptedMonth, flightQueryKey, normalizeOffers, providerError, validateFlightParams } from '../_shared/travel/flight-offers.ts';

const TRAVEL_MODULE = 'travel';
const DATASET_ID = 'gd_mhng7wen1rw0a3gvpf';
const API = 'https://api.brightdata.com/datasets/v3';
const LIMIT_PER_INPUT = 15;
const POST_TIMEOUT_MS = 65_000;
const POLL_AFTER_POST_MS = 15_000;
const REPOLL_MS = 30_000;
const POLL_EVERY_MS = 5_000;

type Caller = { userId: string; workspaceId: string };

async function resolveCaller(supabase: DbClient, req: Request, body: any): Promise<Caller | Response> {
  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : null;
  if (!userId || !workspaceId) return jsonResponse({ success: false, error: 'workspace_id is required' }, 400);
  const allowed = await userHasWorkspaceCapability(supabase, userId, workspaceId, 'workspace.read')
    || await userHasWorkspaceCapability(supabase, userId, workspaceId, 'hr.self');
  if (!allowed) return jsonResponse({ success: false, error: 'Workspace not found' }, 404);
  return { userId, workspaceId };
}

async function brightDataKey(supabase: DbClient, workspaceId: string, source: string): Promise<string | null> {
  if (source === 'byok') {
    const { data, error } = await supabase.rpc('travel_credentials', { p_workspace_id: workspaceId });
    if (error) throw new Error(`Could not read the workspace Bright Data key: ${error.message}`);
    return (data as string | null) ?? null;
  }
  return (await resolveSecret(supabase, 'BRIGHTDATA_API_KEY')).value ?? null;
}

class ProviderError extends Error {}

async function pollSnapshot(key: string, snapshotId: string, budgetMs: number): Promise<unknown[] | null> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/snapshot/${encodeURIComponent(snapshotId)}?format=json`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 200) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) return data;
      throw new ProviderError('The provider returned results in an unknown shape.');
    }
    if (res.status !== 202) throw new ProviderError(`The provider refused the results (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
  }
  return null;
}

/** Records when the provider answered inside the budget; null with a snapshot id when it is still collecting. */
async function runSearch(key: string, p: ReturnType<typeof validateFlightParams> & object): Promise<{ records: unknown[] | null; snapshotId: string | null }> {
  const url = `${API}/scrape?dataset_id=${DATASET_ID}&type=discover_new&discover_by=input_filters&include_errors=true&format=json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: [{
        origin: p.origin, destination: p.destination, departure: p.departure, return: p.return || '',
        trip_type: p.trip_type, adults: p.adults, children: 0, infants_in_seat: 0, infants_on_lap: 0, cabin: p.cabin,
      }],
      limit_per_input: LIMIT_PER_INPUT,
    }),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  }).catch((e) => {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new ProviderError('The provider took too long to answer. The search did not count; try again.');
    }
    throw e;
  });
  if (res.status === 200) {
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) throw new ProviderError('The provider returned results in an unknown shape.');
    return { records: data, snapshotId: null };
  }
  if (res.status === 202) {
    const ack = await res.json().catch(() => null);
    const snapshotId = typeof ack?.snapshot_id === 'string' ? ack.snapshot_id : null;
    if (!snapshotId) throw new ProviderError('The provider accepted the search but gave no snapshot to collect.');
    return { records: await pollSnapshot(key, snapshotId, POLL_AFTER_POST_MS), snapshotId };
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('The Bright Data key was refused. Check it under Profile → Keys (or Admin → Platform secrets for the platform key).');
  throw new ProviderError(`The provider refused the search (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
}

async function logOperatorCost(supabase: DbClient, c: Caller, source: string, records: number, searchId: string) {
  if (source === 'byok' || records <= 0) return;
  const pricing = await getServicePricing(supabase, 'brightdata-flight-record').catch(() => null);
  const raw = pricing ? pricing.cost_per_unit * records : null;
  const { error } = await supabase.from('ai_usage_logs').insert({
    user_id: c.userId, workspace_id: c.workspaceId, operation_type: 'flight_search',
    model_name: 'brightdata-flight-record', api_provider: 'brightdata', input_tokens: 0, output_tokens: 0,
    raw_cost_usd: raw, billed_cost_usd: 0, credits_debited: 0, module_slug: TRAVEL_MODULE,
    unbilled_reason: source === 'root' ? 'platform_overhead' : 'free_allowance',
    metadata: { billing_type: 'per_unit', service: 'brightdata-flight-record', units: records, unit_type: 'record', flight_search_id: searchId },
  });
  if (error) console.warn('[flight-search] cost not logged:', error.message);
}

/** Settles a still-pending search. False when another request already settled it. */
async function finish(supabase: DbClient, searchId: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await supabase.from('flight_searches')
    .update({ ...patch, completed_at: new Date().toISOString() })
    .eq('id', searchId).eq('status', 'pending').select('id');
  if (error) throw new Error(`Could not record the search: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Records → a settled row: provider errors fail it (never counted), results complete it. */
async function settle(supabase: DbClient, c: Caller, searchId: string, source: string, records: unknown[], snapshotId: string | null) {
  const err = providerError(records);
  if (err) {
    await finish(supabase, searchId, { status: 'failed', error: err, records: records.length, snapshot_id: snapshotId });
    throw new ProviderError(err);
  }
  const offers = normalizeOffers(records);
  const won = await finish(supabase, searchId, { status: 'ok', offers, offer_count: offers.length, records: records.length, snapshot_id: snapshotId });
  if (won) await logOperatorCost(supabase, c, source, records.length, searchId);
}

async function readSearch(supabase: DbClient, id: string) {
  const { data, error } = await supabase.from('flight_searches')
    .select('id, status, origin, destination, departure_date, return_date, trip_type, adults, cabin, key_source, offers, offer_count, error, created_at, completed_at')
    .eq('id', id).single();
  if (error) throw new Error(`Could not read the search: ${error.message}`);
  return data;
}

async function handleSearch(supabase: DbClient, c: Caller, body: any): Promise<Response> {
  const month = acceptedMonth(body.local_month);
  if (!month) return jsonResponse({ success: false, error: 'local_month (YYYY-MM, your calendar month) is required' }, 400);
  const p = validateFlightParams(body, String(body.today ?? `${month}-01`));
  if (typeof p === 'string') return jsonResponse({ success: false, error: p }, 400);

  const { data: claim, error: claimErr } = await supabase.rpc('claim_flight_search', {
    p_workspace_id: c.workspaceId, p_user_id: c.userId, p_query_key: flightQueryKey(p), p_params: p, p_month: month,
  });
  if (claimErr) throw new Error(`Could not start the search: ${claimErr.message}`);
  const outcome = claim as { outcome: string; search_id?: string; status?: string; snapshot_id?: string | null; key_source?: string; quota?: unknown };
  if (outcome.outcome === 'quota_exhausted') {
    return jsonResponse({ success: false, code: 'quota_exhausted', error: (outcome.quota as { reason?: string })?.reason, quota: outcome.quota }, 402);
  }
  const searchId = outcome.search_id!;

  if (outcome.outcome === 'cached') {
    if (outcome.status === 'pending' && outcome.snapshot_id) {
      const row = await readSearch(supabase, searchId);
      const key = await brightDataKey(supabase, c.workspaceId, row.key_source);
      if (key) {
        try {
          const records = await pollSnapshot(key, outcome.snapshot_id, REPOLL_MS);
          if (records) await settle(supabase, c, searchId, row.key_source, records, outcome.snapshot_id);
        } catch (e) {
          if (!(e instanceof ProviderError)) throw e;
          await finish(supabase, searchId, { status: 'failed', error: e.message.slice(0, 500) });
        }
      }
    }
    const search = await readSearch(supabase, searchId);
    const collecting = search.status === 'pending';
    return jsonResponse({ success: true, data: { cached: true, still_collecting: collecting, search } }, collecting ? 202 : 200);
  }

  const source = outcome.key_source!;
  try {
    const key = await brightDataKey(supabase, c.workspaceId, source);
    if (!key) throw new ProviderError(source === 'byok'
      ? 'The workspace Bright Data key could not be read. Connect it again under Profile → Keys.'
      : 'Flight search is not configured on this platform yet (no Bright Data key).');
    const { records, snapshotId } = await runSearch(key, p);
    if (!records) {
      const { error: snapErr } = await supabase.from('flight_searches').update({ snapshot_id: snapshotId }).eq('id', searchId);
      if (snapErr) throw new Error(`Could not record the pending search: ${snapErr.message}`);
      return jsonResponse({ success: true, data: { cached: false, still_collecting: true, search: await readSearch(supabase, searchId) } }, 202);
    }
    await settle(supabase, c, searchId, source, records, snapshotId);
    return jsonResponse({ success: true, data: { cached: false, search: await readSearch(supabase, searchId) } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish(supabase, searchId, { status: 'failed', error: msg.slice(0, 500) }).catch(() => {});
    return jsonResponse({ success: false, error: msg, search_id: searchId }, e instanceof ProviderError ? 502 : 500);
  }
}

async function handleCredentials(supabase: DbClient, c: Caller, body: any): Promise<Response> {
  if (!(await userHasWorkspaceCapability(supabase, c.userId, c.workspaceId, 'workspace.manage'))) {
    return jsonResponse({ success: false, error: 'Only a workspace owner or admin can change the Bright Data key.' }, 403);
  }
  if (body.disconnect === true) {
    const { error } = await supabase.from('workspace_travel_credentials').update({ enabled: false, updated_by: c.userId }).eq('workspace_id', c.workspaceId);
    if (error) throw new Error(`Could not disconnect: ${error.message}`);
    return jsonResponse({ success: true, data: { connected: false } });
  }
  const apiKey = String(body.api_key ?? '').trim();
  if (apiKey.length < 16) return jsonResponse({ success: false, error: 'Paste the full Bright Data API token.' }, 400);
  const probe = await fetch(`${API}/snapshots?dataset_id=${DATASET_ID}&limit=1`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!probe || probe.status === 401 || probe.status === 403) {
    return jsonResponse({ success: false, error: 'Bright Data refused that token. Check it has access to the Web Scraper API.' }, 400);
  }
  const { error } = await supabase.rpc('travel_store_credentials', { p_workspace_id: c.workspaceId, p_api_key: apiKey, p_user: c.userId });
  if (error) throw new Error(`Could not save the key: ${error.message}`);
  return jsonResponse({ success: true, data: { connected: true } });
}

Deno.serve(withApiLogging('flight-search', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ success: false, error: 'Invalid JSON' }, 400); }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') as DbClient;
  const caller = await resolveCaller(supabase, req, body);
  if (caller instanceof Response) return caller;
  const ent = await assertEntitled(supabase, caller.workspaceId, TRAVEL_MODULE);
  if (!ent.ok) return ent.response;

  switch (body.action) {
    case 'search': return handleSearch(supabase, caller, body);
    case 'quota': {
      const month = acceptedMonth(body.local_month);
      if (!month) return jsonResponse({ success: false, error: 'local_month (YYYY-MM) is required' }, 400);
      const { data, error } = await supabase.rpc('workspace_flight_search_quota', { p_workspace_id: caller.workspaceId, p_month: month });
      if (error) throw new Error(error.message);
      return jsonResponse({ success: true, data });
    }
    case 'credentials': return handleCredentials(supabase, caller, body);
    default: return jsonResponse({ success: false, error: 'Unknown action. Available: search, quota, credentials' }, 400);
  }
}));
