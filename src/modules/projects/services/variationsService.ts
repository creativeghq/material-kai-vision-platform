/**
 * Variations — agreed changes to a project's scope, and the money that comes with them.
 *
 * Direction is the whole model and it is never netted: a CLIENT variation changes what we are
 * owed, a SUPPLIER variation changes what we owe a subcontractor. The CVR reads them on opposite
 * sides for exactly the reason `get_order_settlements` keeps money IN and money OUT apart.
 *
 * This service does no arithmetic. `get_project_cvr` derives every figure the register's totals
 * show, so the screen and the report cannot disagree about what the job is worth.
 */
import { supabase } from '@/integrations/supabase/client';

export {
  VARIATION_DIRECTIONS, VARIATION_STATUSES, VARIATION_ORIGINS,
  VARIATION_COUNTS_AS_MONEY, VARIATION_CLOSED_STATUSES,
  DIRECTION_SIDE, DIRECTION_PREFIX, isVariationMoney,
} from '../variationVocabulary';
export type {
  VariationDirection, VariationStatus, VariationOrigin,
} from '../variationVocabulary';

import type {
  VariationDirection, VariationStatus, VariationOrigin,
} from '../variationVocabulary';

export interface ProjectVariation {
  id: string;
  workspace_id: string;
  project_id: string;
  /** VO-001 upstream, SVO-001 downstream. Assigned by the DB, never sent by a client. */
  reference: string | null;
  direction: VariationDirection;
  title: string;
  description: string | null;
  origin: VariationOrigin;
  status: VariationStatus;
  /** Signed. A negative variation is an omission — work taken OUT — and is as real as an addition. */
  value: number;
  currency: string;
  cost_code_id: string | null;
  quote_id: string | null;
  order_id: string | null;
  counterparty_company_id: string | null;
  time_impact_days: number;
  raised_on: string;
  submitted_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
}

/** One row of `get_project_cvr`. A null `cost_code_id` is the uncoded bucket. */
export interface CvrRow {
  cost_code_id: string | null;
  code: string | null;
  name: string | null;
  contracted_value: number;
  variation_value: number;
  total_value: number;
  actual_cost: number;
  committed_cost: number;
  supplier_variation_cost: number;
  total_cost: number;
  margin: number;
  margin_pct: number | null;
}

const COLUMNS =
  'id, workspace_id, project_id, reference, direction, title, description, origin, status, value, ' +
  'currency, cost_code_id, quote_id, order_id, counterparty_company_id, time_impact_days, ' +
  'raised_on, submitted_at, decided_at, decision_note, created_at, updated_at';

function readable(error: { code?: string; message: string }): Error {
  if (error.code === '42501') return new Error('You do not have permission to change variations on this project.');
  if (error.code === '23505') return new Error('That variation reference is already used on this project.');
  if (error.code === '23503' && /cost code/i.test(error.message)) return new Error(error.message);
  if (error.code === '23514') return new Error(error.message);
  return new Error(error.message);
}

export const variationsService = {
  async list(projectId: string): Promise<ProjectVariation[]> {
    const { data, error } = await supabase
      .from('project_variations')
      .select(COLUMNS)
      .eq('project_id', projectId)
      .order('direction')
      .order('reference');
    if (error) throw readable(error);
    return (data ?? []) as unknown as ProjectVariation[];
  },

  async create(input: {
    workspace_id: string;
    project_id: string;
    direction: VariationDirection;
    title: string;
    description?: string | null;
    origin?: VariationOrigin;
    value: number;
    currency?: string;
    cost_code_id?: string | null;
    quote_id?: string | null;
    order_id?: string | null;
    counterparty_company_id?: string | null;
    time_impact_days?: number;
    raised_on?: string;
  }): Promise<ProjectVariation> {
    const title = input.title.trim();
    if (!title) throw new Error('Give the variation a title.');
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('project_variations')
      .insert({
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        direction: input.direction,
        title,
        description: input.description?.trim() || null,
        origin: input.origin ?? 'client_instruction',
        // Sent as typed, including a negative. Never abs()'d with a flag: an omission is a
        // negative number everywhere it is read, or it is a second thing to get right per site.
        value: input.value,
        currency: input.currency ?? 'EUR',
        cost_code_id: input.cost_code_id ?? null,
        quote_id: input.quote_id ?? null,
        order_id: input.order_id ?? null,
        counterparty_company_id: input.counterparty_company_id ?? null,
        time_impact_days: input.time_impact_days ?? 0,
        ...(input.raised_on ? { raised_on: input.raised_on } : {}),
        created_by: user?.id ?? null,
        // `reference` is deliberately absent: the DB numbers it inside the same INSERT, so there
        // is no create-then-number pair a retry could run twice.
      })
      .select(COLUMNS)
      .single();
    if (error) throw readable(error);
    return data as unknown as ProjectVariation;
  },

  async update(id: string, patch: Partial<Pick<ProjectVariation,
    'title' | 'description' | 'origin' | 'value' | 'cost_code_id' | 'quote_id' | 'order_id'
    | 'counterparty_company_id' | 'time_impact_days' | 'raised_on'>>): Promise<void> {
    const { error } = await supabase.from('project_variations').update(patch).eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * Move a variation's status. The decision date is stamped by the DB in the same write, so an
   * approved variation can never be missing the date its final account will be reconstructed from.
   */
  async setStatus(id: string, status: VariationStatus, note?: string | null): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('project_variations')
      .update({
        status,
        decision_note: note?.trim() || null,
        decided_by: status === 'approved' || status === 'rejected' ? (user?.id ?? null) : null,
      })
      .eq('id', id);
    if (error) throw readable(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('project_variations').delete().eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * The CVR: value against cost, per cost code, for one project.
   *
   * Every figure is derived in SQL from one source — the cost half comes from
   * `get_project_cost_by_code`, the value half distributes `get_quote_totals`, and both
   * apportionments are stated there and nowhere else. Callers format; they never re-add.
   */
  async cvr(projectId: string): Promise<CvrRow[]> {
    const { data, error } = await supabase.rpc('get_project_cvr', { p_project_id: projectId });
    if (error) throw readable(error);
    return (data ?? []) as CvrRow[];
  },
};
