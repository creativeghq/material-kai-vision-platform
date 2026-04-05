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

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const replicateToken = Deno.env.get('REPLICATE_API_TOKEN') || '';

const CREDIT_COST = 20;
const MODEL = 'proplabs/virtual-staging';

interface VirtualStagingRequest {
  source_image_url: string;
  room: string;
  furniture_style?: string;
  furniture_items?: string;
  workspace_id?: string;
  user_id?: string; // For internal server-to-server calls from agent-chat
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  jobId: string,
): Promise<string> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Failed to download staged image: ${resp.status}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const path = `virtual-staging/${jobId}.${ext}`;

  const { error } = await supabase.storage
    .from('generation-images')
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
  return data.publicUrl;
}

async function deductCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  description: string,
): Promise<void> {
  const { data, error } = await supabase.rpc('debit_user_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'virtual_staging',
    p_description: description,
  });
  if (error) throw new Error(`Credit deduction failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (row && !row.success) throw new Error(`Credit deduction failed: ${row.error_message}`);
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
      'Authorization': `Bearer ${replicateToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        image: imageUrl,
        room,
        furniture_style: furnitureStyle,
        furniture_items: furnitureItems || 'Default (AI decides)',
        replicate_api_key: replicateToken,
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
      headers: { 'Authorization': `Bearer ${replicateToken}` },
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: accept service role key (internal server-to-server) OR user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let userId: string;

  if (token === supabaseServiceKey) {
    // Internal call from agent-chat edge function — user_id must be in body
    const rawBody = await req.json() as VirtualStagingRequest;
    if (!rawBody.user_id) {
      return jsonResponse({ success: false, error: 'user_id required for internal calls' }, 400);
    }
    userId = rawBody.user_id;
    return await handleRequest(supabase, rawBody, userId);
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

  return await handleRequest(supabase, body, userId);
}));

async function handleRequest(
  supabase: ReturnType<typeof createClient>,
  body: VirtualStagingRequest,
  userId: string,
): Promise<Response> {
  if (!body.source_image_url) {
    return jsonResponse({ success: false, error: 'source_image_url is required' }, 400);
  }
  if (!body.room) {
    return jsonResponse({ success: false, error: 'room is required' }, 400);
  }
  if (!replicateToken) {
    return jsonResponse({ success: false, error: 'REPLICATE_API_TOKEN not configured' }, 500);
  }

  const jobId = crypto.randomUUID();
  const room = body.room;
  const furnitureStyle = body.furniture_style || 'Default (AI decides)';

  try {
    const tempUrl = await runReplicate(body.source_image_url, room, furnitureStyle, body.furniture_items);
    const imageUrl = await uploadToStorage(supabase, tempUrl, jobId);

    await deductCredits(
      supabase,
      userId,
      CREDIT_COST,
      `Virtual staging (${room}, ${furnitureStyle})`,
    );

    supabase.from('user_notifications').insert({
      user_id: userId,
      type: 'staging_ready',
      title: 'Virtual staging complete!',
      body: `Your ${room} has been virtually staged and is ready to view.`,
      action_url: null,
      is_read: false,
      metadata: { job_id: jobId, room },
    }).then(() => {});

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
    return jsonResponse({ success: false, error: message }, 500);
  }
}
