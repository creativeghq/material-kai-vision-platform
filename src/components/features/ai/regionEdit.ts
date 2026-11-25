import { supabase } from '@/integrations/supabase/client';
import { compositeMasked, loadImage, paintedMask } from '@/lib/scene/sceneCompositing';
import type { RegionEditResult } from './RegionEditCanvas';

/** What generate-region-edit charges: one gemini flash-tier image (`GENERATION_CREDIT_COSTS`). */
export const REGION_EDIT_CREDITS = 6;

/** The model redraws the whole photo, so the edit is laid back over the original inside the painted area only. */
export async function keepOnlyMarkedArea(
  edit: RegionEditResult, editedUrl: string, userId: string, conversationId: string | null | undefined,
): Promise<string> {
  const [base, edited, maskImage] = await Promise.all([loadImage(edit.imageUrl), loadImage(editedUrl), loadImage(edit.maskDataUrl)]);
  const blob = await compositeMasked(base, edited, paintedMask(maskImage).canvas, 4);
  const path = `u/${userId}/${conversationId ? `sessions/${conversationId}/gen` : 'region-edit'}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('generation-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`The edit could not be saved: ${error.message}`);
  return supabase.storage.from('generation-images').getPublicUrl(path).data.publicUrl;
}
