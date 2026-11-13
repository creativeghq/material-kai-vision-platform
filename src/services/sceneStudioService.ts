import { supabase } from '@/integrations/supabase/client';
import { edgeError, parseEdgeError } from '@/utils/edgeError';
import type { PlanOpening, PlanRoom, PlanWall } from '@/lib/scene/sceneGeometry';

export const SCENE_BUCKET = 'generation-images';
const MAX_SOURCE_LONG_SIDE = 2048;

export type SceneSourceKind = 'blank' | 'plan_image' | 'photo' | 'render' | 'drawing';
export type SceneReadStatus = 'none' | 'extracting' | 'ready' | 'failed';

export interface SceneCamera { x_mm: number; y_mm: number; height_mm: number; look_x_mm: number; look_y_mm: number; fov_deg: number }

export interface SceneRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  name: string;
  default_wall_height_mm: number;
  source_kind: SceneSourceKind;
  source_storage_path: string | null;
  extract_status: SceneReadStatus;
  extract_error: string | null;
  extract_notes: { scale_basis?: string; assumptions?: string[]; read_at?: string } | null;
  view_camera: SceneCamera | null;
  created_at: string;
  updated_at: string;
}

export interface SceneObject {
  id: string;
  floor_plan_id: string;
  room_id: string | null;
  kind: string;
  label: string;
  product_id: string | null;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
  width_mm: number;
  depth_mm: number;
  height_mm: number;
  elevation_mm: number;
  size_source: 'estimated' | 'manual';
  colour_hex: string | null;
  source: 'detected' | 'placed' | 'from_plan';
  removed_at: string | null;
}

export interface SceneSurface { id: string; room_id: string; surface: 'floor' | 'ceiling' | 'walls'; product_id: string | null; colour_hex: string | null }

export interface SceneProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  attributes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface SceneRender {
  id: string;
  floor_plan_id: string;
  parent_render_id: string | null;
  kind: 'full' | 'object_edit';
  edited_object_id: string | null;
  camera: Record<string, unknown>;
  capture_path: string | null;
  id_pass_path: string | null;
  id_map: Record<string, string>;
  style_reference_url: string | null;
  style_label: string | null;
  instruction: string | null;
  image_url: string;
  vr_world_id: string | null;
  layout_snapshot: Record<string, LayoutEntry>;
  created_at: string;
}

export interface LayoutEntry { colour_hex: string | null; product_id: string | null; x_mm: number; y_mm: number; rotation_deg: number; removed: boolean }

export interface SceneData {
  scene: SceneRow;
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
  surfaces: SceneSurface[];
  objects: SceneObject[];
  products: Record<string, SceneProduct>;
  renders: SceneRender[];
}

const SCENE_COLUMNS = 'id, workspace_id, project_id, name, default_wall_height_mm, source_kind, source_storage_path, extract_status, extract_error, extract_notes, view_camera, created_at, updated_at';
const OBJECT_COLUMNS = 'id, floor_plan_id, room_id, kind, label, product_id, x_mm, y_mm, rotation_deg, width_mm, depth_mm, height_mm, elevation_mm, size_source, colour_hex, source, removed_at';
const RENDER_COLUMNS = 'id, floor_plan_id, parent_render_id, kind, edited_object_id, camera, capture_path, id_pass_path, id_map, style_reference_url, style_label, instruction, image_url, vr_world_id, layout_snapshot, created_at';

const num = (v: unknown, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

const toObject = (r: Record<string, unknown>): SceneObject => ({
  ...(r as unknown as SceneObject),
  x_mm: num(r.x_mm), y_mm: num(r.y_mm), rotation_deg: num(r.rotation_deg),
  width_mm: num(r.width_mm, 600), depth_mm: num(r.depth_mm, 600), height_mm: num(r.height_mm, 800), elevation_mm: num(r.elevation_mm),
});

export const sceneFolder = (s: Pick<SceneRow, 'workspace_id' | 'id'>) => `scene-studio/${s.workspace_id}/${s.id}`;
export const publicUrl = (path: string) => supabase.storage.from(SCENE_BUCKET).getPublicUrl(path).data.publicUrl as string;

function firstImage(row: Record<string, unknown>): string | null {
  const ipa = row.image_product_associations;
  if (Array.isArray(ipa)) {
    const sorted = [...ipa].sort((a, b) => num((b as Record<string, unknown>)?.overall_score) - num((a as Record<string, unknown>)?.overall_score));
    for (const rel of sorted) {
      const img = (rel as { document_images?: { image_url?: string } })?.document_images?.image_url;
      if (img) return img;
    }
  }
  const md = (row.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = md.image_url ?? md.thumbnail_url;
  return typeof fromMeta === 'string' && /^https?:\/\//.test(fromMeta) ? fromMeta : null;
}

async function prepareImage(file: Blob, keepPng: boolean): Promise<{ blob: Blob; ext: 'jpg' | 'png'; aspect: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SOURCE_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot prepare the image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const type = keepPng ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error('The image could not be prepared.');
  return { blob, ext: keepPng ? 'png' : 'jpg', aspect: h / w };
}

async function uploadTo(path: string, blob: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage.from(SCENE_BUCKET).upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

async function fetchProducts(ids: string[]): Promise<Record<string, SceneProduct>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabase
    .from('products')
    .select('id, name, attributes, metadata, image_product_associations(overall_score, document_images(image_url))')
    .in('id', unique);
  if (error) throw new Error(`Products could not be loaded: ${error.message}`);
  const out: Record<string, SceneProduct> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out[r.id as string] = {
      id: r.id as string,
      name: (r.name as string) || 'Product',
      imageUrl: firstImage(r),
      attributes: (r.attributes as Record<string, unknown>) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
    };
  }
  return out;
}

export interface RecentGeneration { id: string; image_url: string; prompt: string | null; created_at: string }

export const sceneStudioService = {
  async list(workspaceId: string): Promise<Array<SceneRow & { object_count: number; render_count: number; cover_url: string | null }>> {
    const { data, error } = await supabase
      .from('floor_plans')
      .select(`${SCENE_COLUMNS}, floor_plan_objects(count), scene_renders(image_url, created_at)`)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const renders = ((r.scene_renders ?? []) as Array<{ image_url: string; created_at: string }>)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const objects = r.floor_plan_objects as Array<{ count: number }> | undefined;
      return {
        ...(r as unknown as SceneRow),
        object_count: objects?.[0]?.count ?? 0,
        render_count: renders.length,
        cover_url: renders[0]?.image_url ?? null,
      };
    });
  },

  async create(input: {
    workspaceId: string;
    name: string;
    kind: SceneSourceKind;
    file?: Blob | null;
    imageUrl?: string | null;
    room?: { widthMm: number; depthMm: number; heightMm: number };
    projectId?: string | null;
  }): Promise<SceneRow> {
    const { data, error } = await supabase
      .from('floor_plans')
      .insert({
        workspace_id: input.workspaceId,
        project_id: input.projectId ?? null,
        name: input.name.trim().slice(0, 200) || 'Untitled scene',
        source_kind: input.kind,
        default_wall_height_mm: input.room?.heightMm ?? 2700,
      })
      .select(SCENE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const scene = data as SceneRow;

    if (input.kind === 'blank') {
      const w = input.room?.widthMm ?? 5000;
      const d = input.room?.depthMm ?? 4000;
      await this.addRectRoom(scene.id, w, d, 'Room');
      return scene;
    }

    let blob: Blob | null = input.file ?? null;
    if (!blob && input.imageUrl) {
      const res = await fetch(input.imageUrl);
      if (!res.ok) throw new Error('The image could not be fetched.');
      blob = await res.blob();
    }
    if (!blob) throw new Error('Choose an image first.');
    const prepared = await prepareImage(blob, input.kind === 'plan_image');
    const path = `${sceneFolder(scene)}/source.${prepared.ext}`;
    await uploadTo(path, prepared.blob, prepared.ext === 'png' ? 'image/png' : 'image/jpeg');
    const { data: updated, error: upErr } = await supabase
      .from('floor_plans').update({ source_storage_path: path }).eq('id', scene.id).select(SCENE_COLUMNS).single();
    if (upErr) throw new Error(upErr.message);
    return updated as SceneRow;
  },

  async addRectRoom(sceneId: string, widthMm: number, depthMm: number, name: string): Promise<void> {
    const { error: roomErr } = await supabase.from('floor_plan_rooms').insert({
      floor_plan_id: sceneId, name, room_type: 'living',
      outline: [[0, 0], [widthMm, 0], [widthMm, depthMm], [0, depthMm]],
    });
    if (roomErr) throw new Error(roomErr.message);
    const walls = [
      [0, 0, widthMm, 0], [widthMm, 0, widthMm, depthMm], [widthMm, depthMm, 0, depthMm], [0, depthMm, 0, 0],
    ].map(([x1, y1, x2, y2]) => ({ floor_plan_id: sceneId, x1_mm: x1, y1_mm: y1, x2_mm: x2, y2_mm: y2, thickness_mm: 120, source: 'manual' }));
    const { error: wallErr } = await supabase.from('floor_plan_walls').insert(walls);
    if (wallErr) throw new Error(wallErr.message);
  },

  async read(sceneId: string): Promise<void> {
    const { error } = await supabase.functions.invoke('scene-studio-read', { body: { floor_plan_id: sceneId } });
    if (error) {
      const parsed = await parseEdgeError(error, 'The image could not be sent for reading.');
      throw new Error(parsed.message);
    }
  },

  async getScene(id: string): Promise<SceneRow | null> {
    const { data, error } = await supabase.from('floor_plans').select(SCENE_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SceneRow) ?? null;
  },

  async load(id: string): Promise<SceneData | null> {
    const scene = await this.getScene(id);
    if (!scene) return null;
    const [rooms, walls, openings, surfaces, objects, renders] = await Promise.all([
      supabase.from('floor_plan_rooms').select('id, name, outline, height_mm, walk_order').eq('floor_plan_id', id).order('walk_order', { ascending: true, nullsFirst: false }),
      supabase.from('floor_plan_walls').select('id, x1_mm, y1_mm, x2_mm, y2_mm, thickness_mm, height_mm').eq('floor_plan_id', id),
      supabase.from('floor_plan_openings').select('id, wall_id, kind, offset_mm, width_mm, sill_mm, head_mm').eq('floor_plan_id', id),
      supabase.from('floor_plan_surfaces').select('id, room_id, surface, product_id, colour_hex').eq('floor_plan_id', id),
      supabase.from('floor_plan_objects').select(OBJECT_COLUMNS).eq('floor_plan_id', id).order('created_at', { ascending: true }),
      supabase.from('scene_renders').select(RENDER_COLUMNS).eq('floor_plan_id', id).order('created_at', { ascending: false }),
    ]);
    for (const r of [rooms, walls, openings, surfaces, objects, renders]) if (r.error) throw new Error(r.error.message);
    const objs = ((objects.data ?? []) as Record<string, unknown>[]).map(toObject);
    const surf = (surfaces.data ?? []) as SceneSurface[];
    const products = await fetchProducts([...objs.map((o) => o.product_id ?? ''), ...surf.map((s) => s.product_id ?? '')]);
    return {
      scene,
      rooms: ((rooms.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, name: r.name as string, height_mm: r.height_mm == null ? null : num(r.height_mm),
        outline: ((r.outline ?? []) as unknown[]).map((p) => [num((p as number[])[0]), num((p as number[])[1])] as [number, number]),
      })),
      walls: ((walls.data ?? []) as Record<string, unknown>[]).map((w) => ({
        id: w.id as string, x1_mm: num(w.x1_mm), y1_mm: num(w.y1_mm), x2_mm: num(w.x2_mm), y2_mm: num(w.y2_mm),
        thickness_mm: num(w.thickness_mm, 120), height_mm: w.height_mm == null ? null : num(w.height_mm),
      })),
      openings: ((openings.data ?? []) as Record<string, unknown>[]).map((o) => ({
        id: o.id as string, wall_id: o.wall_id as string, kind: o.kind as PlanOpening['kind'],
        offset_mm: num(o.offset_mm), width_mm: num(o.width_mm), sill_mm: num(o.sill_mm), head_mm: num(o.head_mm, 2100),
      })),
      surfaces: surf,
      objects: objs,
      products,
      renders: (renders.data ?? []) as SceneRender[],
    };
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase.from('floor_plans').update({ name: name.trim().slice(0, 200) || 'Untitled scene' }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('floor_plans').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async saveObjects(objects: SceneObject[]): Promise<void> {
    if (!objects.length) return;
    const rows = objects.map((o) => ({
      id: o.id, floor_plan_id: o.floor_plan_id, room_id: o.room_id, kind: o.kind, label: o.label.trim().slice(0, 200) || 'Object',
      product_id: o.product_id, x_mm: Math.round(o.x_mm), y_mm: Math.round(o.y_mm), rotation_deg: Math.round(o.rotation_deg) % 360,
      width_mm: Math.max(1, Math.round(o.width_mm)), depth_mm: Math.max(1, Math.round(o.depth_mm)), height_mm: Math.max(1, Math.round(o.height_mm)), elevation_mm: Math.max(0, Math.round(o.elevation_mm)),
      size_source: o.size_source, colour_hex: o.colour_hex, source: o.source, removed_at: o.removed_at,
    }));
    const { error } = await supabase.from('floor_plan_objects').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`The layout could not be saved: ${error.message}`);
  },

  async addObject(sceneId: string, o: Omit<SceneObject, 'id' | 'floor_plan_id' | 'removed_at'>): Promise<SceneObject> {
    const { data, error } = await supabase.from('floor_plan_objects')
      .insert({ ...pickObjectFields(o), floor_plan_id: sceneId })
      .select(OBJECT_COLUMNS).single();
    if (error) throw new Error(error.message);
    return toObject(data as Record<string, unknown>);
  },

  async deleteObject(id: string): Promise<void> {
    const { error } = await supabase.from('floor_plan_objects').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async setSurface(sceneId: string, roomId: string, surface: SceneSurface['surface'], patch: { product_id: string | null; colour_hex: string | null }): Promise<SceneSurface> {
    const { data, error } = await supabase.from('floor_plan_surfaces')
      .upsert({ floor_plan_id: sceneId, room_id: roomId, surface, product_id: patch.product_id, colour_hex: patch.colour_hex }, { onConflict: 'room_id,surface' })
      .select('id, room_id, surface, product_id, colour_hex').single();
    if (error) throw new Error(error.message);
    return data as SceneSurface;
  },

  fetchProducts,

  async searchProducts(workspaceId: string, query: string): Promise<SceneProduct[]> {
    const q = query.trim();
    let req = supabase
      .from('products')
      .select('id, name, attributes, metadata, image_product_associations(overall_score, document_images(image_url))')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(24);
    if (q) req = req.ilike('name', `%${q.replace(/[%_,()]/g, ' ')}%`);
    const { data, error } = await req;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string, name: (r.name as string) || 'Product', imageUrl: firstImage(r),
      attributes: (r.attributes as Record<string, unknown>) ?? null, metadata: (r.metadata as Record<string, unknown>) ?? null,
    }));
  },

  async recentGenerations(limit = 24): Promise<RecentGeneration[]> {
    const { data, error } = await supabase
      .from('generation_3d')
      .select('id, image_urls, prompt, created_at')
      .eq('generation_status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const out: RecentGeneration[] = [];
    for (const r of (data ?? []) as Array<{ id: string; image_urls: unknown; prompt: string | null; created_at: string }>) {
      const url = Array.isArray(r.image_urls) ? r.image_urls.find((u) => typeof u === 'string' && /^https:\/\//.test(u)) : null;
      if (url) out.push({ id: r.id, image_url: url as string, prompt: r.prompt, created_at: r.created_at });
    }
    return out;
  },

  async uploadCapture(scene: Pick<SceneRow, 'workspace_id' | 'id'>, blob: Blob, name: string): Promise<string> {
    const ext = blob.type === 'image/png' ? 'png' : 'jpg';
    const path = `${sceneFolder(scene)}/captures/${Date.now()}-${name}.${ext}`;
    await uploadTo(path, blob, blob.type || 'image/jpeg');
    return path;
  },

  /** One image generation through the shared chokepoint (credits, edit gate, pricing all live there). */
  async generate(body: Record<string, unknown>): Promise<{ image_url: string; credits_used: number }> {
    const { data, error } = await supabase.functions.invoke('generate-interior-gemini', { body });
    if (error) throw await edgeError(error, 'The render failed');
    if (!data?.success || !data?.image_url) throw new Error(data?.error || 'The render returned no image.');
    return { image_url: data.image_url as string, credits_used: num(data.credits_used) };
  },

  async saveRender(row: Omit<SceneRender, 'id' | 'created_at' | 'vr_world_id'>): Promise<SceneRender> {
    const { data, error } = await supabase.from('scene_renders').insert(row).select(RENDER_COLUMNS).single();
    if (error) throw new Error(`The render was made but could not be saved to the scene: ${error.message}`);
    return data as SceneRender;
  },

  async setRenderWorld(renderId: string, vrWorldId: string): Promise<void> {
    const { error } = await supabase.from('scene_renders').update({ vr_world_id: vrWorldId }).eq('id', renderId);
    if (error) throw new Error(error.message);
  },
};

function pickObjectFields(o: Omit<SceneObject, 'id' | 'floor_plan_id' | 'removed_at'>) {
  return {
    room_id: o.room_id, kind: o.kind, label: o.label.trim().slice(0, 200) || 'Object', product_id: o.product_id,
    x_mm: Math.round(o.x_mm), y_mm: Math.round(o.y_mm), rotation_deg: Math.round(o.rotation_deg) % 360,
    width_mm: Math.max(1, Math.round(o.width_mm)), depth_mm: Math.max(1, Math.round(o.depth_mm)), height_mm: Math.max(1, Math.round(o.height_mm)), elevation_mm: Math.max(0, Math.round(o.elevation_mm)),
    size_source: o.size_source, colour_hex: o.colour_hex, source: o.source,
  };
}
