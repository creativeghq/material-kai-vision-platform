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
    .select('id, user_id, title, description, project_id')
    .eq('id', moodboardId)
    .single();
  if (error || !data) throw new Error(`Moodboard not found: ${moodboardId}`);
  return data as MoodboardRow;
}

/**
 * The workspace's branded PDF cover (Profile → Keys → Document templates), used as the
 * deck cover when a client view has no custom cover image — so a deliverable's front page
 * matches the quotes/catalogs rendered by the shared PDF module. Null when unset.
 */
export async function fetchWorkspaceCoverBytes(
  supabase: SupabaseClient,
  workspaceId: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!workspaceId) return null;
  try {
    const { data: tpl } = await supabase
      .from('workspace_pdf_templates')
      .select('cover_path')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const path = (tpl as { cover_path?: string | null } | null)?.cover_path;
    if (!path) return null;
    const { data } = await supabase.storage.from('quote-templates').download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  } catch {
    return null; // template optional — the deck just renders its plain cover
  }
}

/**
 * Resolve WHICH workspace's branding a sheet/client view renders under.
 * Deterministic order:
 *   1. the owning project's workspace (projects.workspace_id) — the real answer;
 *   2. else the creator's OLDEST workspace membership (stable across renders).
 * Never an unordered `limit(1)` — that could flip the logo between regenerations
 * for anyone who belongs to more than one workspace.
 */
export async function resolveBrandingWorkspaceId(
  supabase: SupabaseClient,
  projectId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | undefined> {
  if (projectId) {
    const { data } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle();
    const wsId = (data as { workspace_id?: string } | null)?.workspace_id;
    if (wsId) return wsId;
  }
  if (userId) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);
    const wsId = (data as Array<{ workspace_id?: string }> | null)?.[0]?.workspace_id;
    if (wsId) return wsId;
  }
  return undefined;
}

export interface OwnerBranding {
  client_fallback_name?: string;
  logo_url?: string;
  company_name?: string;
  contact_line?: string;
}

export async function fetchClientName(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | undefined> {
  const branding = await fetchOwnerBranding(supabase, userId);
  return branding?.client_fallback_name;
}

/**
 * Branding for the sheet title block. Prefers the workspace's finance_settings business
 * identity (business_name + logo + contact) — the SAME source invoices/quotes/catalogs
 * use — so the logo/company match every other document. Falls back to the creator's
 * profile studio branding when finance isn't set up. The client-name fallback always
 * comes from the profile.
 */
export async function fetchOwnerBranding(
  supabase: SupabaseClient,
  userId: string,
  workspaceId?: string,
): Promise<OwnerBranding | undefined> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email, branding_logo_url, branding_company_name, branding_contact_line')
    .eq('id', userId)
    .maybeSingle();

  // Unified branding source: the resolved workspace's finance_settings identity.
  let fsLogoUrl: string | undefined;
  let fsCompany: string | undefined;
  let fsContact: string | undefined;
  try {
    const wsId = workspaceId ?? await resolveBrandingWorkspaceId(supabase, null, userId);
    if (wsId) {
      const { data: fs } = await supabase
        .from('finance_settings')
        .select('business_name, business_logo_path, business_phone, business_email, contact_phone, contact_email')
        .eq('workspace_id', wsId)
        .maybeSingle();
      if (fs) {
        const f = fs as Record<string, string | null>;
        fsCompany = f.business_name || undefined;
        if (f.business_logo_path) {
          // business_logo_path lives in the public generation-images bucket.
          const base = Deno.env.get('SUPABASE_URL') || '';
          fsLogoUrl = `${base}/storage/v1/object/public/generation-images/${f.business_logo_path}`;
        }
        const phone = f.business_phone || f.contact_phone;
        const email = f.business_email || f.contact_email;
        fsContact = [phone, email].filter(Boolean).join('  ·  ') || undefined;
      }
    }
  } catch { /* finance branding optional — fall back to profile below */ }

  const p = profile as Record<string, string | null> | null;
  if (!p && !fsCompany && !fsLogoUrl) return undefined;
  return {
    client_fallback_name: p?.full_name || p?.email || undefined,
    logo_url: fsLogoUrl || p?.branding_logo_url || undefined,
    company_name: fsCompany || p?.branding_company_name || undefined,
    contact_line: fsContact || p?.branding_contact_line || undefined,
  };
}

/** Fetch product chips with thumbnails + descriptions. */
export async function fetchProductChips(
  supabase: SupabaseClient,
  productIds: string[],
  scopeWorkspaceIds?: string[] | null,
): Promise<ProductChip[]> {
  if (productIds.length === 0) return [];

  // Pentest #250 H3: when a caller scope is supplied (non-service path), only include
  // products in the caller's own workspaces — an embedded foreign product_id can't leak.
  let productQuery = supabase
    .from('products')
    .select('id, name, description, category_id, metadata')
    .in('id', productIds);
  if (scopeWorkspaceIds) {
    productQuery = productQuery.in(
      'workspace_id',
      scopeWorkspaceIds.length ? scopeWorkspaceIds : ['00000000-0000-0000-0000-000000000000'],
    );
  }
  const { data: products } = await productQuery;

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
  scope?: { userId: string; workspaceIds: string[] } | null,
): Promise<FfeItem[]> {
  // Pentest #250 H3: verify the caller owns the quote before reading its items,
  // else an embedded foreign quote_id would leak that tenant's FF&E pricing.
  if (scope) {
    const { data: q } = await supabase
      .from('quotes')
      .select('user_id, workspace_id')
      .eq('id', quoteId)
      .maybeSingle();
    const ownsQuote = !!q && (
      (q as any).user_id === scope.userId ||
      (scope.workspaceIds.length > 0 && scope.workspaceIds.includes((q as any).workspace_id))
    );
    if (!ownsQuote) return [];
  }
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
  scopeUserId?: string | null,
): Promise<SheetRow[]> {
  if (sheetIds.length === 0) return [];
  // Pentest #250 H3: only include sub-sheets owned by the caller — an embedded foreign
  // included_sheet_id can't pull another user's sheet content into the deck.
  let sheetsQuery = supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, created_by, sheet_type, title, data')
    .in('id', sheetIds);
  if (scopeUserId) sheetsQuery = sheetsQuery.eq('created_by', scopeUserId);
  const { data, error } = await sheetsQuery;
  if (error) throw error;
  return (data || []) as SheetRow[];
}
