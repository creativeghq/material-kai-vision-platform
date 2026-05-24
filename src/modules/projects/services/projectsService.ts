import { supabase } from '@/integrations/supabase/client';

// =====================================================
// TYPES
// =====================================================

export type ProjectStatus = 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'archived';
export type RoomType =
  | 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining'
  | 'office' | 'outdoor' | 'hallway' | 'other';
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type TaskVisibility = 'internal' | 'client_visible';

export interface Project {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  client_company_id: string | null;
  client_contact_id: string | null;
  deadline: string | null;
  budget_amount: number | null;
  budget_currency: string;
  cover_image_url: string | null;
  actual_amount: number;
  accepted_quote_count: number;
  moodboard_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithClient extends Project {
  client_company?: { id: string; name: string } | null;
  client_contact?: { id: string; name: string | null; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
}

export interface ProjectRoom {
  id: string;
  project_id: string;
  name: string;
  room_type: RoomType | null;
  sort_order: number;
  budget_amount: number | null;
  deadline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  room_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee_id: string | null;
  due_date: string | null;
  visibility: TaskVisibility;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ProjectTaskWithSubtasks extends ProjectTask {
  subtasks: ProjectTask[];
  subtask_done_count: number;
  subtask_total_count: number;
}

export interface ProjectEvent {
  id: string;
  project_id: string;
  event_type: string;
  actor_id: string | null;
  payload: Record<string, any>;
  occurred_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  client_company_id?: string | null;
  client_contact_id?: string | null;
  deadline?: string | null;
  budget_amount?: number | null;
  budget_currency?: string;
  workspace_id?: string | null;
  rooms?: Array<{ name: string; room_type?: RoomType | null }>;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  client_company_id?: string | null;
  client_contact_id?: string | null;
  deadline?: string | null;
  budget_amount?: number | null;
  budget_currency?: string;
  cover_image_url?: string | null;
}

export interface CreateRoomInput {
  project_id: string;
  name: string;
  room_type?: RoomType | null;
  budget_amount?: number | null;
  deadline?: string | null;
  notes?: string | null;
  sort_order?: number;
}

export interface CreateTaskInput {
  project_id: string;
  parent_task_id?: string | null;
  room_id?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  due_date?: string | null;
  visibility?: TaskVisibility;
  sort_order?: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  due_date?: string | null;
  visibility?: TaskVisibility;
  room_id?: string | null;
  sort_order?: number;
}

// =====================================================
// SERVICE
// =====================================================

class ProjectsService {
  // ---------- PROJECTS ----------

  async listProjects(opts: { status?: ProjectStatus | 'active' } = {}): Promise<ProjectWithClient[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    let query = (supabase as any)
      .from('projects')
      .select(`
        *,
        client_company:crm_companies(id, name),
        client_contact:crm_contacts(id, name, first_name, last_name, email)
      `)
      .eq('user_id', user.id)
      .order('last_activity_at', { ascending: false });

    if (opts.status === 'active') {
      query = query.not('status', 'in', '("completed","archived")');
    } else if (opts.status) {
      query = query.eq('status', opts.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ProjectWithClient[];
  }

  async getProject(id: string): Promise<ProjectWithClient | null> {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select(`
        *,
        client_company:crm_companies(id, name, email, phone, website),
        client_contact:crm_contacts(id, name, first_name, last_name, email, phone)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as ProjectWithClient | null;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    if (input.client_company_id && input.client_contact_id) {
      throw new Error('A project can have a client company OR a client contact, not both.');
    }

    const { data: project, error } = await (supabase as any)
      .from('projects')
      .insert({
        user_id: user.id,
        workspace_id: input.workspace_id ?? null,
        name: input.name,
        description: input.description ?? null,
        client_company_id: input.client_company_id ?? null,
        client_contact_id: input.client_contact_id ?? null,
        deadline: input.deadline ?? null,
        budget_amount: input.budget_amount ?? null,
        budget_currency: input.budget_currency ?? 'EUR',
      })
      .select()
      .single();

    if (error) throw error;

    if (input.rooms && input.rooms.length > 0) {
      const roomRows = input.rooms.map((r, idx) => ({
        project_id: project.id,
        name: r.name,
        room_type: r.room_type ?? null,
        sort_order: idx,
      }));
      const { error: roomsError } = await (supabase as any)
        .from('project_rooms')
        .insert(roomRows);
      if (roomsError) throw roomsError;
    }

    return project as Project;
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    if (input.client_company_id && input.client_contact_id) {
      throw new Error('A project can have a client company OR a client contact, not both.');
    }
    const { data, error } = await (supabase as any)
      .from('projects')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  }

  async archiveProject(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', id);
    if (error) throw error;
  }

  // ---------- ROOMS ----------

  async listRooms(projectId: string): Promise<ProjectRoom[]> {
    const { data, error } = await (supabase as any)
      .from('project_rooms')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data || []) as ProjectRoom[];
  }

  async createRoom(input: CreateRoomInput): Promise<ProjectRoom> {
    const { data, error } = await (supabase as any)
      .from('project_rooms')
      .insert({
        project_id: input.project_id,
        name: input.name,
        room_type: input.room_type ?? null,
        budget_amount: input.budget_amount ?? null,
        deadline: input.deadline ?? null,
        notes: input.notes ?? null,
        sort_order: input.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectRoom;
  }

  async updateRoom(id: string, input: Partial<Omit<CreateRoomInput, 'project_id'>>): Promise<ProjectRoom> {
    const { data, error } = await (supabase as any)
      .from('project_rooms')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProjectRoom;
  }

  async deleteRoom(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_rooms').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- TASKS ----------

  async listTasks(projectId: string): Promise<ProjectTaskWithSubtasks[]> {
    const { data, error } = await (supabase as any)
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = (data || []) as ProjectTask[];

    const parents = rows.filter(r => r.parent_task_id === null);
    const subtasksByParent = new Map<string, ProjectTask[]>();
    for (const r of rows) {
      if (r.parent_task_id) {
        if (!subtasksByParent.has(r.parent_task_id)) subtasksByParent.set(r.parent_task_id, []);
        subtasksByParent.get(r.parent_task_id)!.push(r);
      }
    }
    return parents.map(p => {
      const subs = subtasksByParent.get(p.id) || [];
      return {
        ...p,
        subtasks: subs,
        subtask_total_count: subs.length,
        subtask_done_count: subs.filter(s => s.status === 'done').length,
      };
    });
  }

  async createTask(input: CreateTaskInput): Promise<ProjectTask> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Subtasks inherit room from parent
    let room_id = input.room_id ?? null;
    if (input.parent_task_id) {
      const { data: parent } = await (supabase as any)
        .from('project_tasks')
        .select('room_id')
        .eq('id', input.parent_task_id)
        .single();
      room_id = parent?.room_id ?? null;
    }

    const { data, error } = await (supabase as any)
      .from('project_tasks')
      .insert({
        project_id: input.project_id,
        parent_task_id: input.parent_task_id ?? null,
        room_id,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? 'todo',
        assignee_id: input.assignee_id ?? null,
        due_date: input.due_date ?? null,
        visibility: input.visibility ?? 'internal',
        sort_order: input.sort_order ?? 0,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectTask;
  }

  async updateTask(id: string, input: UpdateTaskInput): Promise<ProjectTask> {
    const { data, error } = await (supabase as any)
      .from('project_tasks')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProjectTask;
  }

  async deleteTask(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_tasks').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- LINKED ARTIFACTS ----------

  /**
   * Per-room budget rollup. Returns each room of the project with its budget_amount
   * + the sum of line_total from accepted-quote items that reference that room_id.
   */
  async getRoomBudgetSummary(projectId: string): Promise<Array<{
    room: ProjectRoom;
    actual_amount: number;
    quote_count: number;
    item_count: number;
  }>> {
    const rooms = await this.listRooms(projectId);
    if (rooms.length === 0) return [];

    // Pull every accepted-quote item in this project that has a room_id set.
    // Note: !inner join filter ensures we only get items whose parent quote is accepted + in this project.
    const { data: items } = await (supabase as any)
      .from('quote_items')
      .select('room_id, line_total, quote_id, quote:quotes!inner(project_id, status)')
      .eq('quote.project_id', projectId)
      .eq('quote.status', 'accepted')
      .not('room_id', 'is', null);

    const rollup = new Map<string, { actual_amount: number; quotes: Set<string>; items: number }>();
    for (const it of (items || []) as Array<{ room_id: string; line_total: number | null; quote_id: string }>) {
      if (!rollup.has(it.room_id)) rollup.set(it.room_id, { actual_amount: 0, quotes: new Set(), items: 0 });
      const agg = rollup.get(it.room_id)!;
      agg.actual_amount += Number(it.line_total) || 0;
      agg.quotes.add(it.quote_id);
      agg.items += 1;
    }

    return rooms.map(r => {
      const agg = rollup.get(r.id);
      return {
        room: r,
        actual_amount: agg?.actual_amount || 0,
        quote_count: agg?.quotes.size || 0,
        item_count: agg?.items || 0,
      };
    });
  }

  async listProjectMoodboards(projectId: string) {
    const { data, error } = await (supabase as any)
      .from('moodboards')
      .select('id, title, description, room_id, updated_at, view_count')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async listProjectQuotes(projectId: string) {
    const { data, error } = await (supabase as any)
      .from('quotes')
      .select('id, name, status, grand_total, currency, total_items, quote_number, updated_at, created_at, parent_quote_id, revision_number')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // ---------- TIMELINE (Phase 3) ----------

  async listEvents(projectId: string, opts: { limit?: number; eventTypes?: string[] } = {}): Promise<ProjectEvent[]> {
    let q = (supabase as any)
      .from('project_events')
      .select('*')
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(opts.limit ?? 100);
    if (opts.eventTypes && opts.eventTypes.length > 0) {
      q = q.in('event_type', opts.eventTypes);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as ProjectEvent[];
  }

  // ---------- SHEETS (cross-moodboard roll-up — Phase 3) ----------

  async listProjectSheets(projectId: string): Promise<Array<{
    id: string;
    moodboard_id: string;
    moodboard_title: string | null;
    sheet_type: string;
    title: string | null;
    status: string;
    pdf_storage_path: string | null;
    credits_used: number | null;
    created_at: string;
    updated_at: string;
  }>> {
    // Two-step (no FK join needed): get the project's moodboard ids, then pull sheets for them.
    const { data: mbs } = await (supabase as any)
      .from('moodboards')
      .select('id, title')
      .eq('project_id', projectId);
    const ids = (mbs || []).map((m: any) => m.id);
    if (ids.length === 0) return [];
    const titleById = new Map((mbs || []).map((m: any) => [m.id, m.title]));

    const { data, error } = await (supabase as any)
      .from('moodboard_presentation_sheets')
      .select('id, moodboard_id, sheet_type, title, status, pdf_storage_path, credits_used, created_at, updated_at')
      .in('moodboard_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((s: any) => ({
      ...s,
      moodboard_title: titleById.get(s.moodboard_id) ?? null,
    }));
  }

  // ---------- CRM LOOKUP (for the wizard) ----------

  async searchCompanies(query: string, limit = 10) {
    const q = (supabase as any).from('crm_companies').select('id, name, email').limit(limit);
    if (query.trim()) q.ilike('name', `%${query}%`);
    q.order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Array<{ id: string; name: string; email: string | null }>;
  }

  async searchContacts(query: string, limit = 10) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const q = (supabase as any)
      .from('crm_contacts')
      .select('id, name, first_name, last_name, email')
      .limit(limit);
    if (query.trim()) {
      q.or(`name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`);
    }
    q.order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>;
  }
}

export const projectsService = new ProjectsService();
