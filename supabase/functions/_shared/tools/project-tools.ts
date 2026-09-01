/**
 * Project Workspace Tools — agent-chat surface for the Projects module.
 *
 * Tools:
 *   - create_project        — new project with optional client + rooms + category
 *   - list_my_projects      — user's active projects with budget / deadline summary
 *   - find_project          — fuzzy lookup by name (returns id + summary)
 *   - add_task              — add a task (optionally a subtask via parent_task_id)
 *   - add_purchase_item     — add a made-to-order door/window (with spec) to a project
 *   - generate_purchase_sheet — render the project's purchase items into a spec-sheet PDF
 *
 * Cost discipline: project DB tools are 0 credits. generate_purchase_sheet renders a
 * PDF (no AI) — also free; per-item image generation is a separate UI action.
 * Module-gated on `projects` slug — disabled-module errors are returned as
 * friendly strings rather than thrown.
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MODULE_SLUG = 'projects';

import { serviceClient as svcClient } from '../supabase-client.ts';
import { moduleGate } from './module-gate.ts';
/**
 * The workspace-scoped project resolver is SHARED with `_shared/project-assessment.ts` (#395,
 * invariant 1). It used to live here; it was moved when a second toolkit needed exactly the same
 * tenancy binding, because two copies of a tenancy check is how the hole #395 closed gets
 * reopened one file over. `sbResolveProjectId` takes the client explicitly — that is the only
 * difference from the version this replaced.
 */
import { resolveProjectId as sbResolveProjectId } from '../project-assessment.ts';

async function resolveProjectId(
  userId: string, workspaceId: string | null, projectId?: string, projectName?: string,
): Promise<string | null> {
  return await sbResolveProjectId(svcClient(), userId, workspaceId, projectId, projectName);
}

// ───────────────────────────────────────────────────────────────────────────
// 1) create_project
// ───────────────────────────────────────────────────────────────────────────

export const createCreateProjectTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ name, description, deadline, budget_amount, budget_currency, rooms, client_company_id, client_contact_id, client_name, category }: {
      name: string;
      description?: string;
      deadline?: string;
      budget_amount?: number;
      budget_currency?: string;
      rooms?: string[];
      client_company_id?: string;
      client_contact_id?: string;
      client_name?: string;
      category?: string;
    }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;
      const sb = svcClient();

      // Resolve the project's client — everything downstream (quotes, invoices, client views,
      // finance attach) depends on it, so the agent must set it just like the create page does.
      // Company XOR contact.
      let companyId = client_company_id ?? null;
      let contactId = client_contact_id ?? null;
      if (companyId && contactId) return JSON.stringify({ success: false, error: 'Provide a client company OR contact, not both.' });
      /**
       * A client id supplied by the MODEL is proven to be in this workspace (#395, invariant 1).
       *
       * The `client_name` path below has always searched inside the workspace. The explicit-id
       * path did not check anything — a service-role insert of a body-supplied FK — so a project
       * here could name another tenant's company, and the comment right above says everything
       * downstream depends on that link: quotes, invoices, client views, finance attach.
       */
      if (companyId) {
        const { data: okCo } = await sb.from('crm_companies').select('id')
          .eq('id', companyId).eq('workspace_id', workspaceId).maybeSingle();
        if (!okCo) return JSON.stringify({ success: false, error: 'That client company was not found in this workspace.' });
      }
      if (contactId) {
        const { data: okCt } = await sb.from('crm_contacts').select('id')
          .eq('id', contactId).eq('workspace_id', workspaceId).maybeSingle();
        if (!okCt) return JSON.stringify({ success: false, error: 'That client contact was not found in this workspace.' });
      }
      if (!companyId && !contactId && client_name) {
        const { data: co } = await sb.from('crm_companies').select('id')
          .eq('workspace_id', workspaceId).ilike('name', client_name).limit(1).maybeSingle();
        if (co) companyId = (co as any).id;
        else {
          const { data: ct } = await sb.from('crm_contacts').select('id')
            .eq('workspace_id', workspaceId).ilike('name', client_name).limit(1).maybeSingle();
          if (ct) contactId = (ct as any).id;
        }
      }

      /**
       * The category vocabulary is per workspace (platform defaults + this tenant's own), so it
       * cannot be a z.enum — it is resolved by name here instead. An unrecognised name is
       * REFUSED with the real list rather than dropped: a project silently created without the
       * kind the user named is the silent-zero shape, and the model has no way to notice.
       */
      let categoryId: string | null = null;
      if (category?.trim()) {
        const { data: cats } = await sb
          .from('project_categories')
          .select('id, label')
          .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
          .eq('is_active', true);
        const wanted = category.trim().toLowerCase();
        const hit = (cats ?? []).find((c: any) => String(c.label).toLowerCase() === wanted);
        if (!hit) {
          return JSON.stringify({
            success: false,
            error: `No project category named "${category}" in this workspace.`,
            available_categories: (cats ?? []).map((c: any) => c.label),
            hint: 'Use one of available_categories, omit the category, or ask the user to add it under Projects -> Categories.',
          });
        }
        categoryId = (hit as any).id;
      }

      onChunk?.({ type: 'tool_progress', status: `Creating project "${name}"...`, timestamp: Date.now() });

      const { data: project, error } = await sb
        .from('projects')
        .insert({
          user_id: userId,
          workspace_id: workspaceId,  // NOT NULL + tenancy binding (CLAUDE.md invariant 1)
          name,
          description: description || null,
          deadline: deadline || null,
          budget_amount: budget_amount || null,
          budget_currency: budget_currency || 'EUR',
          client_company_id: companyId,
          client_contact_id: contactId,
          category_id: categoryId,
        } as any)
        .select()
        .single();
      if (error) return JSON.stringify({ success: false, error: error.message });

      let roomCount = 0;
      let roomsError: string | null = null;
      if (rooms && rooms.length > 0) {
        const rows = rooms.map((rname, idx) => ({
          project_id: (project as any).id,
          name: rname,
          sort_order: idx,
        }));
        const { error: rErr } = await sb.from('project_rooms').insert(rows);
        // The project is committed; failing the whole call would invite a duplicate. But the user
        // ASKED for these rooms, and a silent 0 reads as "I did not want any".
        if (rErr) roomsError = rErr.message;
        else roomCount = rooms.length;
      }

      onChunk?.({
        type: 'project_created',
        project_id: (project as any).id,
        name: (project as any).name,
        rooms_count: roomCount,
      });

      return JSON.stringify({
        success: true,
        project_id: (project as any).id,
        name: (project as any).name,
        rooms_added: roomCount,
        rooms_error: roomsError ?? undefined,
        url: `/projects/${(project as any).id}`,
        message: `Project "${name}" created${roomCount ? ` with ${roomCount} ${roomCount === 1 ? 'room' : 'rooms'}` : ''}.`
          + (roomsError ? ` The rooms could NOT be added (${roomsError}) — add them on the project page rather than creating it again.` : ''),
      });
    },
    {
      name: 'create_project',
      description:
        'Create a new project (container above moodboards and quotes). ' +
        'A project tracks rooms, a deadline, a budget, and tasks. Use this when the user says ' +
        '"start a new project", "create a project for X", or describes a new engagement. ' +
        'Rooms are optional — only include them if the user lists rooms explicitly.',
      schema: z.object({
        name: z.string().describe('Project name (e.g. "Kavouri villa renovation")'),
        description: z.string().optional().describe('Short scope or briefing notes'),
        deadline: z.string().optional().describe('ISO date YYYY-MM-DD'),
        budget_amount: z.number().optional().describe('Total budget'),
        budget_currency: z.string().optional().describe('ISO currency code, default EUR'),
        rooms: z.array(z.string()).optional().describe('Room names like ["Master Bath", "Kitchen", "Living"]'),
        client_company_id: z.string().optional().describe('CRM company id of the client (drives quotes/invoices/finance). Company XOR contact.'),
        client_contact_id: z.string().optional().describe('CRM contact id of the client, if the client is a person not a company.'),
        client_name: z.string().optional().describe('Client name to resolve to an existing CRM company/contact when you don\'t have the id.'),
        category: z.string().optional().describe('The kind of work, by NAME - e.g. "Renovation", "Trip", "Warehouse", "Real Estate". The list is per workspace; an unknown name is refused with the real options rather than guessed at.'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) list_my_projects
// ───────────────────────────────────────────────────────────────────────────

export const createListMyProjectsTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ include_archived }: { include_archived?: boolean }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;
      const sb = svcClient();

      onChunk?.({ type: 'tool_progress', status: 'Loading your projects...', timestamp: Date.now() });

      // Scoped to this workspace as well as this user (#395) — see `resolveProjectId`. Without
      // it, "my projects" answered with every workspace the user belongs to, in one list, with
      // no way to tell which was which.
      let q = sb
        .from('projects')
        .select('id, name, status, deadline, budget_amount, budget_currency, actual_amount, accepted_quote_count, moodboard_count, last_activity_at, category:project_categories(label)')
        .eq('user_id', userId);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      q = q.order('last_activity_at', { ascending: false });
      if (!include_archived) {
        q = q.not('status', 'in', '("archived","completed")');
      }
      const { data, error } = await q;
      if (error) return JSON.stringify({ success: false, error: error.message });

      const projects = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        category: p.category?.label ?? null,
        deadline: p.deadline,
        budget: p.budget_amount,
        actual: Number(p.actual_amount) || 0,
        currency: p.budget_currency,
        accepted_quotes: p.accepted_quote_count,
        moodboards: p.moodboard_count,
        url: `/projects/${p.id}`,
      }));

      return JSON.stringify({
        success: true,
        count: projects.length,
        projects,
      });
    },
    {
      name: 'list_my_projects',
      description:
        "List the current user's projects with budget vs actual, deadlines, and moodboard/quote counts. " +
        'Use when the user asks "what projects do I have", "show my projects", "list my engagements", ' +
        'or needs to look up project context before another action.',
      schema: z.object({
        include_archived: z.boolean().optional().describe('Include archived + completed projects (default false — active only)'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 3) find_project
// ───────────────────────────────────────────────────────────────────────────

export const createFindProjectTool = (
  userId: string,
  workspaceId: string | null,
  _onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ query }: { query: string }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;
      const sb = svcClient();

      // Scoped to this workspace as well as this user (#395) — see `resolveProjectId`.
      let fq = sb
        .from('projects')
        .select('id, name, status, deadline, budget_amount, actual_amount, budget_currency, accepted_quote_count, moodboard_count')
        .eq('user_id', userId);
      if (workspaceId) fq = fq.eq('workspace_id', workspaceId);
      const { data, error } = await fq
        .ilike('name', `%${query}%`)
        .order('last_activity_at', { ascending: false })
        .limit(5);

      if (error) return JSON.stringify({ success: false, error: error.message });

      return JSON.stringify({
        success: true,
        count: (data || []).length,
        matches: (data || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          deadline: p.deadline,
          budget: p.budget_amount,
          actual: Number(p.actual_amount) || 0,
          currency: p.budget_currency,
          accepted_quotes: p.accepted_quote_count,
          moodboards: p.moodboard_count,
          url: `/projects/${p.id}`,
        })),
      });
    },
    {
      name: 'find_project',
      description:
        'Fuzzy-find one of the user\'s projects by name. Returns up to 5 matches. ' +
        'Use this before any action that references a specific project by name, so you can ' +
        'resolve to the right project_id before calling another tool.',
      schema: z.object({
        query: z.string().describe('Project name fragment to match (case-insensitive)'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 4) add_task
// ───────────────────────────────────────────────────────────────────────────

export const createAddTaskTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name, title, description, parent_task_id, room_name, due_date, visibility }: {
      project_id?: string;
      project_name?: string;
      title: string;
      description?: string;
      parent_task_id?: string;
      room_name?: string;
      due_date?: string;
      visibility?: 'internal' | 'client_visible';
    }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;
      const sb = svcClient();

      const resolvedProjectId = await resolveProjectId(userId, workspaceId, project_id, project_name);
      if (!resolvedProjectId) {
        return JSON.stringify({
          success: false,
          error: project_name
            ? `No project found matching "${project_name}". Use find_project first or pass project_id directly.`
            : 'Need either project_id or project_name to know where to add this task.',
        });
      }

      // Resolve room_id from room_name (optional)
      let room_id: string | null = null;
      if (room_name) {
        const { data: rooms } = await sb
          .from('project_rooms')
          .select('id')
          .eq('project_id', resolvedProjectId)
          .ilike('name', `%${room_name}%`)
          .limit(1);
        room_id = (rooms && (rooms[0] as any)?.id) || null;
      }

      const isSubtask = !!parent_task_id;

      onChunk?.({
        type: 'tool_progress',
        status: `Adding ${isSubtask ? 'subtask' : 'task'} "${title}"...`,
        timestamp: Date.now(),
      });

      const { data: task, error } = await sb
        .from('project_tasks')
        .insert({
          project_id: resolvedProjectId,
          parent_task_id: parent_task_id || null,
          room_id,
          title,
          description: description || null,
          status: 'todo',
          due_date: due_date || null,
          visibility: visibility || 'internal',
          created_by: userId,
        } as any)
        .select()
        .single();

      if (error) return JSON.stringify({ success: false, error: error.message });

      return JSON.stringify({
        success: true,
        task_id: (task as any).id,
        title: (task as any).title,
        is_subtask: isSubtask,
        room_resolved: room_id !== null,
        url: `/projects/${resolvedProjectId}`,
        message: `${isSubtask ? 'Subtask' : 'Task'} "${title}" added.`,
      });
    },
    {
      name: 'add_task',
      description:
        'Add a task (or subtask) to a project. Specify the project by id OR by name. ' +
        'Pass parent_task_id to make it a subtask of an existing task (max nesting depth = 1). ' +
        'visibility="client_visible" means the task will be shown on the client share view when it ships. ' +
        'Use when the user says "add a task to X", "remind me to Y", "I need to follow up on Z", etc.',
      schema: z.object({
        project_id: z.string().optional().describe('UUID of the project'),
        project_name: z.string().optional().describe('Project name fragment (resolved via fuzzy match if project_id not given)'),
        title: z.string().describe('Task title'),
        description: z.string().optional().describe('Optional longer description'),
        parent_task_id: z.string().optional().describe('When set, this becomes a subtask of that task'),
        room_name: z.string().optional().describe('Room name to scope task to (fuzzy match)'),
        due_date: z.string().optional().describe('ISO date YYYY-MM-DD'),
        visibility: z.enum(['internal', 'client_visible']).optional().describe('Default internal'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 5) add_purchase_item — made-to-order door / window with a measurement spec
// ───────────────────────────────────────────────────────────────────────────

export const createAddPurchaseItemTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async (input: {
      project_id?: string;
      project_name?: string;
      item_type?: 'door' | 'window' | 'other';
      name: string;
      width_mm?: number;
      height_mm?: number;
      thickness_mm?: number;
      finish?: string;
      frame?: string;
      hardware?: string;
      opening?: string;
      handing?: string;
      frame_type?: string;
      glazing?: string;
      opening_type?: string;
      quantity?: number;
      unit_cost?: number;
      currency?: string;
      room_name?: string;
      notes?: string;
    }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;
      const sb = svcClient();

      const projectId = await resolveProjectId(userId, workspaceId, input.project_id, input.project_name);
      if (!projectId) {
        return JSON.stringify({
          success: false,
          error: input.project_name
            ? `No project found matching "${input.project_name}". Use find_project first or pass project_id.`
            : 'Need either project_id or project_name to add a purchase item.',
        });
      }
      // workspace_id is required on the row. Read from the PROJECT rather than reusing the
      // session's, because the resolver above has already proven the two are the same and a
      // project predating the workspace column may carry none.
      const { data: proj } = await sb.from('projects').select('workspace_id').eq('id', projectId).maybeSingle();
      const itemWorkspaceId = (proj as any)?.workspace_id ?? workspaceId;
      if (!itemWorkspaceId) {
        return JSON.stringify({ success: false, error: 'This project has no workspace — purchase items need one.' });
      }

      // Resolve optional room.
      let roomId: string | null = null;
      if (input.room_name) {
        const { data: rooms } = await sb.from('project_rooms').select('id')
          .eq('project_id', projectId).ilike('name', `%${input.room_name}%`).limit(1);
        roomId = (rooms && (rooms[0] as any)?.id) || null;
      }

      // Build the structured spec from whichever fields were supplied.
      const details: Record<string, unknown> = {};
      for (const k of ['width_mm', 'height_mm', 'thickness_mm', 'finish', 'frame', 'hardware',
        'opening', 'handing', 'frame_type', 'glazing', 'opening_type'] as const) {
        const v = (input as any)[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') details[k] = v;
      }

      onChunk?.({ type: 'tool_progress', status: `Adding ${input.item_type || 'door'} "${input.name}"...`, timestamp: Date.now() });

      const { data: row, error } = await sb
        .from('project_purchase_items')
        .insert({
          project_id: projectId,
          workspace_id: itemWorkspaceId,
          item_type: input.item_type || 'door',
          name: input.name,
          room_id: roomId,
          quantity: input.quantity ?? 1,
          unit_cost: input.unit_cost ?? null,
          currency: input.currency || 'EUR',
          details,
          notes: input.notes ?? null,   // was advertised in the schema but silently dropped
          created_by: userId,
        } as any)
        .select('id')
        .single();
      if (error) return JSON.stringify({ success: false, error: error.message });

      return JSON.stringify({
        success: true,
        purchase_item_id: (row as any).id,
        project_id: projectId,
        message: `Added ${input.item_type || 'door'} "${input.name}". It has no photo yet — open the project's Purchases tab to generate one from the spec, or run generate_purchase_sheet to produce the spec PDF.`,
        url: `/projects/${projectId}`,
      });
    },
    {
      name: 'add_purchase_item',
      description:
        'Add a made-to-order purchase item (a door, window, or other custom item) with its ' +
        'measurements/spec to a project. Specify the project by id OR name. For doors pass ' +
        'width_mm/height_mm/thickness_mm/finish/frame/hardware/opening (inward|outward)/handing (left|right); ' +
        'for windows pass width_mm/height_mm/frame_type/glazing/opening_type (tilt-turn|casement|sliding)/finish. ' +
        'Use when the user says "add a door/window to the project", "we need 3 oak doors 900x2100", etc. ' +
        'After adding, the spec sheet is produced with generate_purchase_sheet.',
      schema: z.object({
        project_id: z.string().optional().describe('UUID of the project'),
        project_name: z.string().optional().describe('Project name fragment (fuzzy match)'),
        item_type: z.enum(['door', 'window', 'other']).optional().describe('Default door'),
        name: z.string().describe('Item name e.g. "Master bedroom oak door"'),
        width_mm: z.number().optional(),
        height_mm: z.number().optional(),
        thickness_mm: z.number().optional().describe('Doors'),
        finish: z.string().optional().describe('e.g. "oak veneer, satin lacquer"'),
        frame: z.string().optional().describe('Doors — frame material/finish'),
        hardware: z.string().optional().describe('Doors — handle/lock set'),
        opening: z.string().optional().describe('Doors — inward | outward'),
        handing: z.string().optional().describe('Doors — left | right'),
        frame_type: z.string().optional().describe('Windows — e.g. aluminium, uPVC'),
        glazing: z.string().optional().describe('Windows — e.g. double, triple, low-E'),
        opening_type: z.string().optional().describe('Windows — tilt-turn | casement | sliding | fixed'),
        quantity: z.number().optional().describe('Default 1'),
        unit_cost: z.number().optional(),
        currency: z.string().optional().describe('Default EUR'),
        room_name: z.string().optional().describe('Room to scope to (fuzzy match)'),
        notes: z.string().optional(),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 6) generate_purchase_sheet — render purchase items to a PDF spec sheet
// ───────────────────────────────────────────────────────────────────────────

export const createGeneratePurchaseSheetTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name, mode }: {
      project_id?: string;
      project_name?: string;
      mode?: 'schedule' | 'per_item' | 'both' | 'order';
    }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;
      const sb = svcClient();

      const projectId = await resolveProjectId(userId, workspaceId, project_id, project_name);
      if (!projectId) {
        return JSON.stringify({
          success: false,
          error: project_name
            ? `No project found matching "${project_name}". Use find_project first or pass project_id.`
            : 'Need either project_id or project_name to generate the sheet.',
        });
      }

      const { count } = await sb.from('project_purchase_items')
        .select('id', { count: 'exact', head: true }).eq('project_id', projectId);
      if (!count) {
        return JSON.stringify({ success: false, error: 'This project has no purchase items yet. Add a door/window with add_purchase_item first.' });
      }

      const { data: proj } = await sb.from('projects').select('name').eq('id', projectId).maybeSingle();

      onChunk?.({ type: 'tool_progress', status: 'Rendering purchase spec sheet...', timestamp: Date.now() });

      // Call the PDF function server-to-server with the service-role key (it reads the
      // project's items as admin in that mode).
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-purchase-sheet-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ project_id: projectId, mode: mode || 'both', project_name: (proj as any)?.name }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.success) {
        return JSON.stringify({ success: false, error: out?.error || `Sheet generation failed (${resp.status})` });
      }

      onChunk?.({ type: 'purchase_sheet_ready', pdf_url: out.pdf_url, page_count: out.page_count, item_count: out.item_count });

      return JSON.stringify({
        success: true,
        pdf_url: out.pdf_url,
        page_count: out.page_count,
        item_count: out.item_count,
        message: `Purchase spec sheet ready — ${out.item_count} item(s), ${out.page_count} page(s).`,
      });
    },
    {
      name: 'generate_purchase_sheet',
      description:
        "Render a project's purchase items (doors/windows) into a PDF: a combined schedule table " +
        'and/or per-item specification sheets with door-swing / window glyph drawings. ' +
        "mode='schedule' for the table only, 'per_item' for spec pages only, 'both' (default) for both, 'order' for the per-item supplier order sheet. " +
        'Use when the user says "make the purchase sheet", "send the door schedule to the supplier", etc.',
      schema: z.object({
        project_id: z.string().optional().describe('UUID of the project'),
        project_name: z.string().optional().describe('Project name fragment (fuzzy match)'),
        mode: z.enum(['schedule', 'per_item', 'both', 'order']).optional().describe("Default both; 'order' produces the per-item supplier order sheet"),
      }),
    },
  );
};
