/** Product 3D models (#321 asset foundation). */
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export function modelPublicUrl(model: Pick<Tables<'product_3d_models'>, 'storage_bucket' | 'storage_path'>): string {
  return supabase.storage.from(model.storage_bucket).getPublicUrl(model.storage_path).data.publicUrl;
}
