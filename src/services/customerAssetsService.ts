/**
 * Installed base (#343) — a customer's equipment, its warranties, and its recurring service plans.
 *
 * Everything here is a thin call into `customer-assets-api`. Note what is NOT here: any
 * computation of when a plan is next due. That answer is a row (the plan's single open service
 * event) served by the `customer_asset_service_due` view — re-deriving it on the client would be
 * a second copy of a derived quantity, which is the bug shape CLAUDE.md's derivation rule exists
 * to prevent. Format the server's answer; never recompute it.
 */
import { supabase } from '@/integrations/supabase/client';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { toLocalISODate, todayLocalISO } from '@/utils/datetime';

export type AssetStatus = 'active' | 'removed' | 'replaced' | 'decommissioned';
export type WarrantyKind = 'manufacturer' | 'extended' | 'installer' | 'insurance';
export type ServiceEventStatus = 'due' | 'completed' | 'skipped';

export interface CustomerAsset {
  id: string;
  workspace_id: string;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  project_id: string | null;
  room_id: string | null;
  product_id: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  quantity: number;
  status: AssetStatus;
  purchased_on: string | null;
  installed_on: string | null;
  location_note: string | null;
  notes: string | null;
  source_order_id: string | null;
  source_order_item_id: string | null;
  supplier_company_id: string | null;
  created_at: string;
  updated_at: string;
  /** The order this unit was sold on, embedded by the API. Null for a manually registered unit. */
  source_order?: { id: string; order_number: string | null; order_type: string } | null;
  /** Cover periods, embedded by `list` so the register can show them without a call per row. */
  warranties?: Array<Pick<AssetWarranty, 'id' | 'kind' | 'starts_on' | 'ends_on'>>;
}

/**
 * "Starts on X, runs N months — when does it end?", answered by the DATABASE.
 *
 * The obvious client-side `d.setMonth(d.getMonth() + n)` is a second implementation of the
 * expression `apply_asset_service_defaults` uses when it opens a manufacturer warranty from
 * `products.default_warranty_months`, and the two disagree on real inputs: 2026-01-31 + 1 month is
 * 2026-02-28 in Postgres and 2026-03-03 in JavaScript. A cover end date is a date the customer can
 * hold us to, and a wrong date is a valid date — nothing downstream would ever notice the drift.
 * So the client asks; it does not calculate. Null when either input is missing or months <= 0.
 */
export async function warrantyEndDate(startsOn: string, months: number): Promise<string | null> {
  if (!startsOn || !Number.isFinite(months) || months <= 0) return null;
  const { data, error } = await supabase.rpc('warranty_end_date', {
    p_start: startsOn,
    p_months: Math.trunc(months),
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * The cover to NAME for a unit: the one running longest that has not expired.
 *
 * A unit can hold a manufacturer period and an extended one at once, and what the customer can
 * hold us to is whichever ends last — reporting the first row would show a lapsed manufacturer
 * year on a unit still covered for four more. Every surface that says "covered to …" reads this,
 * so the answer is picked once.
 */
export function activeCover(
  warranties: Array<Pick<AssetWarranty, 'id' | 'kind' | 'starts_on' | 'ends_on'>> | null | undefined,
): Pick<AssetWarranty, 'id' | 'kind' | 'starts_on' | 'ends_on'> | null {
  const today = todayLocalISO();
  return (warranties ?? [])
    .filter((w) => w.ends_on >= today)
    .sort((a, b) => b.ends_on.localeCompare(a.ends_on))[0] ?? null;
}

/** One unit registered off an order, with its cover — what an order line needs to describe itself. */
export interface OrderAssetRow {
  id: string;
  name: string;
  product_id: string | null;
  source_order_id: string | null;
  source_order_item_id: string | null;
  status: AssetStatus;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  warranties: Array<Pick<AssetWarranty, 'id' | 'kind' | 'starts_on' | 'ends_on'>>;
}

export interface AssetWarranty {
  id: string;
  workspace_id: string;
  asset_id: string;
  kind: WarrantyKind;
  provider_company_id: string | null;
  provider_name: string | null;
  policy_number: string | null;
  starts_on: string;
  ends_on: string;
  coverage_notes: string | null;
  document_bucket: string | null;
  document_path: string | null;
  remind_days_before: number[];
  created_at: string;
}

export interface AssetServicePlan {
  id: string;
  workspace_id: string;
  asset_id: string;
  title: string;
  instructions: string | null;
  interval_months: number | null;
  interval_days: number | null;
  lead_days: number;
  assignee_user_id: string | null;
  notify_internal: boolean;
  notify_customer: boolean;
  is_active: boolean;
  source_default_id: string | null;
  created_at: string;
}

export interface AssetServiceEvent {
  id: string;
  workspace_id: string;
  plan_id: string;
  asset_id: string;
  due_on: string;
  status: ServiceEventStatus;
  completed_on: string | null;
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  cost: number | null;
  notes: string | null;
  reminded_at: string | null;
  overdue_reminded_at: string | null;
}

/** A row of `customer_asset_service_due` — the open occurrence, with enough context to act. */
export interface ServiceDueRow {
  event_id: string;
  workspace_id: string;
  due_on: string;
  is_overdue: boolean;
  days_until_due: number;
  is_within_lead_time: boolean;
  plan_id: string;
  plan_title: string;
  instructions: string | null;
  lead_days: number;
  assignee_user_id: string | null;
  notify_internal: boolean;
  notify_customer: boolean;
  asset_id: string;
  asset_name: string;
  serial_number: string | null;
  location_note: string | null;
  asset_status: AssetStatus;
  project_id: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  project_name: string | null;
}

/**
 * A row of `customer_asset_service_history` — work that actually happened. It outlives the plan
 * that produced it: deleting a schedule sets `plan_id` to null but keeps `plan_title`, so the
 * ledger still reads "Clean the filters, done 2026-05-02, EUR 45".
 */
export interface ServiceHistoryRow {
  event_id: string;
  workspace_id: string;
  status: 'completed' | 'skipped';
  due_on: string;
  completed_on: string | null;
  happened_on: string;
  was_late: boolean;
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  cost: number | null;
  notes: string | null;
  linked_order_id: string | null;
  plan_id: string | null;
  plan_title: string;
  plan_removed: boolean;
  asset_id: string;
  asset_name: string;
  serial_number: string | null;
  location_note: string | null;
  project_id: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  customer_name: string | null;
  project_name: string | null;
}

export interface ProductServiceDefault {
  id: string;
  workspace_id: string;
  product_id: string | null;
  product_category: string | null;
  title: string;
  instructions: string | null;
  interval_months: number | null;
  interval_days: number | null;
  lead_days: number;
  notify_internal: boolean;
  notify_customer: boolean;
  position: number;
  is_active: boolean;
}

export interface AssetDetail {
  asset: CustomerAsset;
  warranties: AssetWarranty[];
  plans: AssetServicePlan[];
  events: AssetServiceEvent[];
}

async function resolveWorkspaceId(explicit?: unknown): Promise<string> {
  if (explicit) return String(explicit);
  const { data: { user } } = await supabase.auth.getUser();
  const id = getActiveWorkspaceId(user?.id);
  if (!id) throw new Error('No active workspace');
  return id;
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const workspaceId = await resolveWorkspaceId(payload.workspace_id);
  const { data, error } = await supabase.functions.invoke('customer-assets-api', {
    body: { action, ...payload, workspace_id: workspaceId },
  });
  if (error) {
    const ctx = (error as { context?: { error?: string } }).context;
    throw new Error(ctx?.error || error.message || 'Equipment request failed');
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Every human-readable interval reads through here, so "every 3 months" is worded once. */
export function describeInterval(plan: { interval_months: number | null; interval_days: number | null }): string {
  if (plan.interval_months) {
    if (plan.interval_months === 12) return 'Yearly';
    if (plan.interval_months === 1) return 'Monthly';
    return `Every ${plan.interval_months} months`;
  }
  if (plan.interval_days) {
    if (plan.interval_days === 7) return 'Weekly';
    return `Every ${plan.interval_days} days`;
  }
  return '—';
}

/**
 * Warranty state for display. `ends_on` is the only input — nothing is cached server-side.
 *
 * "Today" is the VIEWER'S calendar day (#366 BU-12). It used to be
 * `new Date().toISOString().slice(0, 10)`, which is the UTC day, so a warranty ending yesterday
 * still read `active` to a Greek operator until 03:00 — and one starting today read `pending`.
 *
 * Deliberately NOT pushed into SQL, which is where the audit pointed: the database session runs
 * in UTC, so `current_date` there is the same defect one layer down. A workspace-pinned business
 * timezone would make a server-side answer meaningful; until that exists, the operator's own
 * calendar is the only frame that matches what "expired today" means to them.
 */
export function warrantyState(w: { starts_on: string; ends_on: string }): 'active' | 'expiring' | 'expired' | 'pending' {
  const today = todayLocalISO();
  if (w.starts_on > today) return 'pending';
  if (w.ends_on < today) return 'expired';
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  return w.ends_on <= toLocalISODate(soon) ? 'expiring' : 'active';
}

export const customerAssetsService = {
  list(filter: {
    customer_company_id?: string;
    customer_contact_id?: string;
    project_id?: string;
    source_order_id?: string;
    status?: AssetStatus;
    limit?: number;
  } = {}) {
    return call<{ assets: CustomerAsset[] }>('list', filter).then((r) => r.assets);
  },

  /** Units registered off one order, with their cover periods — one call for a whole order page. */
  listByOrder(orderId: string) {
    return call<{ assets: OrderAssetRow[] }>('by_order', { order_id: orderId }).then((r) => r.assets);
  },

  get(assetId: string) {
    return call<AssetDetail>('get', { asset_id: assetId });
  },

  register(input: {
    name: string;
    customer_company_id?: string | null;
    customer_contact_id?: string | null;
    project_id?: string | null;
    room_id?: string | null;
    product_id?: string | null;
    brand?: string | null;
    model?: string | null;
    serial_number?: string | null;
    quantity?: number;
    purchased_on?: string | null;
    installed_on?: string | null;
    location_note?: string | null;
    notes?: string | null;
    supplier_company_id?: string | null;
    source_order_id?: string | null;
    source_order_item_id?: string | null;
    apply_defaults?: boolean;
  }) {
    return call<{ asset_id: string }>('register', input).then((r) => r.asset_id);
  },

  /**
   * Put an order line under warranty: register the unit against that order + line, then make its
   * manufacturer cover say what the operator chose.
   *
   * The two steps cannot collapse into one. `register` runs `apply_asset_service_defaults`, which
   * already opens a manufacturer warranty when the product declares `default_warranty_months` — so
   * inserting ours unconditionally would leave the unit with two manufacturer covers and no way to
   * tell which one the reminders mean. We adopt the row the defaults created when there is one and
   * only insert when there is not.
   *
   * `asset_id` is REQUIRED when the line already produced a unit. `register_customer_asset` is a
   * plain insert with no conflict handling, and `uq_customer_assets_order_item` is unique on
   * `source_order_item_id` — so registering a second time raises 23505 and the whole call fails.
   * Editing the cover on an already-registered line is the common case (that is what the "covered
   * to …" button opens), so this path must update rather than re-register.
   *
   * `ends_on` is the operator's answer and is passed through, never recomputed here: a cover period
   * is a date the customer can hold us to, not a number this client is entitled to derive.
   */
  async warrantOrderLine(input: {
    order_id: string;
    order_item_id: string;
    /** The unit this line already produced, when it has one. Omit to register a new one. */
    asset_id?: string | null;
    name: string;
    customer_company_id?: string | null;
    customer_contact_id?: string | null;
    project_id?: string | null;
    product_id?: string | null;
    supplier_company_id?: string | null;
    quantity?: number;
    purchased_on?: string | null;
    starts_on: string;
    ends_on: string;
    kind?: WarrantyKind;
    policy_number?: string | null;
  }): Promise<{ asset_id: string; warranty: AssetWarranty }> {
    const kind = input.kind ?? 'manufacturer';
    const assetId = input.asset_id ?? await this.register({
      name: input.name,
      customer_company_id: input.customer_company_id ?? null,
      customer_contact_id: input.customer_contact_id ?? null,
      project_id: input.project_id ?? null,
      product_id: input.product_id ?? null,
      supplier_company_id: input.supplier_company_id ?? null,
      quantity: input.quantity ?? 1,
      purchased_on: input.purchased_on ?? null,
      installed_on: input.starts_on,
      source_order_id: input.order_id,
      source_order_item_id: input.order_item_id,
      apply_defaults: true,
    });

    const detail = await this.get(assetId);
    const existing = detail.warranties.find((w) => w.kind === kind) ?? null;
    const warranty = await this.saveWarranty({
      ...(existing ? { warranty_id: existing.id } : { asset_id: assetId }),
      kind,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      ...(input.policy_number ? { policy_number: input.policy_number } : {}),
    });
    return { asset_id: assetId, warranty };
  },

  update(assetId: string, patch: Partial<Pick<CustomerAsset,
    'name' | 'brand' | 'model' | 'serial_number' | 'quantity' | 'status' | 'purchased_on' |
    'installed_on' | 'location_note' | 'notes' | 'project_id' | 'room_id' | 'supplier_company_id'>>) {
    return call<{ asset: CustomerAsset }>('update', { asset_id: assetId, ...patch }).then((r) => r.asset);
  },

  /**
   * Hard delete. Refused by the database once the unit has any logged service — retiring it
   * (`status: 'removed' | 'replaced' | 'decommissioned'`) is what you almost always want, and
   * keeps the history. The API returns 409 with a message naming that alternative.
   */
  remove(assetId: string) {
    return call<{ success: true }>('delete', { asset_id: assetId });
  },

  /** Retire a unit without losing anything. */
  retire(assetId: string, status: Exclude<AssetStatus, 'active'> = 'removed') {
    return this.update(assetId, { status });
  },

  /** Re-run the product defaults against an asset registered before those defaults existed. */
  applyDefaults(assetId: string) {
    return call<{ created: number }>('apply_defaults', { asset_id: assetId }).then((r) => r.created);
  },

  saveWarranty(input: Partial<AssetWarranty> & { asset_id?: string; warranty_id?: string }) {
    return call<{ warranty: AssetWarranty }>('warranty.save', input).then((r) => r.warranty);
  },

  /**
   * Attach (or replace) the warranty certificate. Goes through the API rather than the storage
   * client: the bucket is private and service-role-write, so ownership is proven server-side
   * instead of by widening client storage policies. 5 MB cap, PDF or image.
   */
  async uploadWarrantyDocument(warrantyId: string, file: File) {
    const data_base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file'));
      reader.onload = () => {
        const r = String(reader.result ?? '');
        resolve(r.slice(r.indexOf(',') + 1));
      };
      reader.readAsDataURL(file);
    });
    return call<{ warranty: AssetWarranty }>('warranty.upload_document', {
      warranty_id: warrantyId,
      filename: file.name,
      content_type: file.type,
      data_base64,
    }).then((r) => r.warranty);
  },

  /** A short-lived signed URL, minted per read — the row never stores one. */
  warrantyDocumentUrl(warrantyId: string) {
    return call<{ url: string }>('warranty.document_url', { warranty_id: warrantyId }).then((r) => r.url);
  },

  deleteWarrantyDocument(warrantyId: string) {
    return call<{ success: true }>('warranty.delete_document', { warranty_id: warrantyId });
  },

  deleteWarranty(warrantyId: string) {
    return call<{ success: true }>('warranty.delete', { warranty_id: warrantyId });
  },

  savePlan(input: Partial<AssetServicePlan> & { asset_id?: string; plan_id?: string; anchor_date?: string }) {
    return call<{ plan: AssetServicePlan }>('plan.save', input).then((r) => r.plan);
  },

  deletePlan(planId: string) {
    return call<{ success: true }>('plan.delete', { plan_id: planId });
  },

  /** The worklist. Open occurrences only — one per active plan, by construction. */
  serviceDue(filter: {
    customer_company_id?: string;
    customer_contact_id?: string;
    project_id?: string;
    asset_id?: string;
    within_lead_time?: boolean;
    limit?: number;
  } = {}) {
    return call<{ due: ServiceDueRow[] }>('service.due', filter).then((r) => r.due);
  },

  /** Everything already done for a customer, across every unit they own. */
  serviceHistory(filter: {
    customer_company_id?: string;
    customer_contact_id?: string;
    project_id?: string;
    asset_id?: string;
    limit?: number;
  } = {}) {
    return call<{ history: ServiceHistoryRow[] }>('service.history', filter).then((r) => r.history);
  },

  /**
   * Mark an occurrence done (or skipped). The server opens the next one, anchored on the date
   * the work actually happened — that single RPC is the only thing that advances a plan.
   */
  completeService(eventId: string, input: {
    completed_on?: string;
    notes?: string;
    cost?: number;
    performed_by_name?: string;
  } = {}) {
    return call<{ next_event_id: string | null }>('service.complete', { event_id: eventId, ...input });
  },

  skipService(eventId: string, notes?: string) {
    return call<{ next_event_id: string | null }>('service.skip', { event_id: eventId, notes });
  },

  listDefaults(filter: { product_id?: string; product_category?: string } = {}) {
    return call<{ defaults: ProductServiceDefault[] }>('defaults.list', filter).then((r) => r.defaults);
  },

  saveDefault(input: Partial<ProductServiceDefault> & { default_id?: string }) {
    return call<{ default: ProductServiceDefault }>('defaults.save', input).then((r) => r.default);
  },

  deleteDefault(defaultId: string) {
    return call<{ success: true }>('defaults.delete', { default_id: defaultId });
  },
};
