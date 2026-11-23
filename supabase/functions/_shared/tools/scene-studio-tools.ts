const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { moduleGate } from './module-gate.ts';
import { callerDbClient } from '../caller-client.ts';
import { serviceClient } from '../supabase-client.ts';
import { fetchImageGuarded } from '../fetch-image.ts';
import { SCENE_OBJECT_SLOTS, slotsForKind } from '../sceneReadSchema.generated.ts';
import { KITCHEN_KINDS, kitchenCompositionFromRoom, type RoomComposition } from '../kitchenComposition.generated.ts';
import { CABINET_HARDWARE, CABINET_HARDWARE_OPTIONS } from '../cabinetHardware.generated.ts';

const MODULE_SLUG = 'scene-studio';
const BUCKET = 'generation-images';
const SCENE_COLUMNS = 'id, name, source_kind, extract_status, extract_error, extract_notes, created_at, updated_at';

const extOf = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg');

export const createManageScenesTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => tool(
  async ({ action, image_url, kind, name, scene_id, object, mode, room, area, part, product, colour, project, fronts, handles }) => {
    const denied = await moduleGate(workspaceId, MODULE_SLUG);
    if (denied) return denied;
    if (!userId || !jwt) return JSON.stringify({ success: false, error: 'Scene Studio needs a signed-in user.' });
    const sb = callerDbClient(jwt, userId, workspaceId);

    if (action === 'list') {
      const { data, error } = await sb.from('floor_plans').select(SCENE_COLUMNS)
        .eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(20);
      if (error) return JSON.stringify({ success: false, error: error.message });
      const scenes = data ?? [];
      onChunk?.({ type: 'scene_studio_scenes', scenes, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: scenes.length, scenes });
    }

    if (action === 'open') {
      if (!scene_id) return JSON.stringify({ success: false, error: 'open needs scene_id (list the scenes first).' });
      const { data: scene, error } = await sb.from('floor_plans').select(SCENE_COLUMNS).eq('id', scene_id).maybeSingle();
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!scene) return JSON.stringify({ success: false, error: 'Scene not found.' });
      let target: { id: string; label: string } | null = null;
      if (object) {
        const { data: objs } = await sb.from('floor_plan_objects').select('id, label, kind')
          .eq('floor_plan_id', scene_id).is('removed_at', null);
        const list = (objs ?? []) as Array<{ id: string; label: string; kind: string }>;
        const needle = object.trim().toLowerCase();
        const found = list.find((o) => o.label.toLowerCase() === needle)
          ?? list.find((o) => o.label.toLowerCase().includes(needle) || o.kind.replace(/_/g, ' ').includes(needle));
        if (!found) {
          return JSON.stringify({ success: false, error: `No object called "${object}" in this room.`, objects: list.map((o) => o.label).slice(0, 30) });
        }
        target = { id: found.id, label: found.label };
      }
      let roomId: string | null = null;
      if (room) {
        const { data: rooms } = await sb.from('floor_plan_rooms').select('id, name').eq('floor_plan_id', scene_id);
        const list = (rooms ?? []) as Array<{ id: string; name: string }>;
        const needle = room.trim().toLowerCase();
        const hit = list.find((r) => r.name.toLowerCase() === needle) ?? list.find((r) => r.name.toLowerCase().includes(needle));
        if (!hit) return JSON.stringify({ success: false, error: `No space called "${room}" in this 3D room.`, spaces: list.map((r) => r.name) });
        roomId = hit.id;
      }
      const intent = { mode: mode ?? 'view', object_id: target?.id ?? null, room_id: roomId, ...(fronts ? { fronts } : {}), nonce: Date.now() };
      onChunk?.({ type: 'scene_studio_scene', scene: { ...scene, intent }, timestamp: Date.now() });
      const next = mode === 'make_3d'
        ? `${target?.label ?? 'The object'} is selected in the room; the user presses "Make 3D (10 credits)" to confirm.`
        : mode === 'photo_walk'
          ? 'The room is open with the photo-real walk offer; the user confirms it there (a render plus 190 credits).'
          : mode === 'walk' ? 'The room is open in walk mode: WASD or arrows, drag to look, click the floor to go there.' : 'The room is open on the canvas.';
      return JSON.stringify({ success: true, scene_id, object: target, mode: intent.mode, message: next });
    }

    if (action === 'finish') {
      if (!scene_id || (!object && (!room || !area))) return JSON.stringify({ success: false, error: 'finish needs scene_id and either an object, or a room and an area.' });
      if (!product && !colour) return JSON.stringify({ success: false, error: 'finish needs a product or a colour.' });
      let productRow: { id: string; name: string } | null = null;
      if (product) {
        const isId = /^[0-9a-f-]{36}$/i.test(product.trim());
        const q = sb.from('products').select('id, name').eq('workspace_id', workspaceId).limit(10);
        const { data: found } = isId ? await q.eq('id', product.trim()) : await q.ilike('name', `%${product.trim().replace(/[%_,()]/g, ' ')}%`);
        const list = (found ?? []) as Array<{ id: string; name: string }>;
        productRow = list.find((p) => p.name.toLowerCase() === product.trim().toLowerCase()) ?? list[0] ?? null;
        if (!productRow) return JSON.stringify({ success: false, error: `No product called "${product}" in this workspace's catalogue.` });
        if (list.length > 1 && productRow.name.toLowerCase() !== product.trim().toLowerCase()) {
          return JSON.stringify({ success: false, error: 'More than one product matches; name one exactly.', matches: list.map((p) => p.name) });
        }
      }
      if (object) {
        const { data: objs } = await sb.from('floor_plan_objects').select('id, label, kind').eq('floor_plan_id', scene_id).is('removed_at', null);
        const list = (objs ?? []) as Array<{ id: string; label: string; kind: string }>;
        const needle = object.trim().toLowerCase();
        const found = list.find((o) => o.label.toLowerCase() === needle)
          ?? list.find((o) => o.label.toLowerCase().includes(needle) || o.kind.replace(/_/g, ' ').includes(needle));
        if (!found) return JSON.stringify({ success: false, error: `No object called "${object}" in this room.`, objects: list.map((o) => o.label).slice(0, 30) });
        const slots = slotsForKind(found.kind);
        const slot = part ?? slots[0];
        if (!slots.includes(slot)) return JSON.stringify({ success: false, error: `A ${found.kind.replace(/_/g, ' ')} has no ${slot}.`, parts: slots });
        const { error: finErr } = await sb.from('floor_plan_object_finishes').upsert(
          { floor_plan_id: scene_id, object_id: found.id, slot, product_id: productRow?.id ?? null, colour_hex: colour?.toLowerCase() ?? null },
          { onConflict: 'object_id,slot' },
        );
        if (finErr) return JSON.stringify({ success: false, error: finErr.message });
        const { data: scene } = await sb.from('floor_plans').select(SCENE_COLUMNS).eq('id', scene_id).maybeSingle();
        if (scene) onChunk?.({ type: 'scene_studio_scene', scene: { ...scene, intent: { mode: 'view', object_id: found.id, room_id: null, nonce: Date.now() } }, timestamp: Date.now() });
        return JSON.stringify({
          success: true, object: found.label, part: slot, product: productRow?.name ?? null, colour: colour ?? null,
          message: `The ${slot} of the ${found.label} now shows ${productRow ? productRow.name : colour}. Render, or "Apply to render" on the object, shows it photo-real.`,
        });
      }
      const { data: rooms } = await sb.from('floor_plan_rooms').select('id, name').eq('floor_plan_id', scene_id);
      const spaces = (rooms ?? []) as Array<{ id: string; name: string }>;
      const needle = room!.trim().toLowerCase();
      const hit = spaces.find((r) => r.name.toLowerCase() === needle) ?? spaces.find((r) => r.name.toLowerCase().includes(needle));
      if (!hit) return JSON.stringify({ success: false, error: `No space called "${room}" in this 3D room.`, spaces: spaces.map((r) => r.name) });
      const { error: upErr } = await sb.from('floor_plan_surfaces').upsert(
        { floor_plan_id: scene_id, room_id: hit.id, surface: area, wall_id: null, band_from_mm: null, band_to_mm: null, product_id: productRow?.id ?? null, colour_hex: colour?.toLowerCase() ?? null },
        { onConflict: 'room_id,surface,wall_id,zone_key' },
      );
      if (upErr) return JSON.stringify({ success: false, error: upErr.message });
      if (area === 'walls') await sb.from('floor_plan_surfaces').delete().eq('room_id', hit.id).eq('surface', 'wall');
      const { data: scene } = await sb.from('floor_plans').select(SCENE_COLUMNS).eq('id', scene_id).maybeSingle();
      if (scene) onChunk?.({ type: 'scene_studio_scene', scene: { ...scene, intent: { mode: 'view', object_id: null, room_id: hit.id, nonce: Date.now() } }, timestamp: Date.now() });
      return JSON.stringify({
        success: true, room: hit.name, area, product: productRow?.name ?? null, colour: colour ?? null,
        message: `The ${area} of ${hit.name} now show ${productRow ? productRow.name : colour}. One wall or a backsplash is picked by clicking it with Paint in the room.`,
      });
    }

    if (action === 'handles') {
      if (!scene_id || !handles) return JSON.stringify({ success: false, error: 'handles needs scene_id and handles.' });
      const { data: scene, error } = await sb.from('floor_plans').update({ cabinet_hardware: handles }).eq('id', scene_id).select(SCENE_COLUMNS).maybeSingle();
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!scene) return JSON.stringify({ success: false, error: 'Scene not found.' });
      onChunk?.({ type: 'scene_studio_scene', scene: { ...scene, intent: { mode: 'view', object_id: null, room_id: null, nonce: Date.now() } }, timestamp: Date.now() });
      return JSON.stringify({ success: true, handles: CABINET_HARDWARE_OPTIONS[handles].label, message: `The kitchen fronts now show ${CABINET_HARDWARE_OPTIONS[handles].label.toLowerCase()} in the room.` });
    }

    if (action === 'cut_list') {
      if (!scene_id) return JSON.stringify({ success: false, error: 'cut_list needs scene_id.' });
      const { data: scene } = await sb.from('floor_plans').select('id, project_plan_id').eq('id', scene_id).maybeSingle();
      if (!scene) return JSON.stringify({ success: false, error: 'Scene not found.' });
      if (!scene.project_plan_id) return JSON.stringify({ success: false, error: 'The kitchen has not been priced yet; run price_kitchen first. The cut list comes from its plan, so it always matches the price.' });
      const { data: lines, error } = await sb.from('project_plan_items').select('label, unit, quantity, quantity_formula')
        .eq('plan_id', scene.project_plan_id).eq('is_schedule', true).order('sort_order');
      if (error) return JSON.stringify({ success: false, error: error.message });
      const rows = (lines ?? []) as Array<{ label: string; unit: string | null; quantity: number; quantity_formula: string | null }>;
      const cut = (r: { quantity_formula: string | null }) => ['total_board_m2_', 'total_edge_m_'].some((k) => (r.quantity_formula ?? '').includes(k));
      const fmt = (r: { label: string; unit: string | null; quantity: number }) => ({ item: r.label, quantity: Number(r.quantity), unit: r.unit });
      const boards = rows.filter(cut).map(fmt);
      if (!boards.length) return JSON.stringify({ success: false, error: "This kitchen's blueprint is not built from boards, so it has no cut list. Its hardware schedule is on the plan." });
      return JSON.stringify({
        success: true, plan_id: scene.project_plan_id, boards, hardware: rows.filter((r) => !cut(r)).map(fmt),
        message: 'Board areas and edge tape come from the cabinets on the kitchen plan. If the room has changed since it was priced, run price_kitchen again first.',
      });
    }

    if (action === 'price_kitchen') {
      if (!scene_id) return JSON.stringify({ success: false, error: 'price_kitchen needs scene_id.' });
      const { data: scene } = await sb.from('floor_plans').select(`${SCENE_COLUMNS}, workspace_id, project_id, project_plan_id`).eq('id', scene_id).maybeSingle();
      if (!scene) return JSON.stringify({ success: false, error: 'Scene not found.' });
      const { data: objs } = await sb.from('floor_plan_objects').select('id, kind, width_mm, depth_mm, height_mm, removed_at').eq('floor_plan_id', scene_id);
      const objects = ((objs ?? []) as Array<{ id: string; kind: string; width_mm: number; depth_mm: number; height_mm: number; removed_at: string | null }>)
        .map((o) => ({ ...o, width_mm: Number(o.width_mm), depth_mm: Number(o.depth_mm), height_mm: Number(o.height_mm) }));
      if (!objects.some((o) => !o.removed_at && KITCHEN_KINDS.has(o.kind))) return JSON.stringify({ success: false, error: 'There is no kitchen in this 3D room to price.' });
      const engine = async (body: Record<string, unknown>) => {
        const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/project-plan-engine`, {
          method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const out = await res.json().catch(() => ({})) as { plan?: { id: string; subtotal: number; source_currency: string; project_id: string | null }; error?: string };
        if (!res.ok || !out.plan) throw new Error(out.error ?? `The plan engine answered HTTP ${res.status}.`);
        return out.plan;
      };
      try {
        let plan;
        if (scene.project_plan_id) {
          const { data: existing } = await sb.from('project_plans').select('id, dimensions, composition').eq('id', scene.project_plan_id).maybeSingle();
          const previous = ((existing?.composition as { config?: RoomComposition } | null)?.config) ?? {};
          plan = await engine({ action: 'rescale', plan_id: scene.project_plan_id, dimensions: existing?.dimensions ?? {}, composition: kitchenCompositionFromRoom(objects, previous) });
        } else {
          let projectId = scene.project_id as string | null;
          if (!projectId && project) {
            const { data: found } = await sb.from('projects').select('id, name').eq('workspace_id', workspaceId).ilike('name', `%${project.trim().replace(/[%_,()]/g, ' ')}%`).limit(5);
            const list = (found ?? []) as Array<{ id: string; name: string }>;
            if (list.length > 1) return JSON.stringify({ success: false, error: 'More than one project matches; name one exactly.', matches: list.map((p) => p.name) });
            projectId = list[0]?.id ?? null;
          }
          if (!projectId) return JSON.stringify({ success: false, error: 'This 3D room is not on a project yet. Ask which project the kitchen is quoted on and pass project.' });
          const { data: bps } = await sb.from('blueprints').select('id, workspace_id').eq('project_type', 'kitchen_cabinets').eq('status', 'active')
            .or(`workspace_id.eq.${workspaceId},is_platform_starter.eq.true`).order('updated_at', { ascending: false });
          const bpList = (bps ?? []) as Array<{ id: string; workspace_id: string | null }>;
          const blueprint = bpList.find((b) => b.workspace_id === workspaceId) ?? bpList[0];
          if (!blueprint) return JSON.stringify({ success: false, error: 'No kitchen blueprint is available to price from.' });
          plan = await engine({ action: 'create-from-blueprint', project_id: projectId, blueprint_id: blueprint.id, title: `${scene.name} — kitchen`.slice(0, 200), composition: kitchenCompositionFromRoom(objects) });
          const { error: linkErr } = await sb.from('floor_plans').update({ project_id: projectId, project_plan_id: plan.id }).eq('id', scene_id);
          if (linkErr) return JSON.stringify({ success: false, plan_id: plan.id, error: `The kitchen was priced but the room could not be linked to its plan: ${linkErr.message}` });
        }
        onChunk?.({ type: 'scene_studio_scene', scene: { ...scene, project_plan_id: plan.id, intent: { mode: 'view', object_id: null, room_id: null, nonce: Date.now() } }, timestamp: Date.now() });
        return JSON.stringify({
          success: true, plan_id: plan.id, subtotal: plan.subtotal, currency: plan.source_currency,
          plan_link: plan.project_id ? `/projects/${plan.project_id}?tab=plan` : null,
          message: 'The kitchen is priced on its project plan. Door model and worktop are chosen in the room (Kitchen Price) or on the plan; "Create quote" there turns it into a draft quote.',
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (action === 'status') {
      if (!scene_id) return JSON.stringify({ success: false, error: 'status needs scene_id.' });
      const { data, error } = await sb.from('floor_plans').select(SCENE_COLUMNS).eq('id', scene_id).maybeSingle();
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!data) return JSON.stringify({ success: false, error: 'Scene not found.' });
      const { count } = await sb.from('floor_plan_objects').select('id', { count: 'exact', head: true }).eq('floor_plan_id', scene_id);
      const scene = { ...data, object_count: count ?? 0 };
      onChunk?.({ type: 'scene_studio_scene', scene, timestamp: Date.now() });
      return JSON.stringify({ success: true, scene });
    }

    if (!image_url) return JSON.stringify({ success: false, error: 'create needs image_url: an image the user attached or a render from this conversation.' });
    let image: { bytes: Uint8Array; mimeType: string };
    try {
      image = await fetchImageGuarded(image_url);
    } catch (e) {
      return JSON.stringify({ success: false, error: `The image could not be fetched: ${e instanceof Error ? e.message : String(e)}` });
    }
    const { data: created, error: createErr } = await sb.from('floor_plans')
      .insert({ workspace_id: workspaceId, name: (name ?? '').trim().slice(0, 200) || '3D room from chat', source_kind: kind })
      .select('id, workspace_id, name').single();
    if (createErr || !created) return JSON.stringify({ success: false, error: createErr?.message ?? 'The scene could not be created.' });

    const path = `scene-studio/${created.workspace_id}/${created.id}/source.${extOf(image.mimeType)}`;
    const admin = serviceClient();
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, image.bytes, { contentType: image.mimeType, upsert: false });
    if (upErr) return JSON.stringify({ success: false, error: `Upload failed: ${upErr.message}` });
    const { error: pathErr } = await sb.from('floor_plans').update({ source_storage_path: path }).eq('id', created.id);
    if (pathErr) return JSON.stringify({ success: false, error: pathErr.message });

    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/scene-studio-read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ floor_plan_id: created.id }),
    });
    const body = await res.json().catch(() => ({})) as { error?: string };
    const scene = { id: created.id, name: created.name, source_kind: kind, extract_status: res.ok ? 'extracting' : 'failed' };
    onChunk?.({ type: 'scene_studio_scene', scene, timestamp: Date.now() });
    if (!res.ok) {
      return JSON.stringify({ success: false, scene, error: body.error ?? `The image could not be sent for reading (HTTP ${res.status}).` });
    }
    return JSON.stringify({
      success: true, scene,
      message: 'The 3D room is open on the canvas and the image is being read into rooms, walls and furniture (about a minute). The user rearranges it there and clicks a style to render it; renders come back into this conversation.',
    });
  },
  {
    name: 'manage_scenes',
    description:
      '3D rooms: turn a floor plan, a room photo or a render into an editable 3D room on the canvas, where the user '
      + 'rearranges it, recolours or swaps products, and renders it photo-real in any style. '
      + 'create: reads image_url (an image the user attached, or a render from this conversation) as kind '
      + 'plan_image (a floor plan drawing), photo (a photo of a room) or render (a generated image); it is '
      + 'charged once and takes about a minute. status: one scene by scene_id. list: the workspace\'s scenes. '
      + 'open: opens scene_id on the canvas; mode walk lets the user walk through it, object + mode make_3d selects that object '
      + 'for Make 3D (10 credits, the user confirms), mode photo_walk offers a photo-real walk the user confirms. '
      + 'finish: lays a catalogue product (by name) or a #hex colour on the floor, walls or ceiling of one space, '
      + 'or on one part of an object (object + part, e.g. the sofa upholstery or the kitchen fronts); free. '
      + 'price_kitchen: prices the kitchen units standing in the room on a project plan from the kitchen blueprint '
      + '(runs, cabinet counts, sizes; the door model and worktop chosen on the plan are kept) and returns the subtotal. '
      + 'handles: sets how the kitchen fronts open (handles: bar_handles, knobs, gola, push_to_open, edge_pull, cup_pulls). '
      + 'cut_list: the board areas (carcass, fronts, back, plinth, m²), edge tape (m) and hardware the priced kitchen needs; price_kitchen first. '
      + 'open with fronts closed/half/open shows the cabinets with their doors and drawers that way. '
      + 'Rendering and editing happen in the room on the canvas; each render returns to the conversation.',
    schema: z.object({
      action: z.enum(['create', 'status', 'list', 'open', 'finish', 'price_kitchen', 'handles', 'cut_list']).describe('What to do.'),
      image_url: z.string().url().optional().describe('create: the https URL of the plan, photo or render.'),
      kind: z.enum(['plan_image', 'photo', 'render']).default('photo').describe('create: what the image shows.'),
      name: z.string().max(200).optional().describe('create: a name for the scene.'),
      scene_id: z.string().uuid().optional().describe('status/open/finish: the scene.'),
      object: z.string().max(120).optional().describe('open/finish: the object, by its name in the room (e.g. sofa).'),
      mode: z.enum(['view', 'walk', 'make_3d', 'photo_walk']).optional().describe('open: what to do in the room.'),
      room: z.string().max(120).optional().describe('open/finish: the space, by name (e.g. living room).'),
      area: z.enum(['floor', 'walls', 'ceiling']).optional().describe('finish: which surface of the space.'),
      part: z.enum(SCENE_OBJECT_SLOTS).optional().describe('finish with object: which part (upholstery, legs, fronts, worktop, handles…); default the main one.'),
      product: z.string().max(200).optional().describe('finish: the catalogue product to lay, by exact name or id.'),
      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('finish: a paint colour as #rrggbb, instead of a product.'),
      project: z.string().max(200).optional().describe('price_kitchen: the project to price on, by name, when the room has none yet.'),
      fronts: z.enum(['closed', 'half', 'open']).optional().describe('open: show the kitchen doors and drawers closed, half open or open.'),
      handles: z.enum(CABINET_HARDWARE).optional().describe('handles: how the kitchen fronts open.'),
    }),
  },
);
