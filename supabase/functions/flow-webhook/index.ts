/**
 * Flow Webhook Edge Function
 *
 * Receives external HTTP requests and routes them to the matching flow.
 * Each flow with a webhook trigger has a unique URL:
 *   POST /functions/v1/flow-webhook?flow_id=<uuid>
 *
 * Optional HMAC-SHA256 verification via X-Webhook-Secret header
 * matched against the secret stored in the flow's trigger_config.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const arrA = new Uint8Array(sigA);
  const arrB = new Uint8Array(sigB);
  let diff = 0;
  for (let i = 0; i < arrA.length; i++) diff |= arrA[i] ^ arrB[i];
  return diff === 0;
}

Deno.serve(withApiLogging('flow-webhook', async (req) => {
  await bootstrapForFunction();
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const flowId = url.searchParams.get('flow_id');

    if (!flowId) {
      return jsonResponse({ success: false, error: 'Missing flow_id query parameter' }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load the flow
    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('id, status, trigger_type, trigger_config')
      .eq('id', flowId)
      .single();

    if (flowError || !flow) {
      return jsonResponse({ success: false, error: 'Flow not found' }, 404);
    }

    if (flow.trigger_type !== 'webhook') {
      return jsonResponse({ success: false, error: 'Flow is not a webhook trigger' }, 400);
    }

    if (flow.status !== 'active') {
      return jsonResponse({ success: false, error: `Flow is ${flow.status}, not active` }, 400);
    }

    // Validate HTTP method
    const expectedMethod = (flow.trigger_config as Record<string, unknown>)?.method || 'POST';
    if (req.method !== expectedMethod) {
      return jsonResponse({
        success: false,
        error: `Expected ${expectedMethod}, got ${req.method}`,
      }, 405);
    }

    // Validate webhook secret if configured
    const configSecret = (flow.trigger_config as Record<string, unknown>)?.secret;
    if (configSecret) {
      const headerSecret = req.headers.get('X-Webhook-Secret') || req.headers.get('x-webhook-secret');
      if (!headerSecret || !await timingSafeEqual(headerSecret, configSecret as string)) {
        return jsonResponse({ success: false, error: 'Invalid webhook secret' }, 401);
      }
    }

    // Parse request body
    let triggerData: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      try {
        triggerData = await req.json();
      } catch {
        // Body may be empty or not JSON
        triggerData = {};
      }
    }

    // Include query params and headers as metadata
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      if (key !== 'flow_id') queryParams[key] = value;
    });

    triggerData = {
      ...triggerData,
      _webhook: {
        method: req.method,
        query_params: queryParams,
        received_at: new Date().toISOString(),
      },
    };

    // Execute the flow via flow-engine
    const { data: result, error: execError } = await supabase.functions.invoke('flow-engine', {
      body: {
        action: 'execute-flow',
        flow_id: flowId,
        trigger_data: triggerData,
      },
    });

    if (execError) {
      return jsonResponse({ success: false, error: execError.message }, 500);
    }

    return jsonResponse({
      success: true,
      data: {
        flow_id: flowId,
        run_id: result?.data?.id,
        status: result?.data?.status || 'triggered',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[flow-webhook] Error:', message);
    return jsonResponse({ success: false, error: message }, 500);
  }
}));
