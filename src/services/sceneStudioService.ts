import { supabase } from '@/integrations/supabase/client';
import type { KitchenLayout } from '@/lib/scene/kitchenComposition';
import { edgeError, parseEdgeError } from '@/utils/edgeError';
import type { PlanOpening, PlanRoom, PlanWall } from '@/lib/scene/sceneGeometry';
import type { SurfaceTarget } from '@/lib/scene/sceneSurfaces';
import type { SceneObjectSlot } from '@/lib/scene/sceneReadSchema';
import { kitchenCompositionFromRoom, type RoomComposition } from '@/lib/scene/kitchenComposition';
import { projectPlansService, type PlanWithItems } from '@/services/projectPlansService';
import type { Composition, PlanComposition } from '@/utils/blueprintComposition';

export const SCENE_BUCKET = 'generation-images';
const MAX_SOURCE_LONG_SIDE = 2048;

export type SceneSourceKind = 'blank' | 'plan_image' | 'photo' | 'render' | 'drawing';
export type SceneReadStatus = 'none' | 'extracting' | 'ready' | 'failed';

export interface SceneCamera { x_mm: number; y_mm: number; height_mm: number; look_x_mm: number; look_y_mm: number; fov_deg: number }

export interface SceneRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  project_plan_id: string | null;
  name: string;
  default_wall_height_mm: number;
  source_kind: SceneSourceKind;
  source_storage_path: string | null;
  extract_status: SceneReadStatus;
  extract_error: string | null;
  extract_notes: { scale_basis?: string; assumptions?: string[]; read_at?: string } | null;
  view_camera: SceneCamera | null;
  /** CABINET_HARDWARE key; null draws bar handles. */
  cabinet_hardware: string | null;
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
  model_status?: 'processing' | 'ready' | 'failed' | null;
  model_storage_path?: string | null;
  model_error?: string | null;
  model_finish?: string | null;
  kitchen_layout?: KitchenLayout | null;
}

export interface SceneSurface {
  id: string;
  room_id: string;
  surface: 'floor' | 'ceiling' | 'walls' | 'wall' | 'splash' | 'zone';
  wall_id: string | null;
  band_from_mm: number | null;
  band_to_mm: number | null;
  zone_key?: string | null;
  zone_u0_mm?: number | null;
  zone_u1_mm?: number | null;
  zone_v0_mm?: number | null;
  zone_v1_mm?: number | null;
  product_id: string | null;
  colour_hex: string | null;
}

export interface SceneObjectFinish { id: string; object_id: string; slot: SceneObjectSlot; product_id: string | null; colour_hex: string | null }

export interface SceneProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  albedoUrl?: string | null;
  attributes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface SceneRender {
  id: string;
  floor_plan_id: string;
  parent_render_id: string | null;
  kind: 'full' | 'object_edit' | 'area_edit';
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

export interface LayoutEntry { colour_hex: string | null; product_id: string | null; x_mm: number; y_mm: number; rotation_deg: number; removed: boolean; finishes?: string }

export interface SceneData {
  scene: SceneRow;
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
  surfaces: SceneSurface[];
  finishes: SceneObjectFinish[];
  objects: SceneObject[];
  products: Record<string, SceneProduct>;
  renders: SceneRender[];
}

const SCENE_COLUMNS = 'id, workspace_id, project_id, project_plan_id, name, default_wall_height_mm, source_kind, source_storage_path, extract_status, extract_error, extract_notes, view_camera, cabinet_hardware, created_at, updated_at';
const OBJECT_COLUMNS = 'id, floor_plan_id, room_id, kind, label, product_id, x_mm, y_mm, rotation_deg, width_mm, depth_mm, height_mm, elevation_mm, size_source, colour_hex, source, removed_at, model_status, model_storage_path, model_error, model_finish, kitchen_layout';
const SURFACE_COLUMNS = 'id, room_id, surface, wall_id, band_from_mm, band_to_mm, zone_key, zone_u0_mm, zone_u1_mm, zone_v0_mm, zone_v1_mm, product_id, colour_hex';
const FINISH_COLUMNS = 'id, object_id, slot, product_id, colour_hex';
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

const PRODUCT_COLUMNS = 'id, name, attributes, metadata, image_product_associations(overall_score, document_images(image_url)), product_material_maps(storage_bucket, albedo_path, is_selected, option_value_id)';

function selectedAlbedo(row: Record<string, unknown>): string | null {
  const maps = row.product_material_maps;
  if (!Array.isArray(maps)) return null;
  const m = maps.find((x) => (x as { is_selected?: boolean; option_value_id?: string | null }).is_selected && !(x as { option_value_id?: string | null }).option_value_id) as
    { storage_bucket?: string; albedo_path?: string | null } | undefined;
  return m?.albedo_path ? supabase.storage.from(m.storage_bucket || SCENE_BUCKET).getPublicUrl(m.albedo_path).data.publicUrl : null;
}

async function fetchProducts(ids: string[]): Promise<Record<string, SceneProduct>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .in('id', unique);
  if (error) throw new Error(`Products could not be loaded: ${error.message}`);
  const out: Record<string, SceneProduct> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out[r.id as string] = {
      id: r.id as string,
      name: (r.name as string) || 'Product',
      imageUrl: firstImage(r),
      albedoUrl: selectedAlbedo(r),
      attributes: (r.attributes as Record<string, unknown>) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? null,
    };
  }
  return out;
}

export const sceneStudioService = {
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

  async openFromImage(workspaceId: string, imageUrl: string, kind: 'plan_image' | 'photo' | 'render', name: string): Promise<SceneRow> {
    const scene = await this.create({ workspaceId, name, kind, imageUrl });
    await this.read(scene.id);
    return scene;
  },

  async setCabinetHardware(sceneId: string, hardware: string | null): Promise<void> {
    const { error } = await supabase.from('floor_plans').update({ cabinet_hardware: hardware }).eq('id', sceneId);
    if (error) throw new Error(error.message);
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
    const [rooms, walls, openings, surfaces, objects, renders, finishes] = await Promise.all([
      supabase.from('floor_plan_rooms').select('id, name, outline, height_mm, walk_order').eq('floor_plan_id', id).order('walk_order', { ascending: true, nullsFirst: false }),
      supabase.from('floor_plan_walls').select('id, x1_mm, y1_mm, x2_mm, y2_mm, thickness_mm, height_mm').eq('floor_plan_id', id),
      supabase.from('floor_plan_openings').select('id, wall_id, kind, offset_mm, width_mm, sill_mm, head_mm').eq('floor_plan_id', id),
      supabase.from('floor_plan_surfaces').select(SURFACE_COLUMNS).eq('floor_plan_id', id),
      supabase.from('floor_plan_objects').select(OBJECT_COLUMNS).eq('floor_plan_id', id).order('created_at', { ascending: true }),
      supabase.from('scene_renders').select(RENDER_COLUMNS).eq('floor_plan_id', id).order('created_at', { ascending: false }),
      supabase.from('floor_plan_object_finishes').select(FINISH_COLUMNS).eq('floor_plan_id', id),
    ]);
    for (const r of [rooms, walls, openings, surfaces, objects, renders, finishes]) if (r.error) throw new Error(r.error.message);
    const fin = (finishes.data ?? []) as SceneObjectFinish[];
    const objs = ((objects.data ?? []) as Record<string, unknown>[]).map(toObject);
    const surf = (surfaces.data ?? []) as SceneSurface[];
    const products = await fetchProducts([...objs.map((o) => o.product_id ?? ''), ...surf.map((s) => s.product_id ?? ''), ...fin.map((f) => f.product_id ?? '')]);
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
      finishes: fin,
      objects: objs,
      products,
      renders: (renders.data ?? []) as SceneRender[],
    };
  },

  async objectModelStates(sceneId: string): Promise<Array<Pick<SceneObject, 'id' | 'model_status' | 'model_storage_path' | 'model_error' | 'model_finish'>>> {
    const { data, error } = await supabase.from('floor_plan_objects')
      .select('id, model_status, model_storage_path, model_error, model_finish').eq('floor_plan_id', sceneId).not('model_status', 'is', null);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Pick<SceneObject, 'id' | 'model_status' | 'model_storage_path' | 'model_error' | 'model_finish'>>;
  },

  async make3d(body: { floor_plan_object_id?: string; image_path?: string; product_id?: string; workspace_id?: string; finish?: { description: string; image_url?: string } }): Promise<{ status: 'ready' | 'processing'; url?: string; charged: boolean; credits_used?: number }> {
    const { data, error } = await supabase.functions.invoke('object-3d', { body });
    if (error) throw await edgeError(error, 'The 3D model could not be started');
    if (!data?.success) throw new Error(data?.error || 'The 3D model could not be started.');
    return data;
  },

  async saveObjects(objects: SceneObject[]): Promise<void> {
    if (!objects.length) return;
    const rows = objects.map((o) => ({
      id: o.id, floor_plan_id: o.floor_plan_id, room_id: o.room_id, kind: o.kind, label: o.label.trim().slice(0, 200) || 'Object',
      product_id: o.product_id, x_mm: Math.round(o.x_mm), y_mm: Math.round(o.y_mm), rotation_deg: Math.round(o.rotation_deg) % 360,
      width_mm: Math.max(1, Math.round(o.width_mm)), depth_mm: Math.max(1, Math.round(o.depth_mm)), height_mm: Math.max(1, Math.round(o.height_mm)), elevation_mm: Math.max(0, Math.round(o.elevation_mm)),
      size_source: o.size_source, colour_hex: o.colour_hex, source: o.source, removed_at: o.removed_at,
      kitchen_layout: o.kitchen_layout ?? null,
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

  async setSurface(sceneId: string, target: SurfaceTarget, patch: { product_id: string | null; colour_hex: string | null }): Promise<SceneSurface> {
    const wallId = 'wallId' in target ? target.wallId : null;
    const band = target.surface === 'splash' ? { band_from_mm: target.fromMm, band_to_mm: target.toMm } : { band_from_mm: null, band_to_mm: null };
    const zone = target.surface === 'zone'
      ? { zone_key: target.zoneKey, zone_u0_mm: Math.round(target.u0), zone_u1_mm: Math.round(target.u1), zone_v0_mm: Math.round(target.v0), zone_v1_mm: Math.round(target.v1) }
      : { zone_key: null, zone_u0_mm: null, zone_u1_mm: null, zone_v0_mm: null, zone_v1_mm: null };
    const { data, error } = await supabase.from('floor_plan_surfaces')
      .upsert(
        { floor_plan_id: sceneId, room_id: target.roomId, surface: target.surface, wall_id: wallId, ...band, ...zone, product_id: patch.product_id, colour_hex: patch.colour_hex },
        { onConflict: 'room_id,surface,wall_id,zone_key' },
      )
      .select(SURFACE_COLUMNS).single();
    if (error) throw new Error(error.message);
    return data as SceneSurface;
  },

  async setObjectFinish(sceneId: string, objectId: string, slot: SceneObjectSlot, patch: { product_id: string | null; colour_hex: string | null }): Promise<SceneObjectFinish> {
    const { data, error } = await supabase.from('floor_plan_object_finishes')
      .upsert({ floor_plan_id: sceneId, object_id: objectId, slot, product_id: patch.product_id, colour_hex: patch.colour_hex }, { onConflict: 'object_id,slot' })
      .select(FINISH_COLUMNS).single();
    if (error) throw new Error(error.message);
    return data as SceneObjectFinish;
  },

  async clearObjectFinishes(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await supabase.from('floor_plan_object_finishes').delete().in('id', ids);
    if (error) throw new Error(error.message);
  },

  async clearSurfaces(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await supabase.from('floor_plan_surfaces').delete().in('id', ids);
    if (error) throw new Error(error.message);
  },

  fetchProducts,

  products: fetchProducts,

  async makeTexture(workspaceId: string, productId: string): Promise<{ albedo_url: string; charged: boolean; credits_used?: number }> {
    const { data, error } = await supabase.functions.invoke('surface-texture', { body: { workspace_id: workspaceId, product_id: productId } });
    if (error) throw await edgeError(error, 'The texture could not be made');
    return data as { albedo_url: string; charged: boolean; credits_used?: number };
  },

  /** The workspace's own kitchen blueprints first (newest first), then the platform starters in the order they were added. */
  async kitchenBlueprints(workspaceId: string): Promise<Array<{ id: string; title: string; own: boolean }>> {
    const { data, error } = await supabase.from('blueprints').select('id, title, workspace_id, created_at, updated_at')
      .eq('project_type', 'kitchen_cabinets').eq('status', 'active')
      .or(`workspace_id.eq.${workspaceId},is_platform_starter.eq.true`);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ id: string; title: string; workspace_id: string | null; created_at: string; updated_at: string }>;
    const own = rows.filter((r) => r.workspace_id === workspaceId).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const starters = rows.filter((r) => r.workspace_id !== workspaceId).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return [...own, ...starters].map((r) => ({ id: r.id, title: r.title, own: r.workspace_id === workspaceId }));
  },

  async kitchenBlueprintId(workspaceId: string): Promise<string> {
    const pick = (await this.kitchenBlueprints(workspaceId))[0];
    if (!pick) throw new Error('No kitchen blueprint is available to price from.');
    return pick.id;
  },

  /** Prices the room's kitchen on its linked plan, creating the plan (on `projectId`) the first time. */
  async priceKitchen(scene: SceneRow, objects: SceneObject[], projectId: string | null, blueprintId?: string | null): Promise<PlanWithItems> {
    if (scene.project_plan_id) {
      const plan = await projectPlansService.get(scene.project_plan_id);
      if (plan) {
        const previous = (plan.composition as PlanComposition).config ?? {};
        return projectPlansService.rescale(plan.id, plan.dimensions ?? {}, kitchenCompositionFromRoom(objects, previous as RoomComposition) as unknown as Composition);
      }
    }
    const project = projectId ?? scene.project_id;
    if (!project) throw new Error('Choose the project this kitchen is quoted on.');
    const res = await projectPlansService.createFromBlueprint({
      project_id: project,
      blueprint_id: blueprintId ?? await this.kitchenBlueprintId(scene.workspace_id),
      title: `${scene.name} — kitchen`.slice(0, 200),
      composition: kitchenCompositionFromRoom(objects) as unknown as Composition,
    });
    const { error } = await supabase.from('floor_plans').update({ project_id: project, project_plan_id: res.plan.id }).eq('id', scene.id);
    if (error) throw new Error(error.message);
    return res;
  },

  async setKitchenChoice(planId: string, change: (config: Composition) => Composition): Promise<PlanWithItems> {
    const plan = await projectPlansService.get(planId);
    if (!plan) throw new Error('The kitchen plan no longer exists.');
    return projectPlansService.rescale(plan.id, plan.dimensions ?? {}, change((plan.composition as PlanComposition).config ?? {}));
  },

  async searchProducts(workspaceId: string, query: string): Promise<SceneProduct[]> {
    const q = query.trim();
    let req = supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
      .limit(24);
    if (q) req = req.ilike('name', `%${q.replace(/[%_,()]/g, ' ')}%`);
    const { data, error } = await req;
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string, name: (r.name as string) || 'Product', imageUrl: firstImage(r), albedoUrl: selectedAlbedo(r),
      attributes: (r.attributes as Record<string, unknown>) ?? null, metadata: (r.metadata as Record<string, unknown>) ?? null,
    }));
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

};

function pickObjectFields(o: Omit<SceneObject, 'id' | 'floor_plan_id' | 'removed_at'>) {
  return {
    room_id: o.room_id, kind: o.kind, label: o.label.trim().slice(0, 200) || 'Object', product_id: o.product_id,
    x_mm: Math.round(o.x_mm), y_mm: Math.round(o.y_mm), rotation_deg: Math.round(o.rotation_deg) % 360,
    width_mm: Math.max(1, Math.round(o.width_mm)), depth_mm: Math.max(1, Math.round(o.depth_mm)), height_mm: Math.max(1, Math.round(o.height_mm)), elevation_mm: Math.max(0, Math.round(o.elevation_mm)),
    size_source: o.size_source, colour_hex: o.colour_hex, source: o.source,
  };
}
