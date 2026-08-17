/**
 * generate-region-edit
 *
 * Masked inpainting: regenerate only the user-painted area of a room image.
 * Uses Grok Aurora's /v1/images/edits endpoint with an explicit binary mask.
 *
 * Mask convention (PNG):
 *   white pixels (255,255,255) = regenerate this area
 *   black pixels (0,0,0)       = keep exactly as-is
 *
 * Request body (JSON):
 *   image_url     string   — public URL of the room image to edit
 *   mask_data_url string   — PNG data URL of the binary mask
 *   prompt        string   — what to change in the masked area
 *   user_id       string?  — required when called with service role key
 *   workspace_id  string?
 *
 * Credits: 20 per call (Grok inpainting with mask)
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { editImageWithGrok } from '../_shared/ai-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveOutputPath, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { captureException } from '../_shared/sentry.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';

import { fetchImageGuarded } from '../_shared/fetch-image.ts';
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CREDITS_REQUIRED = 20;
// Grok masked inpainting runs on xAI Aurora — same `ai_model_pricing` row the other
// Grok image paths bill against. Logged as model_name so usage and price share a key.
const PRICING_KEY = 'xai-aurora';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Fetch a remote image and return raw bytes + detected mime type.
 *
 * SSRF-guarded (invariant 7). `url` is caller-supplied
 * (`body.image_url`), so a raw fetch here was a working internal port scanner:
 * an authenticated user could point it at 169.254.169.254 (cloud metadata),
 * loopback or RFC1918, and the thrown message below leaks the upstream status
 * back to them — a response oracle. `redirect: 'error'` is REQUIRED by the
 * guard's contract: a public URL can 302 to a blocked address after the check.
 * On failure we deliberately do NOT echo the status or URL back to the caller.
 */
/** Guarded AND bounded. This one already called assertSafeUrl and refused
 *  redirects; what it lacked was a size cap, so an attacker-chosen URL could still
 *  stream unbounded bytes into the isolate. */
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  return await fetchImageGuarded(url);
}

/** Decode a PNG data URL into raw bytes */
function decodeDataUrl(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) throw new Error('Invalid data URL');
  const base64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
    const { data: { user }, error: authError } = await createClient(supabaseUrl, supabaseServiceKey).auth.getUser(token);
    if (authError || !user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    userId = user.id;
  }

  // Invariant 1 (#364 EX-1). `workspace_id` arrives in the body and then routes the debit and
  // stamps the `ai_usage_logs` row this tenant's admins read through
  // `is_workspace_admin(workspace_id)`. 404, not 403 — no workspace-id enumeration.
  if (!isServiceCall && body.workspace_id
    && !(await userCanAccessWorkspace(supabase, userId, body.workspace_id))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  // Validate inputs
  if (!body.image_url) return jsonResponse({ success: false, error: 'image_url is required' }, 400);
  if (!body.mask_data_url) return jsonResponse({ success: false, error: 'mask_data_url is required' }, 400);
  if (!body.prompt?.trim()) return jsonResponse({ success: false, error: 'prompt is required' }, 400);

  const jobId = crypto.randomUUID();

  // Debit credits BEFORE the upstream inpaint call (invariant #10 — debit-before,
  // refund-on-failure). The old non-atomic balance pre-read + deduct-after-generation
  // let a race deliver a free edit; a real debit gates the caller and is refunded on failure.
  const { data: debitData, error: debitErr } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: CREDITS_REQUIRED,
    p_operation_type: 'region_edit',
    p_description: `Region edit (Grok Aurora inpainting)`,
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
    // Fetch room image bytes
    const { bytes: imageBytes, mimeType: imageMimeType } = await fetchImageBytes(body.image_url);

    // Decode mask from data URL
    const maskBytes = decodeDataUrl(body.mask_data_url);

    // Call Grok with mask inpainting
    const result = await editImageWithGrok(body.prompt, imageBytes, {
      maskBytes,
      imageMimeType,
    });

    const imageUrl = await uploadResult(supabase, result.base64, result.mimeType, jobId, { userId, conversationId: body.conversation_id });

    // This function debited 20 credits per edit but wrote NO ai_usage_logs row at all,
    // so region edits were entirely absent from usage and cost reporting — not a null
    // cost, no row. Grok inpainting bills as one xai-aurora image.
    const editPricing = await getServicePricing(supabase, PRICING_KEY);
    if (!editPricing) {
      console.warn(`[generate-region-edit] no ai_model_pricing row for "${PRICING_KEY}" — cost logged as null`);
    }
    const rawCostUsd = editPricing ? editPricing.cost_per_unit : null;
    const billedCostUsd = editPricing ? rawCostUsd! * editPricing.markup_multiplier : null;

    // The billing row is best-effort for the REQUEST but not for the books (#347 audit).
    //
    // It must never throw: the credits are already debited and the upstream call already
    // happened, so failing here would punish the user for an accounting problem. But the old
    // `.then(() => {}, () => {})` discarded the outcome entirely, which is the
    // `stamp_job_refresh_cost` shape — spend charged to a tenant and reported against nobody,
    // with billing sitting at zero and the exception swallowed.
    //
    // try/catch rather than checking `error` alone, because both failure modes have to be
    // caught: supabase-js RESOLVES with `{ error }` on an RLS denial, and REJECTS on a
    // transport error. This function has no top-level Sentry reach for a mid-pipeline swallow.
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
