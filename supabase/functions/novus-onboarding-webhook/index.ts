// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { novusBaseUrl } from '../_shared/fiscal/novus.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// Novus onboarding events. The payload is a nudge — every event is answered by a re-read.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(withApiLogging('novus-onboarding-webhook', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const [secretRes, endpointRes] = await Promise.all([
    resolveSecret(supabase, 'NOVUS_WEBHOOK_SECRET'),
    resolveSecret(supabase, 'NOVUS_WEBHOOK_ENDPOINT_ID'),
  ]);
  const secret = secretRes.value ?? '';
  const registered = !!(endpointRes.value ?? '');

  // Unregistered => 404: the wrapper Sentries every 5xx, so fail-closing 503 files one per scanner (KAI-W0).
  if (!secret) {
    return registered
      ? json({ error: 'Novus webhook secret missing for a registered endpoint — re-register to mint a new one.' }, 503)
      : json({ error: 'Not found.' }, 404);
  }

  const raw = await req.text();
  const header = req.headers.get('X-Novus-Signature') ?? '';
  const eventId = req.headers.get('X-Novus-Event-Id') ?? '';
  const expected = await hmacHex(secret, raw);
  if (!timingSafeEqual(header.replace(/^sha256=/, '').trim().toLowerCase(), expected)) {
    return json({ error: 'Invalid signature.' }, 401);
  }
  if (!eventId) return json({ error: 'Missing required header X-Novus-Event-Id.' }, 400);

  let payload: any;
  try { payload = JSON.parse(raw || '{}'); } catch { return json({ error: 'Malformed JSON body.' }, 400); }
  const requestId = payload?.data?.requestId ?? null;

  const { data: row } = await supabase
    .from('workspace_einvoice_onboarding').select('id, workspace_id')
    .eq('novus_request_id', requestId).maybeSingle();

  const { error: insErr } = await supabase.from('novus_webhook_events').insert({
    event_id: eventId,
    event: payload?.event ?? 'unknown',
    novus_request_id: requestId,
    workspace_id: row?.workspace_id ?? null,
    payload,
  });
  if (insErr?.code === '23505') return json({ received: true, duplicate: true });

  if (!row) {
    await supabase.from('novus_webhook_events')
      .update({ reconcile_error: 'No workspace holds this request id.' }).eq('event_id', eventId);
    return json({ received: true });
  }

  const [keyRes, sandboxRes, baseRes] = await Promise.all([
    resolveSecret(supabase, 'NOVUS_API_KEY'),
    resolveSecret(supabase, 'NOVUS_SANDBOX'),
    resolveSecret(supabase, 'NOVUS_API_BASE_URL'),
  ]);
  const baseUrl = baseRes.value || novusBaseUrl((sandboxRes.value ?? 'true') !== 'false');

  try {
    const res = await fetch(`${baseUrl}/api/v1/requests/${requestId}`, {
      headers: { 'API-KEY': keyRes.value ?? '', Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    const b = await res.json();
    if (!res.ok || !b?.success) throw new Error(b?.error?.message ?? `HTTP ${res.status}`);
    const d = b.data;
    const c = d.contract ?? null, p = d.provisioning ?? null, a = d.aadeStatement ?? null;
    await supabase.from('workspace_einvoice_onboarding').update({
      request_type: d.requestType ?? null,
      status: d.status ?? null,
      message: d.message ?? null,
      vat_number: d.vatNumber ?? null,
      contract_number: c?.contractNumber ?? null,
      contract_date: c?.contractDate ?? null,
      contract_template_version: c?.templateVersion ?? null,
      contract_signed_version: c?.signedVersion ?? null,
      contract_sha256: c?.sha256 ?? null,
      provisioning_status: p?.status ?? null,
      provisioning_client_added: p?.clientAdded ?? null,
      provisioning_client_linked: p?.clientLinked ?? null,
      provisioning_contract_uploaded: p?.contractUploaded ?? null,
      provisioning_statement_sent: p?.statementSent ?? null,
      provisioning_error: p?.error ?? null,
      aade_statement_status: a?.status ?? null,
      aade_accept_date: a?.acceptDate ?? null,
      last_synced_at: new Date().toISOString(),
      sync_error: null,
    }).eq('id', row.id);
    await supabase.from('novus_webhook_events')
      .update({ reconciled_at: new Date().toISOString() }).eq('event_id', eventId);
  } catch (e) {
    // 2xx anyway — the event is recorded, and a retry storm would not fix a Novus outage.
    await supabase.from('novus_webhook_events')
      .update({ reconcile_error: (e as Error).message }).eq('event_id', eventId);
  }

  return json({ received: true });
}));
