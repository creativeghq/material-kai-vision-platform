import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';

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
  /** Chosen sub-unit (branch) address of the client; null = main address. */
  client_address_unit_id: string | null;
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

export interface ProjectCollaborator {
  id: string;
  project_id: string;
  email: string;
  user_id: string | null;
  share_token: string;
  role: 'client' | 'editor';
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  message: string | null;
  created_at: string;
}

export type ProjectProductStatus = 'selection' | 'confirmed' | 'ordered' | 'shipped' | 'delivered';

export const PROJECT_PRODUCT_STATUSES: ProjectProductStatus[] =
  ['selection', 'confirmed', 'ordered', 'shipped', 'delivered'];

export interface ProjectProduct {
  id: string;
  project_id: string;
  workspace_id: string | null;
  product_id: string | null;
  source_quote_item_id: string | null;
  status: ProjectProductStatus;
  custom_name: string | null;
  custom_sku: string | null;
  custom_description: string | null;
  quantity: number;
  unit: string | null;
  sold_price: number | null;
  quoted_price: number | null;
  price_source: string | null;
  price_currency: string;
  room_id: string | null;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  // joined / derived (read-only)
  product?: { id: string; name: string; sku: string | null } | null;
  quote_item?: { unit_price: number | null; discounted_price: number | null; room: string | null; dimensions: string | null } | null;
}

export interface ProjectProductWithDisplay extends ProjectProduct {
  display_name: string;
  display_sku: string | null;
  /** Reference price: quote line (live) for quote-linked rows, else the row's quoted_price. */
  reference_price: number | null;
}

/** Shape returned by the get_product_price_for_workspace RPC. */
export interface ResolvedPrice {
  mode: 'own_product' | 'operator_catalog' | string;
  base_price: number | null;
  cost_basis: number | null;
  suggested_sell: number | null;
  currency: string;
  /** true when no upstream price exists → UI shows "Ask for a quote". */
  ask_for_quote: boolean;
  raw: Record<string, any>;
}

export interface ProjectFinanceRow {
  kind: 'invoice' | 'manual' | 'supplier_bill';
  id: string;
  label: string | null;
  total: number | null;
  amount_paid: number | null;
  amount_due: number | null;
  status: string | null;
  currency: string | null;
  issued_at: string | null;
  due_at: string | null;
}

export interface ProjectFinanceSummary {
  receivables: ProjectFinanceRow[];
  payables: ProjectFinanceRow[];
  totals: {
    receivable_total: number;
    receivable_due: number;
    payable_total: number;
    payable_due: number;
  };
}

export interface InvitationPreview {
  project_name: string;
  project_id: string;
  invited_email_masked: string;
  invited_by_name: string | null;
  expires_at: string;
  is_revoked: boolean;
  is_expired: boolean;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  client_company_id?: string | null;
  client_contact_id?: string | null;
  client_address_unit_id?: string | null;
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
  client_address_unit_id?: string | null;
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
        client_address_unit_id: input.client_address_unit_id ?? null,
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

  // ---------- BILLING: project → invoice(s) (#177) ----------

  async listProjectInvoices(projectId: string) {
    const { data, error } = await (supabase as any)
      .from('invoices')
      .select('id, internal_number, invoice_kind, progress_pct, total, currency, status, fiscal_status, issued_at, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /** Full invoice from an accepted project quote (reuses the standard quote→invoice path). */
  async createFullInvoiceFromQuote(quoteId: string): Promise<string> {
    const { data, error } = await (supabase as any).rpc('issue_invoice_from_quote', { p_quote_id: quoteId });
    if (error) throw error;
    return data as string;
  }

  /** Progress / milestone / final invoice for a percentage of an accepted project quote. */
  async createProgressInvoice(quoteId: string, percent: number, kind: 'progress' | 'milestone' | 'final'): Promise<string> {
    const { data, error } = await (supabase as any).rpc('create_project_progress_invoice', {
      p_quote_id: quoteId, p_percent: percent, p_kind: kind,
    });
    if (error) throw error;
    return data as string;
  }

  // ---------- PROJECT PRODUCTS ----------

  async listProjectProducts(projectId: string): Promise<ProjectProductWithDisplay[]> {
    const { data, error } = await (supabase as any)
      .from('project_products')
      .select(`
        *,
        product:products(id, name, sku),
        quote_item:quote_items!source_quote_item_id(unit_price, discounted_price, room, dimensions)
      `)
      .eq('project_id', projectId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ((data || []) as ProjectProduct[]).map((r) => this._decorateProduct(r));
  }

  private _decorateProduct(r: ProjectProduct): ProjectProductWithDisplay {
    const display_name = r.product?.name || r.custom_name || 'Untitled item';
    const display_sku = r.product?.sku ?? r.custom_sku ?? null;
    // Quote-linked rows track the quote line live; manual rows use their own quoted_price.
    const reference_price = r.source_quote_item_id
      ? (r.quote_item?.discounted_price ?? r.quote_item?.unit_price ?? null)
      : r.quoted_price;
    return { ...r, display_name, display_sku, reference_price };
  }

  async addProjectProduct(input: {
    project_id: string;
    workspace_id?: string | null;
    product_id?: string | null;
    custom_name?: string | null;
    custom_sku?: string | null;
    custom_description?: string | null;
    quantity?: number;
    unit?: string | null;
    sold_price?: number | null;
    quoted_price?: number | null;
    price_source?: string | null;
    price_currency?: string;
    room_id?: string | null;
    status?: ProjectProductStatus;
    notes?: string | null;
  }): Promise<ProjectProduct> {
    if (!input.product_id && !input.custom_name?.trim()) {
      throw new Error('Pick a catalog product or give the custom line a name.');
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_products')
      .insert({
        project_id: input.project_id,
        workspace_id: input.workspace_id ?? null,
        product_id: input.product_id ?? null,
        custom_name: input.custom_name ?? null,
        custom_sku: input.custom_sku ?? null,
        custom_description: input.custom_description ?? null,
        quantity: input.quantity ?? 1,
        unit: input.unit ?? null,
        sold_price: input.sold_price ?? null,
        quoted_price: input.quoted_price ?? null,
        price_source: input.price_source ?? (input.product_id ? null : 'manual'),
        price_currency: input.price_currency ?? 'EUR',
        room_id: input.room_id ?? null,
        status: input.status ?? 'selection',
        notes: input.notes ?? null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectProduct;
  }

  async updateProjectProduct(id: string, input: Partial<{
    status: ProjectProductStatus;
    sold_price: number | null;
    quoted_price: number | null;
    price_source: string | null;
    price_currency: string;
    quantity: number;
    unit: string | null;
    room_id: string | null;
    notes: string | null;
    custom_name: string | null;
    custom_sku: string | null;
    custom_description: string | null;
    position: number;
  }>): Promise<ProjectProduct> {
    const { data, error } = await (supabase as any)
      .from('project_products')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProjectProduct;
  }

  async deleteProjectProduct(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_products').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Import every line of the project's quotes into project_products, live-linked by
   * source_quote_item_id. Idempotent: a quote line already imported is skipped (the
   * partial unique index on source_quote_item_id guards against duplicates anyway).
   * Returns the count of newly-imported lines.
   */
  async importProductsFromQuotes(projectId: string, opts: { acceptedOnly?: boolean } = {}): Promise<number> {
    const project = await this.getProject(projectId);
    let q = (supabase as any)
      .from('quote_items')
      .select('id, product_id, quantity, custom_product_name, custom_sku, custom_unit, unit_price, room_id, quote:quotes!inner(project_id, status, currency)')
      .eq('quote.project_id', projectId);
    if (opts.acceptedOnly) q = q.eq('quote.status', 'accepted');
    const { data: items, error } = await q;
    if (error) throw error;
    const rows = (items || []) as any[];
    if (rows.length === 0) return 0;

    // Skip lines already linked.
    const { data: existing } = await (supabase as any)
      .from('project_products')
      .select('source_quote_item_id')
      .eq('project_id', projectId)
      .not('source_quote_item_id', 'is', null);
    const linked = new Set((existing || []).map((e: any) => e.source_quote_item_id));

    const { data: { user } } = await supabase.auth.getUser();
    const toInsert = rows
      .filter((it) => !linked.has(it.id))
      .map((it, idx) => ({
        project_id: projectId,
        workspace_id: project?.workspace_id ?? null,
        product_id: it.product_id ?? null,
        source_quote_item_id: it.id,
        custom_name: it.product_id ? null : (it.custom_product_name || 'Custom item'),
        custom_sku: it.product_id ? null : (it.custom_sku ?? null),
        quantity: it.quantity ?? 1,
        unit: it.custom_unit ?? null,
        quoted_price: it.unit_price ?? null,
        price_source: 'quote',
        price_currency: it.quote?.currency ?? 'EUR',
        room_id: it.room_id ?? null,
        status: 'selection',
        position: idx,
        created_by: user?.id ?? null,
      }));
    if (toInsert.length === 0) return 0;
    const { error: insErr } = await (supabase as any).from('project_products').insert(toInsert);
    if (insErr) throw insErr;
    return toInsert.length;
  }

  /**
   * Role-correct price for a catalog product, via the existing pricing-hierarchy RPC.
   * Returns ask_for_quote=true when no upstream price exists for this workspace's chain.
   */
  async resolveProductPrice(workspaceId: string, productId: string): Promise<ResolvedPrice> {
    const { data, error } = await (supabase as any).rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
    });
    if (error) throw error;
    const r = (data || {}) as Record<string, any>;
    const base = r.base_price == null ? null : Number(r.base_price);
    const suggested = r.suggested_sell == null ? null : Number(r.suggested_sell);
    return {
      mode: r.mode ?? 'unknown',
      base_price: base,
      cost_basis: r.cost_basis == null ? null : Number(r.cost_basis),
      suggested_sell: suggested,
      currency: r.currency ?? 'EUR',
      ask_for_quote: base == null && suggested == null,
      raw: r,
    };
  }

  // ---------- PROJECT FINANCE: attach payables / receivables ----------

  async getProjectFinanceSummary(projectId: string): Promise<ProjectFinanceSummary> {
    const { data, error } = await (supabase as any).rpc('get_project_finance_summary', { p_project_id: projectId });
    if (error) throw error;
    return (data || { receivables: [], payables: [], totals: { receivable_total: 0, receivable_due: 0, payable_total: 0, payable_due: 0 } }) as ProjectFinanceSummary;
  }

  /**
   * Finance documents for the project's client/supplier that are NOT yet attached to
   * any project — the candidate list for the "attach" picker. Scoped to the project's
   * client contact/company (invoices + receivable manual entries) and, for payables,
   * to all unattached supplier bills + payable manual entries in the workspace.
   */
  async listAttachableFinance(projectId: string): Promise<{ receivables: any[]; payables: any[] }> {
    const project = await this.getProject(projectId);
    const contactId = project?.client_contact_id ?? null;
    const companyId = project?.client_company_id ?? null;

    const invQ = (supabase as any)
      .from('invoices')
      .select('id, internal_number, total, amount_due, status, currency, issued_at, due_at')
      .is('project_id', null);
    if (companyId) invQ.eq('customer_company_id', companyId);
    else if (contactId) invQ.eq('customer_contact_id', contactId);

    const meRecvQ = (supabase as any)
      .from('finance_manual_entries')
      .select('id, description, amount, amount_due, status, currency, issued_at, due_at, direction')
      .is('project_id', null).eq('direction', 'receivable');
    if (companyId) meRecvQ.eq('counterparty_company_id', companyId);
    else if (contactId) meRecvQ.eq('counterparty_contact_id', contactId);

    const billQ = (supabase as any)
      .from('supplier_bills')
      .select('id, supplier_bill_number, total, amount_due, status, currency, issued_at, due_at')
      .is('project_id', null);
    const mePayQ = (supabase as any)
      .from('finance_manual_entries')
      .select('id, description, amount, amount_due, status, currency, issued_at, due_at, direction')
      .is('project_id', null).eq('direction', 'payable');

    const [inv, meRecv, bills, mePay] = await Promise.all([invQ, meRecvQ, billQ, mePayQ]);
    if (inv.error) throw inv.error;
    if (meRecv.error) throw meRecv.error;
    if (bills.error) throw bills.error;
    if (mePay.error) throw mePay.error;

    const recv = [
      ...(inv.data || []).map((i: any) => ({ kind: 'invoice', id: i.id, label: i.internal_number, total: i.total, amount_due: i.amount_due, status: i.status, currency: i.currency, issued_at: i.issued_at })),
      ...(meRecv.data || []).map((m: any) => ({ kind: 'manual', id: m.id, label: m.description, total: m.amount, amount_due: m.amount_due, status: m.status, currency: m.currency, issued_at: m.issued_at })),
    ];
    const pay = [
      ...(bills.data || []).map((b: any) => ({ kind: 'supplier_bill', id: b.id, label: b.supplier_bill_number, total: b.total, amount_due: b.amount_due, status: b.status, currency: b.currency, issued_at: b.issued_at })),
      ...(mePay.data || []).map((m: any) => ({ kind: 'manual', id: m.id, label: m.description, total: m.amount, amount_due: m.amount_due, status: m.status, currency: m.currency, issued_at: m.issued_at })),
    ];
    return { receivables: recv, payables: pay };
  }

  /** Attach (project_id set) or detach (null) a finance document to/from a project. */
  async setFinanceAttachment(kind: 'invoice' | 'manual' | 'supplier_bill', id: string, projectId: string | null): Promise<void> {
    const table = kind === 'invoice' ? 'invoices' : kind === 'supplier_bill' ? 'supplier_bills' : 'finance_manual_entries';
    const { error } = await (supabase as any).from(table).update({ project_id: projectId }).eq('id', id);
    if (error) throw error;
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

  // ---------- COLLABORATORS (Phase 4 — passwordless email-invite read access) ----------

  /**
   * Invite a collaborator by email. Creates a project_collaborators row + sends a branded
   * invite email through email-api. Owner-only via RLS. Returns the new row (with share_token).
   */
  async inviteCollaborator(input: {
    project_id: string;
    email: string;
    message?: string;
  }): Promise<ProjectCollaborator> {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email address');
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check for existing active invite for the same email — prevent duplicates
    const { data: existing } = await (supabase as any)
      .from('project_collaborators')
      .select('id, share_token')
      .eq('project_id', input.project_id)
      .ilike('email', email)
      .is('revoked_at', null)
      .maybeSingle();
    if (existing) {
      throw new Error('This email already has an active invitation. Revoke it first if you want to re-send.');
    }

    const { data, error } = await (supabase as any)
      .from('project_collaborators')
      .insert({
        project_id: input.project_id,
        email,
        invited_by: user.id,
        message: input.message?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;

    // Fetch project name + inviter name for the email body
    const { data: project } = await (supabase as any)
      .from('projects')
      .select('name')
      .eq('id', input.project_id)
      .single();
    const inviterName = user.user_metadata?.full_name || user.email || 'Your collaborator';
    const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    const inviteUrl = `${appUrl}/projects/invite/${data.share_token}`;

    // The invite email is delivered by the "Project Invite Sent" flow (Send
    // Email action), so an admin can pause/edit/redirect it without code changes.
    flowEventService.emit('project_invitation_sent', {
      to: email,
      subject: `${inviterName} invited you to view "${project?.name || 'a project'}"`,
      body: this._renderInviteEmailHtml({
        projectName: project?.name || 'a project',
        inviterName,
        inviteUrl,
        message: input.message?.trim() || null,
      }),
      project_id: input.project_id,
      project_name: project?.name || 'a project',
      inviter_name: inviterName,
    });

    return data as ProjectCollaborator;
  }

  async listCollaborators(projectId: string): Promise<ProjectCollaborator[]> {
    const { data, error } = await (supabase as any)
      .from('project_collaborators')
      .select('*')
      .eq('project_id', projectId)
      .order('invited_at', { ascending: false });
    if (error) throw error;
    return (data || []) as ProjectCollaborator[];
  }

  async revokeCollaborator(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_collaborators')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async resendCollaboratorInvite(id: string): Promise<void> {
    const { data: row, error } = await (supabase as any)
      .from('project_collaborators')
      .select('email, share_token, project_id, message')
      .eq('id', id)
      .single();
    if (error || !row) throw error || new Error('Invitation not found');

    const { data: project } = await (supabase as any)
      .from('projects')
      .select('name')
      .eq('id', row.project_id)
      .single();
    const { data: { user } } = await supabase.auth.getUser();
    const inviterName = user?.user_metadata?.full_name || user?.email || 'Your collaborator';
    const appUrl = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
    const inviteUrl = `${appUrl}/projects/invite/${row.share_token}`;

    // Delivered by the "Project Invite Resent" flow (Send Email action).
    flowEventService.emit('project_invitation_resent', {
      to: row.email,
      subject: `${inviterName} invited you to view "${project?.name || 'a project'}"`,
      body: this._renderInviteEmailHtml({
        projectName: project?.name || 'a project',
        inviterName,
        inviteUrl,
        message: row.message || null,
      }),
      project_id: row.project_id,
      project_name: project?.name || 'a project',
      inviter_name: inviterName,
    });
  }

  /**
   * Pre-auth lookup of an invitation by its share_token. Returns a masked
   * email + project name so the landing page can render context BEFORE the
   * invitee enters their email. Uses a SECURITY DEFINER RPC.
   */
  async getInvitationPreview(shareToken: string): Promise<InvitationPreview | null> {
    const { data, error } = await (supabase as any).rpc('get_project_invitation_preview', {
      p_share_token: shareToken,
    });
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return data[0] as InvitationPreview;
  }

  /**
   * Called after the magic-link redirect lands the signed-in invitee on /projects/accept-invite.
   * Verifies JWT email matches the invitation's email + stamps user_id.
   */
  async acceptInvitation(shareToken: string): Promise<{ project_id: string; project_name: string }> {
    const { data, error } = await (supabase as any).rpc('accept_project_invitation', {
      p_share_token: shareToken,
    });
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Invitation accept returned no project');
    return data[0];
  }

  /** Is the current viewer a collaborator on this project (vs the owner)? */
  async isCollaborator(projectId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await (supabase as any)
      .from('project_collaborators')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .maybeSingle();
    return Boolean(data);
  }

  private _renderInviteEmailHtml(input: {
    projectName: string;
    inviterName: string;
    inviteUrl: string;
    message: string | null;
  }): string {
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const messageBlock = input.message
      ? `<p style="margin:16px 0;padding:12px;background:#f5f5f5;border-left:3px solid #999;font-style:italic;">${escape(input.message)}</p>`
      : '';
    return `<!doctype html>
<html><body style="font-family:'Open Sans',Arial,sans-serif;max-width:560px;margin:32px auto;padding:24px;color:#222;">
  <h2 style="margin:0 0 16px;font-weight:300;">You've been invited</h2>
  <p style="margin:0 0 12px;"><strong>${escape(input.inviterName)}</strong> invited you to view the project <strong>"${escape(input.projectName)}"</strong>.</p>
  ${messageBlock}
  <p style="margin:24px 0;">
    <a href="${escape(input.inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#8a3a6b;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">View project</a>
  </p>
  <p style="margin:24px 0 0;font-size:13px;color:#666;">No password needed — just confirm your email on the next screen. Link expires in 90 days.</p>
  <p style="margin:8px 0 0;font-size:12px;color:#999;word-break:break-all;">If the button doesn't work, paste this URL into your browser:<br>${escape(input.inviteUrl)}</p>
</body></html>`;
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

  async searchProducts(query: string, limit = 12) {
    const q = (supabase as any).from('products').select('id, name, sku').limit(limit);
    if (query.trim()) q.or(`name.ilike.%${query}%,sku.ilike.%${query}%`);
    q.order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Array<{ id: string; name: string; sku: string | null }>;
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
