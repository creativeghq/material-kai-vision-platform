/**
 * canonicalize-attributes
 *
 * Thin proxy invoked by background agents (material-tagger, product-enrichment)
 * to canonicalize a product's raw attributes through MIVAA's
 * POST /api/admin/facets/canonicalize.
 *
 * Why this layer exists at all (vs. agents calling MIVAA directly): keeps the
 * MIVAA service URL + key in one place (env on the edge function), and lets the
 * canonicalization endpoint stay admin-only on MIVAA side without each agent
 * carrying credentials. Same pattern as the existing mivaa-gateway proxy.
 *
 * Request body:
 *   {
 *     product_id?:     string,           // optional — enables diff-before-canonicalize
 *     raw_attributes:  Record<string,unknown>,
 *     source:          string,           // e.g. 'agent_material_tagger'
 *   }
 *
 * Response:
 *   {
 *     attributes:        Record<string,unknown>,
 *     attributes_raw:    Record<string,string[]>,
 *     resolutions_count: number,
 *     actions_by_type:   Record<string,number>,
 *   }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

const MIVAA_LOCAL_URL = Deno.env.get('MIVAA_LOCAL_URL') || 'http://127.0.0.1:8000';
const MIVAA_EXTERNAL_URL = 'https://v1api.materialshub.gr';
const MIVAA_SERVICE_URL = Deno.env.get('MIVAA_SERVICE_URL') || MIVAA_EXTERNAL_URL;
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || '';

interface CanonicalizeRequest {
  product_id?: string;
  raw_attributes: Record<string, unknown>;
  source: string;
}

async function callMivaa(body: CanonicalizeRequest): Promise<Response> {
  // Try local first (same-host fast path), fall back to external URL.
  const urls = [MIVAA_LOCAL_URL, MIVAA_SERVICE_URL].filter((u, i, arr) => u && arr.indexOf(u) === i);

  let lastError: string = 'no upstream attempted';
  for (const baseUrl of urls) {
    try {
      const resp = await fetch(`${baseUrl}/api/admin/facets/canonicalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(MIVAA_API_KEY ? { 'Authorization': `Bearer ${MIVAA_API_KEY}` } : {}),
        },
        body: JSON.stringify(body),
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
  return new Response(
    JSON.stringify({ error: 'canonicalize upstream failed', details: lastError }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: CanonicalizeRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ error: 'body must be a JSON object' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!body.raw_attributes || typeof body.raw_attributes !== 'object') {
    return new Response(JSON.stringify({ error: 'raw_attributes must be an object' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (typeof body.source !== 'string' || !body.source) {
    return new Response(JSON.stringify({ error: 'source string required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return await callMivaa(body);
});
