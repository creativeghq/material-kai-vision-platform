const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { callerDbClient } from '../caller-client.ts';

type Db = ReturnType<typeof callerDbClient>;
const UUID = /^[0-9a-f-]{36}$/i;

async function resolveProject(sb: Db, workspaceId: string, project: string | undefined): Promise<{ id: string; name: string } | { error: string; matches?: string[] }> {
  if (!project?.trim()) return { error: 'Name the project.' };
  const q = sb.from('projects').select('id, name').eq('workspace_id', workspaceId).limit(10);
  const { data, error } = UUID.test(project.trim()) ? await q.eq('id', project.trim()) : await q.ilike('name', `%${project.trim().replace(/[%_,()]/g, ' ')}%`);
  if (error) return { error: error.message };
  const list = (data ?? []) as Array<{ id: string; name: string }>;
  const exact = list.find((p) => p.name.toLowerCase() === project.trim().toLowerCase());
  if (!list.length) return { error: `No project called "${project}".` };
  if (list.length > 1 && !exact) return { error: 'More than one project matches; name one exactly.', matches: list.map((p) => p.name) };
  return exact ?? list[0];
}

const VIEW_COLUMNS = 'id, project_id, title, sheet_ids, quote_id, vr_world_id, embed_vr, embed_walkthrough, walkthrough_floor_plan_id, public_share_enabled, public_share_token, updated_at';
interface View {
  id: string; project_id: string; title: string; sheet_ids: string[] | null; quote_id: string | null; vr_world_id: string | null;
  embed_vr: boolean; embed_walkthrough: boolean | null; walkthrough_floor_plan_id: string | null; public_share_enabled: boolean; public_share_token: string | null;
}

async function available(sb: Db, projectId: string) {
  const { data: boards } = await sb.from('moodboards').select('id').eq('project_id', projectId).limit(50);
  const boardIds = ((boards ?? []) as Array<{ id: string }>).map((b) => b.id);
  const owner = boardIds.length ? `project_id.eq.${projectId},moodboard_id.in.(${boardIds.join(',')})` : `project_id.eq.${projectId}`;
  const [sheets, quotes, scenes] = await Promise.all([
    sb.from('moodboard_presentation_sheets').select('id, sheet_type, title').or(owner).eq('status', 'ready').order('updated_at', { ascending: false }).limit(100),
    sb.from('quotes').select('id, name, quote_number, status').eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
    sb.from('floor_plans').select('id, name').eq('project_id', projectId).order('updated_at', { ascending: false }).limit(20),
  ]);
  const sceneRows = (scenes.data ?? []) as Array<{ id: string; name: string }>;
  const worlds = sceneRows.length
    ? ((await sb.from('scene_renders').select('vr_world_id, floor_plan_id, style_label, created_at').in('floor_plan_id', sceneRows.map((s) => s.id)).not('vr_world_id', 'is', null).order('created_at', { ascending: false })).data ?? []) as Array<{ vr_world_id: string; floor_plan_id: string; style_label: string | null }>
    : [];
  const sheetRows = (sheets.data ?? []) as Array<{ id: string; sheet_type: string; title: string }>;
  return {
    sheets: sheetRows.map((s) => ({ id: s.id, type: s.sheet_type, title: s.title })),
    quotes: ((quotes.data ?? []) as Array<{ id: string; name: string | null; quote_number: string | null; status: string | null }>).map((q) => ({ id: q.id, name: q.name ?? q.quote_number, status: q.status })),
    rooms: sceneRows,
    worlds: [...new Map(worlds.map((w) => [w.vr_world_id, { id: w.vr_world_id, room: sceneRows.find((s) => s.id === w.floor_plan_id)?.name ?? '3D room', style: w.style_label }])).values()],
  };
}

export const createManageClientViewTool = (userId: string, workspaceId: string, jwt: string | undefined, onChunk?: (chunk: any) => void) => tool(
  async ({ action, project, view_id, title, item, item_id, confirm }) => {
    if (!userId || !jwt) return JSON.stringify({ success: false, error: 'Client views need a signed-in user.' });
    const sb = callerDbClient(jwt, userId, workspaceId);
    const proj = await resolveProject(sb, workspaceId, project);
    if ('error' in proj) return JSON.stringify({ success: false, ...proj });
    const link = `/projects/${proj.id}?tab=client-view`;

    const { data: viewRows, error: viewErr } = await sb.from('project_client_views').select(VIEW_COLUMNS).eq('project_id', proj.id).order('updated_at', { ascending: false });
    if (viewErr) return JSON.stringify({ success: false, error: viewErr.message });
    const views = (viewRows ?? []) as View[];
    const pool = await available(sb, proj.id);
    const describe = (v: View) => ({
      id: v.id, title: v.title, shared: v.public_share_enabled,
      sheets: (v.sheet_ids ?? []).map((id) => pool.sheets.find((s) => s.id === id) ?? { id, type: 'unknown', title: 'A sheet you cannot see' }),
      quote: v.quote_id ? pool.quotes.find((q) => q.id === v.quote_id) ?? { id: v.quote_id } : null,
      explorable_world: v.embed_vr && v.vr_world_id ? pool.worlds.find((w) => w.id === v.vr_world_id) ?? { id: v.vr_world_id } : null,
      walkthrough: v.embed_walkthrough && v.walkthrough_floor_plan_id ? pool.rooms.find((r) => r.id === v.walkthrough_floor_plan_id) ?? { id: v.walkthrough_floor_plan_id } : null,
    });

    if (action === 'list') {
      return JSON.stringify({ success: true, project: proj.name, link, views: views.map(describe), available: pool });
    }

    if (action === 'create') {
      const worldId = pool.worlds[0]?.id ?? null;
      const { data: created, error } = await sb.from('project_client_views').insert({
        project_id: proj.id, created_by: userId, title: (title?.trim() || `${proj.name} — Client Presentation`).slice(0, 200),
        sheet_ids: [], cover: {}, embed_vr: !!worldId, vr_world_id: worldId, quote_id: null,
        embed_walkthrough: false, walkthrough_floor_plan_id: null, public_share_enabled: false,
      }).select(VIEW_COLUMNS).single();
      if (error || !created) return JSON.stringify({ success: false, error: error?.message ?? 'The client view could not be created.' });
      return JSON.stringify({ success: true, view: describe(created as View), link, available: pool, message: 'A draft client view, not shared yet. Add the items by id, then share it from the Client View tab.' });
    }

    const view = view_id ? views.find((v) => v.id === view_id) : views[0];
    if (!view) return JSON.stringify({ success: false, error: views.length ? 'No such client view on this project.' : 'The project has no client view yet; create one first.', link });
    if (!item || !item_id) return JSON.stringify({ success: false, error: `${action} needs item and item_id (from list).`, available: pool });

    const adding = action === 'add';
    const patch: Record<string, unknown> = {};
    let what = '';
    if (item === 'sheet') {
      const sheet = pool.sheets.find((s) => s.id === item_id);
      if (adding && !sheet) return JSON.stringify({ success: false, error: 'That sheet is not a ready sheet of this project.', sheets: pool.sheets });
      const ids = (view.sheet_ids ?? []).filter((id) => id !== item_id);
      patch.sheet_ids = adding ? [...ids, item_id] : ids;
      what = sheet ? `the ${sheet.title} sheet` : 'the sheet';
    } else if (item === 'quote') {
      const quote = pool.quotes.find((q) => q.id === item_id);
      if (adding && !quote) return JSON.stringify({ success: false, error: 'That quote is not on this project.', quotes: pool.quotes });
      patch.quote_id = adding ? item_id : null;
      what = `quote ${quote?.name ?? ''}`.trim();
    } else if (item === 'world') {
      const world = pool.worlds.find((w) => w.id === item_id);
      if (adding && !world) return JSON.stringify({ success: false, error: 'That explorable world was not made from a room of this project.', worlds: pool.worlds });
      patch.vr_world_id = adding ? item_id : null;
      patch.embed_vr = adding;
      what = world ? `the explorable world of ${world.room}` : 'the explorable world';
    } else {
      const room = pool.rooms.find((r) => r.id === item_id);
      if (adding && !room) return JSON.stringify({ success: false, error: 'That 3D room is not on this project.', rooms: pool.rooms });
      patch.walkthrough_floor_plan_id = adding ? item_id : null;
      patch.embed_walkthrough = adding;
      what = room ? `the walkthrough of ${room.name}` : 'the walkthrough';
    }

    if (view.public_share_enabled && confirm !== true) {
      onChunk?.({
        type: 'action_confirmation',
        tool: 'manage_client_view',
        input: { action, project: proj.id, view_id: view.id, item, item_id, confirm: true },
        title: `${adding ? 'Add' : 'Remove'} ${what} ${adding ? 'to' : 'from'} the shared client view?`,
        summary: `**${view.title}** is already shared, so the client sees the change at once.`,
        toolkit_id: 'presentation-sheets',
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Waiting for the user to approve on the card. Do not retry.' });
    }
    const { data: updated, error } = await sb.from('project_client_views').update(patch).eq('id', view.id).select(VIEW_COLUMNS).single();
    if (error || !updated) return JSON.stringify({ success: false, error: error?.message ?? 'The client view could not be updated.' });
    return JSON.stringify({ success: true, view: describe(updated as View), link, message: `${adding ? 'Added' : 'Removed'} ${what}.${view.public_share_enabled ? ' The client sees it now.' : ' Share the view from the Client View tab when it is ready.'}` });
  },
  {
    name: 'manage_client_view',
    description:
      'The client package of a project: one client view showing its drawings, renders and sheets, the quote, the scroll walkthrough of a 3D room and an explorable world, '
      + 'all picked by id from what the project already holds, never re-uploaded. list: the project\'s client views and everything available to put on them '
      + '(sheets including drawing sets, quotes, 3D rooms, explorable worlds made from those rooms). create: a draft, unshared view. '
      + 'add/remove: one item (sheet, quote, world or walkthrough) on a view (default the latest); on a view already shared the user approves on a card first. '
      + 'A render becomes a sheet first (generate_presentation_sheet), drawings come from manage_scenes drawing_set.',
    schema: z.object({
      action: z.enum(['list', 'create', 'add', 'remove']).describe('What to do.'),
      project: z.string().max(200).describe('The project, by name or id.'),
      view_id: z.string().uuid().optional().describe('add/remove: the client view; default the most recently changed one.'),
      title: z.string().max(200).optional().describe('create: the view title.'),
      item: z.enum(['sheet', 'quote', 'world', 'walkthrough']).optional().describe('add/remove: what kind of item.'),
      item_id: z.string().uuid().optional().describe('add/remove: its id, from list (a walkthrough is the 3D room id).'),
      confirm: z.boolean().optional().describe('Leave unset; the Approve button re-invokes with confirm:true.'),
    }),
  },
);

const MEDIA_TYPES = ['image', 'video'] as const;

export const createSaveToMoodboardTool = (userId: string, workspaceId: string, jwt: string | undefined, conversationMedia: Array<{ kind: string; url: string; label: string }> = []) => tool(
  async ({ moodboard, media_url, title }) => {
    if (!userId || !jwt) return JSON.stringify({ success: false, error: 'Saving needs a signed-in user.' });
    const sb = callerDbClient(jwt, userId, workspaceId);
    const q = sb.from('moodboards').select('id, title, project_id').eq('user_id', userId).order('updated_at', { ascending: false }).limit(20);
    const { data, error } = moodboard && UUID.test(moodboard.trim()) ? await q.eq('id', moodboard.trim()) : moodboard ? await q.ilike('title', `%${moodboard.trim().replace(/[%_,()]/g, ' ')}%`) : await q;
    if (error) return JSON.stringify({ success: false, error: error.message });
    const boards = (data ?? []) as Array<{ id: string; title: string }>;
    const exact = moodboard ? boards.find((b) => b.title.toLowerCase() === moodboard.trim().toLowerCase()) : undefined;
    if (!moodboard || !boards.length || (boards.length > 1 && !exact)) {
      return JSON.stringify({ success: false, error: moodboard ? (boards.length ? 'More than one moodboard matches; name one exactly.' : `No moodboard of yours called "${moodboard}".`) : 'Name the moodboard.', moodboards: boards.map((b) => b.title) });
    }
    const board = exact ?? boards[0];
    const media = media_url ? conversationMedia.find((m) => m.url === media_url) : conversationMedia.at(-1);
    if (!media) return JSON.stringify({ success: false, error: media_url ? 'That URL is not a result of this conversation; only generated results can be saved.' : 'Nothing has been generated in this conversation yet.' });
    const media_type = media.kind === 'video' ? MEDIA_TYPES[1] : MEDIA_TYPES[0];
    const { data: last } = await sb.from('moodboard_items').select('position').eq('moodboard_id', board.id).order('position', { ascending: false }).limit(1);
    const position = (((last ?? [])[0] as { position?: number } | undefined)?.position ?? -1) + 1;
    const { error: insErr } = await sb.from('moodboard_items').insert({
      moodboard_id: board.id, material_id: null, media_url: media.url, media_type, media_title: (title?.trim() || media.label).slice(0, 200), position, notes: null,
    });
    if (insErr) return JSON.stringify({ success: false, error: insErr.message });
    return JSON.stringify({ success: true, moodboard: board.title, saved: media.url, media_type, link: `/moodboard/${board.id}`, message: `Saved to ${board.title}; its sheets can now use it.` });
  },
  {
    name: 'save_to_moodboard',
    description: 'Saves a result of this conversation (a render, staged room, scene render, materials board, grid tile or video) to one of the user\'s moodboards, so its sheets and client views can use it. '
      + 'media_url picks which one (from the results listed in context); without it the newest result is saved.',
    schema: z.object({
      moodboard: z.string().max(200).describe('The moodboard, by title or id.'),
      media_url: z.string().url().optional().describe('The result to save; default the newest.'),
      title: z.string().max(200).optional().describe('A caption for it on the board.'),
    }),
  },
);
