/**
 * Deals & pipeline (#311) — the one service over `crm_deals`.
 *
 * The pipeline is a CRM object, not a Real Estate feature: Real Estate is a consumer that filters
 * to the `real_estate` deal type. Everything reads this service, so there is one place that knows
 * how a deal is loaded and one visibility rule (RLS on `crm_deals`, which carries the property
 * agent-scoping so the CRM board cannot show a listing Real Estate would hide).
 *
 * Stages are DATA, not a TypeScript union. Each deal type owns its own stage set and the database
 * enforces the pairing through a composite FK on `(deal_type_id, stage)` — a construction deal
 * physically cannot sit in "Conveyancing". Never hardcode a stage list in a component.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { flowEventService } from '@/services/flows/flowEventService';

export interface DealType {
  id: string;
  workspace_id: string | null;      // null = platform default, non-null = this tenant's own
  key: string;
  label: string;
  subject_kind: 'property' | 'project' | 'none';
  sort: number;
  is_active: boolean;
}

export interface DealStage {
  id: string;
  deal_type_id: string;
  key: string;
  label: string;
  sort: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface Deal {
  id: string;
  workspace_id: string;
  deal_type_id: string;
  title: string | null;
  stage: string;
  status: 'open' | 'won' | 'lost';
  value: number | null;
  currency: string;
  probability: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  contact_id: string | null;
  company_id: string | null;
  property_id: string | null;
  project_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
  contact?: { id: string; name: string | null } | null;
  company?: { id: string; name: string | null } | null;
  property?: { id: string; title: string | null; reference_code: string | null; town: string | null } | null;
  task_total?: number;
  task_done?: number;
}

export interface DealTask {
  id: string;
  deal_id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  created_at: string;
}

/** Fields a caller may set. Identity and tenancy (`workspace_id`, `created_by`) are server-side. */
export interface DealInput {
  deal_type_id: string;
  stage: string;
  title?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  property_id?: string | null;
  project_id?: string | null;
  value?: number | null;
  currency?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  notes?: string | null;
  status?: 'open' | 'won' | 'lost';
  lost_reason?: string | null;
}

const DEAL_SELECT =
  'id, workspace_id, deal_type_id, title, stage, status, value, currency, probability, ' +
  'expected_close_date, lost_reason, notes, contact_id, company_id, property_id, project_id, ' +
  'owner_user_id, created_at, updated_at, ' +
  'contact:crm_contacts!crm_deals_contact_id_fkey ( id, name ), ' +
  'company:crm_companies ( id, name ), ' +
  'property:properties ( id, title, reference_code, town ), ' +
  'tasks:crm_deal_tasks ( id, done )';

/** Collapse the embedded task rows into the two counts the board renders. */
function withTaskCounts(row: any): Deal {
  const tasks = row?.tasks ?? [];
  const { tasks: _drop, ...rest } = row ?? {};
  return { ...rest, task_total: tasks.length, task_done: tasks.filter((t: any) => t.done).length } as Deal;
}

/**
 * The payload every deal event carries. `action_url` points at the record page — a notification
 * whose link goes nowhere is the shape `deepLinkTargets.test.ts` exists to catch.
 */
async function emitDealEvent(
  type: 'deal_stage_changed' | 'deal_won' | 'deal_lost',
  deal: Deal,
  stageLabel?: string,
): Promise<void> {
  // The type KEY, not its id: a flow filters on a readable value a person picked in a form, and
  // ids are not portable between workspaces.
  let dealTypeKey: string | null = null;
  let contactEmail: string | null = null;
  try {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('crm_deal_types').select('key').eq('id', deal.deal_type_id).maybeSingle(),
      deal.contact_id
        ? supabase.from('crm_contacts').select('email').eq('id', deal.contact_id).maybeSingle()
        : Promise.resolve({ data: null } as { data: { email: string | null } | null }),
    ]);
    dealTypeKey = (t as { key?: string } | null)?.key ?? null;
    contactEmail = (c as { email?: string | null } | null)?.email ?? null;
  } catch {
    // Enrichment is best-effort: a flow that filters on deal_type_key simply will not match.
  }
  const name = deal.title?.trim() || deal.property?.title || deal.company?.name || deal.contact?.name || 'Deal';
  const title = type === 'deal_won' ? `Deal won: ${name}`
    : type === 'deal_lost' ? `Deal lost: ${name}`
    : `${name} moved to ${stageLabel ?? deal.stage}`;
  const payload = {
    user_id: deal.owner_user_id,
    workspace_id: deal.workspace_id,
    title,
    body: deal.value != null ? `${deal.value} ${deal.currency || 'EUR'}` : '',
    action_url: `/crm/deals/${deal.id}`,
    type,
    deal_id: deal.id,
    deal_type_id: deal.deal_type_id,
    deal_type_key: dealTypeKey,
    // What a send_email action needs to address the mail without a second lookup.
    contact_email: contactEmail,
    contact_name: deal.contact?.name ?? null,
    company_name: deal.company?.name ?? null,
    deal_title: deal.title?.trim() || null,
    deal_url: `/crm/deals/${deal.id}`,
    stage: deal.stage,
    stage_label: stageLabel ?? deal.stage,
    value: deal.value,
    currency: deal.currency,
    contact_id: deal.contact_id,
    company_id: deal.company_id,
  };
  try {
    // Emitted as STRING LITERALS on purpose. tests/unit/flowEventContract.test.ts can only check
    // literals — `emit(type, …)` with a variable is invisible to it, so an event name that drifted
    // out of the TriggerType union would emit into nothing with nobody reporting a problem.
    if (type === 'deal_won') await flowEventService.emit('deal_won', payload);
    else if (type === 'deal_lost') await flowEventService.emit('deal_lost', payload);
    else await flowEventService.emit('deal_stage_changed', payload);
  } catch {
    // A flow-engine hiccup must never fail the stage move the user just made.
  }
}

export const dealsService = {
  /** Platform defaults + this workspace's own types, in display order. */
  /**
   * What this deal actually turned into (#378 C3) — quotes, orders and invoices, derived in SQL by
   * `get_deal_documents` so a fourth document type is added in one place rather than in N
   * components, and so the client cannot assemble a different answer from three queries.
   */
  async documents(dealId: string): Promise<Array<{
    kind: 'quote' | 'order' | 'invoice';
    id: string;
    number: string | null;
    status: string | null;
    total: number | null;
    currency: string | null;
    occurred_at: string;
  }>> {
    const { data, error } = await (supabase as any).rpc('get_deal_documents', { p_deal_id: dealId });
    if (error) throw error;
    return (data ?? []) as any[];
  },

  /**
   * Attach or detach a document. `deal_id` lives on the DOCUMENT, not on the deal, because one
   * deal legitimately produces several quotes (a revision, an option A/B), can be served by more
   * than one order and is billed by more than one invoice — a single `crm_deals.quote_id` would
   * have to pick one and be wrong about the rest.
   *
   * `dealId: null` detaches. The document itself is never touched otherwise.
   */
  async setDocumentDeal(kind: 'quote' | 'order' | 'invoice', documentId: string, dealId: string | null): Promise<void> {
    const table = kind === 'quote' ? 'quotes' : kind === 'order' ? 'orders' : 'invoices';
    const { error } = await (supabase as any).from(table).update({ deal_id: dealId }).eq('id', documentId);
    if (error) throw error;
  },

  async listTypes(workspaceId: string): Promise<DealType[]> {
    const { data, error } = await supabase
      .from('crm_deal_types')
      .select('id, workspace_id, key, label, subject_kind, sort, is_active')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .eq('is_active', true)
      .order('sort');
    if (error) throw error;
    return (data ?? []) as DealType[];
  },

  /** The stage set for one type — the board's columns. */
  async listStages(dealTypeId: string): Promise<DealStage[]> {
    const { data, error } = await supabase
      .from('crm_deal_stages')
      .select('id, deal_type_id, key, label, sort, is_won, is_lost')
      .eq('deal_type_id', dealTypeId)
      .order('sort');
    if (error) throw error;
    return (data ?? []) as DealStage[];
  },

  /** Deals of one type. RLS applies the property agent-scoping; no client-side filtering needed. */
  async listDeals(workspaceId: string, dealTypeId: string): Promise<Deal[]> {
    const { data, error } = await supabase
      .from('crm_deals')
      .select(DEAL_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('deal_type_id', dealTypeId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(withTaskCounts);
  },

  async createDeal(workspaceId: string, input: DealInput): Promise<Deal> {
    const { data: { user } } = await supabase.auth.getUser();
    // Allowlisted payload — never spread caller input into a write (invariant 8).
    const { data, error } = await supabase
      .from('crm_deals')
      .insert({
        workspace_id: workspaceId,
        deal_type_id: input.deal_type_id,
        stage: input.stage,
        title: input.title?.trim() || null,
        contact_id: input.contact_id ?? null,
        company_id: input.company_id ?? null,
        property_id: input.property_id ?? null,
        project_id: input.project_id ?? null,
        value: input.value ?? null,
        currency: input.currency || 'EUR',
        probability: input.probability ?? null,
        expected_close_date: input.expected_close_date ?? null,
        notes: input.notes ?? null,
        status: input.status ?? 'open',
        owner_user_id: user?.id ?? null,
        created_by: user?.id ?? null,
      })
      .select(DEAL_SELECT)
      .single();
    if (error) throw error;
    return withTaskCounts(data);
  },

  /** Close a deal as lost, with its reason. Separate from updateDeal so the event fires once. */
  async markLost(dealId: string, reason: string | null): Promise<Deal> {
    const deal = await this.updateDeal(dealId, { status: 'lost', lost_reason: reason });
    void emitDealEvent('deal_lost', deal);
    return deal;
  },

  async updateDeal(dealId: string, patch: Partial<DealInput>): Promise<Deal> {
    const payload: Record<string, unknown> = {};
    for (const k of ['stage', 'title', 'contact_id', 'company_id', 'property_id', 'project_id',
                     'value', 'currency', 'probability', 'expected_close_date', 'notes',
                     'status', 'lost_reason'] as const) {
      if (patch[k] !== undefined) payload[k] = patch[k];
    }
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('crm_deals').update(payload).eq('id', dealId).select(DEAL_SELECT).single();
    if (error) throw error;
    return withTaskCounts(data);
  },

  /**
   * Move a deal to a stage, and let a winning stage win the deal. Which stage wins is DATA
   * (`crm_deal_stages.is_won`) — the old board hardcoded `stage === 'completed'`, which is only
   * true for the property stage set.
   *
   * Emits a flow event rather than writing a notification: a seeded `system-default` flow
   * delivers it, so an admin can retarget or pause "tell me when a deal is won" without a deploy
   * (CLAUDE.md — never hardcode a user_notifications insert or an email-api call).
   */
  async moveToStage(dealId: string, stage: DealStage): Promise<Deal> {
    const deal = await this.updateDeal(dealId, {
      stage: stage.key,
      ...(stage.is_won ? { status: 'won' as const } : {}),
      ...(stage.is_lost ? { status: 'lost' as const } : {}),
    });
    void emitDealEvent(stage.is_won ? 'deal_won' : stage.is_lost ? 'deal_lost' : 'deal_stage_changed', deal, stage.label);
    return deal;
  },

  async deleteDeal(dealId: string): Promise<void> {
    const { error } = await supabase.from('crm_deals').delete().eq('id', dealId);
    if (error) throw error;
  },

  async listTasks(dealId: string): Promise<DealTask[]> {
    const { data, error } = await supabase
      .from('crm_deal_tasks').select('id, deal_id, title, done, due_date, created_at')
      .eq('deal_id', dealId).order('created_at');
    if (error) throw error;
    return (data ?? []) as DealTask[];
  },

  async addTask(workspaceId: string, dealId: string, title: string, dueDate?: string | null): Promise<DealTask> {
    const { data, error } = await supabase
      .from('crm_deal_tasks')
      .insert({ workspace_id: workspaceId, deal_id: dealId, title: title.trim(), due_date: dueDate ?? null })
      .select('id, deal_id, title, done, due_date, created_at').single();
    if (error) throw error;
    return data as DealTask;
  },

  async toggleTask(taskId: string, done: boolean): Promise<void> {
    const { error } = await supabase.from('crm_deal_tasks').update({ done }).eq('id', taskId);
    if (error) throw error;
  },

  async deleteTask(taskId: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_tasks').delete().eq('id', taskId);
    if (error) throw error;
  },
};

/**
 * Tenant-defined deal types (#311). Platform defaults (`workspace_id IS NULL`) are read-only;
 * a workspace admin manages its own. Creation goes through an RPC because a type and its stages
 * must land together — a type with no stages renders a board with no columns and no way in.
 */
export const dealTypesAdmin = {
  async create(
    workspaceId: string,
    label: string,
    subjectKind: DealType['subject_kind'],
    stages?: { key: string; label: string; is_won?: boolean; is_lost?: boolean }[],
  ): Promise<string> {
    const { data, error } = await supabase.rpc('crm_create_deal_type', {
      p_workspace_id: workspaceId,
      p_label: label,
      p_subject_kind: subjectKind,
      p_stages: (stages && stages.length ? stages : null) as unknown as Json,
    });
    if (error) throw error;
    return data as string;
  },

  async rename(typeId: string, label: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_types')
      .update({ label: label.trim(), updated_at: new Date().toISOString() }).eq('id', typeId);
    if (error) throw error;
  },

  /** Deleting a type in use is refused by the FK from crm_deals — surfaced as a readable message. */
  async remove(typeId: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_types').delete().eq('id', typeId);
    if (error) {
      if (error.code === '23503') throw new Error('This type still has deals. Move or delete them first.');
      throw error;
    }
  },

  async addStage(dealTypeId: string, label: string, sort: number): Promise<void> {
    const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '') || `stage_${sort}`;
    const { error } = await supabase.from('crm_deal_stages')
      .insert({ deal_type_id: dealTypeId, key, label: label.trim(), sort });
    if (error) throw error;
  },

  async updateStage(stageId: string, patch: { label?: string; sort?: number; is_won?: boolean; is_lost?: boolean }): Promise<void> {
    const { error } = await supabase.from('crm_deal_stages')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', stageId);
    if (error) throw error;
  },

  /** A stage holding deals is refused by the composite FK — the deals would have nowhere to sit. */
  async removeStage(stageId: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_stages').delete().eq('id', stageId);
    if (error) {
      if (error.code === '23503') throw new Error('This stage still holds deals. Move them to another stage first.');
      throw error;
    }
  },
};

/**
 * Deals attached to one party, for the contact/company record pages. Without this a deal could be
 * linked to a contact and then be invisible from that contact — the link existed in one direction
 * only, which is the same as not having it.
 *
 * Stage LABELS are resolved from each deal's own type (stages are per type), not from a constant.
 */
export interface PartyDeal extends Deal {
  type_label: string;
  stage_label: string;
}

export async function listDealsForParty(
  workspaceId: string,
  party: { contactId?: string | null; companyId?: string | null },
): Promise<PartyDeal[]> {
  const filters = [
    party.contactId ? `contact_id.eq.${party.contactId}` : null,
    party.companyId ? `company_id.eq.${party.companyId}` : null,
  ].filter(Boolean) as string[];
  if (!filters.length) return [];

  const { data, error } = await supabase
    .from('crm_deals')
    .select('id, workspace_id, deal_type_id, title, stage, status, value, currency, expected_close_date, property_id, contact_id, company_id, updated_at, type:crm_deal_types ( label )')
    .eq('workspace_id', workspaceId)
    .or(filters.join(','))
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (!rows.length) return [];

  // One stage lookup per distinct type — the label lives with the type that owns the stage.
  const typeIds = [...new Set(rows.map((r) => r.deal_type_id))];
  const { data: stageRows } = await supabase
    .from('crm_deal_stages').select('deal_type_id, key, label').in('deal_type_id', typeIds);
  const label = new Map((stageRows ?? []).map((s: any) => [`${s.deal_type_id}:${s.key}`, s.label as string]));

  return rows.map((r) => ({
    ...r,
    type_label: r.type?.label ?? '',
    stage_label: label.get(`${r.deal_type_id}:${r.stage}`) ?? r.stage,
  })) as PartyDeal[];
}

// ── Forecast ──────────────────────────────────────────────────────────────────────────────────
/** Already-derived weighted pipeline. Grouped BY CURRENCY: summing mixed currencies is a lie. */
export interface DealForecastRow {
  currency: string;
  open_count: number;
  open_value: number;
  weighted_value: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  avg_probability: number;
  /**
   * What the deals in this set actually BILLED, ex-VAT (#378 C3).
   *
   * NET on purpose, because `crm_deals.value` is a pipeline figure — what the work is worth, not
   * what the customer hands over including tax. Summing `invoices.total` here would make every
   * accuracy reading 24% high at the Greek standard rate, which is the worst kind of wrong: the
   * right order of magnitude, moving the right way, and flattering.
   *
   * This became answerable only once the chain carried `deal_id` onto the order and the invoice;
   * before that a won deal's paper trail stopped at the quote.
   */
  invoiced_net: number;
  /** The accuracy pair: `won_value` is what we said, this is what it billed. */
  won_invoiced_net: number;
  deals_with_invoices: number;
}

/**
 * Read the forecast. TypeScript FORMATS this and never recomputes `value × probability` — one
 * derivation per money quantity (tests/unit/moneyDerivation.test.ts). Deals with no probability
 * fall back to their stage's position in its own type's ladder, in SQL.
 */
export async function getDealForecast(workspaceId: string, dealTypeId?: string | null): Promise<DealForecastRow[]> {
  const { data, error } = await supabase.rpc('get_deal_forecast', {
    p_workspace_id: workspaceId,
    p_deal_type_id: dealTypeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DealForecastRow[];
}

/** Per-stage, per-currency pipeline value. One row per (stage, currency) — never a mixed sum. */
export interface DealStageTotalRow {
  stage: string;
  currency: string;
  deal_count: number;
  total_value: number;
}

/**
 * Read the per-stage column totals.
 *
 * The board used to do `col.reduce((t, d) => t + Number(d.value ?? 0), 0)` and label the result
 * with `col[0]?.currency` — so a stage holding a €10,000 deal and a $10,000 deal displayed
 * "€20,000" (#366 BU-5). Derived in SQL and grouped by currency for the same reason the forecast
 * above is: TypeScript formats a money quantity, it does not add one up.
 */
export async function getDealStageTotals(workspaceId: string, dealTypeId?: string | null): Promise<DealStageTotalRow[]> {
  const { data, error } = await (supabase as any).rpc('get_deal_stage_totals', {
    p_workspace_id: workspaceId,
    p_deal_type_id: dealTypeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DealStageTotalRow[];
}

// ── Deal team ─────────────────────────────────────────────────────────────────────────────────
/** A per-deal LABEL. Membership grants nothing — access lives in workspace_members.role. */
export const DEAL_TEAM_ROLES = [
  { value: 'account_executive', label: 'Account Executive' },
  { value: 'bdr', label: 'BDR' },
  { value: 'account_manager', label: 'Account Manager' },
  { value: 'solutions', label: 'Solutions' },
  { value: 'exec_sponsor', label: 'Exec Sponsor' },
  { value: 'contributor', label: 'Contributor' },
] as const;

export interface DealMember {
  id: string;
  deal_id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
}

export const dealTeam = {
  /**
   * Two queries, not an embed. `crm_deal_members.user_id` FKs to **auth.users**, so PostgREST has
   * no relationship to `user_profiles` and `profile:user_profiles(…)` is a 400 (PGRST200) — which
   * would have failed the whole card, silently, on every load.
   */
  async list(dealId: string): Promise<DealMember[]> {
    const { data, error } = await supabase
      .from('crm_deal_members')
      .select('id, deal_id, user_id, role')
      .eq('deal_id', dealId)
      .order('created_at');
    if (error) throw error;
    const rows = (data ?? []) as { id: string; deal_id: string; user_id: string; role: string }[];
    if (!rows.length) return [];

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, email')
      .in('user_id', rows.map((r) => r.user_id));
    const byUser = new Map<string, { full_name: string | null; email: string | null }>(
      (profiles ?? []).map((p: any) => [p.user_id as string, { full_name: p.full_name ?? null, email: p.email ?? null }]),
    );

    return rows.map((r) => ({
      ...r,
      full_name: byUser.get(r.user_id)?.full_name ?? null,
      email: byUser.get(r.user_id)?.email ?? null,
    }));
  },

  async add(dealId: string, userId: string, role = 'contributor'): Promise<void> {
    const { error } = await supabase.from('crm_deal_members').insert({ deal_id: dealId, user_id: userId, role });
    if (error) {
      if (error.code === '23505') throw new Error('They are already on this deal.');
      // The insert policy requires an ACTIVE member of the deal's workspace.
      if (error.code === '42501') throw new Error('That person is not an active member of this workspace.');
      throw error;
    }
  },

  async setRole(memberId: string, role: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_members').update({ role }).eq('id', memberId);
    if (error) throw error;
  },

  async remove(memberId: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_members').delete().eq('id', memberId);
    if (error) throw error;
  },
};

/** One deal by id, for the record page. Returns null when it is not visible to the caller. */
export async function getDeal(dealId: string): Promise<Deal | null> {
  const { data, error } = await supabase.from('crm_deals').select(DEAL_SELECT).eq('id', dealId).maybeSingle();
  if (error) throw error;
  return data ? withTaskCounts(data) : null;
}

// ── Stage-triggered email ─────────────────────────────────────────────────────────────────────
/**
 * "Email the contact when a deal reaches this stage" (#311).
 *
 * This is NOT a new delivery path — it writes an ordinary workspace-scoped FLOW, so the automation
 * is visible, editable and pausable under Flows like everything else, and the send goes through
 * the engine's `send_email` action with the workspace's own BYOK sender.
 *
 * Targeting relies on `flows.trigger_config`, which the engine now matches by equality against the
 * event payload — `{ deal_type_key, stage }` means "only this type, only this stage". Before that
 * filter existed a stage-triggered flow fired on EVERY move.
 *
 * `is_global: false` + `workspace_id` is what makes it per-workspace: the engine matches global
 * flows plus this workspace's own, never another tenant's.
 */
const STAGE_EMAIL_TAG = 'deal-stage-email';

export interface StageEmailRule {
  flow_id: string;
  stage_key: string;
  template_slug: string | null;
  subject: string | null;
  active: boolean;
}

export const stageEmail = {
  /** Existing rules for one deal type, keyed by stage. */
  async list(workspaceId: string, dealTypeKey: string): Promise<StageEmailRule[]> {
    const { data, error } = await supabase
      .from('flows')
      .select('id, status, trigger_config, graph_definition')
      .eq('workspace_id', workspaceId)
      .eq('trigger_type', 'deal_stage_changed')
      .contains('tags', [STAGE_EMAIL_TAG]);
    if (error) throw error;
    return ((data ?? []) as any[])
      .filter((f) => f.trigger_config?.deal_type_key === dealTypeKey)
      .map((f) => {
        const action = (f.graph_definition?.nodes ?? []).find((n: any) => n.id === 'email');
        return {
          flow_id: f.id,
          stage_key: String(f.trigger_config?.stage ?? ''),
          template_slug: action?.data?.config?.template_slug ?? null,
          subject: action?.data?.config?.subject ?? null,
          active: f.status === 'active',
        };
      });
  },

  /** Create or update the rule for one stage. */
  async upsert(
    workspaceId: string,
    dealType: { key: string; label: string },
    stage: { key: string; label: string },
    email: { subject: string; body: string; templateSlug?: string | null },
    existingFlowId?: string | null,
  ): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    const graph = {
      viewport: { x: 0, y: 0, zoom: 1 },
      edges: [{ id: 'e_trigger_email', source: 'trigger', target: 'email' }],
      nodes: [
        {
          id: 'trigger', type: 'triggerNode', position: { x: 0, y: 0 },
          data: {
            label: `Deal reaches ${stage.label}`, category: 'trigger', triggerType: 'deal_stage_changed',
            config: { deal_type_key: dealType.key, stage: stage.key },
          },
        },
        {
          id: 'email', type: 'actionNode', position: { x: 340, y: 0 },
          data: {
            label: 'Send Email', category: 'action', actionType: 'send_email',
            config: {
              // The engine skips a `to` that resolves to null or stays unresolved, and says why in
              // the run output — a deal whose contact has no email is a no-op, not a failed send.
              to: '{{trigger.data.contact_email}}',
              subject: email.subject,
              body: email.body,
              ...(email.templateSlug ? { template_slug: email.templateSlug } : {}),
              variables: {
                contact_name: '{{trigger.data.contact_name}}',
                deal_title: '{{trigger.data.deal_title}}',
                stage: '{{trigger.data.stage_label}}',
                value: '{{trigger.data.value}}',
                currency: '{{trigger.data.currency}}',
              },
            },
          },
        },
      ],
    };

    const row = {
      name: `${dealType.label}: email on ${stage.label}`,
      description: `Emails the deal's contact when it reaches ${stage.label}.`,
      trigger_type: 'deal_stage_changed',
      trigger_config: { deal_type_key: dealType.key, stage: stage.key },
      graph_definition: graph as unknown as Json,
      workspace_id: workspaceId,
      is_global: false,
      status: 'active',
      tags: [STAGE_EMAIL_TAG],
      updated_by: user?.id ?? null,
    };

    if (existingFlowId) {
      const { error } = await supabase.from('flows').update(row).eq('id', existingFlowId);
      if (error) throw error;
      return existingFlowId;
    }
    const { data, error } = await supabase
      .from('flows').insert({ ...row, created_by: user?.id ?? null }).select('id').single();
    if (error) throw error;
    return data.id as string;
  },

  /** Pausing deliberately lives on the Flows page, which owns run history and status for every
   *  automation — a second pause control here would be a second place to look. */
  async remove(flowId: string): Promise<void> {
    const { error } = await supabase.from('flows').delete().eq('id', flowId);
    if (error) throw error;
  },
};

// ── Pipeline analytics ────────────────────────────────────────────────────────────────────────
// Every figure below is DERIVED in SQL and only formatted here. Two implementations of
// "conversion rate" is how a dashboard ends up disagreeing with itself, and a funnel recomputed
// in the browser also has to re-derive which stage is further along — which the database already
// knows from `crm_deal_stages.sort`.
//
// Money always arrives grouped BY CURRENCY. A pipeline total is the easiest place in the app to
// add EUR to GBP by accident and produce a number that is true of nothing.

/** One row per stage, in board order. `conversion_pct` is null on the last stage. */
export interface DealFunnelRow {
  stage_key: string;
  label: string;
  sort: number;
  is_won: boolean;
  is_lost: boolean;
  /** Deals known to have reached this stage — derived from stage ORDER, so it works on day one. */
  reached: number;
  current_open: number;
  lost_here: number;
  /** Share of `reached` that went on to the next stage. Null at the end of the funnel. */
  conversion_pct: number | null;
}

export async function getDealStageFunnel(workspaceId: string, dealTypeId?: string | null): Promise<DealFunnelRow[]> {
  const { data, error } = await (supabase as any).rpc('get_deal_stage_funnel', {
    p_workspace_id: workspaceId,
    p_deal_type_id: dealTypeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DealFunnelRow[];
}

/**
 * Average time a deal spends in each stage.
 *
 * `sample_size` is part of the contract, not a debug field: an average over three deals is not a
 * trend, and a dashboard that shows "14.2 days" without saying it is three deals invites a
 * decision the data cannot support. Deals that existed before stage history was recorded are
 * excluded outright — the time they spent in earlier stages is not knowable, and filling it in
 * would put a confident wrong number on the page.
 */
export interface DealVelocityRow {
  stage_key: string;
  label: string;
  sort: number;
  avg_days: number | null;
  median_days: number | null;
  sample_size: number;
}

export async function getDealVelocity(workspaceId: string, dealTypeId?: string | null): Promise<DealVelocityRow[]> {
  const { data, error } = await (supabase as any).rpc('get_deal_velocity', {
    p_workspace_id: workspaceId,
    p_deal_type_id: dealTypeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DealVelocityRow[];
}

/** Created / won / lost per month, per currency. */
export interface DealOutcomeRow {
  month: string;
  currency: string;
  created_count: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  lost_value: number;
}

export async function getDealOutcomesByMonth(
  workspaceId: string,
  dealTypeId?: string | null,
  months = 12,
): Promise<DealOutcomeRow[]> {
  const { data, error } = await (supabase as any).rpc('get_deal_outcomes_by_month', {
    p_workspace_id: workspaceId,
    p_deal_type_id: dealTypeId ?? null,
    p_months: months,
  });
  if (error) throw error;
  return (data ?? []) as DealOutcomeRow[];
}

/** Per-owner totals. `win_rate_pct` is won / CLOSED — never won / total. */
export interface DealOwnerStatRow {
  owner_user_id: string | null;
  owner_name: string;
  currency: string;
  open_count: number;
  open_value: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  win_rate_pct: number | null;
}

export async function getDealOwnerStats(workspaceId: string, dealTypeId?: string | null): Promise<DealOwnerStatRow[]> {
  const { data, error } = await (supabase as any).rpc('get_deal_owner_stats', {
    p_workspace_id: workspaceId,
    p_deal_type_id: dealTypeId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as DealOwnerStatRow[];
}

// ── Stage history ─────────────────────────────────────────────────────────────────────────────
/**
 * The recorded moves on one deal, oldest first.
 *
 * Written by a database trigger (`trg_crm_deal_stage_event`), never by this client. A history the
 * client writes is a two-call pattern that loses the event when the tab closes between the calls,
 * and records whatever the client claimed rather than what the table actually did.
 */
export interface DealStageEvent {
  id: string;
  deal_id: string;
  from_stage: string | null;
  to_stage: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  /** 'backfill' rows were reconstructed when history was introduced — not observed moves. */
  source: 'trigger' | 'backfill';
  occurred_at: string;
}

export async function listDealStageEvents(dealId: string): Promise<DealStageEvent[]> {
  const { data, error } = await supabase
    .from('crm_deal_stage_events' as never)
    .select('id, deal_id, from_stage, to_stage, from_status, to_status, changed_by, source, occurred_at')
    .eq('deal_id', dealId)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as DealStageEvent[];
}
