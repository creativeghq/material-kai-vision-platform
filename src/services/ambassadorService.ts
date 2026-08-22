/**
 * Data access for brand ambassadorships (`profile_ambassadorships`).
 *
 * Reads and writes go straight at the table: its RLS is the boundary and says exactly what the
 * product means — your own rows, and rows on a PUBLIC profile. Nobody approves an ambassadorship;
 * being on the platform's supplier list is the whole condition.
 *
 * Two things need an RPC and get one: the brand list itself (an operator-owned registry, so only
 * its business-identity fields are exposed) and the brand's own "who promotes me" view (which
 * has to read `user_profiles` past an RLS policy that would blank every name).
 *
 * The table post-dates the last `types.ts` regeneration (which cannot run locally — no access
 * token), hence the casts. They are confined to this file.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Ambassadorship, AmbassadorshipDraft } from '@/lib/ambassadorships';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

const COLUMNS =
  'id, user_id, brand_name, brand_source, platform_supplier_id, brand_country, brand_url, '
  + 'category_keys, relationship, headline, since_year, showcase_moodboard_id, is_featured, '
  + 'sort_order, created_at, updated_at';

/**
 * Every ambassadorship on a profile that the caller may see. Same query for your own profile and
 * for somebody else's public one — the difference is RLS's to make, not the client's.
 */
export async function listAmbassadorships(userId: string): Promise<Ambassadorship[]> {
  const { data, error } = await db()
    .from('profile_ambassadorships')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('is_featured', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('brand_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Ambassadorship[];
}

/** Explicit payload — never a spread of the form state (mass assignment, invariant 8). */
function payloadFrom(draft: AmbassadorshipDraft) {
  return {
    brand_name: draft.brand_name.trim(),
    brand_source: draft.brand_source,
    platform_supplier_id: draft.platform_supplier_id,
    brand_country: draft.brand_country?.trim() || null,
    brand_url: draft.brand_url?.trim() || null,
    category_keys: draft.category_keys,
    relationship: draft.relationship,
    headline: draft.headline?.trim() || null,
    since_year: draft.since_year ?? null,
    showcase_moodboard_id: draft.showcase_moodboard_id || null,
    is_featured: draft.is_featured,
  };
}

export async function createAmbassadorship(
  userId: string,
  draft: AmbassadorshipDraft,
): Promise<Ambassadorship> {
  const { data, error } = await db()
    .from('profile_ambassadorships')
    .insert({ user_id: userId, ...payloadFrom(draft) })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Ambassadorship;
}

export async function updateAmbassadorship(
  id: string,
  draft: AmbassadorshipDraft,
): Promise<Ambassadorship> {
  const { data, error } = await db()
    .from('profile_ambassadorships')
    .update(payloadFrom(draft))
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Ambassadorship;
}

export async function deleteAmbassadorship(id: string): Promise<void> {
  const { error } = await db().from('profile_ambassadorships').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderAmbassadorship(id: string, sortOrder: number): Promise<void> {
  const { error } = await db()
    .from('profile_ambassadorships')
    .update({ sort_order: sortOrder })
    .eq('id', id);
  if (error) throw error;
}

export interface PlatformBrand {
  supplier_id: string | null;
  name: string;
  country_code: string | null;
  website: string | null;
  source: 'supplier' | 'catalog';
}

/**
 * The platform's factory/supplier list, searchable. `supplier` rows are companies on the list;
 * `catalog` rows are brand names the product catalog knows that are not (yet) on it.
 */
export async function searchPlatformBrands(query: string, limit = 30): Promise<PlatformBrand[]> {
  const { data, error } = await db().rpc('search_platform_brands', {
    p_query: query.trim() || null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as PlatformBrand[];
}

export interface SupplierBrandAmbassador {
  id: string;
  supplier_id: string;
  supplier_name: string;
  brand_name: string;
  ambassador_user_id: string;
  ambassador_name: string | null;
  ambassador_company: string | null;
  ambassador_avatar_url: string | null;
  ambassador_location: string | null;
  ambassador_professional_type: string | null;
  ambassador_profile_views: number;
  category_keys: string[];
  relationship: string;
  headline: string | null;
  since_year: number | null;
  brand_url: string | null;
  is_featured: boolean;
  created_at: string;
}

/**
 * The other side, and the only thing the brand gets: visibility. Every public profile promoting
 * a supplier identity this workspace has claimed. Returns nothing — not an error — for a
 * workspace with no claim, because "you have not claimed a supplier identity" is a state the
 * portal already explains.
 */
export async function listSupplierBrandAmbassadors(
  workspaceId: string,
): Promise<SupplierBrandAmbassador[]> {
  const { data, error } = await db().rpc('list_supplier_brand_ambassadors', {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return ((data ?? []) as SupplierBrandAmbassador[]).map((r) => ({
    ...r,
    ambassador_profile_views: Number(r.ambassador_profile_views ?? 0),
  }));
}

export interface BrandCategoryCoverage {
  brand_key: string;
  category_key: string;
  product_count: number;
}

/**
 * Which categories these brands actually have products in, within the catalogs the caller can
 * already read. Used to suggest categories when adding a brand, and to flag a category claimed
 * with nothing behind it. An empty result means "no catalog to compare against" — never
 * "you are wrong" — so the caller must degrade to plain choice rather than block.
 */
export async function brandCategoryCoverage(brands: string[]): Promise<BrandCategoryCoverage[]> {
  if (!brands.length) return [];
  const { data, error } = await db().rpc('get_brand_category_coverage', { p_brands: brands });
  if (error) throw error;
  return (data ?? []).map((r: BrandCategoryCoverage) => ({
    brand_key: r.brand_key,
    category_key: r.category_key,
    product_count: Number(r.product_count),
  }));
}
