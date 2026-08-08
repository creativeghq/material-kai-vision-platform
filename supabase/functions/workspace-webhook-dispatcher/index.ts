/**
 * Outbound tenant webhook dispatcher (#330).
 *
 * `flow-engine` enqueues a delivery row per subscribed endpoint the moment an event fires; this
 * cron does the actual POST. The split matters: a tenant endpoint can be slow, down, or hostile,
 * and none of that may be allowed to slow or fail the business transaction that emitted the
 * event.
 *
 * Three things this has to get right, none of them optional:
 *
 *  1. **SSRF.** The URL is tenant-supplied — the canonical hostile input. It goes through the
 *     shared guard at delivery time, not merely at registration: DNS can be re-pointed at
 *     169.254.169.254 after the row is stored. `redirect: 'error'` because a public URL can 302
 *     to a blocked address after the check passes.
 *  2. **Signature.** HMAC-SHA256 over `{timestamp}.{body}`, so a receiver can verify both the
 *     payload and its freshness. Signing over the body alone would let anyone replay a captured
 *     delivery forever.
 *  3. **Bounded retries.** Exponential backoff, a hard attempt cap, and auto-disable after
 *     enough consecutive failures — a dead endpoint must stop generating work rather than
 *     retrying until the table fills.
 *
 * Cron: invoke with header `x-cron-secret: <CRON_SECRET>`.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from '../_shared/secrets.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Give up on a single delivery after this many attempts. */
const MAX_ATTEMPTS = 6;
/** Disable the endpoint entirely after this many consecutive failed deliveries. */
const DISABLE_AFTER_CONSECUTIVE_FAILURES = 20;
/** Per-request timeout. A tenant endpoint that hangs must not hold a worker. */
const REQUEST_TIMEOUT_MS = 10_000;
/** How much of the response body to keep for the tenant's delivery log. */
const RESPONSE_SNIPPET_LIMIT = 2_000;
/** Deliveries handled per tick. */
const BATCH = 50;

/** Exponential backoff with a ceiling: 1m, 5m, 25m, 2h, 6h (capped). */
function backoffMinutes(attempt: number): number {
  return Math.min(360, 1 * Math.pow(5, Math.max(0, attempt - 1)));
}

async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(withApiLogging('workspace-webhook-dispatcher', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Fail closed: an unset CRON_SECRET must reject rather than skip the check.
  const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'unauthorized' }, 401);

  const results = { claimed: 0, delivered: 0, retrying: 0, failed: 0, dropped: 0, endpoints_disabled: 0 };

  const { data: due } = await supabase
    .from('workspace_webhook_deliveries')
    .select('id, webhook_id, workspace_id, event_type, payload, attempt')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH);

  results.claimed = (due ?? []).length;

  for (const d of due ?? []) {
    const attempt = Number(d.attempt) + 1;

    // Re-read the endpoint per delivery: it may have been disabled or re-pointed since enqueue,
    // and the secret lives here (service role is the only reader).
    const { data: hook } = await supabase
      .from('workspace_webhooks')
      .select('id, url, secret, is_active, consecutive_failures')
      .eq('id', d.webhook_id)
      .maybeSingle();

    if (!hook || !hook.is_active) {
      // The tenant turned it off (or deleted it) after the event was queued. Dropping is
      // correct — but it is recorded, because "nothing arrived" must be explainable.
      await supabase.from('workspace_webhook_deliveries').update({
        status: 'dropped', attempt,
        error: hook ? 'Endpoint disabled before delivery' : 'Endpoint no longer exists',
      }).eq('id', d.id);
      results.dropped++;
      continue;
    }

    const body = JSON.stringify(d.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let httpStatus: number | null = null;
    let snippet: string | null = null;
    let error: string | null = null;
    let ok = false;

    try {
      // Guarded at DELIVERY time, not just registration: DNS behind a stored hostname can be
      // re-pointed at an internal address long after the row was written.
      const safeUrl = await assertSafeUrl(hook.url, { allowSchemes: ['https:', 'http:'] });
      const signature = await sign(hook.secret, timestamp, body);

      const res = await fetch(safeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MaterialKai-Webhooks/1',
          'X-MaterialKai-Event': d.event_type,
          'X-MaterialKai-Delivery': d.id,
          'X-MaterialKai-Timestamp': timestamp,
          'X-MaterialKai-Signature': `sha256=${signature}`,
        },
        body,
        // A public URL can 302 to a blocked address after the guard passed.
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      httpStatus = res.status;
      snippet = (await res.text().catch(() => '')).slice(0, RESPONSE_SNIPPET_LIMIT) || null;
      ok = res.ok;
      if (!ok) error = `Endpoint returned HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof SSRFError ? `Blocked by SSRF guard: ${e.message}` : String(e);
    }

    if (ok) {
      await supabase.from('workspace_webhook_deliveries').update({
        status: 'delivered', attempt, http_status: httpStatus,
        response_snippet: snippet, error: null, delivered_at: new Date().toISOString(),
      }).eq('id', d.id);
      await supabase.from('workspace_webhooks').update({
        consecutive_failures: 0,
        last_delivery_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
      }).eq('id', hook.id);
      results.delivered++;
      continue;
    }

    // An SSRF rejection is not a transient network blip — retrying cannot make a blocked
    // address safe, so it fails immediately rather than burning six attempts.
    const permanent = error?.startsWith('Blocked by SSRF guard');
    const exhausted = permanent || attempt >= MAX_ATTEMPTS;

    await supabase.from('workspace_webhook_deliveries').update({
      status: exhausted ? 'failed' : 'pending',
      attempt,
      http_status: httpStatus,
      response_snippet: snippet,
      error,
      next_attempt_at: exhausted
        ? new Date().toISOString()
        : new Date(Date.now() + backoffMinutes(attempt) * 60_000).toISOString(),
    }).eq('id', d.id);

    if (exhausted) results.failed++; else results.retrying++;

    const consecutive = Number(hook.consecutive_failures) + 1;
    const disable = consecutive >= DISABLE_AFTER_CONSECUTIVE_FAILURES;
    await supabase.from('workspace_webhooks').update({
      consecutive_failures: consecutive,
      last_delivery_at: new Date().toISOString(),
      ...(disable
        ? { is_active: false, disabled_reason: `Auto-disabled after ${consecutive} consecutive failures. Fix the endpoint and re-enable.` }
        : {}),
    }).eq('id', hook.id);
    if (disable) results.endpoints_disabled++;
  }

  return json({ ok: true, ...results });
}));
