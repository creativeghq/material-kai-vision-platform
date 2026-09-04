/**
 * Markup on a drawing revision — clouds, notes and measurements over the sheet.
 *
 * Two things live in SQL rather than here:
 *
 *  - **Raising an RFI from a markup.** `raise_rfi_from_markup` creates the question AND stamps the
 *    markup in one call. Two calls would leave a NUMBERED RFI in the register with no link back on
 *    a dropped connection, and the person — who saw an error — would press again and put a second
 *    numbered question to the architect about the same detail.
 *  - **The scale**, which lives on the REVISION. Every measurement on a sheet uses one scale, and
 *    storing it per markup is how two lines on one drawing end up measured differently.
 */
import { supabase } from '@/integrations/supabase/client';
import type { MarkupGeometry, MarkupKind } from '../lib/drawingMarkup';

export { MARKUP_KINDS, MIN_POINTS } from '../lib/drawingMarkup';
export type { MarkupKind, MarkupGeometry, NormPoint } from '../lib/drawingMarkup';

export interface DrawingMarkup {
  id: string;
  revision_id: string;
  page: number;
  kind: MarkupKind;
  /** Normalised 0–1 against the page — never pixels. See `lib/drawingMarkup.ts`. */
  geometry: MarkupGeometry;
  page_aspect: number | null;
  note: string | null;
  /** NULL means NOT MEASURED. An uncalibrated sheet measures nothing, never zero. */
  measured_value: number | null;
  measured_unit: string | null;
  request_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** The sheet's calibration, as stored on the revision. */
export interface DrawingScale {
  /** Real-world units per one unit of normalised page WIDTH. Null when never calibrated. */
  scale_units_per_unit: number | null;
  scale_unit: string | null;
  scale_set_at: string | null;
}

export interface NewMarkup {
  revision_id: string;
  page?: number;
  kind: MarkupKind;
  geometry: MarkupGeometry;
  page_aspect?: number | null;
  note?: string | null;
  measured_value?: number | null;
  measured_unit?: string | null;
}

export const drawingMarkupsService = {
  async list(revisionId: string): Promise<DrawingMarkup[]> {
    const { data, error } = await (supabase as any)
      .from('project_drawing_markups')
      .select('*')
      .eq('revision_id', revisionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []) as DrawingMarkup[];
  },

  async create(input: NewMarkup): Promise<DrawingMarkup> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any)
      .from('project_drawing_markups')
      .insert({
        revision_id: input.revision_id,
        page: input.page ?? 1,
        kind: input.kind,
        geometry: input.geometry,
        page_aspect: input.page_aspect ?? null,
        note: input.note ?? null,
        // Both or neither — the DB refuses one without the other, because a number with no unit is
        // not a measurement.
        measured_value: input.measured_value ?? null,
        measured_unit: input.measured_value == null ? null : (input.measured_unit ?? null),
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as DrawingMarkup;
  },

  async setNote(id: string, note: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_drawing_markups').update({ note: note || null }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_drawing_markups').delete().eq('id', id);
    if (error) throw error;
  },

  /** The sheet's calibration. Null throughout means it has never been set. */
  async scale(revisionId: string): Promise<DrawingScale> {
    const { data, error } = await (supabase as any)
      .from('project_document_revisions')
      .select('scale_units_per_unit, scale_unit, scale_set_at')
      .eq('id', revisionId)
      .single();
    if (error) throw error;
    return data as DrawingScale;
  },

  /**
   * Calibrate the sheet from a line of KNOWN length.
   *
   * Never from the title block: a drawing printed "1:50" survives being photocopied at 90% and the
   * scale printed on it does not. The operator drags along something they know the length of, and
   * that is the only thing the measurements rest on.
   */
  async setScale(revisionId: string, unitsPerPageWidth: number, unit: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_document_revisions')
      .update({
        scale_units_per_unit: unitsPerPageWidth,
        scale_unit: unit,
        scale_set_at: new Date().toISOString(),
      })
      .eq('id', revisionId);
    if (error) throw error;
  },

  /** Clear the calibration. Every measurement on the sheet goes back to unmeasured, not to zero. */
  async clearScale(revisionId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_document_revisions')
      .update({ scale_units_per_unit: null, scale_unit: null, scale_set_at: null })
      .eq('id', revisionId);
    if (error) throw error;
  },

  /**
   * Turn a markup into an RFI. Idempotent by construction: pressing twice returns the SAME request
   * id rather than putting a second numbered question to the architect about one detail.
   */
  async raiseRfi(
    markupId: string, title: string, body?: string | null, dueAt?: string | null,
  ): Promise<string> {
    const { data, error } = await (supabase as any).rpc('raise_rfi_from_markup', {
      p_markup_id: markupId,
      p_title: title,
      p_body: body ?? null,
      p_due_at: dueAt ?? null,
    });
    if (error) throw error;
    return data as string;
  },
};
