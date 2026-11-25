/** generate-region-edit */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { generateImageWithGemini, IMAGE_ASPECT_RATIOS } from '../_shared/ai-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveOutputPath, isPlatformGeneratedImage, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { assertEditableSource } from '../_shared/image-edit-gate.ts';
import { GENERATION_CREDIT_COSTS } from '../_shared/generation-routing.ts';
import { aspectRatioOfImage } from '../_shared/image-dimensions.ts';
import { getGenerationPrompt, renderPromptTemplate } from '../_shared/prompt-utils.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';

import { fetchImageGuarded } from '../_shared/fetch-image.ts';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const MODEL = 'gemini-nano-banana-2.1' as const;
const CREDITS_REQUIRED = GENERATION_CREDIT_COSTS[MODEL];
const PRICING_KEY = MODEL;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Upload base64 image to Supabase Storage, return permanent public URL */
async function uploadResult(
  supabase: DbClient,
  base64: string,
  mimeType: string,
  jobId: string,
  ctx: Partial<SessionPathCtx> = {},
): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = resolveOutputPath(ctx, 'region-edit', `${jobId}.${ext}`);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return supabase.storage.from('generation-images').getPublicUrl(path).data.publicUrl;
}

Deno.serve(withApiLogging('generate-region-edit', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse body
  let body: {
    image_url: string;
    mask_data_url: string;
    prompt: string;
    user_id?: string;
    workspace_id?: string;
    conversation_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  // Auth
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let userId: string;

  const isServiceCall = token === supabaseServiceKey && !!body.user_id;
  if (isServiceCall) {
    userId = body.user_id!;
  } else {
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
    userId = auth.userId;
    const keyWs = auth.apiKey?.workspace_id;
    if (keyWs && body.workspace_id && body.workspace_id !== keyWs) {
      return jsonResponse({ success: false, error: 'Not found' }, 404);
    }
  }

  // Invariant 1 (#364 EX-1). `workspace_id` arrives in the body and then routes the debit and
  // stamps the `ai_usage_logs` row this tenant's admins read through
  // `is_workspace_admin(workspace_id)`. 404, not 403 — no workspace-id enumeration.
  if (!isServiceCall && body.workspace_id
    && !(await userHasWorkspaceCapability(supabase, userId, body.workspace_id, ['agent.use', 'moodboards.use', 'projects.use']))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  // Validate inputs
  if (!body.image_url) return jsonResponse({ success: false, error: 'image_url is required' }, 400);
  if (!body.mask_data_url) return jsonResponse({ success: false, error: 'mask_data_url is required' }, 400);
  if (!body.prompt?.trim()) return jsonResponse({ success: false, error: 'prompt is required' }, 400);

  // Invariant 9b: the source artefact is gated before any debit, exactly as the gemini edit modes are.
  const gate = await assertEditableSource(
    supabase, body.image_url, body.prompt, isPlatformGeneratedImage(body.image_url), userId, body.workspace_id ?? null,
  );
  if (!gate.allowed) {
    console.warn(`[generate-region-edit] edit refused (${gate.documentKind ?? 'unknown'}) user=${userId}`);
    return jsonResponse({ success: false, error: gate.message, refused: true }, 422);
  }

  const jobId = crypto.randomUUID();

  // Debit credits BEFORE the upstream inpaint call (invariant #10 — debit-before,
  // refund-on-failure). The old non-atomic balance pre-read + deduct-after-generation
  // let a race deliver a free edit; a real debit gates the caller and is refunded on failure.
  const { data: debitData, error: debitErr } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: CREDITS_REQUIRED,
    p_operation_type: 'region_edit',
    p_description: 'Region edit (Gemini)',
    p_metadata: { workspace_id: body.workspace_id, job_id: jobId },
    p_workspace_id: body.workspace_id ?? null,
  });
  {
    const row = Array.isArray(debitData) ? debitData[0] : debitData;
    if (debitErr || (row && row.success === false)) {
      const msg = row?.error_message || debitErr?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg, insufficient_credits: true }, 402);
    }
  }

  try {
    const prompt = renderPromptTemplate(await getGenerationPrompt(supabase, 'interior_region_edit'), { instruction: body.prompt.trim() });
    const { bytes: imageBytes } = await fetchImageGuarded(body.image_url);

    // Gemini has no mask input: the caller composites the result back through its own mask.
    const result = await generateImageWithGemini(
      { text: prompt, images: [body.mask_data_url, imageBytes] },
      {
        model: MODEL,
        aspectRatio: aspectRatioOfImage(imageBytes, IMAGE_ASPECT_RATIOS) ?? undefined,
        imageLabels: ['MASK (white = the only area to change, black = keep exactly as it is):', 'PHOTO TO EDIT:'],
      },
    );

    const imageUrl = await uploadResult(supabase, result.base64, result.mimeType, jobId, { userId, conversationId: body.conversation_id });

    const editPricing = await getServicePricing(supabase, PRICING_KEY);
    if (!editPricing) {
      console.warn(`[generate-region-edit] no ai_model_pricing row for "${PRICING_KEY}" — cost logged as null`);
    }
    const rawCostUsd = editPricing ? editPricing.cost_per_unit : null;
    const billedCostUsd = editPricing ? rawCostUsd! * editPricing.markup_multiplier : null;

    // The billing row is best-effort for the REQUEST but not for the books (#347 audit).
    try {
      const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
        user_id: userId,
        // Same value the debit above used. It was in scope and never reached the log row, so
        // this spend was charged to a tenant and then reported against nobody.
        workspace_id: body.workspace_id ?? null,
        operation_type: 'region_edit',
        model_name: PRICING_KEY,
        credits_debited: CREDITS_REQUIRED,
        raw_cost_usd: rawCostUsd,
        billed_cost_usd: billedCostUsd,
        markup_multiplier: editPricing?.markup_multiplier ?? null,
        metadata: { provider_model: result.model, billing_type: 'per_unit', units: 1 },
      });
      if (usageErr) throw usageErr;
    } catch (usageErr) {
      console.error('[generate-region-edit] ai_usage_logs insert FAILED — spend is unattributed', usageErr);
      await captureException(
        usageErr instanceof Error ? usageErr : new Error(String((usageErr as { message?: string })?.message ?? usageErr)),
        {
          tags: { area: 'billing', operation: 'region_edit' },
          extra: { user_id: userId, workspace_id: body.workspace_id ?? null, credits: CREDITS_REQUIRED },
          fingerprint: ['ai-usage-log-write-failed', 'region_edit'],
        },
      );
    }

    return jsonResponse({
      success: true,
      job_id: jobId,
      image_url: imageUrl,
      model: result.model,
      credits_used: CREDITS_REQUIRED,
    });

  } catch (err) {
    console.error('[generate-region-edit] Error:', err);
    // Refund the upfront debit — no edited image was delivered.
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: CREDITS_REQUIRED,
      p_operation_type: 'region_edit_refund',
      p_description: 'Refund: region edit failed',
      p_metadata: { job_id: jobId, error: String(err) },
      p_workspace_id: body.workspace_id ?? null,
    }).then(() => {}, () => {});
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
