/**
 * generate-interior-video-v2
 *
 * Multi-model interior design video generation.
 * Routes to the best model based on video_type or explicit model override.
 *
 * Models:
 *   veo-2           → 50 credits (Google, cinematic walkthroughs)
 *   kling-v3.0      → 20 credits (native SDK, cinematic + audio)
 *   runway-gen4-turbo → 40 credits (Replicate, premium quality)
 *   wan-3.0-480p/720p/1080p → 30/55/110 credits (Alibaba, via @ai-sdk/alibaba). Reaches
 *     30 seconds and returns the clip SCORED, with up to 5 reference items held consistent
 *     across it — though not alongside a source frame. Issue #394.
 *   seedance-2.5-480p/720p → 60/125 credits (ByteDance, via BytePlus ModelArk). Also 30
 *     seconds with audio, but generated in ONE pass and with references that carry an
 *     explicit ROLE (first frame / last frame / reference image) rather than an
 *     undifferentiated set — which is what keeps THIS tile in frame rather than one like it.
 *   minimax-h3      → 40 credits (MiniMax Hailuo 3.0). 5-15s at native 2K with stereo
 *     audio — the reel format, at half the credits of a 30-second clip. Default for
 *     `social_reel`. Will not take a frame image and references together.
 *   ray-3.2-720p/1080p → 20/70 credits (Luma Ray3.2). 5 or 10 seconds, first-to-last
 *     frame interpolation — the one model here that takes you from THIS room to THAT
 *     room rather than wherever the camera drifts. Silent.
 *
 * Async handling: Replicate models can take 3-5 min. If polling times out
 * (55s), stores prediction_id in generation_videos and returns job_id for
 * frontend polling (same pattern as 3D generation).
 */

import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { replicateToken } from '../_shared/replicate-token.ts';
import { corsHeaders } from '../_shared/cors.ts';
import {
  generateVideoWithVeo,
  generateVideoWithKling,
  generateVideoWithWan,
  generateVideoWithSeedance,
  generateVideoWithMinimax,
  generateVideoWithRay,
} from '../_shared/ai-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { resolveOutputPath, type SessionPathCtx } from '../_shared/storage-paths.ts';
import { getServicePricing } from '../_shared/credit-utils.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { fetchBinaryGuarded } from '../_shared/fetch-image.ts';
import { assertSafeUrl, SSRFError } from '../_shared/ssrf-guard.ts';
import { captureException } from '../_shared/sentry.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// 'wan2.1-i2v-720p' removed 2026-08-12 (issue #4): `wan-video/wan2.1-i2v-720p` returns 404 from
// GET /v1/models — a read that needs no credit, so this is upstream deletion, NOT our 402
// Insufficient-credit state. It was user-selectable at 12 credits and always hard-failed.
// The budget tier stays vacant until `wan-video/wan-2.2-i2v-fast` can be verified against a
// funded account (issue #4 Phase 5) — an unverified replacement would repeat the same bug.
type VideoModel = 'veo-2' | 'kling-v3.0' | 'runway-gen4-turbo'
  | 'wan-3.0-480p' | 'wan-3.0-720p' | 'wan-3.0-1080p'
  | 'seedance-2.5-480p' | 'seedance-2.5-720p'
  | 'minimax-h3'
  | 'ray-3.2-720p' | 'ray-3.2-1080p';
type VideoType = 'walkthrough' | 'product_spotlight' | 'before_after' | 'floorplan_flythrough' | 'social_reel';
type AspectRatio = '16:9' | '9:16' | '1:1';

// Every price here must cover the provider bill for a MAX-LENGTH clip of that model, because
// MAX_DURATION_SECONDS below is what the caller can actually ask for and the fee is flat.
//
// The arithmetic, using the rates in `ai_model_pricing` and the platform's declared 1.5x markup,
// against the WORST credit price we sell (the premium pack, ~$0.085/credit — a credit bought
// cheaper still has to cover the same bill):
//
//   veo-2              8s x $0.35/s = $2.80 -> x1.5 = $4.20 -> >= 50 credits
//   kling-v3.0        10s x $0.10/s = $1.00 -> x1.5 = $1.50 -> >= 18 credits (20 charged)
//   runway-gen4-turbo 10s x $0.15/s = $1.50 -> x1.5 = $2.25 -> >= 27 credits (40 charged)
//   wan-3.0-480p      30s x $0.05/s  = $1.50 -> x1.5 = $2.25  -> >= 27 credits (30 charged)
//   wan-3.0-720p      30s x $0.10/s  = $3.00 -> x1.5 = $4.50  -> >= 53 credits (55 charged)
//   wan-3.0-1080p     30s x $0.20/s  = $6.00 -> x1.5 = $9.00  -> >= 106 credits (110 charged)
//   seedance-2.5-480p 30s x $0.104/s = $3.12 -> x1.5 = $4.68  -> >= 56 credits (60 charged)
//   seedance-2.5-720p 30s x $0.231/s = $6.93 -> x1.5 = $10.40 -> >= 123 credits (125 charged)
//   minimax-h3        15s x $0.13/s  = $1.95 -> x1.5 = $2.93  -> >= 35 credits (40 charged)
//   ray-3.2-720p      10s x $0.09/s  = $0.90 -> x1.5 = $1.35  -> >= 16 credits (20 charged)
//   ray-3.2-1080p     10s x $0.36/s  = $3.60 -> x1.5 = $5.40  -> >= 64 credits (70 charged)
//
// Ray's per-second rates are the TEN-second ones on purpose: Luma prices per clip and a
// 10s clip costs 3x a 5s clip, not 2x, so the 5s rate would under-price exactly the
// full-length clip these fees have to cover.
//
// MiniMax is the cheapest CLIP here despite a mid-table per-second rate, because its
// ceiling is 15 seconds — which is the length of a reel. Half the credits of Wan 720p
// for native 2K with stereo audio, and that is why `social_reel` routes to it.
//
// Seedance's rate is DERIVED, not quoted: BytePlus bills it by token at $10.70/M with no
// video input, and tokens are width x height x fps x seconds / 1024. At 24fps that is
// 9,608 tokens/s for 480p and 21,600 tokens/s for 720p — $0.104 and $0.231. It is roughly
// 1.7x Wan per second, which is the price of one-pass 30s with role-tagged references.
//
// Wan's three prices came DOWN on 2026-08-29 (40/80/155 -> 30/55/110) and no negotiation was
// involved: the old figures were derived from $0.068/$0.14/$0.28, the rate for
// `wan3.0-video-prime` — an id absent from Alibaba's own model page. The documented model
// `wan3.0-video` lists $0.05/$0.10/$0.20. Same arithmetic, corrected input, which is exactly
// what this block is for: the numbers moved with the rate rather than sitting at a margin
// nobody had chosen. The tiers stay separate entries so the 30-second option is reachable at
// 30 credits and not only at 110.
//
// veo-2 was 30. A full 8-second clip cost $2.80 and earned about $2.70, so the platform paid
// customers to use its most expensive model — and nothing surfaced it, because a flat fee is a
// valid number and the provider cost was not in `ai_usage_logs` at all until #363 `EE-2` put it
// there. Pinned by tests/unit/videoCreditFloor.test.ts.
const CREDIT_COSTS: Record<VideoModel, number> = {
  'veo-2':              50,
  'kling-v3.0':         20,
  'runway-gen4-turbo':  40,
  'wan-3.0-480p':       30,
  'wan-3.0-720p':       55,
  'wan-3.0-1080p':      110,
  'seedance-2.5-480p':  60,
  'seedance-2.5-720p':  125,
  'minimax-h3':         40,
  'ray-3.2-720p':       20,
  'ray-3.2-1080p':      70,
};

// Longest clip each model will produce.
//
// `duration_seconds` arrives from the request body and the Replicate branch passed it STRAIGHT to
// the provider unclamped, while CREDIT_COSTS above charges a FLAT per-model price. So
// `duration_seconds: 60` cost the caller exactly what `5` did and we paid the difference — and
// `ai_usage_logs` priced the same models per SECOND, so the logged cost and the charged cost
// disagreed by however long the clip was. The Veo and Kling branches each clamped in-branch;
// Replicate did not. Clamped once here, at the input, which is also what makes the flat credit
// price defensible: it is the price of a bounded clip. (audit #312)
const MAX_DURATION_SECONDS: Record<VideoModel, number> = {
  'veo-2':              8,
  'kling-v3.0':         10,
  'runway-gen4-turbo':  10,
  'wan-3.0-480p':       30,
  'wan-3.0-720p':       30,
  'wan-3.0-1080p':      30,
  // Seedance's own floor is 4 seconds; the generator clamps up as well as down.
  'seedance-2.5-480p':  30,
  'seedance-2.5-720p':  30,
  // H3's own range is 5-15s. Not a limitation for a reel — it is the format.
  'minimax-h3':         15,
  // Ray3.2 generates longer, but 10s is the longest clip Luma PUBLISHES A PRICE FOR,
  // and an unpriced duration is one we cannot charge for honestly. The generator sends
  // 5 or 10 and nothing between, for the same reason.
  'ray-3.2-720p':       10,
  'ray-3.2-1080p':      10,
};

// Resolution tier per Wan model id. The id carries the tier because the RATE differs
// 4x across them, so the tier has to be part of what gets priced, not a free parameter.
const WAN_RESOLUTION: Partial<Record<VideoModel, '480P' | '720P' | '1080P'>> = {
  'wan-3.0-480p':  '480P',
  'wan-3.0-720p':  '720P',
  'wan-3.0-1080p': '1080P',
};

/** Same shape, same reason: the tier IS the rate, so it cannot be a free parameter. */
const SEEDANCE_RESOLUTION: Partial<Record<VideoModel, '480P' | '720P'>> = {
  'seedance-2.5-480p': '480P',
  'seedance-2.5-720p': '720P',
};

/** And again for Ray, where 720p -> 1080p is a 4x jump in rate. */
const RAY_RESOLUTION: Partial<Record<VideoModel, '720p' | '1080p'>> = {
  'ray-3.2-720p':  '720p',
  'ray-3.2-1080p': '1080p',
};

// Auto-select model by video type
// An 8-second silent clip is not a walkthrough and a 10-second silent clip is not a
// reel — the three types that were most misserved by the old roster now default to the
// model that can actually produce them (30s, scored, multi-reference).
const TYPE_MODEL_MAP: Record<VideoType, VideoModel> = {
  walkthrough:          'wan-3.0-720p',
  floorplan_flythrough: 'wan-3.0-720p',
  product_spotlight:    'kling-v3.0',
  // A before/after is a clip that must END on a specific image, and Ray3.2 is the only
  // model here that interpolates first frame -> last frame. Everything else starts from
  // the source and drifts, which is why `before_image_url` had nowhere to go: it was
  // read by the Replicate branch alone, and `before_after` has not routed there in
  // months. It now lands as the end frame on every native branch — see `endFrameUrl`.
  before_after:         'ray-3.2-720p',
  // A reel is 15 seconds on a phone, not 30 on a monitor. MiniMax H3 gives that at
  // native 2K with stereo audio for 40 credits, where the 30-second model spent 80 to
  // produce twice the footage nobody watches. Wan stays one explicit `model` away.
  social_reel:          'minimax-h3',
};

// Replicate model identifiers (Kling now uses native SDK, not Replicate)
const REPLICATE_MODELS: Record<string, string> = {
  'runway-gen4-turbo': 'runwayml/gen4-turbo',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadVideoToStorage(
  supabase: DbClient,
  videoData: string | ArrayBuffer | Uint8Array,
  jobId: string,
  isBase64 = false,
  ctx: Partial<SessionPathCtx> = {},
): Promise<string> {
  const path = resolveOutputPath(ctx, 'videos/v2', `${jobId}.mp4`);
  let bytes: Uint8Array;

  if (isBase64 && typeof videoData === 'string') {
    bytes = Uint8Array.from(atob(videoData), c => c.charCodeAt(0));
  } else if (typeof videoData === 'string') {
    // Download the provider's output through the shared guard (#364 EX-7). This was a bare
    // `fetch(videoData)` with no SSRF guard, no `res.ok` check and no size cap: a redirect or an
    // error page came back as bytes, went into the bucket as `video/mp4`, and was handed to the
    // user as their finished video. 200 MB ceiling — a 10s clip is single-digit MB.
    bytes = (await fetchBinaryGuarded(videoData, {
      maxBytes: 200 * 1024 * 1024,
      contentTypePrefix: 'video/',
      timeoutMs: 45_000,
    })).bytes;
  } else {
    bytes = new Uint8Array(videoData);
  }

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: 'video/mp4', upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

async function createReplicatePrediction(
  model: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const token = await replicateToken();
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate ${model} error ${res.status}: ${text}`);
  }
  return await res.json();
}

async function pollReplicate(
  predictionId: string,
  // Edge function hard limit is ~60s. We leave ~15s margin for setup/teardown.
  // If the prediction isn't done in time we return 'processing' and the client
  // polls generation_videos.replicate_prediction_id (already persisted).
  timeoutMs = 45_000,
): Promise<{ status: string; output?: string | string[]; error?: string }> {
  const start = Date.now();
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;

  const token = await replicateToken();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(url, { headers: { 'Authorization': `Token ${token}` } });
    const data = await res.json() as { status: string; output?: string | string[]; error?: string };
    if (data.status === 'succeeded' || data.status === 'failed') return data;
  }

  return { status: 'processing' };
}

Deno.serve(withApiLogging('generate-interior-video-v2', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: accept service role key (internal agent-chat call) OR user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const body = await req.json();
  let userId: string;
  const isServiceCall = token === supabaseServiceKey && !!body.user_id;

  if (isServiceCall) {
    // Internal server-to-server call (from agent-chat edge function)
    userId = body.user_id;
  } else {
    // User JWT validation
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    userId = user.id;
  }

  const {
    source_image_url,
    video_type = 'walkthrough' as VideoType,
    model: requestedModel,
    prompt,
    aspect_ratio = '16:9' as AspectRatio,
    duration_seconds = 8,
    workspace_id,
    before_image_url,
    // Extra images held CONSISTENT across the clip — the product itself, its finish,
    // the room it goes in — which is the whole reason a generated interior is usable
    // as a sales asset rather than a plausible lookalike. Wan, Seedance and MiniMax
    // take them; Veo and Ray do not.
    reference_image_urls,
    last_frame_url,
    generate_audio,
  } = body;

  // Invariant 1 (#364 EX-1). `workspace_id` comes from the body and then routes the debit,
  // stamps `generation_videos` and stamps the `ai_usage_logs` row that this tenant's admins
  // read through `is_workspace_admin(workspace_id)`. 404, not 403 — no id enumeration.
  if (!isServiceCall && workspace_id
    && !(await userCanAccessWorkspace(supabase, userId, workspace_id))) {
    return jsonResponse({ success: false, error: 'Not found' }, 404);
  }

  if (!source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }

  // Capped at 19 so the first frame plus the references cannot exceed Wan's 20-reference
  // ceiling. Truncating here rather than at the provider keeps the SSRF loop bounded too.
  const referenceUrls: string[] = Array.isArray(reference_image_urls)
    ? reference_image_urls.filter((u: unknown): u is string => typeof u === 'string' && !!u).slice(0, 19)
    : [];

  // Invariant 7 (#364 EX-7). These URLs are handed to Replicate / Veo / Kling, which fetch them
  // from THEIR network — and the Veo and Kling branches also make us fetch them ourselves. A
  // provider fetching an internal address on our behalf is the same primitive as fetching it
  // here, so validate before either happens rather than at whichever call site fetches first.
  try {
    await assertSafeUrl(source_image_url, { allowSchemes: ['https:'] });
    if (before_image_url) await assertSafeUrl(before_image_url, { allowSchemes: ['https:'] });
    if (last_frame_url) await assertSafeUrl(last_frame_url, { allowSchemes: ['https:'] });
    // Every reference is a URL a caller chose and a provider will fetch, so each one
    // needs the guard — the loop is the point, not a formality (invariant 7).
    for (const refUrl of referenceUrls) {
      await assertSafeUrl(refUrl, { allowSchemes: ['https:'] });
    }
  } catch (e) {
    // Do not echo the URL or the upstream status — that makes the error a response oracle.
    return jsonResponse(
      { success: false, error: e instanceof SSRFError ? `Rejected image URL: ${e.message}` : 'Invalid image URL' },
      400,
    );
  }

  // The clip's LAST frame, and the one place `before_image_url` becomes real.
  //
  // It was documented on the tool ("Required only for before_after type"), validated above,
  // and then read by exactly one branch — Replicate's, which sets `image_end`. Every native
  // branch reads `last_frame_url` instead, so from the moment `before_after` stopped routing
  // to Replicate, the before image was accepted, SSRF-checked, and dropped. The caller got a
  // generic clip with no transition and nothing said otherwise.
  //
  // Direction follows what the Replicate branch already did: the source image is the design
  // and the "before" is where the clip ENDS.
  const endFrameUrl: string | undefined =
    last_frame_url || (video_type === 'before_after' ? before_image_url : undefined) || undefined;

  // Resolve model. `requestedModel` is client-supplied, so reject an unknown key
  // here rather than letting it flow on: CREDIT_COSTS[unknown] is undefined, which
  // debits `undefined` credits, writes credits_used=undefined onto generation_videos,
  // and only fails much later at the provider switch — refunding undefined.
  const resolvedModel: VideoModel = requestedModel || TYPE_MODEL_MAP[video_type as VideoType] || 'kling-v3.0';
  const creditCost = CREDIT_COSTS[resolvedModel];
  if (typeof creditCost !== 'number') {
    return jsonResponse({
      success: false,
      error: `Unknown model '${resolvedModel}'. Supported: ${Object.keys(CREDIT_COSTS).join(', ')}`,
    }, 400);
  }

  // Clamped to the model's ceiling, and defended against a non-numeric or negative body value
  // (`Number('abc')` is NaN, and NaN silently defeats a bare Math.min). Everything downstream —
  // the provider call, the usage log, the stored record — uses this, never the raw body field.
  const requestedDuration = Number(duration_seconds);
  const clampedDuration = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.min(Math.round(requestedDuration), MAX_DURATION_SECONDS[resolvedModel])
    : Math.min(8, MAX_DURATION_SECONDS[resolvedModel]);

  // Ray takes 5 or 10 and nothing between — those are the two durations Luma publishes a
  // price for — and the snap happens HERE rather than inside the shared client so that the
  // number stored on `generation_videos.duration_s` and logged to `ai_usage_logs` is the
  // clip that was actually made. Snapping downstream would have recorded the UI's default 8
  // against a 10-second video: a plausible number, off by two, in the row an operator reads.
  const durationSeconds = RAY_RESOLUTION[resolvedModel]
    ? (clampedDuration > 7 ? 10 : 5)
    : clampedDuration;

  // `ai_model_pricing` keys differ from the model ids this function uses: the price
  // table carries `kling-3.0`, here it is `kling-v3.0`. Identity map only — no prices
  // are defined here. (Issue #4 Phase 1 deletes this map by making the id the key everywhere.)
  const PRICING_KEY_BY_MODEL: Record<string, string> = {
    'kling-v3.0': 'kling-3.0',
  };

  // This function debited credits per video but wrote NO ai_usage_logs row at all, so
  // interior video generation was absent from usage and cost reporting entirely — not a
  // null cost, no row. Kling/Wan rows are priced per SECOND, so units = actual duration.
  const logVideoUsage = async (actualSeconds: number) => {
    const key = PRICING_KEY_BY_MODEL[resolvedModel] ?? resolvedModel;
    const pricing = await getServicePricing(supabase, key);
    if (!pricing) {
      console.warn(`[generate-interior-video-v2] no ai_model_pricing row for "${key}" — cost logged as null`);
    }
    const units = pricing?.unit === 'second' ? actualSeconds : 1;
    const rawCostUsd = pricing ? pricing.cost_per_unit * units : null;
    // Billing row: never throw (the credits are debited and the paid call already happened),
    // but never silent either. `.then(() => {}, () => {})` discarded the outcome — the
    // `stamp_job_refresh_cost` shape, where spend is charged to a tenant and reported against
    // nobody while every health signal stays green (#364 EX-14). try/catch covers both failure
    // modes: supabase-js RESOLVES with `{ error }` on an RLS denial and REJECTS on transport.
    try {
      const { error: usageErr } = await supabase.from('ai_usage_logs').insert({
        user_id: userId,
        workspace_id: workspace_id ?? null,
        operation_type: 'interior_video_generation_v2',
        model_name: key,
        credits_debited: creditCost,
        raw_cost_usd: rawCostUsd,
        billed_cost_usd: rawCostUsd === null ? null : rawCostUsd * pricing!.markup_multiplier,
        markup_multiplier: pricing?.markup_multiplier ?? null,
        metadata: {
          model: resolvedModel, video_type, billing_type: 'per_unit',
          units, unit: pricing?.unit ?? null,
        },
      });
      if (usageErr) throw usageErr;
    } catch (usageErr) {
      console.error('[generate-interior-video-v2] ai_usage_logs insert FAILED — spend is unattributed', usageErr);
      await captureException(
        usageErr instanceof Error ? usageErr : new Error(String((usageErr as { message?: string })?.message ?? usageErr)),
        {
          tags: { area: 'billing', operation: 'interior_video_generation_v2' },
          extra: { user_id: userId, workspace_id: workspace_id ?? null, credits: creditCost },
          fingerprint: ['ai-usage-log-write-failed', 'interior_video_generation_v2'],
        },
      );
    }
  };

  // ① Debit credits upfront
  const { data: debitData, error: debitError } = await supabase.rpc('debit_credits', {
    p_user_id: userId,
    p_amount: creditCost,
    p_operation_type: 'interior_video_generation_v2',
    p_description: `Interior video v2 (${resolvedModel}, ${video_type})`,
    p_metadata: { model: resolvedModel, video_type, duration_seconds: durationSeconds, aspect_ratio, workspace_id },
    p_workspace_id: workspace_id ?? null,
  });

  const debit = Array.isArray(debitData) ? debitData[0] : debitData;
  if (debitError || !debit?.success) {
    return jsonResponse({ success: false, error: debit?.error_message || 'Insufficient credits' }, 402);
  }

  // ② Create generation_videos record
  const { data: videoRecord, error: recordErr } = await supabase
    .from('generation_videos')
    .insert({
      user_id: userId,
      workspace_id,
      source_image_url,
      prompt,
      status: 'processing',
      model: resolvedModel,
      aspect_ratio,
      duration_s: durationSeconds,
      credits_used: creditCost,
      video_type,
      model_version: REPLICATE_MODELS[resolvedModel] || resolvedModel,
    })
    .select('id')
    .single();

  if (recordErr || !videoRecord) {
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'interior_video_generation_v2_refund',
      p_description: 'Refund: failed to create generation record',
      p_workspace_id: workspace_id ?? null,
    });
    return jsonResponse({ success: false, error: 'Failed to create generation record' }, 500);
  }

  const jobId = videoRecord.id;
  const uploadCtx: Partial<SessionPathCtx> = { userId, conversationId: body.conversation_id };

  try {
    // ③ Generate video
    if (resolvedModel === 'veo-2') {
      // Use existing Veo integration from ai-client.ts
      const defaultPrompt = video_type === 'walkthrough'
        ? 'Smooth cinematic walkthrough of the interior space, slow dolly forward, professional real estate video'
        : video_type === 'floorplan_flythrough'
        ? 'Aerial cinematic flythrough of the floorplan, smooth overhead camera movement'
        : 'Professional interior design showcase video, smooth camera movement';

      const veoResult = await generateVideoWithVeo(
        prompt || defaultPrompt,
        {
          imageUrl: source_image_url,
          aspectRatio: aspect_ratio as '16:9' | '9:16',
          durationSeconds,
        },
      );

      const videoUrl = await uploadVideoToStorage(supabase, veoResult.base64, jobId, true, uploadCtx);
      await logVideoUsage(durationSeconds);

      // This write is the ONLY record that the job finished, and the "your video is ready"
      // notification fires immediately after it. Discarding the result meant an RLS denial or a
      // transport blip left the row stuck on `processing` with a null video_url while the user
      // was told it was ready — they click through to nothing, and the job never resolves.
      // Throwing hands it to the catch below, which refunds and records a terminal `failed`:
      // less pleasant, but true, and recoverable (#347 audit).
      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        workspace_id,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        status: 'completed',
      });

    } else if (WAN_RESOLUTION[resolvedModel]) {
      // Wan3.0 — 30 seconds, scored in the same pass. `reference_urls` hold a specific
      // product in frame instead of a plausible lookalike, but wan3 will not accept them
      // ALONGSIDE a source frame, so the shared client drops them and says how many:
      // `references_dropped` below is that count, not a silence.
      const wanPrompt = prompt
        || 'Professional cinematic interior walkthrough, smooth continuous camera movement';

      const wanResult = await generateVideoWithWan(wanPrompt, {
        imageUrl: source_image_url,
        lastFrameUrl: endFrameUrl,
        references: referenceUrls.map((url) => ({ kind: 'image' as const, url })),
        durationSeconds,
        resolution: WAN_RESOLUTION[resolvedModel],
        aspectRatio: aspect_ratio as '16:9' | '9:16' | '1:1',
        generateAudio: generate_audio !== false,
        task: 'interior_video_generation_v2',
        userId,
        workspaceId: workspace_id ?? undefined,
        // `logVideoUsage` below owns this call's ai_usage_logs row. Before the move to
        // the provider both wrote one, so every Wan clip was counted twice in cost.
        logUsage: false,
      });

      const videoUrl = await uploadVideoToStorage(supabase, wanResult.bytes, jobId, false, uploadCtx);
      await logVideoUsage(wanResult.durationSeconds);

      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        workspace_id,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        duration_seconds: wanResult.durationSeconds,
        has_audio: wanResult.hasAudio,
        references_dropped: wanResult.referencesDropped,
        status: 'completed',
      });

    } else if (SEEDANCE_RESOLUTION[resolvedModel]) {
      // Seedance 2.5 (ByteDance) — 30 seconds in one pass, scored, with role-tagged
      // references. `last_frame_url` and `reference_urls` are the same inputs Wan takes;
      // the difference is that Ark receives them TAGGED (first_frame / last_frame /
      // reference_image) instead of as one undifferentiated list.
      const seedancePrompt = prompt
        || 'Professional cinematic interior walkthrough, smooth continuous camera movement';

      const seedanceResult = await generateVideoWithSeedance(seedancePrompt, {
        imageUrl: source_image_url,
        lastFrameUrl: endFrameUrl,
        referenceUrls: referenceUrls,
        durationSeconds,
        resolution: SEEDANCE_RESOLUTION[resolvedModel],
        aspectRatio: aspect_ratio as '16:9' | '9:16' | '1:1',
        generateAudio: generate_audio !== false,
        task: 'interior_video_generation_v2',
        userId,
        workspaceId: workspace_id ?? undefined,
        // `logVideoUsage` below writes the row for this call, with `credits_debited` and
        // `video_type` attached. Letting the shared client write one too would put TWO
        // rows in `ai_usage_logs` for one clip and double every cost view.
        logUsage: false,
      });

      // Bytes, not base64: a 30-second 720p clip is ~20 MB and base64 carries a third
      // more through an edge function that then has to decode it again.
      const videoUrl = await uploadVideoToStorage(supabase, seedanceResult.bytes, jobId, false, uploadCtx);
      await logVideoUsage(seedanceResult.durationSeconds);

      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        workspace_id,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        duration_seconds: seedanceResult.durationSeconds,
        has_audio: seedanceResult.hasAudio,
        status: 'completed',
      });

    } else if (RAY_RESOLUTION[resolvedModel]) {
      // Luma Ray3.2 — first/last frame interpolation and per-frame direction. Hands
      // back a presigned URL that expires in about an hour, so it goes straight into
      // `uploadVideoToStorage`, which is the one guarded download path.
      const rayPrompt = prompt
        || 'Professional cinematic interior walkthrough, smooth continuous camera movement';

      const rayResult = await generateVideoWithRay(rayPrompt, {
        imageUrl: source_image_url,
        lastFrameUrl: endFrameUrl,
        durationSeconds,
        resolution: RAY_RESOLUTION[resolvedModel],
        aspectRatio: aspect_ratio as '16:9' | '9:16' | '1:1',
        task: 'interior_video_generation_v2',
        userId,
        workspaceId: workspace_id ?? undefined,
        // `logVideoUsage` below owns this call's ai_usage_logs row.
        logUsage: false,
      });

      const videoUrl = await uploadVideoToStorage(supabase, rayResult.url, jobId, false, uploadCtx);
      await logVideoUsage(rayResult.durationSeconds);

      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        workspace_id,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        duration_seconds: rayResult.durationSeconds,
        status: 'completed',
      });

    } else if (resolvedModel === 'minimax-h3') {
      // MiniMax H3 (Hailuo 3.0) — the reel model: 5-15s, native 2K, stereo audio.
      //
      // It will not take a frame image AND references in the same call, so the client
      // is told which one it got rather than left to wonder: `references_dropped` in
      // the response is the count the model never saw. Same for the ratio — with a
      // source frame the model derives it, so a vertical reel needs a vertical source.
      const minimaxPrompt = prompt
        || 'Professional cinematic interior reel, smooth continuous camera movement';

      const minimaxResult = await generateVideoWithMinimax(minimaxPrompt, {
        imageUrl: source_image_url,
        lastFrameUrl: endFrameUrl,
        referenceUrls: referenceUrls,
        durationSeconds,
        aspectRatio: aspect_ratio as '16:9' | '9:16' | '1:1',
        task: 'interior_video_generation_v2',
        userId,
        workspaceId: workspace_id ?? undefined,
        // `logVideoUsage` below owns this call's ai_usage_logs row.
        logUsage: false,
      });

      const videoUrl = await uploadVideoToStorage(supabase, minimaxResult.bytes, jobId, false, uploadCtx);
      await logVideoUsage(minimaxResult.durationSeconds);

      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        workspace_id,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        duration_seconds: minimaxResult.durationSeconds,
        has_audio: minimaxResult.hasAudio,
        references_dropped: minimaxResult.referencesDropped,
        status: 'completed',
      });

    } else if (resolvedModel === 'kling-v3.0') {
      // Kling v3.0 via native @ai-sdk/klingai
      const klingPrompt = prompt || 'Professional cinematic interior design video, smooth camera movement';
      const klingDuration = durationSeconds >= 10 ? 10 : 5;

      const klingResult = await generateVideoWithKling(klingPrompt, {
        model: 'kling-v3.0-i2v',
        imageUrl: source_image_url,
        durationSeconds: klingDuration as 5 | 10,
        aspectRatio: aspect_ratio as '16:9' | '9:16' | '1:1',
        mode: 'pro',
      });

      const videoUrl = await uploadVideoToStorage(supabase, klingResult.base64, jobId, true, uploadCtx);
      await logVideoUsage(klingDuration);

      // This write is the ONLY record that the job finished, and the "your video is ready"
      // notification fires immediately after it. Discarding the result meant an RLS denial or a
      // transport blip left the row stuck on `processing` with a null video_url while the user
      // was told it was ready — they click through to nothing, and the job never resolves.
      // Throwing hands it to the catch below, which refunds and records a terminal `failed`:
      // less pleasant, but true, and recoverable (#347 audit).
      const { error: completeErr } = await supabase.from('generation_videos').update({
        status: 'completed',
        video_url: videoUrl,
        completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (completeErr) throw completeErr;

      emitFlowEvent('video_generation_completed', {
        user_id: userId,
        workspace_id,
        type: 'video_ready',
        title: 'Your video is ready!',
        body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
        job_id: jobId,
        video_type,
      }).catch(() => {});

      return jsonResponse({
        success: true,
        job_id: jobId,
        video_url: videoUrl,
        model_used: resolvedModel,
        credits_used: creditCost,
        video_type,
        status: 'completed',
      });

    } else {
      // Replicate models (Wan 720p, Runway Gen-4)
      const replicateModel = REPLICATE_MODELS[resolvedModel];
      if (!replicateModel) throw new Error(`Unknown model: ${resolvedModel}`);

      // Build model-specific input
      const replicateInput: Record<string, unknown> = {
        image: source_image_url,
        prompt: prompt || 'Professional cinematic interior design video, smooth camera movement',
        duration: durationSeconds,
        aspect_ratio,
      };

      // Model-specific params
      if (resolvedModel === 'runway-gen4-turbo') {
        replicateInput.ratio = aspect_ratio;
        replicateInput.image_as_end_frame = false;
      } else if (video_type === 'before_after' && before_image_url) {
        replicateInput.image_end = before_image_url;
      }

      const prediction = await createReplicatePrediction(replicateModel, replicateInput);

      // Update record with prediction ID
      await supabase.from('generation_videos').update({
        replicate_prediction_id: prediction.id,
      }).eq('id', jobId);

      // Poll (50s budget — leave 10s for edge function overhead)
      const pollResult = await pollReplicate(prediction.id, 50_000);

      if (pollResult.status === 'succeeded') {
        const rawUrl = Array.isArray(pollResult.output) ? pollResult.output[0] : pollResult.output as string;
        const videoUrl = await uploadVideoToStorage(supabase, rawUrl, jobId, false, uploadCtx);
        await logVideoUsage(durationSeconds);

        // Same as the two branches above: the completion write is the only record the job
        // finished, and the "ready" notification fires straight after it.
        const { error: completeErr } = await supabase.from('generation_videos').update({
          status: 'completed',
          video_url: videoUrl,
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
        if (completeErr) throw completeErr;

        emitFlowEvent('video_generation_completed', {
          user_id: userId,
          workspace_id,
          type: 'video_ready',
          title: 'Your video is ready!',
          body: `Your ${video_type.replace(/_/g, ' ')} video has been generated successfully.`,
          job_id: jobId,
          video_type,
        }).catch(() => {});

        return jsonResponse({
          success: true,
          job_id: jobId,
          video_url: videoUrl,
          model_used: resolvedModel,
          credits_used: creditCost,
          video_type,
          status: 'completed',
        });

      } else if (pollResult.status === 'processing') {
        // Return async job for frontend polling
        return jsonResponse({
          success: true,
          job_id: jobId,
          async_job: true,
          prediction_id: prediction.id,
          model_used: resolvedModel,
          credits_used: creditCost,
          video_type,
          status: 'processing',
          message: 'Video generation in progress. Poll with job_id to check status.',
        });

      } else {
        throw new Error(pollResult.error || 'Replicate generation failed');
      }
    }

  } catch (err) {
    // Refund and mark failed
    await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: 'interior_video_generation_v2_refund',
      p_description: `Refund: ${resolvedModel} generation failed`,
      p_workspace_id: workspace_id ?? null,
    });

    // The refund has already gone through, so this must not throw — but it must not vanish
    // either: if the terminal write fails the row stays on `processing` forever, and a stuck
    // row that was actually refunded is exactly the state nobody can reconstruct later.
    const { error: failErr } = await supabase.from('generation_videos').update({
      status: 'failed',
      error_message: String(err),
    }).eq('id', jobId);
    if (failErr) {
      console.error(`[generate-interior-video-v2] job ${jobId} refunded but could NOT be marked failed`, failErr);
    }

    emitFlowEvent('video_generation_failed', {
      user_id: userId,
      workspace_id,
      type: 'video_failed',
      title: 'Video generation failed',
      body: 'Something went wrong generating your video. Any credits used have been refunded.',
      job_id: jobId,
      video_type,
    }).catch(() => {});

    console.error('[generate-interior-video-v2] Error:', err);
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}));
