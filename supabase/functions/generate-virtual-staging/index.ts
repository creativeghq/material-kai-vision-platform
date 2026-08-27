/**
 * generate-virtual-staging
 *
 * AI-powered virtual staging using proplabs/virtual-staging on Replicate.
 * Takes an empty room image + room type + style, returns a furnished staged image.
 *
 * Model: proplabs/virtual-staging (~56s, $0.16/run)
 * Credits: 20
 *
 * Requires: REPLICATE_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { resolveOutputPath, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

import { fetchImageGuarded } from '../_shared/fetch-image.ts';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const replicateToken = () => Deno.env.get('REPLICATE_API_TOKEN') || '';

const CREDIT_COST = 20;
const MODEL = 'proplabs/virtual-staging';
// `ai_model_pricing.model_key` for MODEL, slug-derived to match the table's convention
// (`adirik/interior-design` -> `adirik-interior-design`). Also what we log as model_name,
// so the usage row and the price row are keyed by the same string.
const PRICING_KEY = 'proplabs-virtual-staging';

interface VirtualStagingRequest {
  source_image_url: string;
  room: string;
  furniture_style?: string;
  furniture_items?: string;
  workspace_id?: string;
  user_id?: string; // For internal server-to-server calls from agent-chat
  conversation_id?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadToStorage(
  supabase: DbClient,
  imageUrl: string,
  jobId: string,
  ctx: Partial<SessionPathCtx> = {},
): Promise<string> {
  // Was a bare fetch(imageUrl): no SSRF guard, redirects followed, unbounded read.
  const { bytes, mimeType: contentType } = await fetchImageGuarded(imageUrl);
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = resolveOutputPath(ctx, 'virtual-staging', `${jobId}.${ext}`);

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

async function runReplicate(
  imageUrl: string,
  room: string,
  furnitureStyle: string,
  furnitureItems?: string,
): Promise<string> {
  const createResp = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${replicateToken()}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        image: imageUrl,
        room,
        furniture_style: furnitureStyle,
        furniture_items: furnitureItems || 'Default (AI decides)',
      },
    }),
  });

  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`Replicate create failed (${createResp.status}): ${err}`);
  }

  const prediction = await createResp.json();

  // If Prefer: wait resolved it immediately
  if (prediction.status === 'succeeded') {
    const output = prediction.output;
    if (typeof output === 'string') return output;
    if (Array.isArray(output) && output.length > 0) return output[0];
  }

  if (prediction.status === 'failed') {
    throw new Error(`Replicate prediction failed: ${prediction.error}`);
  }

  const predictionId = prediction.id;

  // Poll for completion
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 4000));

    const statusResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${replicateToken()}` },
    });

    if (!statusResp.ok) continue;
    const status = await statusResp.json();

    if (status.status === 'succeeded') {
      const output = status.output;
      if (typeof output === 'string') return output;
      if (Array.isArray(output) && output.length > 0) return output[0];
      throw new Error('Unexpected output format from Replicate');
    }

    if (status.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${status.error}`);
    }
  }

  throw new Error('Virtual staging timed out after 3 minutes');
}

Deno.serve(withApiLogging('generate-virtual-staging', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: accept service role key (internal server-to-server) OR user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let userId: string;

  if (token === supabaseServiceKey) {
    // Internal call from agent-chat edge function — user_id must be in body
    let rawBody: VirtualStagingRequest;
    try {
      rawBody = await req.json() as VirtualStagingRequest;
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
    }
    if (!rawBody.user_id) {
      return jsonResponse({ success: false, error: 'user_id required for internal calls' }, 400);
    }
    userId = rawBody.user_id;
    return await handleRequest(supabase, rawBody, userId, true);
  }

  // User JWT validation
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }
  userId = user.id;

  let body: VirtualStagingRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  return await handleRequest(supabase, body, userId, false);
}));

async function handleRequest(
  supabase: DbClient,
  body: VirtualStagingRequest,
  userId: string,
  isServiceCall: boolean,
): Promise<Response> {
  // Invariant 1 (#364 EX-1). `workspace_id` comes from the body and then routes the debit and
  // stamps the `ai_usage_logs` row this tenant's admins read through
  // `is_workspace_admin(workspace_id)`. 404, not 403 — no workspace-id enumeration.
  if (!isServiceCall && body.workspace_id
    && !(await userCanAccessWorkspace(supabase, userId, body.workspace_id))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  if (!body.source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }
  // Invariant 7 (#364 EX-7). `source_image_url` is handed to Replicate, which fetches it from
  // THEIR network — the same primitive as fetching it here, so it is validated before it leaves
  // rather than only where we happen to download the output.
  try {
    await assertSafeUrl(body.source_image_url, { allowSchemes: ['https:'] });
  } catch (e) {
    return jsonResponse(
      { success: false, error: e instanceof SSRFError ? `Rejected image URL: ${e.message}` : 'Invalid image URL' },
      400,
    );
  }
  if (!body.room) {
    return jsonResponse({ success: false, error: 'room is required' }, 400);
  }
  if (!replicateToken()) {
    return jsonResponse({ success: false, error: 'REPLICATE_API_TOKEN not configured' }, 500);
  }

  const jobId = crypto.randomUUID();
  const room = body.room;
  const furnitureStyle = body.furniture_style || 'Default (AI decides)';

  // Debit credits BEFORE the expensive Replicate call (invariant #10 — debit-before,
  // refund-on-failure). The old non-atomic balance pre-read let a race deliver a free
  // staging; a real debit gates the caller and is refunded if generation fails.
  const { data: debitData, error: debitError } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: CREDIT_COST,
    p_operation_type: 'virtual_staging',
    p_description: `Virtual staging (${room}, ${furnitureStyle})`,
    p_workspace_id: body.workspace_id ?? null,
  });
  const debit = Array.isArray(debitData) ? debitData[0] : debitData;
  if (debitError || !debit?.success) {
    return jsonResponse({ success: false, error: debit?.error_message || 'Insufficient credits' }, 402);
  }

  try {
    const tempUrl = await runReplicate(body.source_image_url, room, furnitureStyle, body.furniture_items);
    const imageUrl = await uploadToStorage(supabase, tempUrl, jobId, { userId, conversationId: body.conversation_id });

    // USD cost from `ai_model_pricing` (this insert previously set credits only, so every
    // virtual_staging row carried a NULL cost). `model_name` is the pricing key, not a
    // made-up label — a log label that doesn't match a price key can never be priced.
    const stagingPricing = await getServicePricing(supabase, PRICING_KEY);
    if (!stagingPricing) {
      console.warn(`[generate-virtual-staging] no ai_model_pricing row for "${PRICING_KEY}" — cost logged as null`);
    }
    const rawCostUsd = stagingPricing ? stagingPricing.cost_per_unit : null;
    const billedCostUsd = stagingPricing ? rawCostUsd! * stagingPricing.markup_multiplier : null;

    // Billing row: never throw, never silent. The old `.then(() => {}, () => {})` discarded the
    // outcome — spend charged to a tenant and reported against nobody. try/catch because
    // supabase-js RESOLVES with `{ error }` on an RLS denial and REJECTS on transport (#347).
    try {
      const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
        user_id: userId,
        workspace_id: body.workspace_id ?? null,
        operation_type: 'virtual_staging',
        model_name: PRICING_KEY,
        credits_debited: CREDIT_COST,
        raw_cost_usd: rawCostUsd,
        billed_cost_usd: billedCostUsd,
        markup_multiplier: stagingPricing?.markup_multiplier ?? null,
        metadata: { room, furniture_style: furnitureStyle, billing_type: 'per_unit', units: 1 },
      });
      if (usageErr) throw usageErr;
    } catch (usageErr) {
      console.error('[generate-virtual-staging] ai_usage_logs insert FAILED — spend is unattributed', usageErr);
      await captureException(
        usageErr instanceof Error ? usageErr : new Error(String((usageErr as { message?: string })?.message ?? usageErr)),
        {
          tags: { area: 'billing', operation: 'virtual_staging' },
          extra: { user_id: userId, workspace_id: body.workspace_id ?? null, credits: CREDIT_COST },
          fingerprint: ['ai-usage-log-write-failed', 'virtual_staging'],
        },
      );
    }

    // Delivered by the "Virtual Staging Done" flow (Flows dashboard).
    emitFlowEvent('virtual_staging_completed', {
      user_id: userId,
      workspace_id: body.workspace_id ?? null,
      type: 'staging_ready',
      title: 'Virtual staging complete!',
      body: `Your ${room} has been virtually staged and is ready to view.`,
      job_id: jobId,
      room,
    }).catch(() => {});

    return jsonResponse({
      success: true,
      job_id: jobId,
      image_url: imageUrl,
      credits_used: CREDIT_COST,
      room,
      furniture_style: furnitureStyle,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-virtual-staging] Error:`, message);
    // Refund the upfront debit — the staging never reached the user.
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: CREDIT_COST,
      p_operation_type: 'virtual_staging_refund',
      p_description: 'Refund: virtual staging failed',
      p_metadata: { error: message },
      p_workspace_id: body.workspace_id ?? null,
    }).then(() => {}, () => {});
    return jsonResponse({ success: false, error: message }, 500);
  }
}
