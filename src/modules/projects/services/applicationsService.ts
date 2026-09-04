/**
 * Applications for payment, and the retention they carry.
 *
 * CUMULATIVE, NOT INCREMENTAL — the one thing that has to be right. An application states the
 * value of work done TO DATE; the money due is the difference from what was certified before it.
 * Treating each as "this month's work" double-counts the moment anybody revises an earlier
 * valuation, and every individual number still looks reasonable while it happens.
 *
 * This service stores the CLAIM (`gross_valuation`) and the ANSWER (`certified_amount`) and
 * derives nothing. Retention, previously-certified, net due and the variance all come from
 * `get_project_applications`, so the screen cannot disagree with the report.
 *
 * THE FISCAL BOUNDARY IS `invoice_id` AND NOTHING ELSE. An application is a commercial claim; a
 * myDATA document is a fiscal act with a sequential number. How Greek progress billing on an έργο
 * maps to myDATA document types is an open question for an accountant, so it is confined to one
 * nullable column and one explicit transition — a small change when the answer arrives rather
 * than a rebuild.
 */
import { supabase } from '@/integrations/supabase/client';

export {
  APPLICATION_STATUSES, APPLICATION_OPEN_STATUSES, isApplicationSettled,
} from '../applicationVocabulary';
export type { ApplicationStatus } from '../applicationVocabulary';

import type { ApplicationStatus } from '../applicationVocabulary';

export interface ProjectApplication {
  id: string;
  workspace_id: string;
  project_id: string;
  reference: string | null;
  period_to: string;
  status: ApplicationStatus;
  /** The claim: cumulative value of work done to date, before retention. */
  gross_valuation: number;
  /** The answer. Null until the payer responds — deliberately distinct from the claim. */
  certified_amount: number | null;
  /** Frozen when the application is raised, so renegotiating terms cannot restate history. */
  retention_percent: number;
  retention_cap_percent: number;
  currency: string;
  due_on: string | null;
  submitted_at: string | null;
  certified_at: string | null;
  paid_at: string | null;
  /** Where the commercial claim becomes a fiscal document. Null until one is issued. */
  invoice_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of `get_project_applications`. Every figure here is derived; none is stored. */
export interface ApplicationRow {
  id: string;
  reference: string | null;
  period_to: string;
  status: ApplicationStatus;
  currency: string;
  gross_valuation: number;
  certified_amount: number | null;
  retention_this_app: number;
  retention_cumulative: number;
  previously_certified: number;
  net_due: number;
  /** Certified minus claimed. Null while unanswered — nobody has disagreed yet. */
  variance: number | null;
  due_on: string | null;
  invoice_id: string | null;
}

/** One release tranche, with what it is worth at today's held figure. */
export interface RetentionTranche {
  id: string;
  tranche: 'practical_completion' | 'defects_end' | 'other';
  due_on: string | null;
  percent: number;
  /** What was actually released. Null until it is. */
  amount: number | null;
  status: 'pending' | 'released' | 'disputed';
  released_at: string | null;
  invoice_id: string | null;
  notes: string | null;
  /** DERIVED from the held figure, never stored — the held amount grows with every valuation. */
  expected_amount: number;
}

export interface RetentionPosition {
  held: number;
  released: number;
  outstanding: number;
  tranches: RetentionTranche[];
}

export interface RetentionTerms {
  retention_percent: number;
  retention_cap_percent: number;
  practical_completion_on: string | null;
  defects_period_months: number;
}

const COLUMNS =
  'id, workspace_id, project_id, reference, period_to, status, gross_valuation, certified_amount, ' +
  'retention_percent, retention_cap_percent, currency, due_on, submitted_at, certified_at, ' +
  'paid_at, invoice_id, notes, created_at, updated_at';

function readable(error: { code?: string; message: string }): Error {
  if (error.code === '42501') return new Error('You do not have permission to change applications on this project.');
  if (error.code === '23505') return new Error('That application reference is already used on this project.');
  if (error.code === '23514' && /certified/i.test(error.message)) {
    return new Error('Say how much was certified before marking it certified.');
  }
  if (error.code === '23514') return new Error(error.message);
  return new Error(error.message);
}

export const applicationsService = {
  async list(projectId: string): Promise<ProjectApplication[]> {
    const { data, error } = await supabase
      .from('project_applications')
      .select(COLUMNS)
      .eq('project_id', projectId)
      .order('period_to');
    if (error) throw readable(error);
    return (data ?? []) as unknown as ProjectApplication[];
  },

  /** The derived view: retention, previously certified, net due and the variance. */
  async derived(projectId: string): Promise<ApplicationRow[]> {
    const { data, error } = await supabase.rpc('get_project_applications', { p_project_id: projectId });
    if (error) throw readable(error);
    return (data ?? []) as ApplicationRow[];
  },

  async create(input: {
    workspace_id: string;
    project_id: string;
    period_to: string;
    gross_valuation: number;
    currency?: string;
    due_on?: string | null;
    notes?: string | null;
  }): Promise<ProjectApplication> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('project_applications')
      .insert({
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        period_to: input.period_to,
        gross_valuation: input.gross_valuation,
        currency: input.currency ?? 'EUR',
        due_on: input.due_on ?? null,
        notes: input.notes?.trim() || null,
        created_by: user?.id ?? null,
        // `reference` and the retention terms are deliberately absent: the DB numbers the row and
        // freezes the terms inside the same INSERT.
      })
      .select(COLUMNS)
      .single();
    if (error) throw readable(error);
    return data as unknown as ProjectApplication;
  },

  /** Revise the claim. Only meaningful while the payer has not answered. */
  async setValuation(id: string, grossValuation: number): Promise<void> {
    const { error } = await supabase
      .from('project_applications')
      .update({ gross_valuation: grossValuation })
      .eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * Record the payer's answer and the status in ONE write.
   *
   * `project_applications_certified_has_amount` refuses a certified application with no amount, so
   * setting them separately means either a rejected first write or a window where the register
   * shows a certified application nobody put a number on.
   */
  async certify(id: string, certifiedAmount: number): Promise<void> {
    const { error } = await supabase
      .from('project_applications')
      .update({ certified_amount: certifiedAmount, status: 'certified' })
      .eq('id', id);
    if (error) throw readable(error);
  },

  async setStatus(id: string, status: ApplicationStatus): Promise<void> {
    const { error } = await supabase.from('project_applications').update({ status }).eq('id', id);
    if (error) throw readable(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('project_applications').delete().eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * The retention position: held, released, still out, and the release tranches.
   *
   * `held` is NOT stored — `get_project_retention` reads it from the latest application's
   * cumulative retention, which `get_project_applications` already derives. One derivation: a
   * second retention calculation would be free to disagree with the figure on the applications
   * table the operator is looking at.
   */
  async retention(projectId: string): Promise<RetentionPosition> {
    const { data, error } = await supabase.rpc('get_project_retention', { p_project_id: projectId });
    if (error) throw readable(error);
    return data as unknown as RetentionPosition;
  },

  /**
   * Create the two conventional tranches: half at practical completion, half when the defects
   * period ends. Dates are derived from the project's terms ONCE, here, and then stored — so a
   * negotiated release date survives somebody later correcting the practical completion date.
   */
  async createStandardTranches(projectId: string, workspaceId: string): Promise<void> {
    const terms = await this.getRetentionTerms(projectId);
    if (!terms.practical_completion_on) {
      throw new Error('Set the practical completion date first — the release dates come from it.');
    }
    const pc = new Date(`${terms.practical_completion_on}T00:00:00Z`);
    // Month arithmetic that cannot overflow. `setUTCMonth(+n)` keeps the day-of-month, so a
    // practical completion on 31 January with a 1-month defects period landed on 3 March — the
    // release date drifted past the end of the period, on the one tranche a contractor waits for.
    // Clamp to the last day of the target month instead (31 Jan + 1 month = 28/29 Feb).
    const months = terms.defects_period_months || 0;
    const targetMonthStart = new Date(Date.UTC(pc.getUTCFullYear(), pc.getUTCMonth() + months, 1));
    const lastDayOfTarget = new Date(Date.UTC(
      targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0,
    )).getUTCDate();
    const defects = new Date(Date.UTC(
      targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth(),
      Math.min(pc.getUTCDate(), lastDayOfTarget),
    ));

    const { error } = await supabase.from('project_retention_releases').insert([
      {
        workspace_id: workspaceId,
        project_id: projectId,
        tranche: 'practical_completion',
        due_on: terms.practical_completion_on,
        percent: 50,
      },
      {
        workspace_id: workspaceId,
        project_id: projectId,
        tranche: 'defects_end',
        due_on: defects.toISOString().slice(0, 10),
        percent: 50,
      },
    ]);
    if (error) throw readable(error);
  },

  /** Record a release. Amount and status move together — the DB refuses one without the other. */
  async releaseTranche(id: string, amount: number): Promise<void> {
    const { error } = await supabase
      .from('project_retention_releases')
      .update({ amount, status: 'released' })
      .eq('id', id);
    if (error) throw readable(error);
  },

  async getRetentionTerms(projectId: string): Promise<RetentionTerms> {
    const { data, error } = await supabase
      .from('projects')
      .select('retention_percent, retention_cap_percent, practical_completion_on, defects_period_months')
      .eq('id', projectId)
      .single();
    if (error) throw readable(error);
    return data as RetentionTerms;
  },

  async setRetentionTerms(projectId: string, terms: Partial<RetentionTerms>): Promise<void> {
    const { error } = await supabase.from('projects').update(terms).eq('id', projectId);
    if (error) throw readable(error);
  },
};
