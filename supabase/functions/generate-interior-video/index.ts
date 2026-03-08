/**
 * generate-interior-video
 *
 * Veo 2.0 video walkthrough generation from an interior design image.
 * Takes a source image URL + optional prompt and generates a short video.
 *
 * Model: veo-2.0-generate-001
 * Credits: 30 (standard 8s clip)
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { generateVideoWithVeo, type VeoModel } from '../_shared/ai-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CREDIT_COST = 30;

interface GenerateVideoRequest {
  source_image_url: string;
  prompt?: string;
  aspect_ratio?: '16:9' | '9:16';
  duration_seconds?: number;
  resolution?: '720p' | '1080p';
  workspace_id?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Upload base64 video to Supabase Storage, return public URL */
async function uploadVideoToStorage(
  supabase: ReturnType<typeof createClient>,
  base64: string,
  jobId: string,
  mimeType: string,
): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const path = `veo/${jobId}.${ext}`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

/** Deduct credits from user balance */
async function deductCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  description: string,
): Promise<void> {
  const { error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_description: description,
  });
  if (error) throw new Error(`Credit deduction failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await authenticate(req);
  if (!auth.user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  let body: GenerateVideoRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body.source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }

  const jobId = crypto.randomUUID();
  const model: VeoModel = 'veo-2.0-generate-001';
  const aspectRatio = body.aspect_ratio ?? '16:9';
  const durationSeconds = body.duration_seconds ?? 8;
  const resolution = body.resolution === '1080p' ? '1920x1080' : '1280x720';

  // Build prompt — describe a camera walkthrough of the room
  const prompt = body.prompt
    ? body.prompt
    : `Smooth cinematic camera walkthrough of this interior design space. The camera slowly pans and moves through the room, revealing the materials, furniture, and lighting in a professional real estate style video. Photorealistic, high quality, steady motion.`;

  // Insert initial row as 'processing'
  await supabase.from('generation_videos').insert({
    id: jobId,
    user_id: auth.user.id,
    workspace_id: body.workspace_id,
    source_image_url: body.source_image_url,
    prompt,
    model,
    aspect_ratio: aspectRatio,
    duration_s: durationSeconds,
    resolution,
    credits_used: CREDIT_COST,
    status: 'processing',
  });

  try {
    const result = await generateVideoWithVeo(prompt, {
      model,
      aspectRatio,
      durationSeconds,
      resolution,
    });

    const videoUrl = await uploadVideoToStorage(supabase, result.base64, jobId, result.mimeType);

    await deductCredits(
      supabase,
      auth.user.id,
      CREDIT_COST,
      `Interior video generation (${model})`,
    );

    await supabase.from('generation_videos').update({
      video_url: videoUrl,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

    return jsonResponse({
      success: true,
      job_id: jobId,
      video_url: videoUrl,
      credits_used: CREDIT_COST,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate-interior-video] Error:`, message);

    await supabase.from('generation_videos').update({
      status: 'failed',
      error_message: message,
    }).eq('id', jobId);

    return jsonResponse({ success: false, error: message }, 500);
  }
});
