import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import { generateImageWithGemini } from '../_shared/ai-client.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import { fetchImageGuarded } from '../_shared/fetch-image.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
import { captureException } from '../_shared/sentry.ts';

const BUCKET = 'generation-images';
const STALE_MS = 15 * 60 * 1000;
const SERVICE = 'object-3d';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const publicUrl = (admin: DbClient, path: string) => admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string;

interface Target {
  kind: 'product' | 'variant' | 'scene_object';
  finish?: { text: string; imageUrl: string | null };
  variantKey?: string;
  id: string;
  rowId: string;
  what: string;
  workspaceId: string;
  folder: string;
  source: { url?: string; path?: string };
  linkObjectId?: string;
}

interface Charge { uid: string; credits: number; transactionId: string | null; workspaceId: string }

async function refund(admin: DbClient, charge: Charge, reason: string, meta: Record<string, unknown>) {
  if (charge.credits <= 0) return;
  const { error } = await admin.rpc('refund_credits', {
    p_user_id: charge.uid,
    p_amount: charge.credits,
    p_operation_type: 'object_3d_refund',
    p_description: `3D generation failed: ${reason.slice(0, 120)}`,
    p_metadata: { ...meta, refunds_transaction_id: charge.transactionId },
    p_workspace_id: charge.workspaceId,
  });
  if (error) void captureException(new Error(`object-3d refund failed: ${error.message}`), { tags: { function: SERVICE } });
}

const productTable = (t: Target) => (t.kind === 'variant' ? 'product_3d_model_variants' : 'product_3d_models');

async function sha32(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function markFailed(admin: DbClient, t: Target, message: string) {
  const msg = message.slice(0, 500);
  if (t.linkObjectId) {
    await admin.from('floor_plan_objects').update({ model_status: 'failed', model_error: msg, model_updated_at: new Date().toISOString() }).eq('id', t.linkObjectId);
  }
  const { error } = t.kind !== 'scene_object'
    ? await admin.from(productTable(t)).update({ status: 'failed', error: msg }).eq('id', t.rowId)
    : await admin.from('floor_plan_objects').update({ model_status: 'failed', model_error: msg, model_updated_at: new Date().toISOString() }).eq('id', t.rowId);
  if (error) console.error('[object-3d] could not mark failed:', error.message);
}

async function generate(admin: DbClient, t: Target, charge: Charge): Promise<void> {
  try {
    let bytes: Uint8Array;
    if (t.source.path) {
      const { data, error } = await admin.storage.from(BUCKET).download(t.source.path);
      if (error || !data) throw new Error('The object image could not be read.');
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = (await fetchImageGuarded(t.source.url!)).bytes;
    }
    const images = [bytes];
    let prompt: string;
    if (t.finish) {
      if (t.finish.imageUrl) images.push((await fetchImageGuarded(t.finish.imageUrl)).bytes);
      prompt = (await loadPrompt(admin, 'generation', 'object_3d', 'clean_shot_finish'))
        .split('{object}').join(t.what).split('{finish}').join(t.finish.text);
    } else {
      prompt = (await loadPrompt(admin, 'generation', 'object_3d', 'clean_shot')).split('{object}').join(t.what);
    }
    const shot = await generateImageWithGemini(
      { text: prompt, images },
      { task: 'object-3d-clean-shot', userId: charge.uid, workspaceId: charge.workspaceId, chargedSeparately: true },
    );
    const stamp = Date.now();
    const cleanPath = `${t.folder}/${stamp}-clean.png`;
    const cleanBytes = Uint8Array.from(atob(shot.base64), (c) => c.charCodeAt(0));
    const { error: upErr } = await admin.storage.from(BUCKET).upload(cleanPath, cleanBytes, { contentType: shot.mimeType || 'image/png', upsert: false });
    if (upErr) throw new Error(`The clean shot could not be stored: ${upErr.message}`);
    if (t.kind !== 'scene_object') {
      await admin.from(productTable(t)).update({ input_image_path: cleanPath, source_image_url: t.source.url ?? null }).eq('id', t.rowId);
    } else {
      await admin.from('floor_plan_objects').update({ model_source_url: publicUrl(admin, cleanPath) }).eq('id', t.rowId);
    }
    const res = await fetch(`${Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr'}/api/internal/object3d/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': Deno.env.get('CRON_SECRET') || '' },
      body: JSON.stringify({
        target: t.kind, row_id: t.rowId, image_path: cleanPath, out_path: `${t.folder}/${stamp}.spz`, link_object_id: t.linkObjectId ?? null,
        model_finish: t.finish?.text ?? null,
        refund: { user_id: charge.uid, credits: charge.credits, transaction_id: charge.transactionId, workspace_id: charge.workspaceId },
      }),
    });
    if (res.status !== 202) throw new Error(`The 3D generator did not accept the job (HTTP ${res.status}).`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(admin, t, message);
    await refund(admin, charge, message, { target: t.kind, id: t.id });
    void captureException(err instanceof Error ? err : new Error(message), { tags: { function: SERVICE }, extra: { target: t.kind, id: t.id } });
  }
}

Deno.serve(withApiLogging(SERVICE, async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Invalid session');
  const uid = auth.userId;
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = (await req.json().catch(() => ({}))) as {
    product_id?: string; floor_plan_object_id?: string; workspace_id?: string; image_path?: string;
    finish?: { description?: string; image_url?: string };
  };
  const finishText = typeof body.finish?.description === 'string' ? body.finish.description.trim().slice(0, 600) : '';
  const finishImage = typeof body.finish?.image_url === 'string' && body.finish.image_url.startsWith('https://') ? body.finish.image_url : null;
  const finish = finishText ? { text: finishText, imageUrl: finishImage } : undefined;

  let target: Target;
  let productWorkspace = '';
  let ready: string | null = null;
  let processing = false;

  if (body.product_id) {
    const ws = body.workspace_id;
    if (!ws || !(await userHasWorkspaceCapability(admin, uid, ws, 'moodboards.use'))) throw new HttpError(404, 'Product not found');
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: visible } = await caller.from('products').select('id').eq('id', body.product_id).maybeSingle();
    if (!visible) throw new HttpError(404, 'Product not found');
    const { data: product } = await admin.from('products').select('id, name, workspace_id').eq('id', body.product_id).maybeSingle();
    if (!product) throw new HttpError(404, 'Product not found');
    const { data: img } = await admin
      .from('image_product_associations')
      .select('overall_score, document_images(image_url)')
      .eq('product_id', product.id)
      .order('overall_score', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    productWorkspace = product.workspace_id;
    const imageUrl = (img?.document_images as { image_url?: string } | null)?.image_url;
    const variantKey = finish ? await sha32(`${finish.text}|${finish.imageUrl ?? ''}`) : null;
    target = {
      kind: variantKey ? 'variant' : 'product', id: product.id, rowId: '', what: `the product "${product.name}"`, workspaceId: ws,
      folder: variantKey ? `object-3d/products/${product.id}/variants/${variantKey}` : `object-3d/products/${product.id}`,
      source: { url: imageUrl }, finish, variantKey: variantKey ?? undefined,
    };
    const { data: row } = variantKey
      ? await admin.from('product_3d_model_variants')
        .select('id, status, storage_path, updated_at').eq('product_id', product.id).eq('variant_key', variantKey).maybeSingle()
      : await admin.from('product_3d_models')
        .select('id, status, storage_path, updated_at').eq('product_id', product.id).in('format', ['ply', 'spz']).maybeSingle();
    if (row?.status === 'ready') ready = row.storage_path;
    else if (row?.status === 'processing' && Date.parse(row.updated_at) > Date.now() - STALE_MS) processing = true;
    else if (!imageUrl) throw new HttpError(409, 'This product has no photo to make a 3D model from.');
    target.rowId = row?.id ?? '';
    if (body.floor_plan_object_id) {
      const { data: link } = await admin.from('floor_plan_objects')
        .select('id, product_id, floor_plans(workspace_id)').eq('id', body.floor_plan_object_id).maybeSingle();
      const linkWs = (link?.floor_plans as { workspace_id?: string } | null)?.workspace_id;
      if (!link || link.product_id !== product.id || linkWs !== ws) throw new HttpError(404, 'Object not found');
      target.linkObjectId = link.id;
    }
  } else if (body.floor_plan_object_id) {
    const { data: obj } = await admin.from('floor_plan_objects')
      .select('id, label, kind, floor_plan_id, product_id, model_status, model_storage_path, model_updated_at, model_finish, floor_plans(workspace_id)')
      .eq('id', body.floor_plan_object_id).maybeSingle();
    const ws = (obj?.floor_plans as { workspace_id?: string } | null)?.workspace_id;
    if (!obj || !ws || !(await userHasWorkspaceCapability(admin, uid, ws, 'moodboards.use'))) throw new HttpError(404, 'Object not found');
    const folder = `scene-studio/${ws}/${obj.floor_plan_id}`;
    target = {
      kind: 'scene_object', id: obj.id, rowId: obj.id, what: `the ${obj.label} (${String(obj.kind).replace(/_/g, ' ')})`, workspaceId: ws,
      folder: `${folder}/object-3d/${obj.id}`, source: { path: body.image_path }, finish,
    };
    if (obj.model_status === 'ready' && obj.model_storage_path && (obj.model_finish ?? '') === (finish?.text ?? '')) ready = obj.model_storage_path;
    else if (obj.model_status === 'processing' && obj.model_updated_at && Date.parse(obj.model_updated_at) > Date.now() - STALE_MS) processing = true;
    else if (!body.image_path || !body.image_path.startsWith(`${folder}/`) || body.image_path.includes('..')) {
      throw new HttpError(400, 'image_path must be a capture of this 3D room.');
    }
  } else {
    throw new HttpError(400, 'product_id or floor_plan_object_id required');
  }

  const { data: entitled } = await admin.rpc('is_workspace_entitled', { p_workspace_id: target.workspaceId, p_module_slug: 'scene-studio' });
  if (entitled !== true) throw new HttpError(403, '3D rooms are not enabled for this workspace.');

  if (processing) return json({ success: true, status: 'processing', charged: false });

  if (!ready) {
    const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
    if (target.kind !== 'scene_object') {
      if (!target.rowId) {
        const { data: ins, error } = target.kind === 'variant'
          ? await admin.from('product_3d_model_variants').insert({
            product_id: target.id, workspace_id: productWorkspace, variant_key: target.variantKey,
            finish_description: target.finish!.text, finish_image_url: target.finish!.imageUrl,
            storage_bucket: BUCKET, status: 'processing', created_by: uid,
          }).select('id').maybeSingle()
          : await admin.from('product_3d_models').insert({
            product_id: target.id, workspace_id: productWorkspace,
            format: 'spz', storage_bucket: BUCKET, storage_path: `${target.folder}/pending`, status: 'processing', source: 'generated', created_by: uid,
          }).select('id').maybeSingle();
        if (error || !ins) return json({ success: true, status: 'processing', charged: false });
        target.rowId = ins.id;
      } else {
        const { data: claimed } = await admin.from(productTable(target))
          .update({ status: 'processing', error: null, created_by: uid })
          .eq('id', target.rowId)
          .or(`status.eq.failed,and(status.eq.processing,updated_at.lt.${staleBefore})`)
          .select('id');
        if (!claimed?.length) return json({ success: true, status: 'processing', charged: false });
      }
    } else {
      const { data: claimed } = await admin.from('floor_plan_objects')
        .update({ model_status: 'processing', model_error: null, model_updated_at: new Date().toISOString() })
        .eq('id', target.rowId)
        .or(`model_status.is.null,model_status.eq.failed,and(model_status.eq.processing,model_updated_at.lt.${staleBefore})`)
        .select('id');
      if (!claimed?.length) return json({ success: true, status: 'processing', charged: false });
    }
  }

  const debit = await debitExternalServiceCredits(admin, uid, SERVICE, 'object_3d', 1, { target: target.kind, id: target.id, cached: !!ready }, target.workspaceId);
  if (!debit.success) {
    if (!ready) await markFailed(admin, target, 'Not enough credits');
    return json({ success: false, error: debit.error ?? 'Insufficient credits', credits_required: debit.credits_debited, service: SERVICE }, 402);
  }

  if (ready) {
    if (target.linkObjectId) {
      await admin.from('floor_plan_objects').update({
        model_status: 'ready', model_storage_path: ready, model_error: null, model_finish: finish?.text ?? null, model_updated_at: new Date().toISOString(),
      }).eq('id', target.linkObjectId);
    }
    return json({ success: true, status: 'ready', charged: true, credits_used: debit.credits_debited, url: publicUrl(admin, ready) });
  }

  if (target.linkObjectId) {
    await admin.from('floor_plan_objects').update({ model_status: 'processing', model_error: null, model_updated_at: new Date().toISOString() }).eq('id', target.linkObjectId);
  }
  const charge: Charge = { uid, credits: debit.credits_debited, transactionId: debit.transaction_id ?? null, workspaceId: target.workspaceId };
  const work = generate(admin, target, charge);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else await work;
  return json({ success: true, status: 'processing', charged: true, credits_used: debit.credits_debited, row_id: target.rowId }, 202);
}));
