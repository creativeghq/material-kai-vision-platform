import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import { generateImageWithGemini } from '../_shared/ai-client.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { fetchImageGuarded } from '../_shared/fetch-image.ts';
import { captureException } from '../_shared/sentry.ts';
import type { DbClient } from '../_shared/supabase-client.ts';

const BUCKET = 'generation-images';
const SERVICE = 'surface-texture';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const formatText = (attributes: Record<string, unknown> | null, metadata: Record<string, unknown> | null): string => {
  const w = Number(attributes?.width_mm ?? metadata?.width_mm);
  const l = Number(attributes?.length_mm ?? metadata?.length_mm);
  if (w > 0 && l > 0) return `one ${Math.round(w / 10)} × ${Math.round(l / 10)} cm piece, the frame in that same proportion`;
  const sizes = metadata?.available_sizes;
  const first = Array.isArray(sizes) ? sizes[0] : null;
  if (typeof first === 'string' && first.trim()) return `one ${first.trim()} piece, the frame in that same proportion`;
  return 'a square area of about 60 × 60 cm';
};

Deno.serve(withApiLogging(SERVICE, async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Invalid session');
  const uid = auth.userId;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = (await req.json().catch(() => ({}))) as { product_id?: string; workspace_id?: string };
  if (!body.product_id || !body.workspace_id) throw new HttpError(400, 'product_id and workspace_id required');

  const ws = body.workspace_id;
  if (!(await userHasWorkspaceCapability(admin, uid, ws, 'moodboards.use'))) throw new HttpError(404, 'Product not found');
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: visible } = await caller.from('products').select('id').eq('id', body.product_id).maybeSingle();
  if (!visible) throw new HttpError(404, 'Product not found');
  const { data: product } = await admin.from('products').select('id, name, workspace_id, attributes, metadata').eq('id', body.product_id).maybeSingle();
  if (!product) throw new HttpError(404, 'Product not found');

  const { data: entitled } = await admin.rpc('is_workspace_entitled', { p_workspace_id: ws, p_module_slug: 'scene-studio' });
  if (entitled !== true) throw new HttpError(403, '3D rooms are not enabled for this workspace.');

  const existing = async () => {
    const { data } = await admin.from('product_material_maps')
      .select('storage_bucket, albedo_path').eq('product_id', product.id).eq('is_selected', true).is('option_value_id', null).maybeSingle();
    return data?.albedo_path ? admin.storage.from(data.storage_bucket).getPublicUrl(data.albedo_path).data.publicUrl as string : null;
  };
  const already = await existing();
  if (already) return json({ success: true, status: 'ready', charged: false, albedo_url: already });

  const { data: img } = await admin
    .from('image_product_associations')
    .select('overall_score, document_images(image_url)')
    .eq('product_id', product.id)
    .order('overall_score', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const imageUrl = (img?.document_images as { image_url?: string } | null)?.image_url;
  if (!imageUrl) throw new HttpError(409, 'This product has no photo to make a texture from.');

  const debit = await debitExternalServiceCredits(admin, uid, SERVICE, 'scene_studio_texture', 1, { product_id: product.id }, ws);
  if (!debit.success) {
    return json({ success: false, error: debit.error ?? 'Insufficient credits', credits_required: debit.credits_debited, service: SERVICE }, 402);
  }

  try {
    const source = await fetchImageGuarded(imageUrl);
    const prompt = (await loadPrompt(admin, 'generation', 'scene_texture', 'albedo'))
      .split('{product}').join(`"${product.name}"`)
      .split('{format}').join(formatText(product.attributes as Record<string, unknown> | null, product.metadata as Record<string, unknown> | null));
    const out = await generateImageWithGemini(
      { text: prompt, images: [source.bytes] },
      { task: 'surface-texture-albedo', userId: uid, workspaceId: ws, chargedSeparately: true },
    );
    const path = `material-maps/products/${product.id}/${Date.now()}-albedo.png`;
    const bytes = Uint8Array.from(atob(out.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: out.mimeType || 'image/png', upsert: false });
    if (upErr) throw new Error(`The texture could not be stored: ${upErr.message}`);
    const { error: insErr } = await admin.from('product_material_maps').insert({
      workspace_id: product.workspace_id, product_id: product.id, option_value_id: null, model: 'gemini-image',
      storage_bucket: BUCKET, albedo_path: path, is_selected: true, source: 'ai_derived', source_image_url: imageUrl, created_by: uid,
    });
    if (insErr) {
      const raced = await existing();
      if (!raced) throw new Error(`The texture could not be saved: ${insErr.message}`);
      await admin.storage.from(BUCKET).remove([path]);
      await refundCharge(admin, uid, debit.credits_debited, debit.transaction_id ?? null, ws, 'Made by another request at the same time');
      return json({ success: true, status: 'ready', charged: false, albedo_url: raced });
    }
    return json({
      success: true, status: 'ready', charged: true, credits_used: debit.credits_debited,
      albedo_url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await refundCharge(admin, uid, debit.credits_debited, debit.transaction_id ?? null, ws, message);
    throw new HttpError(502, `The texture could not be made: ${message.slice(0, 200)}. Your credits were refunded.`);
  }
}));

async function refundCharge(
  admin: DbClient, uid: string, credits: number, transactionId: string | null, ws: string, reason: string,
) {
  if (credits <= 0) return;
  const { error } = await admin.rpc('refund_credits', {
    p_user_id: uid,
    p_amount: credits,
    p_operation_type: 'scene_studio_texture_refund',
    p_description: `Texture not made: ${reason.slice(0, 120)}`,
    p_metadata: { refunds_transaction_id: transactionId },
    p_workspace_id: ws,
  });
  if (error) void captureException(new Error(`surface-texture refund failed: ${error.message}`), { tags: { function: SERVICE } });
}
