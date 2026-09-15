/**
 * Scenes and surfaces for the deterministic surface visualizer (#447 Phase 1). A scene is a room
 * photo; a surface is a flat rectangle in it with its real size. Reads go through RLS: the library
 * (NULL workspace) is visible to everyone signed in, a workspace's own scenes to its members.
 */
import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';
import { roomPlannerService } from '@/services/roomPlannerService';
import type { SurfaceTexture } from '@/components/features/roomplanner/surfaceFormat';
import type { Pt, Pattern, WastageRates } from '@/lib/surfaceRenderer';

export const SURFACE_KINDS = ['floor', 'wall', 'backsplash', 'countertop', 'shower_wall', 'stair', 'ceiling', 'outdoor'] as const;
export type SurfaceKind = (typeof SURFACE_KINDS)[number];

export const SURFACE_KIND_LABELS: Record<SurfaceKind, string> = {
  floor: 'Floor', wall: 'Wall', backsplash: 'Backsplash', countertop: 'Countertop',
  shower_wall: 'Shower wall', stair: 'Stairs', ceiling: 'Ceiling', outdoor: 'Outdoor',
};

export interface VisualizerScene {
  id: string;
  workspace_id: string | null;
  /** May anonymous embed visitors see this photo? False for every workspace scene until opted in. */
  is_embeddable: boolean;
  name: string;
  room_type: string | null;
  storage_bucket: string;
  image_path: string;
  width_px: number;
  height_px: number;
  imageUrl: string;
}

/** Corners normalised to the photo (0..1): far-left, far-right, near-right, near-left. */
export type NormalizedQuad = [Pt, Pt, Pt, Pt];

export interface VisualizerSurface {
  id: string;
  scene_id: string;
  key: string;
  kind: SurfaceKind;
  quad: NormalizedQuad;
  width_cm: number;
  depth_cm: number;
  mask_path: string | null;
  maskUrl: string | null;
  sort_order: number;
}

/** A rate somebody recorded. An absent pattern is NOT zero — it withholds the order quantity. */
export interface WastageRateRow {
  pattern: Pattern;
  percent: number;
  note: string | null;
  updated_at: string;
}

export interface SurfaceProduct {
  id: string;
  name: string;
  texture: SurfaceTexture;
}

const PICKER_LIMIT = 200;

const publicUrl = (bucket: string, path: string): string =>
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

function toScene(row: Record<string, unknown>): VisualizerScene {
  const bucket = String(row.storage_bucket);
  const path = String(row.image_path);
  return {
    id: String(row.id),
    workspace_id: (row.workspace_id as string | null) ?? null,
    is_embeddable: row.is_embeddable === true,
    name: String(row.name),
    room_type: (row.room_type as string | null) ?? null,
    storage_bucket: bucket,
    image_path: path,
    width_px: Number(row.width_px),
    height_px: Number(row.height_px),
    imageUrl: publicUrl(bucket, path),
  };
}

function toQuad(v: unknown): NormalizedQuad {
  const pts = Array.isArray(v) ? v : [];
  const out = pts.slice(0, 4).map((p) => {
    const [x, y] = Array.isArray(p) ? p : [Number((p as { x?: unknown })?.x), Number((p as { y?: unknown })?.y)];
    return { x: Number(x), y: Number(y) };
  });
  while (out.length < 4) out.push({ x: 0, y: 0 });
  return out as NormalizedQuad;
}

function toSurface(row: Record<string, unknown>, bucket: string): VisualizerSurface {
  const maskPath = (row.mask_path as string | null) ?? null;
  return {
    id: String(row.id),
    scene_id: String(row.scene_id),
    key: String(row.key),
    kind: row.kind as SurfaceKind,
    quad: toQuad(row.quad),
    width_cm: Number(row.width_cm),
    depth_cm: Number(row.depth_cm),
    mask_path: maskPath,
    maskUrl: maskPath ? publicUrl(bucket, maskPath) : null,
    sort_order: Number(row.sort_order ?? 0),
  };
}

/** Pixel size of an image file, read in the browser before upload. */
function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image the browser can read')); };
    img.src = url;
  });
}

export const visualizerService = {
  /** The platform library first, then the workspace's own scenes. */
  async listScenes(workspaceId: string): Promise<VisualizerScene[]> {
    const { data, error } = await supabase
      .from('visualizer_scenes')
      .select('*')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order('workspace_id', { ascending: true, nullsFirst: true })
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r) => toScene(r as Record<string, unknown>));
  },

  async getScene(id: string): Promise<{ scene: VisualizerScene; surfaces: VisualizerSurface[] }> {
    const [sceneRes, surfacesRes] = await Promise.all([
      supabase.from('visualizer_scenes').select('*').eq('id', id).maybeSingle(),
      supabase.from('visualizer_scene_surfaces').select('*').eq('scene_id', id).order('sort_order'),
    ]);
    if (sceneRes.error) throw sceneRes.error;
    if (!sceneRes.data) throw new Error('Scene not found');
    if (surfacesRes.error) throw surfacesRes.error;
    const scene = toScene(sceneRes.data as Record<string, unknown>);
    return {
      scene,
      surfaces: (surfacesRes.data ?? []).map((r) => toSurface(r as Record<string, unknown>, scene.storage_bucket)),
    };
  },

  /** Upload a room photo as a workspace scene. Surfaces are authored afterwards in the editor. */
  async createScene(workspaceId: string, userId: string, file: File, name: string, roomType: string | null): Promise<VisualizerScene> {
    const { width, height } = await imageSize(file);
    const id = crypto.randomUUID();
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `visualizer/scenes/${id}/scene.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('generation-images')
      .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (upErr) throw upErr;
    const { data, error } = await supabase
      .from('visualizer_scenes')
      .insert({ id, workspace_id: workspaceId, created_by: userId, name, room_type: roomType, image_path: path, width_px: width, height_px: height })
      .select('*')
      .single();
    if (error) throw error;
    return toScene(data as Record<string, unknown>);
  },

  /** Opt a workspace scene in to the public embed. Off by default: a room photo is somebody's house. */
  async setSceneEmbeddable(id: string, embeddable: boolean): Promise<void> {
    const { error } = await supabase
      .from('visualizer_scenes')
      .update({ is_embeddable: embeddable, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteScene(id: string): Promise<void> {
    const { error } = await supabase.from('visualizer_scenes').delete().eq('id', id);
    if (error) throw error;
  },

  async saveSurface(
    scene: VisualizerScene,
    input: { id?: string; key: string; kind: SurfaceKind; quad: NormalizedQuad; width_cm: number; depth_cm: number; sort_order?: number },
  ): Promise<VisualizerSurface> {
    const payload = {
      scene_id: scene.id,
      key: input.key,
      kind: input.kind,
      quad: input.quad.map((p) => [p.x, p.y]),
      width_cm: input.width_cm,
      depth_cm: input.depth_cm,
      sort_order: input.sort_order ?? 0,
    };
    const q = input.id
      ? supabase.from('visualizer_scene_surfaces').update(payload).eq('id', input.id)
      : supabase.from('visualizer_scene_surfaces').insert(payload);
    const { data, error } = await q.select('*').single();
    if (error) throw error;
    return toSurface(data as Record<string, unknown>, scene.storage_bucket);
  },

  async deleteSurface(id: string): Promise<void> {
    const { error } = await supabase.from('visualizer_scene_surfaces').delete().eq('id', id);
    if (error) throw error;
  },

  /** Store a mask PNG for a surface (light = paint) and record its path. */
  async saveMask(scene: VisualizerScene, surfaceId: string, png: Blob): Promise<string> {
    // A fresh object every time: members may INSERT into the bucket, not UPDATE, so an upsert onto
    // the previous mask is refused. The old file leaves the reference set and the orphan cron reaps it.
    const path = `visualizer/scenes/${scene.id}/masks/${surfaceId}-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from(scene.storage_bucket)
      .upload(path, png, { contentType: 'image/png' });
    if (upErr) throw upErr;
    const { error } = await supabase.from('visualizer_scene_surfaces').update({ mask_path: path }).eq('id', surfaceId);
    if (error) throw error;
    return publicUrl(scene.storage_bucket, path);
  },

  /**
   * Ask SAM 2 for the mask of what lies inside a box of the scene. Null when it could not, in
   * which case the caller says so — a rectangle is never passed off as a segmentation.
   */
  async requestMask(scene: VisualizerScene, bbox: { x: number; y: number; w: number; h: number }, workspaceId: string): Promise<Blob | null> {
    const res = await mivaaApi.generateSAMMask({
      image_url: scene.imageUrl,
      hint_type: 'bbox',
      bbox,
      image_width: scene.width_px,
      image_height: scene.height_px,
      workspace_id: workspaceId,
    });
    if (!res.success || !res.data?.mask_base64 || res.data.method !== 'sam2') return null;
    const bytes = Uint8Array.from(atob(res.data.mask_base64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: 'image/png' });
  },

  /** The cutting allowances this workspace has recorded. An empty map is the honest default. */
  async wastageRates(workspaceId: string): Promise<WastageRates> {
    const { data, error } = await supabase
      .from('surface_pattern_wastage')
      .select('pattern, percent')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    const out: WastageRates = {};
    for (const row of (data ?? []) as { pattern: Pattern; percent: number | string }[]) {
      const n = Number(row.percent);
      if (Number.isFinite(n)) out[row.pattern] = n;
    }
    return out;
  },

  async listWastageRates(workspaceId: string): Promise<WastageRateRow[]> {
    const { data, error } = await supabase
      .from('surface_pattern_wastage')
      .select('pattern, percent, note, updated_at')
      .eq('workspace_id', workspaceId)
      .order('pattern');
    if (error) throw error;
    return (data ?? []).map((r) => ({ ...r, percent: Number((r as { percent: unknown }).percent) })) as WastageRateRow[];
  },

  async setWastageRate(workspaceId: string, pattern: Pattern, percent: number, note?: string | null): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('surface_pattern_wastage').upsert({
      workspace_id: workspaceId,
      pattern,
      percent,
      note: note ?? null,
      updated_by: auth?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,pattern' });
    if (error) throw error;
  },

  async clearWastageRate(workspaceId: string, pattern: Pattern): Promise<void> {
    const { error } = await supabase
      .from('surface_pattern_wastage')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('pattern', pattern);
    if (error) throw error;
  },

  /**
   * Products with something to tile: an image and, where recorded, a format. `ensureIds` are
   * fetched even when they sort past the picker's cap — a deep link names one product.
   */
  async listSurfaceProducts(workspaceId: string, ensureIds: string[] = []): Promise<SurfaceProduct[]> {
    const { data, error } = await supabase
      .from('products')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('name')
      .limit(PICKER_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; name: string }[];
    const missing = ensureIds.filter((id) => id && !rows.some((r) => r.id === id));
    if (missing.length > 0) {
      const { data: extra, error: extraErr } = await supabase.from('products').select('id, name').in('id', missing);
      if (extraErr) throw extraErr;
      rows.push(...((extra ?? []) as { id: string; name: string }[]));
    }
    const textures = await roomPlannerService.surfaceTexturesForProducts(workspaceId, rows.map((r) => r.id));
    return rows
      .map((r) => ({ id: r.id, name: r.name, texture: textures.get(r.id) }))
      .filter((p): p is SurfaceProduct => !!p.texture && !!p.texture.url);
  },
};
