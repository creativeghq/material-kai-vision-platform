import { supabase } from '@/integrations/supabase/client';
import { moodboardSheetsService, type PresentationSheet } from '@/services/moodboardSheetsService';
import { isSheetAssetRef } from '@/services/moodboards/sheetAssetRefs';
import { moodboardAPI } from '@/services/moodboardAPI';
import type { RoomViewData } from '@/lib/surfaceRenderer';

export interface SavedRoomView extends PresentationSheet {
  data: RoomViewData;
}

async function uploadRender(png: Blob): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const path = `u/${user.id}/visualizer/room-views/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
  const { error } = await supabase.storage.from('generation-images').upload(path, png, { contentType: 'image/png' });
  if (error) throw error;
  return supabase.storage.from('generation-images').getPublicUrl(path).data.publicUrl;
}

async function assertPrivateCopy(sheetId: string): Promise<void> {
  const { data, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('data')
    .eq('id', sheetId)
    .maybeSingle();
  if (error) throw error;
  const ref = (data?.data as { render_image_url?: unknown } | null)?.render_image_url;
  if (!isSheetAssetRef(ref)) {
    throw new Error('The render was saved but could not be copied into the sheet\'s private storage. Save it again.');
  }
}

export const roomViewService = {
  async list(moodboardId: string): Promise<SavedRoomView[]> {
    const all = await moodboardSheetsService.list(moodboardId);
    return all.filter((s) => s.sheet_type === 'room_view') as SavedRoomView[];
  },

  async save(input: {
    moodboardId: string;
    sheetId?: string | null;
    title: string;
    data: Omit<RoomViewData, 'render_image_url'>;
    png: Blob;
    roomId?: string | null;
  }): Promise<{ sheetId: string; creditsCharged: number }> {
    await this.ensureOnMoodboard(input.moodboardId, input.data.layers.map((l) => l.product_id));
    const renderUrl = await uploadRender(input.png);
    const data: RoomViewData = { ...input.data, render_image_url: renderUrl };
    if (input.sheetId) {
      await moodboardSheetsService.update(input.sheetId, { title: input.title, data });
      await assertPrivateCopy(input.sheetId);
      await moodboardSheetsService.generatePdf(input.sheetId);
      return { sheetId: input.sheetId, creditsCharged: 0 };
    }
    const created = await moodboardSheetsService.createSheet({
      moodboard_id: input.moodboardId,
      sheet_type: 'room_view',
      title: input.title,
      initial_data: data as unknown as Record<string, unknown>,
      room_id: input.roomId ?? null,
    });
    await assertPrivateCopy(created.sheet_id);
    return { sheetId: created.sheet_id, creditsCharged: created.credits_charged ?? 0 };
  },

  async ensureOnMoodboard(moodboardId: string, productIds: string[]): Promise<void> {
    const wanted = [...new Set(productIds.filter(Boolean))];
    if (wanted.length === 0) return;
    const { data, error } = await supabase
      .from('moodboard_items')
      .select('material_id')
      .eq('moodboard_id', moodboardId)
      .in('material_id', wanted);
    if (error) throw error;
    const present = new Set((data ?? []).map((r) => r.material_id as string));
    for (const id of wanted.filter((x) => !present.has(x))) {
      await moodboardAPI.addMoodBoardItem({ moodboard_id: moodboardId, material_id: id });
    }
  },

  async listMyMoodboards(): Promise<{ id: string; title: string; room_id: string | null }[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('moodboards')
      .select('id, title, room_id')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as { id: string; title: string; room_id: string | null }[];
  },

  async productsUpdatedAt(ids: string[]): Promise<{ id: string; updated_at: string | null }[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    const { data, error } = await supabase.from('products').select('id, updated_at').in('id', unique);
    if (error) throw error;
    return (data ?? []) as { id: string; updated_at: string | null }[];
  },
};
