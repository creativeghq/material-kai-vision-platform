import { supabase } from '@/integrations/supabase/client';

export type SheetType =
  | 'material_board'
  | 'color_palette'
  | 'concept_board'
  | 'lighting_plan'
  | 'annotated_render'
  | 'elevation_render_pair'
  | 'ffe_schedule'
  | 'area_breakdown'
  | 'full_deck';

export type SheetStatus = 'draft' | 'generating' | 'ready' | 'failed';

export interface PresentationSheet {
  id: string;
  moodboard_id: string;
  created_by: string | null;
  sheet_type: SheetType;
  title: string;
  status: SheetStatus;
  data: Record<string, any>;
  pdf_storage_path: string | null;
  pdf_url: string | null;
  pdf_generated_at: string | null;
  page_count: number | null;
  credits_used: number;
  ai_log_ids: string[];
  error_message: string | null;
  share_token: string | null;
  share_expires_at: string | null;
  share_view_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateSheetData {
  moodboard_id: string;
  sheet_type: SheetType;
  title: string;
  data?: Record<string, any>;
}

export interface UpdateSheetData {
  title?: string;
  data?: Record<string, any>;
  status?: SheetStatus;
}

export const SHEET_TYPE_LABELS: Record<SheetType, string> = {
  material_board: 'Material Board',
  color_palette: 'Color Palette',
  concept_board: 'Concept Board',
  lighting_plan: 'Lighting Plan',
  annotated_render: 'Annotated Render Sheet',
  elevation_render_pair: 'Elevation + Render Pair',
  ffe_schedule: 'FF&E Schedule',
  area_breakdown: 'Area Breakdown',
  full_deck: 'Full Presentation Deck',
};

// Mirror of SHEET_CREDITS in the agent tool. Every tool costs credits.
export const SHEET_TYPE_CREDITS: Record<SheetType, number> = {
  material_board: 1,
  color_palette: 2,
  concept_board: 1,
  ffe_schedule: 1,
  lighting_plan: 3,
  annotated_render: 4,
  elevation_render_pair: 3,
  area_breakdown: 2,
  full_deck: 5,
};

class MoodboardSheetsService {
  async list(moodboardId: string): Promise<PresentationSheet[]> {
    const { data, error } = await supabase
      .from('moodboard_presentation_sheets')
      .select('*')
      .eq('moodboard_id', moodboardId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as PresentationSheet[];
  }

  async get(sheetId: string): Promise<PresentationSheet | null> {
    const { data, error } = await supabase
      .from('moodboard_presentation_sheets')
      .select('*')
      .eq('id', sheetId)
      .maybeSingle();

    if (error) throw error;
    return data as PresentationSheet | null;
  }

  async create(input: CreateSheetData): Promise<PresentationSheet> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('moodboard_presentation_sheets')
      .insert({
        moodboard_id: input.moodboard_id,
        sheet_type: input.sheet_type,
        title: input.title,
        data: input.data ?? {},
        created_by: user.id,
        status: 'draft' as SheetStatus,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as PresentationSheet;
  }

  async update(sheetId: string, patch: UpdateSheetData): Promise<PresentationSheet> {
    const { data, error } = await supabase
      .from('moodboard_presentation_sheets')
      .update(patch)
      .eq('id', sheetId)
      .select('*')
      .single();

    if (error) throw error;
    return data as PresentationSheet;
  }

  async remove(sheetId: string): Promise<void> {
    // Best-effort: clean up the PDF in storage BEFORE deleting the row, so
    // that even if the storage delete fails (network, race) we don't end up
    // with an orphan file and a missing row to remediate from. The DB-side
    // trigger `cleanup_moodboard_sheet_storage` is the canonical guarantee;
    // this is a fast-path that keeps the round trip down by 1.
    const { data: row } = await supabase
      .from('moodboard_presentation_sheets')
      .select('pdf_storage_path')
      .eq('id', sheetId)
      .maybeSingle();

    if (row?.pdf_storage_path) {
      await supabase.storage
        .from('pdf-documents')
        .remove([row.pdf_storage_path])
        .then(({ error }) => {
          if (error) console.warn('Sheet PDF storage cleanup failed (will be picked up by trigger):', error);
        });
    }

    const { error } = await supabase
      .from('moodboard_presentation_sheets')
      .delete()
      .eq('id', sheetId);

    if (error) throw error;
  }

  async refreshPdfUrl(sheetId: string): Promise<string | null> {
    const sheet = await this.get(sheetId);
    if (!sheet?.pdf_storage_path) return null;

    const { data, error } = await supabase
      .storage
      .from('pdf-documents')
      .createSignedUrl(sheet.pdf_storage_path, 60 * 60);

    if (error || !data) return null;
    return data.signedUrl;
  }

  async generatePdf(sheetId: string): Promise<{ pdf_url: string; pdf_storage_path: string; page_count: number }> {
    const { data, error } = await supabase.functions.invoke('generate-moodboard-sheet-pdf', {
      body: { sheet_id: sheetId },
    });

    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'PDF generation failed');

    return {
      pdf_url: data.pdf_url,
      pdf_storage_path: data.pdf_storage_path,
      page_count: data.page_count ?? 1,
    };
  }

  /** Retry a sheet that ended in `failed`. Resets status, clears error, and
   *  re-invokes the renderer. Storage cleanup of any partial file is handled
   *  by the BEFORE-DELETE trigger on this row when the sheet is deleted; on
   *  retry we just overwrite the path on success.
   */
  async retry(sheetId: string): Promise<{ pdf_url: string; page_count: number }> {
    await this.update(sheetId, { status: 'draft', data: undefined as any });
    // Service-side: blank error_message via direct UPDATE so the user sees a clean retry
    await supabase
      .from('moodboard_presentation_sheets')
      .update({ error_message: null })
      .eq('id', sheetId);
    const result = await this.generatePdf(sheetId);
    return { pdf_url: result.pdf_url, page_count: result.page_count };
  }

  /** Clone a sheet's title + data into a new draft row on the same moodboard.
   *  Useful for "use this as a template" or A/B variants. Does NOT copy the
   *  PDF; the duplicate is `draft` until the user re-renders it.
   */
  async duplicate(sheetId: string, newTitle?: string): Promise<PresentationSheet> {
    const original = await this.get(sheetId);
    if (!original) throw new Error('Sheet not found');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('moodboard_presentation_sheets')
      .insert({
        moodboard_id: original.moodboard_id,
        sheet_type: original.sheet_type,
        title: newTitle ?? `${original.title} (copy)`,
        data: original.data,
        created_by: user.id,
        status: 'draft' as SheetStatus,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as PresentationSheet;
  }

  /** Issue (or rotate) a public share token for a sheet. The token allows
   *  unauthenticated viewing of the PDF via a /sheets/share/:token route.
   *  Returns the full shareable URL.
   */
  async share(sheetId: string, expiresInDays: number = 30): Promise<{ url: string; token: string; expires_at: string }> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays * 86400_000).toISOString();
    const { error } = await supabase
      .from('moodboard_presentation_sheets')
      .update({
        share_token: token,
        share_expires_at: expiresAt,
        share_view_count: 0,
      })
      .eq('id', sheetId);
    if (error) throw error;
    const url = `${window.location.origin}/sheets/share/${token}`;
    return { url, token, expires_at: expiresAt };
  }

  /** Revoke an existing share token. */
  async revokeShare(sheetId: string): Promise<void> {
    const { error } = await supabase
      .from('moodboard_presentation_sheets')
      .update({ share_token: null, share_expires_at: null })
      .eq('id', sheetId);
    if (error) throw error;
  }

  /** Public lookup by share token — used by the /sheets/share/:token route.
   *  Bypasses RLS via the moodboard-sheet-share edge function (anon role
   *  cannot SELECT presentation_sheets directly).
   */
  async getByShareToken(token: string): Promise<PresentationSheet | null> {
    const { data, error } = await supabase.functions.invoke('moodboard-sheet-share', {
      body: { token },
    });
    if (error) return null;
    return data?.sheet ?? null;
  }
}

export const moodboardSheetsService = new MoodboardSheetsService();
