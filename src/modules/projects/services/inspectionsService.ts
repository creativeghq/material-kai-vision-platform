/**
 * Inspections — the checklist somebody walks the site with.
 *
 * Two things live in SQL rather than here, and both for the same reason:
 *
 *  - **The verdict.** `get_project_inspections` derives whether an inspection passed from its
 *    items, every read. Storing it is the wrong-number shape: an item gets re-answered, the header
 *    still says "passed", and a valid string disagrees with the list under it while nothing raises.
 *  - **Turning a failure into work.** `raise_snag_from_inspection_item` creates the snag AND stamps
 *    the item in one call, with the stamp as the claim. Two calls would leave a snag with no link
 *    back on a dropped connection, and the inspector — who saw an error — would press again and
 *    get a second one for the same defect.
 */
import { supabase } from '@/integrations/supabase/client';

export {
  INSPECTION_STATUSES, INSPECTION_RESULTS, INSPECTION_OUTCOMES, INSPECTION_OUTCOME_LABELS,
  isInspectionResult, isInspectionOutcome,
} from '../inspectionVocabulary';
export type {
  InspectionStatus, InspectionResult, InspectionOutcome,
} from '../inspectionVocabulary';

import type {
  InspectionStatus, InspectionResult, InspectionOutcome,
} from '../inspectionVocabulary';

/** One inspection with its derived counts. Everything below `created_at` comes from SQL. */
export interface ProjectInspection {
  id: string;
  project_id: string;
  room_id: string | null;
  title: string;
  notes: string | null;
  inspection_date: string | null;
  status: InspectionStatus;
  signed_off_at: string | null;
  signed_off_name: string | null;
  client_visible: boolean;
  template_id: string | null;
  created_at: string;
  items_total: number;
  items_answered: number;
  items_passed: number;
  items_failed: number;
  items_na: number;
  /** Failures nobody has turned into work yet — a recorded defect with no snag against it. */
  open_failures: number;
  outcome: InspectionOutcome;
}

export interface ProjectInspectionItem {
  id: string;
  inspection_id: string;
  sequence: number;
  title: string;
  guidance: string | null;
  /** null means NOT ANSWERED, and is never treated as a pass. */
  result: InspectionResult | null;
  note: string | null;
  photo_paths: string[];
  cost_code_id: string | null;
  snag_id: string | null;
  answered_at: string | null;
}

export interface NewInspection {
  project_id: string;
  title: string;
  items: Array<{ title: string; guidance?: string | null; cost_code_id?: string | null }>;
  room_id?: string | null;
  inspection_date?: string | null;
  template_id?: string | null;
  notes?: string | null;
}

export const inspectionsService = {
  /** Inspections with their derived counts. The verdict is never computed here. */
  async list(projectId: string): Promise<ProjectInspection[]> {
    const { data, error } = await (supabase as any)
      .rpc('get_project_inspections', { p_project_id: projectId });
    if (error) throw error;
    return (data || []) as ProjectInspection[];
  },

  async listItems(inspectionId: string): Promise<ProjectInspectionItem[]> {
    const { data, error } = await (supabase as any)
      .from('project_inspection_items')
      .select('*')
      .eq('inspection_id', inspectionId)
      .order('sequence', { ascending: true });
    if (error) throw error;
    return (data || []) as ProjectInspectionItem[];
  },

  /**
   * Start an inspection. ONE call, header and items together — a header with no items derives as
   * `empty`, which on a list reads as a stage that was checked and found clean.
   */
  async create(input: NewInspection): Promise<string> {
    const { data, error } = await (supabase as any).rpc('create_inspection_from_template', {
      p_project_id: input.project_id,
      p_title: input.title,
      p_items: input.items.map((it, i) => ({
        title: it.title,
        guidance: it.guidance ?? null,
        cost_code_id: it.cost_code_id ?? null,
        sequence: i,
      })),
      p_room_id: input.room_id ?? null,
      p_inspection_date: input.inspection_date ?? null,
      p_template_id: input.template_id ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /** Answer one item. Passing null clears the answer back to unanswered. */
  async setResult(itemId: string, result: InspectionResult | null, note?: string | null): Promise<void> {
    const patch: Record<string, unknown> = { result };
    if (note !== undefined) patch.note = note;
    const { error } = await (supabase as any)
      .from('project_inspection_items').update(patch).eq('id', itemId);
    if (error) throw error;
  },

  /**
   * Turn a failed item into a snag. Idempotent by construction: pressing twice returns the SAME
   * snag id rather than raising a second one for the same defect.
   */
  async raiseSnag(itemId: string, severity: 'low' | 'medium' | 'high' = 'medium'): Promise<string> {
    const { data, error } = await (supabase as any).rpc('raise_snag_from_inspection_item', {
      p_item_id: itemId,
      p_severity: severity,
    });
    if (error) throw error;
    return data as string;
  },

  async setStatus(inspectionId: string, status: InspectionStatus, signedOffName?: string | null): Promise<void> {
    const patch: Record<string, unknown> = { status };
    // The time stamp goes on in the database trigger, in the same write, so a signed-off row can
    // never exist without one.
    if (status === 'signed_off' && signedOffName) patch.signed_off_name = signedOffName;
    const { error } = await (supabase as any)
      .from('project_inspections').update(patch).eq('id', inspectionId);
    if (error) throw error;
  },

  async setClientVisible(inspectionId: string, visible: boolean): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_inspections').update({ client_visible: visible }).eq('id', inspectionId);
    if (error) throw error;
  },

  async remove(inspectionId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_inspections').delete().eq('id', inspectionId);
    if (error) throw error;
  },
};
