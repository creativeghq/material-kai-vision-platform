/** The public walkthrough of one 3D room (client view and property listing): projected by hand, nothing priced. */
import type { DbClient } from './supabase-client.ts';

const SCENE_MODEL_BUCKET = 'generation-images';

/** Null when the room does not exist or is not in `workspaceId`; an unknown workspace withholds. */
export async function buildSceneWalkthrough(supabase: DbClient, fp: string, workspaceId: string | null): Promise<unknown> {
  const { data: plan } = await supabase.from('floor_plans')
    .select('id, name, workspace_id, default_wall_height_mm, cabinet_hardware').eq('id', fp).maybeSingle();
  if (!plan) return null;
  if (!workspaceId || plan.workspace_id !== workspaceId) {
    console.error(`[scene-walkthrough] floor_plan ${fp} is not in the expected workspace, withheld`);
    return null;
  }
  const [rooms, walls, openings, objects, surfaces, finishes, renders, worlds] = await Promise.all([
    supabase.from('floor_plan_rooms').select('id, name, outline, height_mm, walk_order').eq('floor_plan_id', fp).order('walk_order'),
    supabase.from('floor_plan_walls').select('id, x1_mm, y1_mm, x2_mm, y2_mm, thickness_mm, height_mm').eq('floor_plan_id', fp),
    supabase.from('floor_plan_openings').select('id, wall_id, kind, offset_mm, width_mm, sill_mm, head_mm').eq('floor_plan_id', fp),
    supabase.from('floor_plan_objects')
      .select('id, room_id, kind, label, product_id, x_mm, y_mm, rotation_deg, width_mm, depth_mm, height_mm, elevation_mm, colour_hex, kitchen_layout, model_status, model_storage_path')
      .eq('floor_plan_id', fp).is('removed_at', null),
    supabase.from('floor_plan_surfaces')
      .select('id, room_id, surface, wall_id, band_from_mm, band_to_mm, zone_key, zone_u0_mm, zone_u1_mm, zone_v0_mm, zone_v1_mm, product_id, colour_hex')
      .eq('floor_plan_id', fp),
    supabase.from('floor_plan_object_finishes').select('id, object_id, slot, product_id, colour_hex').eq('floor_plan_id', fp),
    supabase.from('scene_renders').select('image_url, camera, created_at').eq('floor_plan_id', fp).eq('kind', 'full').order('created_at', { ascending: false }).limit(24),
    supabase.from('scene_worlds').select('room_id, splat_path, layout_snapshot, created_at').eq('floor_plan_id', fp).eq('status', 'ready').not('splat_path', 'is', null).order('created_at', { ascending: false }).limit(40),
  ]);
  const productIds = [...new Set([
    ...((objects.data ?? []) as any[]).map((o) => o.product_id),
    ...((surfaces.data ?? []) as any[]).map((sf) => sf.product_id),
    ...((finishes.data ?? []) as any[]).map((f) => f.product_id),
  ].filter(Boolean))];
  const products: Record<string, unknown> = {};
  if (productIds.length) {
    const { data: prows } = await supabase.from('products')
      .select('id, name, workspace_id, attributes, metadata, image_product_associations(overall_score, document_images(image_url)), product_material_maps(storage_bucket, albedo_path, normal_path, roughness_path, is_selected, option_value_id), product_colour_textures(colour_hex, storage_bucket, albedo_path, covers_mm)')
      .in('id', productIds);
    const FORMAT_ATTRS = ['width_mm', 'length_mm', 'roll_width_mm', 'roll_length_m', 'plank_width_mm', 'plank_length_mm', 'slab_size'];
    const FORMAT_META = [...FORMAT_ATTRS, 'dimensions', 'available_sizes', 'dimensions_cm_from_vision', 'decor_repeat_mm'];
    const colourOptionsOf = (meta: unknown) => {
      const raw = (meta as { colour_options?: unknown } | null)?.colour_options;
      return Array.isArray(raw) ? raw.map((o: any) => ({ hex: o?.hex ?? null, name: o?.name ?? null, swatch_url: o?.swatch_url ?? null })) : [];
    };
    const pick = (src: unknown, keys: string[]) => {
      const o = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
      return Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]));
    };
    for (const p of (prows ?? []) as any[]) {
      if (p.workspace_id !== workspaceId) continue;
      const imgs = ((p.image_product_associations ?? []) as any[])
        .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
        .map((a) => a.document_images?.image_url).filter(Boolean);
      const m = ((p.product_material_maps ?? []) as any[]).find((x) => x.is_selected && !x.option_value_id);
      const url = (path: string | null | undefined) => (path && m ? supabase.storage.from(m.storage_bucket || 'generation-images').getPublicUrl(path).data.publicUrl : null);
      products[p.id] = {
        id: p.id, name: p.name, imageUrl: imgs[0] ?? null,
        albedoUrl: url(m?.albedo_path), normalUrl: url(m?.normal_path), roughnessUrl: url(m?.roughness_path),
        colourTextures: Object.fromEntries(((p.product_colour_textures ?? []) as any[]).map((c) => [c.colour_hex, { url: supabase.storage.from(c.storage_bucket).getPublicUrl(c.albedo_path).data.publicUrl, coversM: c.covers_mm / 1000 }])),
        attributes: pick(p.attributes, FORMAT_ATTRS),
        metadata: { ...pick(p.metadata, FORMAT_META), colour_options: colourOptionsOf(p.metadata) },
      };
    }
  }
  const render = ((renders.data ?? []) as any[])[0] ?? null;
  return {
    name: plan.name,
    default_wall_height_mm: plan.default_wall_height_mm,
    cabinet_hardware: plan.cabinet_hardware,
    rooms: rooms.data ?? [],
    walls: walls.data ?? [],
    openings: openings.data ?? [],
    objects: ((objects.data ?? []) as any[]).map(({ model_status, model_storage_path, ...o }) => ({
      ...o,
      product_id: o.product_id && products[o.product_id] ? o.product_id : null,
      model_url: model_status === 'ready' && model_storage_path ? supabase.storage.from(SCENE_MODEL_BUCKET).getPublicUrl(model_storage_path).data.publicUrl : null,
    })),
    surfaces: surfaces.data ?? [],
    finishes: finishes.data ?? [],
    products,
    render: render ? { image_url: render.image_url, camera: render.camera } : null,
    renders: ((renders.data ?? []) as any[]).map((r) => ({ image_url: r.image_url, camera: r.camera })),
    worlds: [...new Map(((worlds.data ?? []) as any[]).slice().reverse().map((w) => [w.room_id, {
      room_id: w.room_id,
      url: supabase.storage.from(SCENE_MODEL_BUCKET).getPublicUrl(w.splat_path).data.publicUrl,
      sig: w.layout_snapshot?.sig ?? null,
    }])).values()],
  };
}
