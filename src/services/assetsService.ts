// Company Assets — cross-module shared service (mounted in BOTH Finance and HR, no dedicated page).
// Tracks owned/leased/financed company property (vehicles, phones, cards, laptops, equipment) and
// who currently holds each. Leased/financed assets link to a finance_recurring_expenses template so
// the recurring cost flows through the existing expense → supplier_bill machinery (we don't
// re-implement payments here).
//
// Follows the finance convention: direct RLS-gated supabase.from() reads/writes (see financeService).
// company_assets / asset_assignments aren't in the generated types yet, so we cast the client.
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export type AssetCategory = 'vehicle' | 'phone' | 'laptop' | 'payment_card' | 'equipment' | 'other';
export type AssetStatus = 'active' | 'in_repair' | 'retired' | 'returned';
export type AcquisitionType = 'owned' | 'leased' | 'financed';
export type DepreciationMethod = 'none' | 'straight_line';

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  vehicle: 'Vehicle',
  phone: 'Phone',
  laptop: 'Laptop',
  payment_card: 'Payment card',
  equipment: 'Equipment',
  other: 'Other',
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  active: 'Active',
  in_repair: 'In repair',
  retired: 'Retired',
  returned: 'Returned',
};

export const ACQUISITION_LABEL: Record<AcquisitionType, string> = {
  owned: 'Owned',
  leased: 'Leased',
  financed: 'Financed',
};

export interface AssetAssignment {
  id: string;
  assigned_at: string;
  returned_at: string | null;
  note: string | null;
  assignee_name: string | null;
  assignee_kind: 'employee' | 'contact' | null;
}

export interface CompanyAsset {
  id: string;
  workspace_id: string;
  category: AssetCategory;
  name: string;
  identifier: string | null;
  status: AssetStatus;
  acquisition_type: AcquisitionType;
  acquisition_cost: number | null;
  currency: string;
  acquired_at: string | null;
  supplier_company_id: string | null;
  supplier_name: string | null;
  recurring_expense_id: string | null;
  recurring_expense_label: string | null;
  finance_category_id: string | null;
  notes: string | null;
  // Depreciation (owned assets only). Straight-line; book value computed on read.
  depreciation_method: DepreciationMethod;
  useful_life_months: number | null;
  salvage_value: number;
  depreciation_start: string | null;
  book_value: number | null;          // computed: cost − accumulated depreciation
  monthly_depreciation: number | null; // computed: per-month straight-line amount
  created_at: string;
  updated_at: string;
  // Current holder (active assignment, returned_at IS NULL), resolved for display.
  current_holder: AssetAssignment | null;
}

export interface AssetInput {
  category: AssetCategory;
  name: string;
  identifier?: string | null;
  status?: AssetStatus;
  acquisition_type?: AcquisitionType;
  acquisition_cost?: number | null;
  currency?: string;
  acquired_at?: string | null;
  supplier_company_id?: string | null;
  recurring_expense_id?: string | null;
  finance_category_id?: string | null;
  notes?: string | null;
  depreciation_method?: DepreciationMethod;
  useful_life_months?: number | null;
  salvage_value?: number | null;
  depreciation_start?: string | null;
}

export interface EmployeeOption { id: string; name: string; }
export interface ContactOption { id: string; name: string; }
export interface RecurringExpenseOption { id: string; label: string; }
export interface CompanyOption { id: string; name: string; }

function contactName(c: any): string | null {
  if (!c) return null;
  return c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.billing_name || null;
}

/** Whole months elapsed between a start date and today (never negative). */
function monthsElapsed(startISO: string): number {
  const start = new Date(startISO);
  const now = new Date();
  if (isNaN(start.getTime()) || now < start) return 0;
  let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) m -= 1; // not a full month yet
  return Math.max(0, m);
}

/**
 * Straight-line book value for an owned asset.
 * monthly = (cost − salvage) / life; accumulated caps at (cost − salvage); book = cost − accumulated.
 * Returns nulls when depreciation doesn't apply / can't be computed.
 */
function computeDepreciation(row: any): { book: number | null; monthly: number | null } {
  if (row.depreciation_method !== 'straight_line') return { book: null, monthly: null };
  const cost = row.acquisition_cost;
  const life = row.useful_life_months;
  if (cost == null || !life || life <= 0) return { book: null, monthly: null };
  const salvage = row.salvage_value ?? 0;
  const depreciable = Math.max(0, cost - salvage);
  const monthly = depreciable / life;
  const start = row.depreciation_start || row.acquired_at;
  const elapsed = start ? monthsElapsed(start) : 0;
  const accumulated = Math.min(depreciable, elapsed * monthly);
  return { book: Math.round((cost - accumulated) * 100) / 100, monthly: Math.round(monthly * 100) / 100 };
}

class AssetsService {
  /** All company assets for a workspace, newest first, with current holder + supplier + lease label resolved. */
  async listAssets(workspaceId: string): Promise<CompanyAsset[]> {
    const { data, error } = await sb
      .from('company_assets')
      .select(`
        *,
        supplier:crm_companies(id, name),
        recurring:finance_recurring_expenses(id, description, cadence, subtotal_net, currency),
        assignments:asset_assignments(
          id, assigned_at, returned_at, note,
          employee:hr_employees(id, contact:crm_contacts(id, name, first_name, last_name, billing_name)),
          contact:crm_contacts(id, name, first_name, last_name, billing_name)
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return (data || []).map((row: any): CompanyAsset => {
      const active = (row.assignments || []).find((a: any) => !a.returned_at) || null;
      let holder: AssetAssignment | null = null;
      if (active) {
        const empName = contactName(active.employee?.contact);
        const conName = contactName(active.contact);
        holder = {
          id: active.id,
          assigned_at: active.assigned_at,
          returned_at: active.returned_at,
          note: active.note ?? null,
          assignee_name: empName || conName,
          assignee_kind: active.employee ? 'employee' : active.contact ? 'contact' : null,
        };
      }
      const rec = row.recurring;
      const recLabel = rec
        ? [rec.description, rec.subtotal_net != null ? `${rec.subtotal_net} ${rec.currency || ''}`.trim() : null, rec.cadence]
            .filter(Boolean).join(' · ')
        : null;
      const dep = computeDepreciation(row);
      return {
        id: row.id,
        workspace_id: row.workspace_id,
        category: row.category,
        name: row.name,
        identifier: row.identifier ?? null,
        status: row.status,
        acquisition_type: row.acquisition_type,
        acquisition_cost: row.acquisition_cost ?? null,
        currency: row.currency || 'EUR',
        acquired_at: row.acquired_at ?? null,
        supplier_company_id: row.supplier_company_id ?? null,
        supplier_name: row.supplier?.name ?? null,
        recurring_expense_id: row.recurring_expense_id ?? null,
        recurring_expense_label: recLabel,
        finance_category_id: row.finance_category_id ?? null,
        notes: row.notes ?? null,
        depreciation_method: row.depreciation_method ?? 'none',
        useful_life_months: row.useful_life_months ?? null,
        salvage_value: row.salvage_value ?? 0,
        depreciation_start: row.depreciation_start ?? null,
        book_value: dep.book,
        monthly_depreciation: dep.monthly,
        created_at: row.created_at,
        updated_at: row.updated_at,
        current_holder: holder,
      };
    });
  }

  async createAsset(workspaceId: string, input: AssetInput): Promise<string> {
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      workspace_id: workspaceId,
      category: input.category,
      name: input.name,
      identifier: input.identifier || null,
      status: input.status || 'active',
      acquisition_type: input.acquisition_type || 'owned',
      acquisition_cost: input.acquisition_cost ?? null,
      currency: input.currency || 'EUR',
      acquired_at: input.acquired_at || null,
      supplier_company_id: input.supplier_company_id || null,
      recurring_expense_id: input.recurring_expense_id || null,
      finance_category_id: input.finance_category_id || null,
      notes: input.notes || null,
      depreciation_method: input.depreciation_method || 'none',
      useful_life_months: input.useful_life_months ?? null,
      salvage_value: input.salvage_value ?? 0,
      depreciation_start: input.depreciation_start || null,
      created_by: auth?.user?.id ?? null,
    };
    const { data, error } = await sb.from('company_assets').insert(payload).select('id').single();
    if (error) throw error;
    return data.id;
  }

  async updateAsset(id: string, patch: Partial<AssetInput>): Promise<void> {
    const { error } = await sb.from('company_assets').update(patch).eq('id', id);
    if (error) throw error;
  }

  async deleteAsset(id: string): Promise<void> {
    const { error } = await sb.from('company_assets').delete().eq('id', id);
    if (error) throw error;
  }

  /** Assign to an employee OR a contact. Closes any current active assignment first (one holder at a time). */
  async assignAsset(
    workspaceId: string,
    assetId: string,
    to: { employeeId?: string | null; contactId?: string | null; note?: string | null },
  ): Promise<void> {
    if (!to.employeeId && !to.contactId) throw new Error('Pick an employee or a contact to assign to.');
    await this.returnAsset(assetId); // idempotent: no-op if nothing active
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await sb.from('asset_assignments').insert({
      workspace_id: workspaceId,
      asset_id: assetId,
      assignee_employee_id: to.employeeId || null,
      assignee_contact_id: to.employeeId ? null : (to.contactId || null),
      note: to.note || null,
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  }

  /** Close the current active assignment for an asset (marks returned). No-op if none active. */
  async returnAsset(assetId: string): Promise<void> {
    const { error } = await sb
      .from('asset_assignments')
      .update({ returned_at: new Date().toISOString() })
      .eq('asset_id', assetId)
      .is('returned_at', null);
    if (error) throw error;
  }

  /** Employees for the assign dropdown (name resolved via linked CRM contact). */
  async listEmployees(workspaceId: string): Promise<EmployeeOption[]> {
    const { data, error } = await sb
      .from('hr_employees')
      .select('id, contact:crm_contacts(name, first_name, last_name, billing_name)')
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return (data || [])
      .map((e: any) => ({ id: e.id, name: contactName(e.contact) || 'Unnamed employee' }))
      .sort((a: EmployeeOption, b: EmployeeOption) => a.name.localeCompare(b.name));
  }

  /** CRM contacts for the assign dropdown (e.g. an external contractor holding a company phone). */
  async listContacts(workspaceId: string): Promise<ContactOption[]> {
    const { data, error } = await sb
      .from('crm_contacts')
      .select('id, name, first_name, last_name, billing_name')
      .eq('workspace_id', workspaceId)
      .limit(500);
    if (error) throw error;
    return (data || [])
      .map((c: any) => ({ id: c.id, name: contactName(c) || 'Unnamed contact' }))
      .sort((a: ContactOption, b: ContactOption) => a.name.localeCompare(b.name));
  }

  /** CRM companies for the supplier / leasing-company picker. */
  async listCompanies(workspaceId: string): Promise<CompanyOption[]> {
    const { data, error } = await sb
      .from('crm_companies')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .limit(500);
    if (error) throw error;
    return (data || [])
      .map((c: any) => ({ id: c.id, name: c.name || 'Unnamed company' }))
      .sort((a: CompanyOption, b: CompanyOption) => a.name.localeCompare(b.name));
  }

  /** Active recurring-expense templates, for linking a lease/plan cost to an asset. */
  async listRecurringExpenses(workspaceId: string): Promise<RecurringExpenseOption[]> {
    const { data, error } = await sb
      .from('finance_recurring_expenses')
      .select('id, description, cadence, subtotal_net, currency, is_active')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      label: [r.description, r.subtotal_net != null ? `${r.subtotal_net} ${r.currency || ''}`.trim() : null, r.cadence]
        .filter(Boolean).join(' · '),
    }));
  }
}

export const assetsService = new AssetsService();
