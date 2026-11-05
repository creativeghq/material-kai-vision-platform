/** Drawing takeoff (#532): proposals off the sheet, a person's verdict on each, and the quote lines they feed. */
import { supabase } from '@/integrations/supabase/client';
import type {
  TakeoffElementType, TakeoffKind, TakeoffReviewStatus, TakeoffSource,
} from '../takeoffVocabulary';
import type { NormPoint } from '../lib/drawingMarkup';

export interface TakeoffMeasurement {
  id: string;
  revision_id: string;
  page: number;
  kind: TakeoffKind;
  element_type: TakeoffElementType;
  label: string;
  source: TakeoffSource;
  value: number | null;
  value_norm: number | null;
  unit: string;
  geometry: { points?: NormPoint[]; segments?: NormPoint[][] };
  bbox: [number, number, number, number] | null;
  /** NULL means a person or a printed row, not a model. */
  confidence: number | null;
  source_ref: string | null;
  detail: Record<string, unknown>;
  review_status: TakeoffReviewStatus;
  needs_remeasure: boolean;
  quote_item_id: string | null;
  /** Derived in SQL through the sheet's scale. NULL = not measurable yet (no scale), never 0. */
  effective_value: number | null;
}

export interface TakeoffPage {
  page: number;
  kind: 'vector' | 'scan' | 'empty';
  aspect: number | null;
  scale_ratio: number | null;
  scale_text: string | null;
  scale_plausible: boolean | null;
  effective_scale_m: number | null;
  compared_revision_id: string | null;
  changed_cells: number[] | 'all' | null;
  notes: string[];
}

export interface RevisionTakeoff {
  revision: {
    id: string;
    rev_label: string;
    takeoff_status: 'running' | 'done' | 'failed' | null;
    takeoff_error: string | null;
    takeoff_at: string | null;
    takeoff_schedules_status: 'read' | 'no_schedules' | 'too_large' | 'failed' | null;
    scale_units_per_unit: number | null;
    scale_unit: string | null;
  };
  pages: TakeoffPage[];
  measurements: TakeoffMeasurement[];
}

export interface TakeoffGroupTotal {
  element_type: TakeoffElementType;
  unit: string;
  review_status: TakeoffReviewStatus;
  rows: number;
  total: number | null;
  unknown: number;
}

export interface TakeoffDrawingSummary {
  document_id: string;
  revision_id: string;
  label: string;
  title: string;
  rev_label: string;
  takeoff_status: 'running' | 'done' | 'failed' | null;
  takeoff_error: string | null;
  takeoff_at: string | null;
  pages: number;
  vector_pages: number;
  scan_pages: number;
  proposed: number;
  confirmed: number;
  needs_scale: number;
  groups: TakeoffGroupTotal[];
}

export interface ProjectTakeoffSummary {
  drawings: TakeoffDrawingSummary[];
  /** Takeoff lines on a live quote whose quantity no longer matches, or whose area a newer revision moved. */
  remeasure: Array<{
    quote_item_id: string; quote_id: string; quote_number: string | null; quote_status: string;
    description: string; unit: string | null; quoted_quantity: number; drawing_quantity: number | null;
    changed_in_revision: boolean;
  }>;
  /** Drawings whose current revision is unread while an older revision still feeds a quote. */
  not_analysed: Array<{ document_id: string; revision_id: string; label: string; rev_label: string; quoted_rev_label: string }>;
}

function readable(error: { message: string; code?: string }): Error {
  if (error.code === '42501') return new Error('You do not have permission to change this takeoff.');
  return new Error(error.message);
}

async function invoke(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('takeoff-from-drawing', { body });
  if (error) {
    const ctx = (error as any).context;
    let detail: string | null = null;
    try { detail = ctx ? (await ctx.json())?.error ?? null : null; } catch { /* not JSON */ }
    throw new Error(detail || error.message || 'The drawing could not be read.');
  }
  return data;
}

export const takeoffService = {
  /** Starts the read; it runs in the background and the revision row says when it is done. */
  async analyze(revisionId: string): Promise<{ status: string }> {
    return invoke({ action: 'analyze', revision_id: revisionId });
  },

  async findSimilar(input: {
    revisionId: string; page: number; bbox: [number, number, number, number];
    elementType: TakeoffElementType; label: string;
  }): Promise<{ added: number; matches: number; reason: string | null }> {
    return invoke({
      action: 'find_similar', revision_id: input.revisionId, page: input.page,
      bbox: input.bbox, element_type: input.elementType, label: input.label,
    });
  },

  /** A freshly signed URL for the revision's PDF — never stored. */
  async fileUrl(revisionId: string): Promise<string> {
    const { data, error } = await (supabase as any)
      .from('project_document_revisions')
      .select('storage_bucket, storage_object_path')
      .eq('id', revisionId)
      .single();
    if (error) throw readable(error);
    const { data: signed, error: signError } = await supabase.storage
      .from(data.storage_bucket).createSignedUrl(data.storage_object_path, 3600);
    if (signError || !signed?.signedUrl) throw signError ?? new Error('Could not open the drawing.');
    return signed.signedUrl;
  },

  async revision(revisionId: string): Promise<RevisionTakeoff> {
    const { data, error } = await (supabase as any).rpc('get_revision_takeoff', { p_revision_id: revisionId });
    if (error) throw readable(error);
    return data as RevisionTakeoff;
  },

  async projectSummary(projectId: string): Promise<ProjectTakeoffSummary> {
    const { data, error } = await (supabase as any).rpc('get_project_takeoff_summary', { p_project_id: projectId });
    if (error) throw readable(error);
    return data as ProjectTakeoffSummary;
  },

  async setStatus(ids: string[], status: TakeoffReviewStatus): Promise<void> {
    if (!ids.length) return;
    const { error } = await (supabase as any)
      .from('project_drawing_measurements').update({ review_status: status }).in('id', ids);
    if (error) throw readable(error);
  },

  async clearRemeasure(ids: string[]): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_drawing_measurements').update({ needs_remeasure: false }).in('id', ids);
    if (error) throw readable(error);
  },

  /** A person's own line or outline. Stored in page-width units; the length/area is derived in SQL. */
  async addManual(input: {
    revisionId: string; page: number; kind: 'length' | 'area' | 'count';
    elementType: TakeoffElementType; label: string; points: NormPoint[]; valueNorm: number | null;
  }): Promise<void> {
    const xs = input.points.map((p) => p.x);
    const ys = input.points.map((p) => p.y);
    const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const isCount = input.kind === 'count';
    const { error } = await (supabase as any).from('project_drawing_measurements').insert({
      revision_id: input.revisionId,
      page: input.page,
      kind: input.kind,
      element_type: input.elementType,
      label: input.label,
      source: 'manual',
      unit: isCount ? 'pcs' : input.kind === 'length' ? 'm' : 'm2',
      value: isCount ? 1 : null,
      value_norm: isCount ? null : input.valueNorm,
      geometry: { points: input.points },
      bbox,
      review_status: 'confirmed',
    });
    if (error) throw readable(error);
  },

  async remove(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_drawing_measurements').delete().eq('id', id);
    if (error) throw readable(error);
  },

  async addToQuote(input: {
    projectId: string; measurementIds: string[]; description?: string | null;
    quoteId?: string | null; quoteItemId?: string | null;
  }): Promise<{ quote_id: string; quote_item_id: string; quantity: number }> {
    const { data, error } = await (supabase as any).rpc('takeoff_add_to_quote', {
      p_project_id: input.projectId,
      p_measurement_ids: input.measurementIds,
      p_description: input.description ?? null,
      p_quote_id: input.quoteId ?? null,
      p_quote_item_id: input.quoteItemId ?? null,
    });
    if (error) throw readable(error);
    return data as { quote_id: string; quote_item_id: string; quantity: number };
  },

  async refreshQuoteLine(quoteItemId: string): Promise<void> {
    const { error } = await (supabase as any).rpc('takeoff_refresh_quote_line', { p_quote_item_id: quoteItemId });
    if (error) throw readable(error);
  },

  /** Draft quotes on the project, with the takeoff lines each already holds. */
  async draftQuotes(projectId: string): Promise<Array<{
    id: string; name: string | null; quote_number: string | null;
    lines: Array<{ id: string; custom_product_name: string | null; custom_unit: string | null }>;
  }>> {
    const { data, error } = await (supabase as any)
      .from('quotes')
      .select('id, name, quote_number, quote_items(id, custom_product_name, custom_unit, added_from)')
      .eq('project_id', projectId).eq('status', 'draft')
      .order('created_at', { ascending: false });
    if (error) throw readable(error);
    return (data ?? []).map((q: any) => ({
      id: q.id, name: q.name, quote_number: q.quote_number,
      lines: (q.quote_items ?? []).filter((i: any) => i.added_from === 'takeoff'),
    }));
  },
};
