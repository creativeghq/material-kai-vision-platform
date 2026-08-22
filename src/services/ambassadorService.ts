/**
 * Data access for brand ambassadorships (`profile_ambassadorships`).
 *
 * Reads go straight at the table: its RLS is the boundary and says exactly what the product
 * means — your own rows, rows naming you as the brand, and rows on a PUBLIC profile that the
 * brand has not declined. The two writes that a person must not be able to make for themselves
 * — "the brand confirmed me", "I confirm this ambassador" — are RPCs, because the table's guard
 * trigger pins those columns shut for everyone else, service role included.
 *
 * The table post-dates the last `types.ts` regeneration (which cannot run locally — no access
 * token), hence the casts. They are confined to this file.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Ambassadorship, AmbassadorshipDraft } from '@/lib/ambassadorships';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

const COLUMNS =
  'id, user_id, brand_name, brand_source, brand_country, brand_url, category_keys, relationship, '
  + 'headline, since_year, showcase_moodboard_id, is_featured, sort_order, verification_status, '
  + 'brand_user_id, verification_requested_at, verified_at, decision_note, created_at, updated_at';

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

export type VerificationRequestResult =
  | { status: 'pending'; brand_name: string; brand_user_id: string }
  | { status: 'verified'; brand_name: string; brand_user_id: string | null }
  | { status: 'no_brand_account'; brand_name: string };

/**
 * Ask the brand to confirm. `no_brand_account` is a normal answer, not a failure: most brands
 * have no verified account here yet, and the claim stays visible either way — just without a
 * confirmation next to it.
 */
export async function requestVerification(id: string): Promise<VerificationRequestResult> {
  const { data, error } = await db().rpc('request_ambassadorship_verification', { p_id: id });
  if (error) throw error;
  return data as VerificationRequestResult;
}

export interface DecisionResult {
  status: 'verified' | 'declined';
  ambassador_user_id: string;
  brand_name: string;
  ambassadorship_id: string;
}

/** The brand's side. Refused unless the caller's own profile is the verified supplier for it. */
export async function decideAmbassadorship(
  id: string,
  approve: boolean,
  note?: string | null,
): Promise<DecisionResult> {
  const { data, error } = await db().rpc('decide_ambassadorship', {
    p_id: id,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as DecisionResult;
}

export interface BrandAmbassadorRequest {
  id: string;
  ambassador_user_id: string;
  ambassador_name: string | null;
  ambassador_company: string | null;
  ambassador_avatar_url: string | null;
  ambassador_is_public: boolean;
  brand_name: string;
  category_keys: string[];
  relationship: string;
  headline: string | null;
  since_year: number | null;
  verification_status: string;
  verification_requested_at: string | null;
  verified_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/**
 * "Who is promoting my brand" — an RPC rather than a join, because `user_profiles`' RLS is
 * "public profile or your own row", so a plain select returns the row with the person's name
 * and avatar blank for exactly the people the brand needs to identify.
 */
export async function listBrandAmbassadorRequests(): Promise<BrandAmbassadorRequest[]> {
  const { data, error } = await db().rpc('list_brand_ambassador_requests');
  if (error) throw error;
  return (data ?? []) as BrandAmbassadorRequest[];
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
