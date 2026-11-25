import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, isCronAuthorized, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { loadPrompt } from '../_shared/prompt-utils.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { debitExternalServiceCredits } from '../_shared/credit-utils.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
import { fetchImageGuarded } from '../_shared/fetch-image.ts';
import { captureException } from '../_shared/sentry.ts';

const FN = 'scene-world';
const BUCKET = 'generation-images';
const ATLAS = 'https://api.atlas.worldlabs.ai/api/v2';
const MIN_VIEWS = 6;
const MAX_VIEWS = 20;
const CLAIM_MS = 90_000;
const VIEWS_TIMEOUT_MS = 30 * 60_000;
const BUILD_TIMEOUT_MS = 90 * 60_000;
const MAX_SPLAT_BYTES = 120 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

type Vec3 = [number, number, number];
interface View { depth_path: string; z_min: number; z_max: number; position: Vec3; quaternion: [number, number, number, number]; fov: number }
interface Frame { image: string; depth: string; camera: unknown }
interface World {
  id: string; workspace_id: string; floor_plan_id: string; quality: 'draft' | 'refined'; status: string; views: View[]; style_render_id: string | null;
  prompt: string; views_operation: string | null; splat_operation: string | null; frames: Frame[] | null; credits_charged: number; transaction_id: string | null;
  created_by: string; created_at: string;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown, n: number): number[] | null => (Array.isArray(v) && v.length === n && v.every(finite) ? v as number[] : null);

function readViews(raw: unknown, folder: string): View[] {
  if (!Array.isArray(raw) || raw.length < MIN_VIEWS || raw.length > MAX_VIEWS) throw new HttpError(400, `Between ${MIN_VIEWS} and ${MAX_VIEWS} views are needed.`);
  return raw.map((v) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const position = vec(o.position, 3);
    const quaternion = vec(o.quaternion, 4);
    const path = typeof o.depth_path === 'string' ? o.depth_path : '';
    if (!path.startsWith(`${folder}/worlds/`) || path.includes('..') || !path.endsWith('.png')) throw new HttpError(400, 'A view does not belong to this 3D room.');
    if (!position || !quaternion || !finite(o.z_min) || !finite(o.z_max) || !finite(o.fov) || o.z_min <= 0 || o.z_max < o.z_min || o.fov < 20 || o.fov > 110) {
      throw new HttpError(400, 'A view has no usable camera.');
    }
    return { depth_path: path, z_min: o.z_min, z_max: o.z_max, position: position as Vec3, quaternion: quaternion as View['quaternion'], fov: o.fov };
  });
}

const camera = (position: number[], quaternion: number[], fov: number, width: number, height: number) => {
  const f = height / 2 / Math.tan((fov * Math.PI) / 360);
  return { extrinsics: { position, quaternion, coordinateSystem: 'rub' }, intrinsics: { fx: f, fy: f, cx: width / 2, cy: height / 2, width, height } };
};

/** The rotation three.js `lookAt` gives a camera, as XYZW. */
function lookQuaternion(from: number[], to: number[]): number[] {
  const n = (v: number[]) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const z = n([from[0] - to[0], from[1] - to[1], from[2] - to[2]]);
  const x = n(cross([0, 1, 0], z));
  const y = cross(z, x);
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = [...x, ...y, ...z];
  const tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]; }
  if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]; }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

/** Pixel size of a JPEG or PNG, read from its header. */
function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0x89 && b[1] === 0x50) return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
    i += 2 + dv.getUint16(i + 2);
  }
  return null;
}

async function atlas(key: string, path: string, body?: unknown, idempotency?: string): Promise<Record<string, any>> {
  const res = await fetch(`${ATLAS}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'WLT-Api-Key': key, 'Content-Type': 'application/json', ...(idempotency ? { 'Idempotency-Key': idempotency } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[${FN}] Atlas ${path} ${res.status}: ${text.slice(0, 400)}`);
    throw new AtlasError(res.status, text);
  }
  return JSON.parse(text);
}

class AtlasError extends Error {
  retryable: boolean;
  constructor(status: number, text: string) {
    super(status === 402 ? 'The photoreal service is out of credit.' : `The photoreal service refused the request (HTTP ${status}): ${text.slice(0, 200)}`);
    this.retryable = status === 429 || status >= 500;
  }
}

async function atlasKey(admin: DbClient): Promise<string> {
  const { value } = await resolveSecret(admin, 'WORLDLABS_ATLAS_API_KEY');
  if (!value) throw new HttpError(503, 'Photoreal rooms are not configured.');
  return value;
}

const publicUrl = (admin: DbClient, path: string) => admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string;

async function refund(admin: DbClient, w: World, reason: string) {
  if (!(w.credits_charged > 0)) return;
  const { error } = await admin.rpc('refund_credits', {
    p_user_id: w.created_by,
    p_amount: w.credits_charged,
    p_operation_type: 'scene_world_refund',
    p_description: `Photoreal room failed: ${reason.slice(0, 120)}`,
    p_metadata: { scene_world_id: w.id, refunds_transaction_id: w.transaction_id },
    p_workspace_id: w.workspace_id,
  });
  if (error) void captureException(new Error(`scene-world refund failed: ${error.message}`), { tags: { function: FN } });
}

async function fail(admin: DbClient, w: World, reason: string) {
  const { data } = await admin.from('scene_worlds')
    .update({ status: 'failed', error: reason.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', w.id).in('status', ['views', 'building']).select('id');
  if (data?.length) await refund(admin, w, reason);
}

async function submitViews(admin: DbClient, key: string, w: World): Promise<string> {
  const targetFrames = w.views.map((v) => ({
    camera: camera(v.position, v.quaternion, v.fov, 1280, 720),
    depth: { logDepthAsset: { url: publicUrl(admin, v.depth_path) }, zMin: v.z_min, zMax: v.z_max },
  }));
  const contextFrames: unknown[] = [];
  if (w.style_render_id) {
    const { data: r } = await admin.from('scene_renders').select('image_url, camera').eq('id', w.style_render_id).eq('floor_plan_id', w.floor_plan_id).maybeSingle();
    const cam = r?.camera as { position?: number[]; target?: number[]; fov?: number } | null;
    if (r?.image_url && String(r.image_url).startsWith(Deno.env.get('SUPABASE_URL')!) && vec(cam?.position, 3) && vec(cam?.target, 3) && finite(cam?.fov)) {
      const size = imageSize((await fetchImageGuarded(r.image_url)).bytes);
      if (size) contextFrames.push({ imageAsset: { url: r.image_url }, camera: camera(cam!.position!, lookQuaternion(cam!.position!, cam!.target!), cam!.fov!, size.width, size.height) });
    }
  }
  const op = await atlas(key, '/tasks:atlasChisel', { targetFrames, contextFrames, prompt: w.prompt, enhancePrompt: false, returnDepth: true }, `scene-world-${w.id}-views`);
  return op.id as string;
}

async function assetBytes(key: string, ref: { assetId: string; url?: string }): Promise<Response> {
  const url = ref.url ?? (await atlas(key, `/assets/${ref.assetId}:createReadUrl`, {})).readUrl;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`An Atlas result could not be downloaded (HTTP ${res.status}).`);
  return res;
}

/** One step forward for one room: views → splat → stored file. Safe to repeat; each step is keyed on what is already recorded. */
async function advance(admin: DbClient, key: string, w: World): Promise<void> {
  const save = async (fields: Record<string, unknown>) => {
    const { error } = await admin.from('scene_worlds').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', w.id);
    if (error) throw new Error(error.message);
  };
  const age = Date.now() - Date.parse(w.created_at);
  try {
    if (w.status === 'views') {
      if (!w.views_operation) { await save({ views_operation: await submitViews(admin, key, w) }); return; }
      const op = await atlas(key, `/operations/${w.views_operation}`);
      if (!op.done) { if (age > VIEWS_TIMEOUT_MS) await fail(admin, w, 'The photoreal views took too long.'); return; }
      const got = (op.response?.frames ?? []) as Array<{ imageAsset: { assetId: string; url?: string }; depth?: { depthAsset?: { assetId: string } }; camera: unknown }>;
      if (op.error || !got.length || got.some((f) => !f.depth?.depthAsset?.assetId)) { await fail(admin, w, op.error?.message ?? 'The photoreal views came back incomplete.'); return; }
      const frames: Frame[] = got.map((f) => ({ image: f.imageAsset.assetId, depth: f.depth!.depthAsset!.assetId, camera: f.camera }));
      const poster = `scene-studio/${w.workspace_id}/${w.floor_plan_id}/worlds/${w.id}-poster.png`;
      const img = new Uint8Array(await (await assetBytes(key, got[0].imageAsset)).arrayBuffer());
      const { error: upErr } = await admin.storage.from(BUCKET).upload(poster, img, { contentType: 'image/png', upsert: true });
      await save({ status: 'building', frames, poster_path: upErr ? null : poster });
      w.status = 'building';
      w.frames = frames;
    }
    if (w.status === 'building') {
      if (!w.splat_operation) {
        const posedFrames = (w.frames ?? []).map((f) => ({ imageAsset: { assetId: f.image }, depth: { depthAsset: { assetId: f.depth } }, camera: f.camera }));
        const op = await atlas(key, '/tasks:posedImages2Splats', { posedFrames, refine: w.quality === 'refined', prompt: w.prompt, enhancePrompt: false }, `scene-world-${w.id}-splat`);
        await save({ splat_operation: op.id });
        return;
      }
      const op = await atlas(key, `/operations/${w.splat_operation}`);
      if (!op.done) { if (age > BUILD_TIMEOUT_MS) await fail(admin, w, 'The 3D room took too long to build.'); return; }
      const r = op.response as { draftSplat?: { assetId: string; url?: string }; refinedSplats?: Record<string, { assetId: string; url?: string }> } | null;
      const asset = r?.draftSplat ?? Object.entries(r?.refinedSplats ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))[0]?.[1];
      if (op.error || !asset) { await fail(admin, w, op.error?.message ?? 'The 3D room could not be built.'); return; }
      const res = await assetBytes(key, asset);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_SPLAT_BYTES) { await fail(admin, w, 'The 3D room came back too large to show.'); return; }
      const path = `scene-studio/${w.workspace_id}/${w.floor_plan_id}/worlds/${w.id}.spz`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/x-spz', upsert: true });
      if (upErr) throw new Error(`The 3D room could not be stored: ${upErr.message}`);
      await save({ status: 'ready', splat_path: path, splat_bytes: bytes.length, error: null, completed_at: new Date().toISOString() });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof AtlasError && !e.retryable) { await fail(admin, w, message); return; }
    if (age > BUILD_TIMEOUT_MS) await fail(admin, w, message);
    void captureException(e instanceof Error ? e : new Error(message), { tags: { function: FN }, extra: { scene_world_id: w.id } });
  }
}

/** Claims a room before touching it, so the cron and a watching browser never step it at the same time. */
async function advanceClaimed(admin: DbClient, key: string, ids?: string[]): Promise<number> {
  const before = new Date(Date.now() - CLAIM_MS).toISOString();
  let q = admin.from('scene_worlds').update({ advance_claimed_at: new Date().toISOString() })
    .eq('engine', 'atlas').in('status', ['views', 'building']).or(`advance_claimed_at.is.null,advance_claimed_at.lt.${before}`);
  if (ids) q = q.in('id', ids);
  const { data, error } = await q.select('*');
  if (error) throw new Error(error.message);
  for (const w of (data ?? []) as World[]) {
    await advance(admin, key, w);
    await admin.from('scene_worlds').update({ advance_claimed_at: null }).eq('id', w.id);
  }
  return data?.length ?? 0;
}

Deno.serve(withApiLogging(FN, async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === 'advance') {
    if (!isCronAuthorized(req)) throw new HttpError(401, 'Unauthorized');
    return json({ success: true, advanced: await advanceClaimed(admin, await atlasKey(admin)) });
  }

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, auth.error || 'Invalid session');
  const uid = auth.userId;

  if (body.action === 'status') {
    const { data: row } = await admin.from('scene_worlds').select('id, workspace_id, status').eq('id', String(body.id ?? '')).maybeSingle();
    if (!row || !(await userHasWorkspaceCapability(admin, uid, row.workspace_id, 'moodboards.use'))) throw new HttpError(404, 'Not found');
    if (row.status === 'views' || row.status === 'building') await advanceClaimed(admin, await atlasKey(admin), [row.id]);
    const { data: now } = await admin.from('scene_worlds').select('id, room_id, quality, status, splat_path, poster_path, error').eq('id', row.id).maybeSingle();
    return json({ success: true, world: now });
  }

  if (body.action !== 'start') throw new HttpError(400, 'Unknown action');
  const { data: plan } = await admin.from('floor_plans').select('id, workspace_id').eq('id', String(body.floor_plan_id ?? '')).maybeSingle();
  if (!plan || !(await userHasWorkspaceCapability(admin, uid, plan.workspace_id, 'moodboards.use'))) throw new HttpError(404, '3D room not found');
  const { data: room } = await admin.from('floor_plan_rooms').select('id, name').eq('id', String(body.room_id ?? '')).eq('floor_plan_id', plan.id).maybeSingle();
  if (!room) throw new HttpError(404, 'Space not found');
  const { data: entitled } = await admin.rpc('is_workspace_entitled', { p_workspace_id: plan.workspace_id, p_module_slug: 'scene-studio' });
  if (entitled !== true) throw new HttpError(403, '3D rooms are not enabled for this workspace.');
  const quality = body.quality === 'refined' ? 'refined' : 'draft';
  const views = readViews(body.views, `scene-studio/${plan.workspace_id}/${plan.id}`);
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const key = await atlasKey(admin);

  const { data: running } = await admin.from('scene_worlds').select('id').eq('room_id', room.id).in('status', ['views', 'building']).limit(1);
  if (running?.length) return json({ success: true, id: running[0].id, status: 'running', charged: false });

  let styleId: string | null = null;
  if (typeof body.style_render_id === 'string') {
    const { data: r } = await admin.from('scene_renders').select('id').eq('id', body.style_render_id).eq('floor_plan_id', plan.id).maybeSingle();
    styleId = r?.id ?? null;
  }
  const prompt = (await loadPrompt(admin, 'generation', 'scene_world', 'views'))
    .split('{room}').join(room.name).split('{finishes}').join(text(body.finishes, 1200)).split('{objects}').join(text(body.objects, 2000));

  const service = `scene-world-${quality}`;
  const debit = await debitExternalServiceCredits(admin, uid, service, 'scene_world', 1, { floor_plan_id: plan.id, room_id: room.id }, plan.workspace_id);
  if (!debit.success) return json({ success: false, error: debit.error ?? 'Insufficient credits', credits_required: debit.credits_debited, service }, 402);

  const { data: world, error } = await admin.from('scene_worlds').insert({
    workspace_id: plan.workspace_id, floor_plan_id: plan.id, room_id: room.id, engine: 'atlas', quality, views, style_render_id: styleId, prompt,
    layout_snapshot: body.layout_snapshot && typeof body.layout_snapshot === 'object' ? body.layout_snapshot : null,
    credits_charged: debit.credits_debited, transaction_id: debit.transaction_id ?? null, created_by: uid,
  }).select('*').single();
  if (error || !world) {
    await refund(admin, { id: 'not-created', workspace_id: plan.workspace_id, created_by: uid, credits_charged: debit.credits_debited, transaction_id: debit.transaction_id ?? null } as World, 'not recorded');
    throw new HttpError(500, 'The photoreal room could not be started. The credits were returned.');
  }
  await advanceClaimed(admin, key, [world.id]);
  return json({ success: true, id: world.id, status: 'running', charged: true, credits_used: debit.credits_debited }, 202);
}));
