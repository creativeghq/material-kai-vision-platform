/**
 * facets-recanonicalize
 *
 * Proxy for MIVAA's POST /api/admin/facets/recanonicalize — the bulk facet
 * re-canonicalization sweep (#316). Same shape and reasoning as the
 * canonicalize-attributes proxy next door: the MIVAA URL and admin key stay in one
 * place, and the endpoint stays admin-only upstream without every caller carrying
 * credentials.
 *
 * Two callers, and the difference between them matters:
 *
 *   1. The nightly cron (`facets-recanonicalize-degraded`), which sends
 *      `degraded_only: true`. Those products are broken RIGHT NOW — their canonical
 *      attributes are empty because a dependency failed, not because they have no
 *      facets, so they are invisible to every facet filter until replayed. Retrying
 *      them is unambiguously correct and cheap: an outage's worth of rows, not a
 *      catalog.
 *
 *   2. A human, after changing canonicalization RULES (similarity threshold, a curated
 *      alias from /lock, a golden-set correction). That is the full sweep, it costs a
 *      Voyage embedding per raw value across the entire catalog, and it is deliberately
 *      NOT automated. Bump CURRENT_FACET_CANONICALIZATION_VERSION in MIVAA, then drive
 *      this endpoint until `remaining` reaches 0.
 *
 * The defaults here encode that split: `degraded_only` defaults to TRUE. A caller who
 * wants to spend money on a full catalog sweep has to say so explicitly.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';

const MIVAA_LOCAL_URL = Deno.env.get('MIVAA_LOCAL_URL') || 'http://127.0.0.1:8000';
const MIVAA_EXTERNAL_URL = 'https://v1api.materialshub.gr';
const MIVAA_SERVICE_URL = Deno.env.get('MIVAA_SERVICE_URL') || MIVAA_EXTERNAL_URL;
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || '';

interface SweepRequest {
  degraded_only?: boolean;
  max_products?: number;
  batch_size?: number;
  workspace_id?: string;
  target_version?: number;
}

serve(withApiLogging('facets-recanonicalize', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Forwards to an admin endpoint under the platform mk_ key, so it must authenticate its
  // caller — an open proxy here is an open Voyage spend. service-role OR x-cron-secret.
  if (!isCronAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // A cron posts '{}'; tolerate an empty body rather than 400-ing the nightly run.
  let body: SweepRequest = {};
  try {
    const raw = await req.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const payload: Record<string, unknown> = {
    // Safe by default — see the header comment. Only an explicit `false` opens the full sweep.
    degraded_only: body.degraded_only !== false,
    max_products: Math.min(Math.max(Number(body.max_products) || 200, 1), 5000),
    batch_size: Math.min(Math.max(Number(body.batch_size) || 25, 1), 200),
  };
  if (body.workspace_id) payload.workspace_id = body.workspace_id;
  if (body.target_version != null) payload.target_version = body.target_version;

  const urls = [MIVAA_LOCAL_URL, MIVAA_SERVICE_URL].filter((u, i, arr) => u && arr.indexOf(u) === i);
  let lastError = 'no upstream attempted';

  for (const baseUrl of urls) {
    try {
      const resp = await fetch(`${baseUrl}/api/admin/facets/recanonicalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(MIVAA_API_KEY ? { 'Authorization': `Bearer ${MIVAA_API_KEY}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (resp.ok) {
        return new Response(text, {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      lastError = `${baseUrl} -> ${resp.status}: ${text.slice(0, 240)}`;
    } catch (err) {
      lastError = `${baseUrl} -> threw: ${(err as Error).message}`;
    }
  }

  // 502, not a 200 with an error field. A janitor that reports success while doing nothing is
  // the exact failure this sweep exists to clean up after, and ops.silent_zero watches endpoint
  // success rates — so this has to actually look like a failure.
  return new Response(
    JSON.stringify({ error: 'recanonicalize upstream failed', details: lastError }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
