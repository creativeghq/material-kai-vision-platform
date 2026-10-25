/** dataforseo-reconcile — nightly: what DataForSEO says it charged, per day and endpoint, plus the balance. */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const BASE_URL = 'https://api.dataforseo.com';
const APIS = [
  'serp', 'dataforseo_labs', 'backlinks', 'on_page', 'ai_optimization', 'merchant',
  'business_data', 'keywords_data', 'domain_analytics', 'content_analysis', 'app_data',
];
const PAGE = 1000;
const MAX_DAYS = 30;
const DEADLINE_MS = 120_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface IdListItem { cost?: number; datetime_posted?: string; metadata?: { function?: string } }

async function dfsPost(auth: string, path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

/** One API's tasks in the window. A rejected request throws: a missing API must not read as zero spend. */
async function listTasks(auth: string, api: string, from: string, to: string, deadline: number): Promise<IdListItem[]> {
  const out: IdListItem[] = [];
  for (let offset = 0; ; offset += PAGE) {
    if (Date.now() > deadline) throw new Error(`${api}: out of time at offset ${offset}`);
    const d = await dfsPost(auth, `/v3/${api}/id_list`, [{
      datetime_from: from, datetime_to: to, limit: PAGE, offset, sort: 'asc', include_metadata: true,
    }]);
    const task = d?.tasks?.[0];
    if (task?.status_code !== 20000) throw new Error(`${api}: ${task?.status_code} ${task?.status_message}`);
    const res = task.result ?? [];
    const items: IdListItem[] = res[0] && 'items' in res[0] ? (res[0].items ?? []) : res;
    out.push(...items);
    if (items.length < PAGE) return out;
  }
}

Deno.serve(withApiLogging('dataforseo-reconcile', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
  await bootstrapForFunction();

  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  let body: { days?: number } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const days = Math.min(Math.max(Number(body.days) || 2, 1), MAX_DAYS);

  const [login, password] = await Promise.all([
    resolveSecret(supabase, 'DATAFORSEO_LOGIN'), resolveSecret(supabase, 'DATAFORSEO_PASSWORD'),
  ]);
  if (!login.value || !password.value) return json({ ok: false, error: 'DataForSEO credentials are not configured' }, 503);
  const auth = `Basic ${btoa(`${login.value}:${password.value}`)}`;

  const now = new Date();
  const to = new Date(now.getTime() - 2 * 60_000);
  const fromDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const stamp = (d: Date) => `${d.toISOString().slice(0, 19).replace('T', ' ')} +00:00`;
  const deadline = Date.now() + DEADLINE_MS;

  const totals = new Map<string, { provider: string; day: string; api: string; function: string; calls: number; cost_usd: number }>();
  const failed: string[] = [];
  for (const api of APIS) {
    try {
      for (const t of await listTasks(auth, api, stamp(fromDay), stamp(to), deadline)) {
        const day = String(t.datetime_posted ?? '').slice(0, 10);
        if (!day) continue;
        const fn = t.metadata?.function ?? 'unknown';
        const key = `${day}|${api}|${fn}`;
        const row = totals.get(key) ?? { provider: 'dataforseo', day, api, function: fn, calls: 0, cost_usd: 0 };
        row.calls += 1;
        row.cost_usd += Number(t.cost) || 0;
        totals.set(key, row);
      }
    } catch (e) {
      failed.push((e as Error).message);
    }
  }

  const rows = [...totals.values()].map((r) => ({ ...r, cost_usd: Math.round(r.cost_usd * 1e5) / 1e5, fetched_at: new Date().toISOString() }));
  if (rows.length) {
    const { error } = await supabase.from('provider_spend_daily').upsert(rows, { onConflict: 'provider,day,api,function' });
    if (error) return json({ ok: false, error: `provider_spend_daily not stored: ${error.message}` }, 500);
  }

  const userData = await fetch(`${BASE_URL}/v3/appendix/user_data`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(25_000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`user_data HTTP ${r.status}`))))
    .catch((e: Error) => ({ error: e.message }));
  const money = userData?.tasks?.[0]?.result?.[0]?.money;
  if (typeof money?.balance !== 'number') {
    return json({ ok: false, error: `balance not read: ${userData?.error ?? 'no money block in user_data'}`, failed }, 502);
  }
  const { error: snapErr } = await supabase.from('provider_balance_snapshots').insert({
    provider: 'dataforseo',
    balance_usd: money.balance,
    total_deposited_usd: typeof money.total === 'number' ? money.total : null,
    spent_today_usd: typeof money.statistics?.day?.total === 'number' ? money.statistics.day.total : null,
  });
  if (snapErr) return json({ ok: false, error: `balance snapshot not stored: ${snapErr.message}` }, 500);

  return json({ ok: failed.length === 0, days, rows: rows.length, balance_usd: money.balance, failed });
}));
