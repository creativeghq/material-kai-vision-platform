/** 3D rooms for the interior designer: a floor plan, photo or render becomes an editable room on the chat canvas (#564). */
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
  async ({ action, image_url, kind, name, scene_id }) => {
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
      + 'Rendering and editing happen in the room on the canvas; each render returns to the conversation.',
    schema: z.object({
      action: z.enum(['create', 'status', 'list']).describe('What to do.'),
      image_url: z.string().url().optional().describe('create: the https URL of the plan, photo or render.'),
      kind: z.enum(['plan_image', 'photo', 'render']).default('photo').describe('create: what the image shows.'),
      name: z.string().max(200).optional().describe('create: a name for the scene.'),
      scene_id: z.string().uuid().optional().describe('status: the scene to check.'),
    }),
  },
);
