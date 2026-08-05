/**
 * Revolut Business webhooks v2 receiver (#315).
 *
 * Registered per-workspace by `revolut-api?action=register-webhook` with the URL
 * `.../revolut-webhooks?ws=<workspace_id>` — the query param picks the config row whose
 * `webhook_signing_secret` verifies this delivery. Signature scheme (webhooks v2):
 *
 *   signed payload = "v1." + Revolut-Request-Timestamp + "." + raw body
 *   Revolut-Signature: v1=<hex HMAC-SHA256(signing_secret, signed payload)>
 *
 * Doctrine (mirrors stripe-webhooks, CLAUDE.md invariant 6):
 *   - missing signature/timestamp header → 400
 *   - workspace has no stored signing secret → 503 FAIL CLOSED, never process unsigned
 *   - bad signature or stale timestamp (>5 min) → 400
 *   - unknown ws → 200 {ignored} so the endpoint can't be probed for live workspaces
 *   - handler faults → 5xx so Revolut retries; non-actionable events → 200
 *
 * The webhook is a TRIGGER for silver-layer upserts only — reconciliation into the money
 * tables stays in its own explicit step. No CORS on purpose: browsers never call this.
 */

// deno-lint-ignore-file no-explicit-any

import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveRevolutConfig } from '../_shared/revolut/client.ts';
import { legToRow, loadAccountMapping } from '../_shared/revolut/sync-core.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(withApiLogging('revolut-webhooks', async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  await bootstrapForFunction();

  const { createClient } = await import('@supabase/supabase-js');
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const ws = new URL(req.url).searchParams.get('ws') ?? '';
  const rawBody = await req.text();
  const signature = req.headers.get('Revolut-Signature');
  const timestamp = req.headers.get('Revolut-Request-Timestamp');

  // Malformed request shape — reject before any tenant lookup.
  if (!signature || !timestamp) return json({ error: 'missing signature headers' }, 400);

  // Unknown/absent workspace: bland 200 so the endpoint can't be used to enumerate ids.
  const cfg = ws ? await resolveRevolutConfig(service, ws) : null;
  if (!cfg) return json({ ok: true, ignored: true });

  // FAIL CLOSED: a workspace that never completed webhook registration has no secret;
  // an unsigned/unverifiable delivery must never be processed as if it were real.
  if (!cfg.webhook_signing_secret) return json({ error: 'revolut_webhook_not_configured' }, 503);

  // Replay window: 5 minutes either side (header is unix milliseconds).
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 300_000) {
    return json({ error: 'timestamp outside tolerance' }, 400);
  }

  // Signature check in its OWN failure domain: a bad signature is a 400 (attacker or
  // misconfig — do not retry), a handler fault below is a 5xx (Revolut should retry).
  const expected = await hmacHex(cfg.webhook_signing_secret, `v1.${timestamp}.${rawBody}`);
  const provided = signature.startsWith('v1=') ? signature.slice(3) : signature;
  if (!timingSafeEqual(expected, provided.toLowerCase())) {
    return json({ error: 'invalid signature' }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const type = String(event?.event ?? '');
  const data = event?.data ?? {};

  try {
    if (type === 'TransactionCreated') {
      // Payload carries the full transaction; upsert its legs like a sync batch would.
      const tx = data;
      if (!tx?.id || !Array.isArray(tx?.legs)) return json({ ok: true, ignored: true });
      const mapping = await loadAccountMapping(service, cfg.workspace_id);
      const rows = tx.legs.map((leg: any) => legToRow(cfg.workspace_id, tx, leg, mapping));
      const { error } = await service
        .from('revolut_bank_transactions')
        .upsert(rows, { onConflict: 'workspace_id,provider_ref' });
      if (error) return json({ error: 'ingest failed' }, 500);
      return json({ ok: true, upserted: rows.length });
    }

    if (type === 'TransactionStateChanged') {
      const txId = String(data?.id ?? '');
      const newState = String(data?.new_state ?? '');
      if (!txId || !newState) return json({ ok: true, ignored: true });
      const { error } = await service
        .from('revolut_bank_transactions')
        .update({ state: newState, updated_at: new Date().toISOString() })
        .eq('workspace_id', cfg.workspace_id)
        .eq('transaction_id', txId);
      if (error) return json({ error: 'state update failed' }, 500);
      return json({ ok: true });
    }

    if (type === 'PayoutLinkCreated' || type === 'PayoutLinkStateChanged') {
      // Keep the payout audit's state live (created → claimed/expired/cancelled).
      const linkId = String(data?.id ?? '');
      const newState = String(data?.new_state ?? data?.state ?? '');
      if (!linkId || !newState) return json({ ok: true, ignored: true });
      const { error } = await service
        .from('revolut_payouts')
        .update({ state: newState, updated_at: new Date().toISOString() })
        .eq('workspace_id', cfg.workspace_id)
        .eq('kind', 'payout_link')
        .eq('provider_id', linkId);
      if (error) return json({ error: 'payout state update failed' }, 500);
      return json({ ok: true });
    }

    // Event types we did not subscribe to (or new ones) — acknowledge, stop retries.
    return json({ ok: true, ignored: true });
  } catch (err) {
    console.error('[revolut-webhooks] handler fault:', err instanceof Error ? err.message : err);
    return json({ error: 'internal' }, 500);
  }
}));
