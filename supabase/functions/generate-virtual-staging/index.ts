/** generate-virtual-staging — furnishes an empty room photo with Gemini, keeping the room itself. */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { generateImageWithGemini, IMAGE_ASPECT_RATIOS } from '../_shared/ai-client.ts';
import { GENERATION_CREDIT_COSTS } from '../_shared/generation-routing.ts';
import { aspectRatioOfImage } from '../_shared/image-dimensions.ts';
import { assertEditableSource } from '../_shared/image-edit-gate.ts';
import { getGenerationPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { resolveOutputPath, isPlatformGeneratedImage, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';

import { fetchImageGuarded } from '../_shared/fetch-image.ts';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const MODEL = 'gemini-3-pro-image' as const;
const CREDIT_COST = GENERATION_CREDIT_COSTS[MODEL];
const PRICING_KEY = MODEL;
const DEFAULT_STYLE = 'Default (AI decides)';

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
  base64: string,
  mimeType: string,
  jobId: string,
  ctx: Partial<SessionPathCtx> = {},
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = resolveOutputPath(ctx, 'virtual-staging', `${jobId}.${mimeType.includes('png') ? 'png' : 'jpg'}`);
  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

async function stageRoom(supabase: DbClient, imageUrl: string, room: string, furnitureStyle: string, furnitureItems?: string) {
  const prompt = renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_virtual_staging'), {
    room,
    furniture_style: furnitureStyle === DEFAULT_STYLE ? 'whatever suits the room best' : furnitureStyle,
    furniture_items: furnitureItems?.trim() || 'the furniture this kind of room normally needs',
  });
  const { bytes } = await fetchImageGuarded(imageUrl);
  return await generateImageWithGemini(
    { text: prompt, images: [bytes] },
    { model: MODEL, aspectRatio: aspectRatioOfImage(bytes, IMAGE_ASPECT_RATIOS) ?? undefined },
  );
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

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }
  userId = auth.userId;

  let body: VirtualStagingRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }
  const keyWs = auth.apiKey?.workspace_id;
  if (keyWs && body.workspace_id && body.workspace_id !== keyWs) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
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
    && !(await userHasWorkspaceCapability(supabase, userId, body.workspace_id, ['agent.use', 'moodboards.use', 'projects.use', 'realestate.listings.manage']))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  if (!body.source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }
  // Invariant 7: refused before the image gate and the debit, not only at download.
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

  // Invariant 9b: the source artefact is gated before any debit.
  const gate = await assertEditableSource(
    supabase, body.source_image_url, `Furnish this empty ${body.room}`,
    isPlatformGeneratedImage(body.source_image_url), userId, body.workspace_id ?? null,
  );
  if (!gate.allowed) {
    return jsonResponse({ success: false, error: gate.message, refused: true }, 422);
  }

  const jobId = crypto.randomUUID();
  const room = body.room;
  const furnitureStyle = body.furniture_style || DEFAULT_STYLE;

  // Invariant 10: debit first, refund on failure.
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
    const staged = await stageRoom(supabase, body.source_image_url, room, furnitureStyle, body.furniture_items);
    const imageUrl = await uploadToStorage(supabase, staged.base64, staged.mimeType, jobId, { userId, conversationId: body.conversation_id });

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
      // The image, not the turn: the chat only holds it if the browser was open to persist
      // the message, and this notification exists for when it was not.
      action_url: imageUrl,
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
