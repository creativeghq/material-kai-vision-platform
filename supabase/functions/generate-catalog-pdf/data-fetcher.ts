import type { CatalogRow } from './types.ts';

/**
 * Load the catalog row. Branding + template images + item images are now resolved
 * via the shared `_shared/pdf/branding.ts` (workspace finance_settings) so every
 * generated PDF shares one branded design; this only fetches the catalog content.
 */
export async function fetchCatalog(supabase: any, id: string): Promise<CatalogRow> {
  const { data, error } = await supabase
    .from('presentation_catalogs')
    .select('id, owner_user_id, workspace_id, template_id, title, subtitle, description, cover_data, body_data, back_cover_data, status')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`Catalog not found: ${error?.message || id}`);
  return data as CatalogRow;
}
