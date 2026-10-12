/** canonicalize-attributes — proxy to MIVAA's facet canonicalizer: one product (default) or the re-canonicalization sweep. */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';

const MIVAA_EXTERNAL_URL = 'https://v1api.materialshub.gr';

const reply = (body: unknown, status: number) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

/** Local first (same-host fast path), then the service URL. A failure is a 502, never a 200 with an error field. */
async function callMivaa(path: string, payload: Record<string, unknown>, failure: string): Promise<Response> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const apiKey = (await resolveSecret(supabase, 'MIVAA_API_KEY')).value;
  const urls = [
    Deno.env.get('MIVAA_LOCAL_URL') || 'http://127.0.0.1:8000',
    Deno.env.get('MIVAA_SERVICE_URL') || MIVAA_EXTERNAL_URL,
  ].filter((u, i, arr) => u && arr.indexOf(u) === i);

  let lastError = 'no upstream attempted';
  for (const baseUrl of urls) {
    try {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (resp.ok) return reply(text, 200);
      lastError = `${baseUrl} -> ${resp.status}: ${text.slice(0, 240)}`;
    } catch (err) {
      lastError = `${baseUrl} -> threw: ${(err as Error).message}`;
    }
  }
  return reply({ error: failure, details: lastError }, 502);
}

function canonicalize(body: Record<string, unknown>): Promise<Response> | Response {
  if (!body.raw_attributes || typeof body.raw_attributes !== 'object') {
    return reply({ error: 'raw_attributes must be an object' }, 400);
  }
  if (typeof body.source !== 'string' || !body.source) {
    return reply({ error: 'source string required' }, 400);
  }
  const payload: Record<string, unknown> = { raw_attributes: body.raw_attributes, source: body.source };
  if (body.product_id) payload.product_id = body.product_id;
  if (body.workspace_id) payload.workspace_id = body.workspace_id;
  return callMivaa('/api/admin/facets/canonicalize', payload, 'canonicalize upstream failed');
}

/** Replays products.attributes_raw. degraded_only unless explicitly false — a full sweep is a Voyage call per raw value. */
function recanonicalize(body: Record<string, unknown>): Promise<Response> {
  const payload: Record<string, unknown> = {
    degraded_only: body.degraded_only !== false,
    max_products: Math.min(Math.max(Number(body.max_products) || 200, 1), 5000),
    batch_size: Math.min(Math.max(Number(body.batch_size) || 25, 1), 200),
  };
  if (body.workspace_id) payload.workspace_id = body.workspace_id;
  if (body.target_version != null) payload.target_version = body.target_version;
  return callMivaa('/api/admin/facets/recanonicalize', payload, 'recanonicalize upstream failed');
}

Deno.serve(withApiLogging('canonicalize-attributes', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  // Forwards to MIVAA admin routes under the platform key: an open proxy here is open Voyage spend.
  if (!isCronAuthorized(req)) return reply({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return reply({ error: 'invalid JSON body' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return reply({ error: 'body must be a JSON object' }, 400);
  }

  const action = body.action ?? 'canonicalize';
  switch (action) {
    case 'canonicalize':
      return canonicalize(body);
    case 'recanonicalize':
      return recanonicalize(body);
    default:
      return reply({ error: `Unknown action '${String(action)}'. Available: canonicalize, recanonicalize` }, 400);
  }
}));
