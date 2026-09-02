/**
 * Time-tracking & billing. Log billable
 * hours against a customer, then turn the unbilled entries into a draft invoice (one line per
 * entry) that flows through the normal issue → myDATA path.
 */
import { supabase } from '@/integrations/supabase/client';

export interface TimeEntry {
  id: string;
  workspace_id: string;
  user_id: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  /** Optional project the hours were worked on (WS1 #285). Independent of the customer columns. */
  project_id: string | null;
  /** Optional task within `project_id`. Requires `project_id` (enforced by a DB trigger). */
  task_id: string | null;
  work_date: string;
  minutes: number;
  hourly_rate: number;
  description: string;
  is_billable: boolean;
  /** Cost code — the job-breakdown classification `get_project_cost_by_code` groups labour by. */
  cost_code_id: string | null;
  billed_invoice_id: string | null;
  billed_at: string | null;
  created_at: string;
}

export interface NewTimeEntry {
  customer_company_id?: string | null;
  customer_contact_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
  work_date: string;
  minutes: number;
  hourly_rate: number;
  description: string;
  is_billable?: boolean;
  /** How this labour is classified in the job's cost breakdown. */
  cost_code_id?: string | null;
  /**
   * Whose hours these are when the worker has NO platform login (#378 N1) — an `hr_employees` id.
   * Mutually exclusive with the signed-in user, enforced by `time_entries_single_worker_ck`:
   * recording somebody else's hours must not also claim they are yours.
   *
   * N2 made a task assignable to such a person; until this existed the schedule could name
   * somebody who could never appear on that job's labour cost.
   */
  employee_id?: string | null;
}

// The roll-up shapes and their parse live in a pure module so they can be unit-tested without the
// Supabase client. Re-exported here so existing importers are unaffected.
// Re-export is not an import: the service CALLS these too.
import { parseProjectLabor, type ProjectLabor } from '@/modules/finance/utils/projectLabor';

export {
  parseProjectLabor, EMPTY_PROJECT_LABOR,
  type ProjectLaborByUser, type ProjectLaborWorker, type ProjectLaborPayroll, type ProjectLabor,
} from '@/modules/finance/utils/projectLabor';

import { round2 } from '@/utils/decimal';

// Aggregated time reports.
export interface TimeReportUserRow {
  user_id: string | null; name: string; entries: number;
  hours: number; billable_hours: number; value: number; billed_value: number;
}
export interface TimeReportContactRow {
  key: string; name: string; entries: number;
  hours: number; value: number; billed_value: number; unbilled_value: number;
}

/**
 * The RPCs raise tagged errors for the two things an operator can actually act on; everything
 * else is passed through as it came. `raise exception` reaches PostgREST as a bare message, so
 * the tag is the only thing distinguishing "someone else billed these while you were looking"
 * from a generic failure.
 */
export function billingErrorMessage(raw: string): string {
  if (raw.includes('attributed_to_another_customer')) {
    return 'Some of the selected entries are logged against a different customer. Bill each customer separately.';
  }
  if (raw.includes('concurrent_billing')) {
    return 'Someone else billed part of this selection just now. Nothing was invoiced — reload and try again.';
  }
  if (raw.includes('mixed_currency')) {
    return 'The selected expenses are in more than one currency. Bill each currency separately.';
  }
  return raw;
}

export const timeTrackingService = {
  async list(workspaceId: string, opts?: { onlyUnbilled?: boolean; customerId?: string; from?: string; to?: string; projectId?: string }): Promise<TimeEntry[]> {
    let q = supabase.from('time_entries').select('*').eq('workspace_id', workspaceId).order('work_date', { ascending: false });
    if (opts?.onlyUnbilled) q = q.is('billed_invoice_id', null).eq('is_billable', true);
    if (opts?.from) q = q.gte('work_date', opts.from);
    if (opts?.to) q = q.lte('work_date', opts.to);
    if (opts?.projectId) q = q.eq('project_id', opts.projectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TimeEntry[];
  },

  /** Entries logged against one project, newest first. */
  async listByProject(workspaceId: string, projectId: string): Promise<TimeEntry[]> {
    return this.list(workspaceId, { projectId });
  },

  /**
   * A project's labor roll-up, derived in SQL. Deliberately an RPC and not a client-side sum:
   * labor cost feeds `get_project_pnl`, and two independent implementations of the same money
   * quantity is exactly the drift this codebase has been bitten by before.
   */
  async getProjectLabor(projectId: string): Promise<ProjectLabor> {
    const { data, error } = await (supabase as any).rpc('get_project_labor', { p_project_id: projectId });
    if (error) throw error;
    return parseProjectLabor(data);
  },

  async create(workspaceId: string, entry: NewTimeEntry): Promise<TimeEntry> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('time_entries').insert({
      workspace_id: workspaceId,
      // One worker or the other, never both — the CHECK refuses it, and claiming a
      // subcontractor's hours as your own would put them in the wrong person's "my time".
      user_id: entry.employee_id ? null : (auth.user?.id ?? null),
      employee_id: entry.employee_id ?? null,
      customer_company_id: entry.customer_company_id ?? null,
      customer_contact_id: entry.customer_contact_id ?? null,
      project_id: entry.project_id ?? null,
      task_id: entry.task_id ?? null,
      work_date: entry.work_date,
      minutes: entry.minutes,
      hourly_rate: entry.hourly_rate,
      description: entry.description,
      is_billable: entry.is_billable ?? true,
      cost_code_id: entry.cost_code_id ?? null,
      created_by: auth.user?.id ?? null,
    }).select().single();
    if (error) throw error;
    return data as TimeEntry;
  },

  async update(id: string, patch: Partial<Pick<TimeEntry, 'work_date' | 'minutes' | 'hourly_rate' | 'description' | 'is_billable' | 'cost_code_id'>>): Promise<void> {
    const { error } = await supabase.from('time_entries').update(patch).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('time_entries').delete().eq('id', id).is('billed_invoice_id', null);
    if (error) throw error;
  },

  /**
   * Bill a set of unbilled entries (all for the SAME customer) → one draft invoice with a line
   * per entry (quantity = hours, unit_price = hourly_rate). Returns the draft invoice id; the
   * caller routes the user to the invoice editor to set classifications + issue.
   */
  async billToInvoice(
    workspaceId: string,
    customer: { type: 'company' | 'contact'; id: string } | null,
    entryIds: string[],
    vatRate: number,
  ): Promise<string> {
    if (entryIds.length === 0) throw new Error('No entries selected');
    /**
     * ONE transaction (#351 S4).
     *
     * This used to be four round trips — allocate a number, insert the invoice, insert the
     * lines, stamp the entries. A failure on the last one left an invoice that exists beside
     * entries that still read unbilled, and the natural retry billed the same hours twice.
     *
     * The RPC also applies the two filters this function's own doc comment claimed and its
     * query never did (#351 S2): `is_billable`, and a refusal when a selected entry is logged
     * against a DIFFERENT customer than the one being invoiced. The tab happens to filter both
     * today; the next caller of this service would not have.
     */
    const { data, error } = await supabase.rpc('bill_time_entries_to_invoice', {
      p_workspace_id: workspaceId,
      p_customer_company_id: customer?.type === 'company' ? customer.id : null,
      p_customer_contact_id: customer?.type === 'contact' ? customer.id : null,
      p_entry_ids: entryIds,
      p_vat_rate: vatRate,
    });
    if (error) throw new Error(billingErrorMessage(error.message));
    if (!data) throw new Error('The invoice was not created');
    return data as string;
  },

  /**
   * Time reports for a date range, aggregated per user and per contact.
   * Computed client-side from `time_entries`; volumes per workspace are small
   * enough to not need an RPC.
   */
  async report(workspaceId: string, from: string, to: string): Promise<{ byUser: TimeReportUserRow[]; byContact: TimeReportContactRow[] }> {
    const entries = await this.list(workspaceId, { from, to });

    // resolve user + party display names
    const userIds = [...new Set(entries.map((e) => e.user_id).filter(Boolean) as string[])];
    const compIds = [...new Set(entries.map((e) => e.customer_company_id).filter(Boolean) as string[])];
    const contIds = [...new Set(entries.map((e) => e.customer_contact_id).filter(Boolean) as string[])];
    const userName: Record<string, string> = {};
    const partyName: Record<string, string> = {};
    await Promise.all([
      userIds.length ? supabase.from('user_profiles').select('id, full_name, email').in('id', userIds)
        .then(({ data }) => { for (const u of data ?? []) userName[(u as any).id] = (u as any).full_name || (u as any).email || (u as any).id; }) : Promise.resolve(),
      compIds.length ? supabase.from('crm_companies').select('id, name').in('id', compIds)
        .then(({ data }) => { for (const c of data ?? []) partyName[`c:${(c as any).id}`] = (c as any).name ?? ''; }) : Promise.resolve(),
      contIds.length ? supabase.from('crm_contacts').select('id, name, first_name, last_name').in('id', contIds)
        .then(({ data }) => { for (const c of data ?? []) partyName[`p:${(c as any).id}`] = (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' '); }) : Promise.resolve(),
    ]);

    const byUserMap = new Map<string, TimeReportUserRow>();
    const byContactMap = new Map<string, TimeReportContactRow>();
    for (const e of entries) {
      const hours = round2(e.minutes / 60);
      const value = round2(hours * Number(e.hourly_rate));
      const isBilled = !!e.billed_invoice_id;

      const uk = e.user_id ?? '∅';
      const u = byUserMap.get(uk) ?? { user_id: e.user_id, name: e.user_id ? (userName[e.user_id] || e.user_id.slice(0, 8)) : 'Unassigned', entries: 0, hours: 0, billable_hours: 0, value: 0, billed_value: 0 };
      u.entries += 1; u.hours = round2(u.hours + hours); if (e.is_billable) u.billable_hours = round2(u.billable_hours + hours);
      u.value = round2(u.value + value); if (isBilled) u.billed_value = round2(u.billed_value + value);
      byUserMap.set(uk, u);

      const pk = e.customer_company_id ? `c:${e.customer_company_id}` : e.customer_contact_id ? `p:${e.customer_contact_id}` : '∅';
      const c = byContactMap.get(pk) ?? { key: pk, name: pk === '∅' ? 'No customer' : (partyName[pk] || '—'), entries: 0, hours: 0, value: 0, billed_value: 0, unbilled_value: 0 };
      c.entries += 1; c.hours = round2(c.hours + hours); c.value = round2(c.value + value);
      if (isBilled) c.billed_value = round2(c.billed_value + value); else if (e.is_billable) c.unbilled_value = round2(c.unbilled_value + value);
      byContactMap.set(pk, c);
    }
    const byUser = [...byUserMap.values()].sort((a, b) => b.hours - a.hours);
    const byContact = [...byContactMap.values()].sort((a, b) => b.value - a.value);
    return { byUser, byContact };
  },
};
