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

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { editImageWithGrok } from '../_shared/ai-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveOutputPath, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CREDITS_REQUIRED = 20;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Fetch a remote image and return raw bytes + detected mime type.
 *
 * SSRF-guarded (invariant 7, pentest #250 C23/C24). `url` is caller-supplied
 * (`body.image_url`), so a raw fetch here was a working internal port scanner:
 * an authenticated user could point it at 169.254.169.254 (cloud metadata),
 * loopback or RFC1918, and the thrown message below leaks the upstream status
 * back to them — a response oracle. `redirect: 'error'` is REQUIRED by the
 * guard's contract: a public URL can 302 to a blocked address after the check.
 * On failure we deliberately do NOT echo the status or URL back to the caller.
 */
async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const safeUrl = await assertSafeUrl(url);
  const res = await fetch(safeUrl, { redirect: 'error' });
  if (!res.ok) throw new Error('Failed to fetch the source image');
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
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
  supabase: ReturnType<typeof createClient>,
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

  if (token === supabaseServiceKey && body.user_id) {
    userId = body.user_id;
  } else {
    const { data: { user }, error: authError } = await createClient(supabaseUrl, supabaseServiceKey).auth.getUser(token);
    if (authError || !user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    userId = user.id;
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
