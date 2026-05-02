import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductChip, FfeItem, MoodboardRow, SheetRow } from './types.ts';

export async function fetchSheet(
  supabase: SupabaseClient,
  sheetId: string,
): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, created_by, sheet_type, title, data')
    .eq('id', sheetId)
    .single();
  if (error || !data) throw new Error(`Sheet not found: ${sheetId}`);
  return data as SheetRow;
}

export async function fetchMoodboard(
  supabase: SupabaseClient,
  moodboardId: string,
): Promise<MoodboardRow> {
  const { data, error } = await supabase
    .from('moodboards')
    .select('id, user_id, title, description')
    .eq('id', moodboardId)
    .single();
  if (error || !data) throw new Error(`Moodboard not found: ${moodboardId}`);
  return data as MoodboardRow;
}

export async function fetchClientName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return undefined;
  return (data as any).full_name || (data as any).email || undefined;
}

/** Fetch product chips with thumbnails + descriptions. */
export async function fetchProductChips(
  supabase: SupabaseClient,
  productIds: string[],
): Promise<ProductChip[]> {
  if (productIds.length === 0) return [];

  const { data: products } = await supabase
    .from('products')
    .select('id, name, description, category_id, metadata')
    .in('id', productIds);

  const { data: rels } = await supabase
    .from('image_product_associations')
    .select('product_id, overall_score, image:document_images(image_url)')
    .in('product_id', productIds)
    .order('overall_score', { ascending: false });

  const imageByProduct: Record<string, string> = {};
  for (const rel of rels || []) {
    const imgUrl = (rel as any).image?.image_url;
    if (imgUrl && !imageByProduct[(rel as any).product_id]) {
      imageByProduct[(rel as any).product_id] = imgUrl;
    }
  }

  return (products || []).map((p: any) => ({
    product_id: p.id,
    name: p.name || 'Unnamed',
    description: p.description || null,
    image_url: imageByProduct[p.id] || null,
    hex: p.metadata?.hex_codes?.[0] || p.metadata?.color_hex || null,
    category: p.metadata?.material_type || p.metadata?.category || null,
  }));
}

/** Pull FF&E items off a quote. */
export async function fetchQuoteFfeItems(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<FfeItem[]> {
  const { data, error } = await supabase
    .from('quote_items')
    .select('room, name, dimensions, installation_requirements, delivery_date, qty, unit_price')
    .eq('quote_id', quoteId)
    .order('position', { ascending: true });

  if (error) {
    console.warn('fetchQuoteFfeItems error', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    room: row.room ?? null,
    name: row.name || 'Item',
    dimensions: row.dimensions ?? null,
    install: row.installation_requirements ?? null,
    delivery: row.delivery_date ?? null,
    qty: row.qty ?? 1,
    price: row.unit_price ?? null,
  }));
}

/** Fetch sub-sheets to assemble the full deck. */
export async function fetchSheets(
  supabase: SupabaseClient,
  sheetIds: string[],
): Promise<SheetRow[]> {
  if (sheetIds.length === 0) return [];
  const { data, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, created_by, sheet_type, title, data')
    .in('id', sheetIds);
  if (error) throw error;
  return (data || []) as SheetRow[];
}
