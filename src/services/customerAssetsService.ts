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

/** Warranty state for display. `ends_on` is the only input — nothing is cached server-side. */
export function warrantyState(w: { starts_on: string; ends_on: string }): 'active' | 'expiring' | 'expired' | 'pending' {
  const today = new Date().toISOString().slice(0, 10);
  if (w.starts_on > today) return 'pending';
  if (w.ends_on < today) return 'expired';
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  return w.ends_on <= soon.toISOString().slice(0, 10) ? 'expiring' : 'active';
}

export const customerAssetsService = {
  list(filter: {
    customer_company_id?: string;
    customer_contact_id?: string;
    project_id?: string;
    status?: AssetStatus;
    limit?: number;
  } = {}) {
    return call<{ assets: CustomerAsset[] }>('list', filter).then((r) => r.assets);
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
    apply_defaults?: boolean;
  }) {
    return call<{ asset_id: string }>('register', input).then((r) => r.asset_id);
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
