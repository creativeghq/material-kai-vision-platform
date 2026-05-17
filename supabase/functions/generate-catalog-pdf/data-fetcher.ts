import type { CatalogRow, CatalogTemplateRow, OwnerBranding } from './types.ts';

export async function fetchCatalog(supabase: any, id: string): Promise<CatalogRow> {
  const { data, error } = await supabase
    .from('presentation_catalogs')
    .select('id, owner_user_id, template_id, title, subtitle, description, cover_data, body_data, back_cover_data, status')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`Catalog not found: ${error?.message || id}`);
  return data as CatalogRow;
}

export async function fetchTemplate(supabase: any, templateId: string | null): Promise<CatalogTemplateRow> {
  let query = supabase
    .from('catalog_templates')
    .select('id, name, cover_image_path, content_background_path, back_cover_image_path, accent_color_hex')
    .eq('is_active', true)
    .limit(1);
  if (templateId) {
    query = query.eq('id', templateId);
  } else {
    query = query.eq('is_default', true);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return {
      id: 'fallback',
      name: 'Fallback (no template configured)',
      cover_image_path: 'cover.png',
      content_background_path: null,
      back_cover_image_path: 'backcover.png',
      accent_color_hex: null,
    };
  }
  return data as CatalogTemplateRow;
}

export async function fetchOwnerBranding(supabase: any, userId: string): Promise<OwnerBranding> {
  const { data } = await supabase
    .from('user_profiles')
    .select('branding_logo_url, branding_company_name, branding_contact_line')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return {};
  return {
    logo_url: data.branding_logo_url,
    company_name: data.branding_company_name,
    contact_line: data.branding_contact_line,
  };
}

export async function fetchStorageFile(supabase: any, bucket: string, path: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) return null;
    const buf = await (data as Blob).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function fetchUrlBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
