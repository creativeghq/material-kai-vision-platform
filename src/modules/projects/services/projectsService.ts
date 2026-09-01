import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { flowEventService } from '@/services/flows/flowEventService';
import { edgeError } from '@/utils/edgeError';
import { escapeHtml } from '@/utils/escapeHtml';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { assertSameWorkspace } from '@/utils/workspaceScope';
import { parsePlanGeometry, type PlanGeometry } from '@/utils/planGeometry';
import { planPurchaseOrders, purchaseItemSpecSummary } from '@/modules/projects/utils/purchaseOrders';
import { ordersService } from '@/modules/finance/services/ordersService';

/**
 * Room floor-plan backdrops live alongside the other user-uploaded imagery.
 * Public-read, so the URL is re-derived on read rather than persisted.
 */
const ROOM_PLAN_BUCKET = 'generation-images';
import { EmailSendError } from '@/modules/email/services/emailService';
import { unwrapEmailSendError } from '@/modules/email/lib/emailSenderGate';
import { parseProjectLabor, type ProjectLabor } from '@/modules/finance/services/timeTrackingService';

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
  /**
   * The building this job is at (#378 N4). Optional and independent of the client: a landlord's
   * refurb and an owner-occupier's fit-out are both jobs at an address, and plenty of jobs have
   * no building on file at all.
   */
  property_id: string | null;
  /**
   * What KIND of job this is — Renovation, Trip, Warehouse, … A platform default or one of this
   * workspace's own (`project_categories`). Optional: an uncategorised project is a normal state,
   * never a defect, so nothing downstream may assume a category is present.
   */
  category_id: string | null;
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
  /** Resolved from `category_id` by the select below — null when uncategorised. */
  category?: { id: string; key: string; label: string } | null;
  client_company?: { id: string; name: string } | null;
  client_contact?: { id: string; name: string | null; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  /** Set by listProjects: false for projects reached via an active collaborator grant. */
  is_mine?: boolean;
  /** Owner display name — 'You' for your own, else the owner's name. */
  owner_name?: string | null;
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
  /** Physical size. Null until someone fills it in — never assume a default. */
  width_mm: number | null;
  length_mm: number | null;
  height_mm: number | null;
  /** Floor-plan backdrop, as bucket + object path. Both set, or both null. */
  plan_storage_bucket: string | null;
  plan_storage_path: string | null;
  /**
   * Calibrated plan geometry (walls, openings, mm-per-px). Raw jsonb — read it
   * through parsePlanGeometry in @/utils/planGeometry rather than destructuring
   * here, so the backing store can change without touching consumers.
   */
  plan_geometry: unknown;
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
  /** A platform USER — they get "my tasks" and notifications. */
  assignee_id: string | null;
  /**
   * A person on the HR roster (#378 N2). Mutually exclusive with `assignee_id` — an employee may
   * have no login at all, which is exactly who a site task is usually for.
   */
  assignee_employee_id: string | null;
  due_date: string | null;
  visibility: TaskVisibility;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** WS3 #285 scheduling. `due_date` is kept — it is the deadline, these are the planned span. */
  start_date: string | null;
  end_date: string | null;
  progress_pct: number;
  is_milestone: boolean;
}

/** A sequencing edge between two tasks of the same project. Cycles are rejected by the DB. */
export interface ProjectTaskDependency {
  id: string;
  project_id: string;
  predecessor_id: string;
  successor_id: string;
  /** Finish-to-start by default; the other three are accepted but not yet scheduled differently. */
  dep_type: 'FS' | 'SS' | 'FF' | 'SF';
  created_at: string;
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
  kind: 'invoice' | 'supplier_bill';
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
  /** The currencies actually behind `totals`. More than one means the sums mix money — the tiles
   *  say so rather than labelling everything EUR (#358 PQ-11). Same contract as ProjectPnl. */
  currencies: string[];
  totals: {
    receivable_total: number;
    receivable_due: number;
    payable_total: number;
    payable_due: number;
  };
}

/**
 * Project job costing (WS2 #285). Every figure here is DERIVED by `get_project_pnl`; nothing in
 * this file recomputes any of it. Note `contracted_revenue` and `billed_revenue` are two separate
 * views of revenue and must never be added together — an invoice normally derives from a quote.
 */
/** `get_quote_billing_progress` — derived in SQL, formatted here and nowhere else. */
export interface QuoteBillingProgress {
  quote_id: string;
  billed_pct: number;
  remaining_pct: number;
  invoice_count: number;
  has_full: boolean;
}

export interface ProjectPnl {
  /** Accepted quotes — what the client agreed to. */
  contracted_revenue: number;
  /** Issued (non-draft, non-void) invoices, NET of VAT — what we actually billed. */
  billed_revenue: number;
  /**
   * Revenue on this project's sales orders that nothing has invoiced yet, net of VAT. Real revenue
   * with no document behind it: a business that sells on orders and invoices later used to see its
   * whole margin as loss, because cost counted and this did not.
   */
  order_revenue: number;
  /** Cost of goods on that same un-invoiced remainder. Part of `actual_cost`. */
  order_cogs: number;
  /** `billed_revenue + order_revenue` — the figure margin is actually taken against. */
  revenue: number;
  /** Open purchase-order value: PO total minus bills already received against it. */
  committed_cost: number;
  supplier_cost: number;
  labor_cost: number;
  /**
   * Approved project-tagged expense claims. Counted regardless of `billable` — billable says the
   * cost can be on-charged to the client, not whether it was a cost.
   */
  expense_cost: number;
  /** Claims awaiting review. Reported so they are visible, but deliberately NOT in actual_cost. */
  pending_expense_cost: number;
  expense_count: number;
  /** supplier_cost + labor_cost + expense_cost + order_cogs. */
  actual_cost: number;
  margin_amount: number;
  margin_pct: number | null;
  forecast_margin_amount: number;
  forecast_margin_pct: number | null;
  /** Cost incurred but not yet billed. */
  wip: number;
  labor: ProjectLabor;
  /** Distinct currencies behind the figures — >1 means the totals mix money. */
  currencies: string[];
}

// ---------- PURCHASE ITEMS (made-to-order doors / windows) ----------

export type PurchaseItemType = 'door' | 'window' | 'other';
export const PURCHASE_ITEM_TYPES: PurchaseItemType[] = ['door', 'window', 'other'];

/** Structured spec stored on project_purchase_items.details. Keys are item-type specific;
 *  the PDF generator + product-shot prompt both read from here. All optional. */
export interface PurchaseItemDetails {
  width_mm?: number;
  height_mm?: number;
  thickness_mm?: number;
  finish?: string;
  frame?: string;
  hardware?: string;
  // door
  opening?: 'inward' | 'outward' | string;
  handing?: 'left' | 'right' | string;
  hinge_side?: string;
  // window
  frame_type?: string;
  glazing?: string;
  opening_type?: 'tilt-turn' | 'casement' | 'sliding' | string;
  [k: string]: unknown;
}

export interface ProjectPurchaseItem {
  id: string;
  project_id: string;
  workspace_id: string;
  item_type: PurchaseItemType | string;
  name: string;
  category: string | null;
  room_id: string | null;
  quantity: number;
  unit_cost: number | null;
  currency: string;
  supplier_company_id: string | null;
  status: string;
  details: PurchaseItemDetails;
  design_image_url: string | null;
  design_image_path: string | null;
  notes: string | null;
  sort_order: number;
  quote_id: string | null;
  /** The purchase order raised for this item (#378 C2). NULL = not ordered yet. */
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

// The decisions live in utils/purchaseOrders.ts, with no Supabase client, so they can be tested
// by being called. Re-exported here so existing importers do not churn.
export { planPurchaseOrders, purchaseItemSpecSummary } from '@/modules/projects/utils/purchaseOrders';
export type { PurchaseOrderGroup } from '@/modules/projects/utils/purchaseOrders';

/** Outcome of raising purchase orders — what was created, and what deliberately was not. */
export interface RaisePurchaseOrdersResult {
  orders: Array<{ orderId: string; supplierCompanyId: string; itemCount: number }>;
  /** Items left alone, each with the reason. NEVER silently dropped: a missing line on a PO is
   *  discovered on fitting day. */
  skipped: Array<{ id: string; name: string; reason: string }>;
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
  category_id?: string | null;
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
  /** `null` clears the category. */
  category_id?: string | null;
  deadline?: string | null;
  budget_amount?: number | null;
  budget_currency?: string;
  cover_image_url?: string | null;
  /** The building this job is at (#378 N4). `null` detaches it. */
  property_id?: string | null;
}

export interface CreateRoomInput {
  project_id: string;
  name: string;
  room_type?: RoomType | null;
  budget_amount?: number | null;
  deadline?: string | null;
  notes?: string | null;
  sort_order?: number;
  /** Physical size in mm. Feeds plan scale and, later, the MEP calculations. */
  width_mm?: number | null;
  length_mm?: number | null;
  height_mm?: number | null;
}

export interface CreateTaskInput {
  project_id: string;
  parent_task_id?: string | null;
  room_id?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  /** The HR-roster person instead. Exactly one of the two; the DB CHECK refuses both. */
  assignee_employee_id?: string | null;
  due_date?: string | null;
  visibility?: TaskVisibility;
  sort_order?: number;
  start_date?: string | null;
  end_date?: string | null;
  progress_pct?: number;
  is_milestone?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_id?: string | null;
  /** The HR-roster person instead. Exactly one of the two; the DB CHECK refuses both. */
  assignee_employee_id?: string | null;
  due_date?: string | null;
  visibility?: TaskVisibility;
  room_id?: string | null;
  sort_order?: number;
  start_date?: string | null;
  end_date?: string | null;
  progress_pct?: number;
  is_milestone?: boolean;
}

// =====================================================
// SERVICE
// =====================================================

/**
 * Raise a project lifecycle flow event (#378 Phase 4).
 *
 * ONE helper, because every one of these payloads has to carry the same four things and getting
 * any of them wrong fails silently in its own way:
 *
 *   • `workspace_id` — a trigger whose emitter does not stamp it can NEVER be forked by a tenant.
 *     `fork_workspace_flow_default` disables the global in the same transaction, so forking such a
 *     trigger ends with FEWER notifications and nothing raising. `appointment_booked` shipped in
 *     exactly that state.
 *   • `user_id` — `create_notification` reads it straight off the payload, so a missing one is a
 *     flow that runs, records a step, reports success and tells nobody.
 *   • `title` / `body` / `action_url` — the same, and the reason the seeded defaults can be one
 *     shape for all of them.
 *
 * Resolves the workspace and the job's name FROM the project rather than trusting a caller: the
 * callers here hold a task, a snag or an asset, and each looking it up its own way is how four of
 * them end up subtly different.
 *
 * Best-effort and non-blocking. The thing that happened has happened; failing the write because a
 * notification did not go out is the worse outcome.
 */
export async function emitProjectLifecycle(
  projectId: string | null | undefined,
  type: 'project_created' | 'project_task_completed' | 'project_milestone_reached'
      | 'project_snag_raised' | 'project_expense_approved' | 'project_delivery_issued'
      | 'project_asset_registered',
  say: (projectName: string) => { title: string; body: string },
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!projectId) return;
  try {
    const { data } = await (supabase as any)
      .from('projects')
      .select('id, name, workspace_id, user_id')
      .eq('id', projectId)
      .maybeSingle();
    const project = data as { id: string; name: string | null; workspace_id: string | null; user_id: string | null } | null;
    // No workspace means the event could never be matched to a tenant's flows anyway — emitting it
    // would be a run that can only ever no-op.
    if (!project?.workspace_id) return;
    const name = project.name ?? 'the project';
    const { title, body } = say(name);
    void flowEventService.emit(type, {
      workspace_id: project.workspace_id,
      user_id: project.user_id,
      type: 'project',
      project_id: project.id,
      project_name: project.name,
      title,
      body,
      action_url: `/projects/${project.id}`,
      ...extra,
    });
  } catch (err) {
    console.error(`[projects] could not emit ${type}`, err);
  }
}

class ProjectsService {
  // ---------- PROJECTS ----------

  /**
   * Projects the caller can see: their own plus any they are an active collaborator on.
   *
   * This deliberately does NOT filter on `user_id`. RLS already scopes the table via
   * `projects_owner_all` (owner) and `projects_collaborator_read`
   * (`_user_is_active_project_collaborator`, which honours `revoked_at`/`expires_at`), so an
   * explicit owner filter here was narrower than the policy and hid every project shared with
   * you — the collaborator feature existed but nothing shared ever reached this list.
   *
   * It DOES scope by the active workspace (#358 PQ-5). RLS bounds this to "mine + shared with
   * me", which for a user who belongs to several tenants is every one of their workspaces at
   * once — so switching workspace changed nothing on this screen. The one thing that must not be
   * dropped is a project shared with you: it lives in the OWNER's workspace, and you can see it
   * because you were invited, not because of which workspace you are in.
   */
  async listProjects(opts: { status?: ProjectStatus | 'active' } = {}): Promise<ProjectWithClient[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const activeWorkspaceId = getActiveWorkspaceId(user.id);

    let query = (supabase as any)
      .from('projects')
      .select(`
        *,
        category:project_categories(id, key, label),
        client_company:crm_companies(id, name),
        client_contact:crm_contacts(id, name, first_name, last_name, email)
      `)
      .order('last_activity_at', { ascending: false });

    // "In this workspace, or shared with me." With no active workspace resolved there is no scope
    // to apply and RLS's own bound (mine + collaborated) stands.
    if (activeWorkspaceId) {
      query = query.or(`workspace_id.eq.${activeWorkspaceId},user_id.neq.${user.id}`);
    }

    if (opts.status === 'active') {
      query = query.not('status', 'in', '("completed","archived")');
    } else if (opts.status) {
      query = query.eq('status', opts.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as ProjectWithClient[];

    // Resolve owner names so a shared list can say who owns what. Own projects are marked
    // without a lookup; only the other owners need resolving.
    const otherOwnerIds = [...new Set(rows.map((r) => r.user_id).filter((id) => id && id !== user.id))] as string[];
    const nameById = new Map<string, string>();
    if (otherOwnerIds.length) {
      const { data: profiles } = await supabase
        .from('user_profiles').select('user_id, full_name, email').in('user_id', otherOwnerIds);
      for (const p of profiles ?? []) {
        const label = (p as any).full_name || (p as any).email;
        if (label) nameById.set((p as any).user_id, label);
      }
    }
    return rows.map((r) => ({
      ...r,
      is_mine: r.user_id === user.id,
      owner_name: r.user_id === user.id ? 'You' : (nameById.get(r.user_id) ?? 'Shared with me'),
    }));
  }

  /**
   * Projects belonging to ONE CRM party — the company's or the contact's. Used by the Projects tab
   * on the CRM record. A company's projects include those booked against the company itself AND
   * (optionally) against its people, since a project attached to an employee is still that
   * company's work.
   */
  async listProjectsForClient(opts: {
    companyId?: string | null;
    contactId?: string | null;
    /** Extra contact ids to fold in (a company's people). */
    alsoContactIds?: string[];
  }): Promise<ProjectWithClient[]> {
    const contactIds = [...new Set([opts.contactId, ...(opts.alsoContactIds ?? [])].filter(Boolean))] as string[];
    if (!opts.companyId && contactIds.length === 0) return [];

    // PostgREST `.or()` with an `in.(…)` list — one round trip, no client-side union.
    const clauses: string[] = [];
    if (opts.companyId) clauses.push(`client_company_id.eq.${opts.companyId}`);
    if (contactIds.length) clauses.push(`client_contact_id.in.(${contactIds.join(',')})`);

    // PQ-5: scope to the ACTIVE workspace, like listProjects above. Without it this asked only
    // "which projects name this client?", so a user who belongs to two workspaces saw the other
    // one's projects for the same company or contact — CRM parties are shared across a tenant, so
    // a client id is not a tenant boundary. RLS still bounds the answer to workspaces the caller
    // belongs to; this narrows it to the one they are actually looking at.
    const { data: { user } } = await supabase.auth.getUser();
    const activeWorkspaceId = user ? getActiveWorkspaceId(user.id) : null;

    let query = (supabase as any)
      .from('projects')
      .select(`
        *,
        category:project_categories(id, key, label),
        client_company:crm_companies(id, name),
        client_contact:crm_contacts(id, name, first_name, last_name, email)
      `)
      .or(clauses.join(','))
      .order('last_activity_at', { ascending: false });
    if (activeWorkspaceId) query = query.eq('workspace_id', activeWorkspaceId);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as ProjectWithClient[];
  }

  async getProject(id: string): Promise<ProjectWithClient | null> {
    const { data, error } = await (supabase as any)
      .from('projects')
      .select(`
        *,
        category:project_categories(id, key, label),
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

    // Default to the workspace the user is actually working in, rather than storing NULL and
    // leaving every downstream tenancy check with nothing to test (#358 PQ-5).
    const workspaceId = input.workspace_id ?? getActiveWorkspaceId(user.id) ?? null;
    // Two ids each individually valid, never checked against each other (#358 PQ-4). The DB
    // trigger is the enforcement; this is here so the operator gets a sentence, not a 23514.
    await assertSameWorkspace(workspaceId, [
      { table: 'crm_companies', id: input.client_company_id, label: 'client company' },
      { table: 'crm_contacts', id: input.client_contact_id, label: 'client contact' },
    ]);

    const { data: project, error } = await (supabase as any)
      .from('projects')
      .insert({
        user_id: user.id,
        workspace_id: workspaceId,
        name: input.name,
        description: input.description ?? null,
        client_company_id: input.client_company_id ?? null,
        client_contact_id: input.client_contact_id ?? null,
        client_address_unit_id: input.client_address_unit_id ?? null,
        category_id: input.category_id ?? null,
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

    // A new job exists (#378 Phase 4). Emitted after the ROOMS land, so a flow that reads the
    // project does not race a half-built one.
    void emitProjectLifecycle((project as Project).id, 'project_created',
      (name) => ({ title: `New project: ${name}`, body: `${name} was created.` }));

    return project as Project;
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    if (input.client_company_id && input.client_contact_id) {
      throw new Error('A project can have a client company OR a client contact, not both.');
    }
    // Re-binding the client is the same cross-workspace hazard as creating it (#358 PQ-4).
    if (input.client_company_id || input.client_contact_id) {
      const { data: current } = await (supabase as any)
        .from('projects').select('workspace_id').eq('id', id).maybeSingle();
      await assertSameWorkspace((current as { workspace_id: string | null } | null)?.workspace_id, [
        { table: 'crm_companies', id: input.client_company_id, label: 'client company' },
        { table: 'crm_contacts', id: input.client_contact_id, label: 'client contact' },
      ]);
    }
    // The status BEFORE the write, so the event can say what changed and fire only on a real
    // move. Read alongside the tenancy check above rather than as an extra round trip.
    const previousStatus = input.status !== undefined
      ? ((await (supabase as any).from('projects').select('status').eq('id', id).maybeSingle())
          .data as { status: string | null } | null)?.status ?? null
      : null;

    const { data, error } = await (supabase as any)
      .from('projects')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    const project = data as Project;

    /**
     * A job moved (#378 Phase 4 — project lifecycle).
     *
     * Projects emitted almost nothing: of the whole trigger vocabulary the only project events
     * were two invitation ones and two request ones, so "the job is now on site" — the thing
     * everyone downstream waits for — could not start an automation.
     *
     * Fired only on a REAL change: an update that resaves the same status is not a move, and a
     * flow run is metered. `workspace_id` is in the payload because a trigger without it can
     * never be forked by a tenant — `appointment_booked` shipped in exactly that state, and its
     * table has no workspace column at all to put there.
     *
     * Best-effort: the status IS saved, and failing the update because a notification did not go
     * out would be the worse outcome.
     */
    if (input.status !== undefined && project.status && project.status !== previousStatus) {
      void flowEventService.emit('project_status_changed', {
        workspace_id: project.workspace_id,
        // The seeded default notifies the job's OWNER; `create_notification` reads these three
        // straight off the payload, so a missing `user_id` is a flow that runs and tells nobody.
        user_id: project.user_id,
        type: 'project',
        project_id: project.id,
        project_name: project.name,
        from_status: previousStatus,
        to_status: project.status,
        title: `Project status: ${project.name}`,
        body: `${project.name} moved to ${project.status}.`,
        action_url: `/projects/${project.id}`,
      });
    }

    return project;
  }

  async archiveProject(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('projects')
      .update({ status: 'archived' })
      .eq('id', id);
    if (error) throw error;
  }

  // Hard-delete a project. RLS (projects_owner_all) restricts this to the owner.
  // FK CASCADE removes rooms, tasks, product lines, client views, collaborators and
  // events; moodboards, quotes and invoices are SET NULL (kept, just unlinked). Any
  // storage files (e.g. client-view PDFs) become unreferenced and are reclaimed by
  // storage-orphan-cleanup-cron.
  async deleteProject(id: string): Promise<void> {
    const { error } = await (supabase as any).from('projects').delete().eq('id', id);
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
        width_mm: input.width_mm ?? null,
        length_mm: input.length_mm ?? null,
        height_mm: input.height_mm ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectRoom;
  }

  async updateRoom(id: string, input: Partial<Omit<CreateRoomInput, 'project_id'>>): Promise<ProjectRoom> {
    // Allowlisted payload rather than spreading `input` — a spread lets any extra
    // runtime key reach the write (CLAUDE.md security invariant 8), and this
    // object now sits next to columns that feed calculations.
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.room_type !== undefined) payload.room_type = input.room_type;
    if (input.budget_amount !== undefined) payload.budget_amount = input.budget_amount;
    if (input.deadline !== undefined) payload.deadline = input.deadline;
    if (input.notes !== undefined) payload.notes = input.notes;
    if (input.sort_order !== undefined) payload.sort_order = input.sort_order;
    if (input.width_mm !== undefined) payload.width_mm = input.width_mm;
    if (input.length_mm !== undefined) payload.length_mm = input.length_mm;
    if (input.height_mm !== undefined) payload.height_mm = input.height_mm;

    const { data, error } = await (supabase as any)
      .from('project_rooms')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProjectRoom;
  }

  /**
   * Persist calibrated plan geometry for a room.
   *
   * Separate from updateRoom on purpose: geometry is written by the canvas as a
   * whole document, never field-by-field, and keeping it off the general update
   * path means a stray form submit can never blank someone's traced walls.
   */
  async updateRoomGeometry(id: string, geometry: PlanGeometry): Promise<ProjectRoom> {
    const { data, error } = await (supabase as any)
      .from('project_rooms')
      .update({ plan_geometry: geometry })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProjectRoom;
  }

  /** Read a room's geometry, defaulting cleanly when it has never been traced. */
  roomGeometry(room: Pick<ProjectRoom, 'plan_geometry'>): PlanGeometry {
    return parsePlanGeometry(room.plan_geometry);
  }

  /**
   * Upload a floor-plan backdrop for a room.
   *
   * Stores bucket + object path rather than a URL (pipeline convention 7) and
   * re-derives the URL on read. project_rooms.plan_storage_* is registered in
   * build_storage_reference_set(), so storage-orphan-cleanup-cron leaves these
   * files alone; a CHECK keeps bucket and path set together, because half a
   * reference is both unreadable AND invisible to the GC.
   */
  async uploadRoomPlan(roomId: string, file: File): Promise<ProjectRoom> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `u/${user.id}/room-plans/${roomId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from(ROOM_PLAN_BUCKET)
      .upload(path, file, { upsert: true });
    if (error || !data) throw error ?? new Error('Upload failed');

    const { data: row, error: updErr } = await (supabase as any)
      .from('project_rooms')
      .update({ plan_storage_bucket: ROOM_PLAN_BUCKET, plan_storage_path: data.path })
      .eq('id', roomId)
      .select()
      .single();
    if (updErr) throw updErr;
    return row as ProjectRoom;
  }

  /** Readable URL for a room's plan backdrop, or null when it has none. */
  roomPlanUrl(room: Pick<ProjectRoom, 'plan_storage_bucket' | 'plan_storage_path'>): string | null {
    if (!room.plan_storage_bucket || !room.plan_storage_path) return null;
    return supabase.storage
      .from(room.plan_storage_bucket)
      .getPublicUrl(room.plan_storage_path).data.publicUrl;
  }

  /**
   * Detach the plan backdrop. The blob itself is left for the orphan cron —
   * cleanup here is GC-based, not trigger-based (see docs/storage-buckets.md),
   * so dropping the reference is the whole job.
   *
   * Scale is dropped with it: an mm-per-pixel derived from an image that is no
   * longer attached would silently measure against the wrong backdrop.
   */
  async clearRoomPlan(roomId: string, geometry: PlanGeometry): Promise<ProjectRoom> {
    const { scale: _dropped, ...rest } = geometry;
    const { data, error } = await (supabase as any)
      .from('project_rooms')
      .update({ plan_storage_bucket: null, plan_storage_path: null, plan_geometry: rest })
      .eq('id', roomId)
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

  /**
   * Who a task can be given to: platform members AND the HR roster, as one deduped list (#378 N2).
   *
   * Derived by `list_project_task_assignees` rather than assembled here — `user_profiles` RLS is
   * `is_public OR own row` with no teammate branch, so a plain client read returns a picker full
   * of people called "Member".
   */
  async listTaskAssignees(workspaceId: string): Promise<Array<{
    kind: 'employee' | 'member'; id: string; name: string; email: string | null;
  }>> {
    const { data, error } = await (supabase as any)
      .rpc('list_project_task_assignees', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as any[];
  }

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
    // The status BEFORE the write, so completion fires on a real transition. Re-saving a task that
    // was already done is not a completion, and every flow run is metered.
    const previousStatus = input.status !== undefined
      ? ((await (supabase as any).from('project_tasks').select('status').eq('id', id).maybeSingle())
          .data as { status: string | null } | null)?.status ?? null
      : null;

    const { data, error } = await (supabase as any)
      .from('project_tasks')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    const task = data as ProjectTask & { is_milestone?: boolean | null };

    if (input.status !== undefined && task.status === 'done' && previousStatus !== 'done') {
      const label = task.title || 'A task';
      void emitProjectLifecycle(task.project_id, 'project_task_completed',
        (name) => ({ title: `Task done: ${label}`, body: `${label} was completed on ${name}.` }),
        { task_id: task.id, task_title: task.title });

      /**
       * A MILESTONE is a separate event, not a flag on the task one.
       *
       * They are different questions with different audiences: "a task finished" is for the team
       * and fires constantly; "we hit the milestone" is for the client and fires rarely. Folding
       * the second into the first as a config filter would make every milestone automation pay for
       * a run on every task — and flow runs are metered.
       */
      if (task.is_milestone) {
        void emitProjectLifecycle(task.project_id, 'project_milestone_reached',
          (name) => ({ title: `Milestone reached: ${label}`, body: `${name} reached the milestone "${label}".` }),
          { task_id: task.id, task_title: task.title });
      }
    }

    return task as ProjectTask;
  }

  // ---------- TASK DEPENDENCIES (WS3 #285) ----------

  async listTaskDependencies(projectId: string): Promise<ProjectTaskDependency[]> {
    const { data, error } = await (supabase as any)
      .from('project_task_dependencies')
      .select('*')
      .eq('project_id', projectId);
    if (error) throw error;
    return (data || []) as ProjectTaskDependency[];
  }

  /**
   * Link two tasks. The DB rejects self-edges, cross-project edges and anything that would
   * close a cycle — a cycle makes the schedule pass non-terminating, so it is refused at write
   * time rather than defended against on every read.
   */
  async addTaskDependency(
    projectId: string, predecessorId: string, successorId: string,
    depType: ProjectTaskDependency['dep_type'] = 'FS',
  ): Promise<ProjectTaskDependency> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_task_dependencies')
      .insert({
        project_id: projectId,
        predecessor_id: predecessorId,
        successor_id: successorId,
        dep_type: depType,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectTaskDependency;
  }

  async removeTaskDependency(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_task_dependencies').delete().eq('id', id);
    if (error) throw error;
  }

  async deleteTask(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_tasks').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- LINKED ARTIFACTS ----------

  /**
   * Per-room budget rollup, and — deliberately — what is NOT on a room.
   *
   * THIS IS NOT THE PROJECT ACTUAL, AND THE TWO SIT ON THE SAME CARD. `projects.actual_amount` is
   * `SUM(grand_total)` of accepted quotes, maintained by a trigger. These rows are `SUM(line_total)`
   * of accepted-quote ITEMS. Per `get_quote_totals`, grand_total is
   * `(sum(line_total) - cash discount) + accepted upsells + VAT`, so the room rows can never add up
   * to the project figure — and until `unassigned` existed, quote lines with no `room_id` were
   * dropped from the breakdown entirely with nothing saying so. Money that is simply absent from a
   * budget screen reads as money that was not spent.
   *
   * One query, one derivation. The caller formats and names the gap; it must not re-derive either
   * half (CLAUDE.md rule 1).
   */
  async getRoomBudgetSummary(projectId: string): Promise<{
    rooms: Array<{ room: ProjectRoom; actual_amount: number; quote_count: number; item_count: number }>;
    /** Accepted-quote line spend on this project that is not attributed to any room. */
    unassigned: { actual_amount: number; item_count: number };
  }> {
    const rooms = await this.listRooms(projectId);

    // Every accepted-quote item in this project, room-tagged or not.
    // !inner join filter ensures we only get items whose parent quote is accepted + in this project.
    // The error was discarded here, so a failed read reported every room as zero spent — which
    // on a budget screen reads as good news (#358 PQ-6). It throws now; the caller renders the
    // failure instead of a number nobody measured.
    //
    // The `room_id is not null` filter that used to live here is what made the untagged lines
    // invisible. They are bucketed below instead of dropped.
    const { data: items, error: itemsError } = await (supabase as any)
      .from('quote_items')
      .select('room_id, line_total, quote_id, quote:quotes!inner(project_id, status)')
      .eq('quote.project_id', projectId)
      .eq('quote.status', 'accepted');
    if (itemsError) throw itemsError;

    const rollup = new Map<string, { actual_amount: number; quotes: Set<string>; items: number }>();
    const unassigned = { actual_amount: 0, item_count: 0 };
    const knownRooms = new Set(rooms.map(r => r.id));
    for (const it of (items || []) as Array<{ room_id: string | null; line_total: number | null; quote_id: string }>) {
      const amount = Number(it.line_total) || 0;
      // A room_id pointing at a room that is no longer on the project counts as unassigned too —
      // otherwise deleting a room would delete its spend from the screen.
      if (!it.room_id || !knownRooms.has(it.room_id)) {
        unassigned.actual_amount += amount;
        unassigned.item_count += 1;
        continue;
      }
      if (!rollup.has(it.room_id)) rollup.set(it.room_id, { actual_amount: 0, quotes: new Set(), items: 0 });
      const agg = rollup.get(it.room_id)!;
      agg.actual_amount += amount;
      agg.quotes.add(it.quote_id);
      agg.items += 1;
    }

    return {
      rooms: rooms.map(r => {
        const agg = rollup.get(r.id);
        return {
          room: r,
          actual_amount: agg?.actual_amount || 0,
          quote_count: agg?.quotes.size || 0,
          item_count: agg?.items || 0,
        };
      }),
      unassigned,
    };
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

  // ---------- BILLING: project → invoice(s) ----------

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

  /**
   * How much of a quote is already billed — the SAME derivation `create_project_progress_invoice`
   * and `issue_invoice_from_quote` gate on, so the dialog cannot offer a percentage the write
   * will refuse. Never re-add this up from the invoice list: two answers to one money question is
   * the shape CLAUDE.md rule 1 exists for.
   */
  async quoteBillingProgress(quoteIds: string[]): Promise<Record<string, QuoteBillingProgress>> {
    if (quoteIds.length === 0) return {};
    const { data, error } = await (supabase as any).rpc('get_quote_billing_progress', { p_quote_ids: quoteIds });
    if (error) throw error;
    const out: Record<string, QuoteBillingProgress> = {};
    for (const r of (data || []) as QuoteBillingProgress[]) out[r.quote_id] = r;
    return out;
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
  async resolveProductPrice(
    workspaceId: string,
    productId: string,
    /**
     * The project line's quantity and unit, so `product_price_breaks` can fire (#332 step 1c).
     * A project specifies 240 m² of a tile; pricing it at the single-unit rate quoted the client
     * a number the same tile would never cost on a quote or an order.
     *
     * Pass them TOGETHER or not at all: `get_product_price_break` does
     * `coalesce(convert_to_base_unit(product, qty, unit), qty)`, so a quantity with a missing or
     * unconvertible unit is read as already being in base units and matches the wrong threshold.
     */
    opts?: {
      quantity?: number | null;
      unit?: string | null;
      /**
       * #374 Phase 4 — which variant to price. `project_products` does not capture a variant
       * yet, so today's callers pass nothing and get the product-wide row exactly as before;
       * the parameter exists so a project line that gains one is priced like a quote line
       * rather than silently falling back to base.
       */
      variantKey?: string | null;
    },
  ): Promise<ResolvedPrice> {
    const qty = opts?.quantity == null ? null : Number(opts.quantity);
    const hasQty = qty != null && Number.isFinite(qty) && qty > 0;
    const breakArgs = hasQty && opts?.unit ? { p_quantity: qty, p_unit: opts.unit } : {};
    const { data, error } = await (supabase as any).rpc('get_product_price_for_workspace', {
      p_workspace_id: workspaceId,
      p_product_id: productId,
      p_variant_key: opts?.variantKey ?? null,
      ...breakArgs,
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
    const row = (data || {}) as Partial<ProjectFinanceSummary>;
    return {
      receivables: row.receivables ?? [],
      payables: row.payables ?? [],
      currencies: row.currencies ?? [],
      totals: row.totals ?? { receivable_total: 0, receivable_due: 0, payable_total: 0, payable_due: 0 },
    };
  }

  /** Job costing for a project. Read-only view over `get_project_pnl` — see ProjectPnl. */
  async getProjectPnl(projectId: string): Promise<ProjectPnl> {
    const { data, error } = await (supabase as any).rpc('get_project_pnl', { p_project_id: projectId });
    if (error) throw error;
    const r = (data || {}) as Record<string, any>;
    const n = (v: unknown): number => (v == null ? 0 : Number(v));
    const nOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
    return {
      contracted_revenue: n(r.contracted_revenue),
      billed_revenue: n(r.billed_revenue),
      order_revenue: n(r.order_revenue),
      order_cogs: n(r.order_cogs),
      revenue: n(r.revenue),
      committed_cost: n(r.committed_cost),
      supplier_cost: n(r.supplier_cost),
      labor_cost: n(r.labor_cost),
      expense_cost: n(r.expense_cost),
      pending_expense_cost: n(r.pending_expense_cost),
      expense_count: n(r.expense_count),
      actual_cost: n(r.actual_cost),
      margin_amount: n(r.margin_amount),
      margin_pct: nOrNull(r.margin_pct),
      forecast_margin_amount: n(r.forecast_margin_amount),
      forecast_margin_pct: nOrNull(r.forecast_margin_pct),
      wip: n(r.wip),
      labor: parseProjectLabor(r.labor),
      currencies: (r.currencies ?? []) as string[],
    };
  }

  /**
   * Finance documents that are NOT yet attached to any project — the candidate list for the
   * "attach" picker.
   *
   * Both sides are scoped to the PROJECT's workspace. RLS bounds these to every workspace the
   * caller belongs to, so for a multi-workspace user the picker was offering another tenant's
   * documents and attaching one would have moved it across the boundary.
   *
   * Receivables are scoped to the project's client. Payables cannot be — a project buys from
   * whoever supplies it — but "every unattached supplier bill in the workspace" is not a
   * candidate list either (#358 PQ-13). Each row is flagged `related`: its supplier already
   * appears on this project's purchase orders or purchase items. The picker leads with those and
   * keeps the rest behind a labelled divider, so a genuinely new supplier is still attachable
   * without the list pretending everything is a candidate.
   */
  async listAttachableFinance(projectId: string): Promise<{ receivables: any[]; payables: any[] }> {
    const project = await this.getProject(projectId);
    const contactId = project?.client_contact_id ?? null;
    const companyId = project?.client_company_id ?? null;
    const workspaceId = project?.workspace_id ?? null;
    // No workspace means no scope to apply, and a picker that widens when it cannot resolve its
    // scope is the failure this fix exists to remove.
    if (!workspaceId) return { receivables: [], payables: [] };

    // Voided docs are deletions — never offer them as attachable to a project.
    const invQ = (supabase as any)
      .from('invoices')
      .select('id, internal_number, total, amount_due, status, currency, issued_at, due_at')
      .eq('workspace_id', workspaceId)
      .is('project_id', null).neq('status', 'void');
    if (companyId) invQ.eq('customer_company_id', companyId);
    else if (contactId) invQ.eq('customer_contact_id', contactId);

    const billQ = (supabase as any)
      .from('supplier_bills')
      .select('id, supplier_bill_number, supplier_company_id, total, amount_due, status, currency, issued_at, due_at')
      .eq('workspace_id', workspaceId)
      .is('project_id', null).neq('status', 'void');

    const ordersQ = (supabase as any)
      .from('orders')
      .select('supplier_company_id')
      .eq('project_id', projectId)
      .not('supplier_company_id', 'is', null);

    const itemsQ = (supabase as any)
      .from('project_purchase_items')
      .select('supplier_company_id')
      .eq('project_id', projectId)
      .not('supplier_company_id', 'is', null);

    const [inv, bills, orders, items] = await Promise.all([invQ, billQ, ordersQ, itemsQ]);
    if (inv.error) throw inv.error;
    if (bills.error) throw bills.error;

    const projectSuppliers = new Set<string>([
      ...((orders.data || []) as Array<{ supplier_company_id: string }>).map((r) => r.supplier_company_id),
      ...((items.data || []) as Array<{ supplier_company_id: string }>).map((r) => r.supplier_company_id),
    ]);

    const recv = [
      ...(inv.data || []).map((i: any) => ({ kind: 'invoice', id: i.id, label: i.internal_number, total: i.total, amount_due: i.amount_due, status: i.status, currency: i.currency, issued_at: i.issued_at, related: true })),
    ];
    const pay = [
      ...(bills.data || []).map((b: any) => ({ kind: 'supplier_bill', id: b.id, label: b.supplier_bill_number, total: b.total, amount_due: b.amount_due, status: b.status, currency: b.currency, issued_at: b.issued_at, related: !!b.supplier_company_id && projectSuppliers.has(b.supplier_company_id) })),
    ];
    pay.sort((a, b) => Number(b.related) - Number(a.related));
    return { receivables: recv, payables: pay };
  }

  /** Attach (project_id set) or detach (null) a finance document to/from a project. */
  async setFinanceAttachment(kind: 'invoice' | 'supplier_bill', id: string, projectId: string | null): Promise<void> {
    const table = kind === 'invoice' ? 'invoices' : 'supplier_bills';
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
    moodboard_id: string | null;
    moodboard_title: string | null;
    sheet_type: string;
    title: string | null;
    status: string;
    pdf_storage_path: string | null;
    credits_used: number | null;
    created_at: string;
    updated_at: string;
  }>> {
    // Sheets reach a project two ways now: through one of its moodboards, or
    // owned by the project directly (technical plans, which are not mood work).
    const { data: mbs } = await (supabase as any)
      .from('moodboards')
      .select('id, title')
      .eq('project_id', projectId);
    const ids = (mbs || []).map((m: any) => m.id);
    const titleById = new Map((mbs || []).map((m: any) => [m.id, m.title]));

    const cols = 'id, moodboard_id, project_id, room_id, sheet_type, title, status, pdf_storage_path, credits_used, created_at, updated_at';

    const [viaMoodboards, viaProject] = await Promise.all([
      ids.length
        ? (supabase as any).from('moodboard_presentation_sheets').select(cols).in('moodboard_id', ids)
        : Promise.resolve({ data: [] }),
      (supabase as any).from('moodboard_presentation_sheets').select(cols).eq('project_id', projectId),
    ]);

    const rows = [...(viaMoodboards.data || []), ...(viaProject.data || [])];
    return rows
      .map((s: any) => ({ ...s, moodboard_title: titleById.get(s.moodboard_id) ?? null }))
      .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
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
    const escape = escapeHtml; // shared canonical escaper (was `& < > "`-only — left ' unescaped)
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

  // ---------- PURCHASE ITEMS (doors / windows → purchase spec sheet) ----------

  async listPurchaseItems(projectId: string): Promise<ProjectPurchaseItem[]> {
    const { data, error } = await (supabase as any)
      .from('project_purchase_items')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as ProjectPurchaseItem[];
  }

  async addPurchaseItem(input: {
    project_id: string;
    workspace_id: string;
    item_type?: PurchaseItemType | string;
    name: string;
    category?: string | null;
    room_id?: string | null;
    quantity?: number;
    unit_cost?: number | null;
    currency?: string;
    supplier_company_id?: string | null;
    quote_id?: string | null;
    details?: PurchaseItemDetails;
    design_image_url?: string | null;
    design_image_path?: string | null;
    notes?: string | null;
    sort_order?: number;
  }): Promise<ProjectPurchaseItem> {
    if (!input.name?.trim()) throw new Error('Give the purchase item a name.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_purchase_items')
      .insert({
        project_id: input.project_id,
        workspace_id: input.workspace_id,
        item_type: input.item_type ?? 'door',
        name: input.name.trim(),
        category: input.category ?? null,
        room_id: input.room_id ?? null,
        quantity: input.quantity ?? 1,
        unit_cost: input.unit_cost ?? null,
        currency: input.currency ?? 'EUR',
        supplier_company_id: input.supplier_company_id ?? null,
        quote_id: input.quote_id ?? null,
        details: input.details ?? {},
        design_image_url: input.design_image_url ?? null,
        design_image_path: input.design_image_path ?? null,
        notes: input.notes ?? null,
        sort_order: input.sort_order ?? 0,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectPurchaseItem;
  }

  async updatePurchaseItem(id: string, input: Partial<{
    item_type: PurchaseItemType | string;
    name: string;
    category: string | null;
    room_id: string | null;
    quantity: number;
    unit_cost: number | null;
    currency: string;
    supplier_company_id: string | null;
    quote_id: string | null;
    status: string;
    details: PurchaseItemDetails;
    design_image_url: string | null;
    design_image_path: string | null;
    notes: string | null;
    sort_order: number;
  }>): Promise<ProjectPurchaseItem> {
    const { data, error } = await (supabase as any)
      .from('project_purchase_items')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProjectPurchaseItem;
  }

  /**
   * Turn made-to-order items into real PURCHASE ORDERS (#378 C2).
   *
   * One order per supplier, because that is what a supplier can acknowledge, deliver against and
   * bill. Each order is stamped with the project, so its total lands as the job's COMMITTED cost
   * immediately — and when the supplier's bill is later raised from that order,
   * `generate_supplier_bill_from_order` carries the job onto it (#378 Phase 1), so committed
   * becomes actual instead of quietly disappearing.
   *
   * The PDF spec sheet is unchanged and is still the detailed document. This adds the thing the
   * PDF could never be: a row the platform can count, receive against, three-way match, and hand
   * to the supplier portal.
   *
   * NOTHING IS SKIPPED SILENTLY. An item with no supplier cannot be grouped onto an order, and an
   * item with no unit cost would land on a supplier's order at zero — both are returned with a
   * reason for the caller to show. A missing line on a purchase order is discovered on fitting
   * day, which is the most expensive day to discover it.
   */
  async raisePurchaseOrders(
    projectId: string,
    itemIds: string[],
  ): Promise<RaisePurchaseOrdersResult> {
    const result: RaisePurchaseOrdersResult = { orders: [], skipped: [] };
    if (itemIds.length === 0) return result;

    const { data, error } = await (supabase as any)
      .from('project_purchase_items')
      .select('*')
      .eq('project_id', projectId)
      .in('id', itemIds);
    if (error) throw error;
    const items = (data ?? []) as ProjectPurchaseItem[];

    const plan = planPurchaseOrders(items);
    result.skipped = plan.skipped;
    if (plan.groups.length === 0) return result;

    for (const { supplierCompanyId, currency, items: group } of plan.groups) {
      const orderId = await ordersService.create({
        workspaceId: group[0].workspace_id,
        orderType: 'purchase',
        status: 'draft',
        supplierCompanyId,
        projectId,
        currency,
        notes: 'Made-to-order items from this project. The spec sheet for each item is the detailed document.',
        items: group.map((it) => {
          const spec = purchaseItemSpecSummary(it);
          return {
            description: spec ? `${it.name} — ${spec}` : it.name,
            quantity: Number(it.quantity) || 1,
            // What we PAY the supplier. A purchase order settles on money OUT.
            unit_price: Number(it.unit_cost) || 0,
            supplier_company_id: supplierCompanyId,
          };
        }),
      });

      const { error: stampErr } = await (supabase as any)
        .from('project_purchase_items')
        .update({ order_id: orderId, status: 'ordered' })
        .in('id', group.map((it) => it.id));
      // The order EXISTS at this point. Failing to stamp it back would let the same items be
      // ordered twice, so it is reported rather than swallowed.
      if (stampErr) {
        throw new Error(
          `Purchase order created, but the items could not be marked as ordered (${stampErr.message}). `
          + 'Check the project purchases tab before raising it again.',
        );
      }

      result.orders.push({ orderId, supplierCompanyId, itemCount: group.length });
    }

    return result;
  }

  async deletePurchaseItem(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_purchase_items').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Generate a studio product image for a made-to-order door/window from its spec, via the
   * `product-shot` mode of generate-interior-gemini. Used when the item is NOT a catalog
   * product (no real photo). Persists the returned URL onto the item's design_image_url and
   * returns it. Costs image-generation credits (debited inside the edge function).
   */
  async generatePurchaseItemImage(itemId: string, opts: { extraPrompt?: string } = {}): Promise<string> {
    const { data: item, error: readErr } = await (supabase as any)
      .from('project_purchase_items')
      .select('item_type, name, details')
      .eq('id', itemId)
      .single();
    if (readErr) throw readErr;

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.functions.invoke('generate-interior-gemini', {
      body: {
        mode: 'product-shot',
        item_type: item.item_type || 'door',
        item_name: item.name,
        spec: item.details || {},
        prompt: opts.extraPrompt || undefined,
        workspace_id: getActiveWorkspaceId(user?.id),
      },
    });
    if (error) throw await edgeError(error, 'Image generation failed');
    const url: string | undefined = (data as any)?.image_url;
    if (!url) throw new Error((data as any)?.error || 'Image generation returned no image');

    await this.updatePurchaseItem(itemId, { design_image_url: url });
    return url;
  }

  /**
   * Render the project's purchase items into a PDF (schedule + per-item spec sheets) via the
   * generate-purchase-sheet-pdf edge function. Returns a 7-day signed URL.
   */
  async generatePurchaseSheet(projectId: string, opts: {
    item_ids?: string[];
    mode?: 'schedule' | 'per_item' | 'both' | 'order';
    title?: string;
    project_name?: string;
  } = {}): Promise<{ pdf_url: string; pdf_storage_path: string; page_count: number; item_count: number; mode: string }> {
    const { data, error } = await supabase.functions.invoke('generate-purchase-sheet-pdf', {
      body: {
        project_id: projectId,
        item_ids: opts.item_ids,
        mode: opts.mode ?? 'both',
        title: opts.title,
        project_name: opts.project_name,
      },
    });
    // Typed error so UI can open the Connect-email gate on `workspace_sender_required` (send mode).
    if (error) { const { code, message } = await unwrapEmailSendError(error); throw new EmailSendError(message, (code as any) ?? 'unknown'); }
    if (!(data as any)?.success) throw new Error((data as any)?.error || 'Purchase sheet generation failed');
    return data as { pdf_url: string; pdf_storage_path: string; page_count: number; item_count: number; mode: string };
  }

  /** Best-effort primary catalog image for a product (via image_product_associations). */
  async getProductPrimaryImageUrl(productId: string): Promise<string | null> {
    const { data: assoc } = await (supabase as any)
      .from('image_product_associations')
      .select('image_id')
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle();
    if (!assoc?.image_id) return null;
    const { data: img } = await (supabase as any)
      .from('document_images')
      .select('image_url')
      .eq('id', assoc.image_id)
      .maybeSingle();
    return img?.image_url ?? null;
  }

  // ---------- CRM LOOKUP (for the wizard) ----------

  /**
   * The wizard's CRM lookups, scoped to the ACTIVE workspace.
   *
   * RLS scopes these to every workspace the caller belongs to, which for a multi-workspace user
   * is several tenants at once — so the ClientPicker could offer, and the project could then
   * store, a party from a different workspace (#358 PQ-4). The scope is required, not
   * best-effort: with no active workspace resolved the picker returns nothing rather than
   * quietly widening to everything.
   */
  private async activeWorkspaceOrNull(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return getActiveWorkspaceId(user.id) ?? null;
  }

  async searchCompanies(query: string, limit = 10) {
    const ws = await this.activeWorkspaceOrNull();
    if (!ws) return [];
    const q = (supabase as any).from('crm_companies').select('id, name, email')
      .eq('workspace_id', ws).limit(limit);
    if (query.trim()) q.ilike(CRM_SEARCH_COLUMN, foldedLike(query));
    q.order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Array<{ id: string; name: string; email: string | null }>;
  }

  async searchProducts(query: string, limit = 12) {
    const ws = await this.activeWorkspaceOrNull();
    if (!ws) return [];
    const q = (supabase as any).from('products').select('id, name, sku')
      .eq('workspace_id', ws).limit(limit);
    if (query.trim()) q.or(`name.ilike.%${query}%,sku.ilike.%${query}%`);
    q.order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Array<{ id: string; name: string; sku: string | null }>;
  }

  async searchContacts(query: string, limit = 10) {
    const ws = await this.activeWorkspaceOrNull();
    if (!ws) return [];
    const q = (supabase as any)
      .from('crm_contacts')
      .select('id, name, first_name, last_name, email')
      .eq('workspace_id', ws)
      .limit(limit);
    if (query.trim()) q.ilike(CRM_SEARCH_COLUMN, foldedLike(query));
    q.order('name', { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Array<{ id: string; name: string | null; first_name: string | null; last_name: string | null; email: string | null }>;
  }
}

export const projectsService = new ProjectsService();
