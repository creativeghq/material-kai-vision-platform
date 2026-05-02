import { supabase } from '@/integrations/supabase/client';

export type SheetType =
  | 'material_board'
  | 'color_palette'
  | 'concept_board'
  | 'lighting_plan'
  | 'annotated_render'
  | 'elevation_render_pair'
  | 'ffe_schedule'
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
  full_deck: 'Full Presentation Deck',
};

export const SHEET_TYPE_CREDITS: Record<SheetType, number> = {
  material_board: 0,
  color_palette: 0,
  concept_board: 0,
  ffe_schedule: 0,
  lighting_plan: 3,
  annotated_render: 3,
  elevation_render_pair: 2,
  full_deck: 3,
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
      .from('moodboard-sheets')
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
}

export const moodboardSheetsService = new MoodboardSheetsService();
