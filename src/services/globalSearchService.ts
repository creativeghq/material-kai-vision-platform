/**
 * The top-bar search palette's data layer — "find me anything in this workspace".
 *
 * Before this, the palette searched exactly two things: product NAMES and nav-item LABELS. So a
 * query that was neither — a person, a customer, an order number — matched nothing, and the only
 * item left standing in the palette was the "Smart search materials" action. cmdk highlights the
 * first item, so Enter ran it: type a colleague's name, land on the product catalogue. The
 * conversion was silent and there was no general search anywhere to fall back to (`/search` and
 * `/search-hub` both redirect to the product smart search).
 *
 * Everything now comes from ONE round trip — `public.global_search`, a SECURITY INVOKER function,
 * so each table's existing RLS stays the tenancy boundary and the palette can never surface a row
 * the caller could not already fetch. `kinds` narrows what is asked for; it is a filter for the
 * persona's surfaces, never an authorization gate.
 *
 * The KIND CATALOGUE — what can be found, where each kind opens, and the gates that must hold
 * first — lives in `@/config/searchKinds` and is re-exported here unchanged. It moved because the
 * agent result cards need the same answers to make a tool's rows openable, and a config module
 * must not import the Supabase client to get them.
 *
 * @see tests/unit/globalSearchKinds.test.ts — holds the catalogue honest.
 */
import { supabase } from '@/integrations/supabase/client';

import { SPEC_BY_KIND, type GlobalSearchHit, type GlobalSearchKind } from '@/config/searchKinds';

export {
  GLOBAL_SEARCH_KINDS,
  allowedSearchKinds,
  groupHits,
} from '@/config/searchKinds';
export type {
  GlobalSearchGroup,
  GlobalSearchHit,
  GlobalSearchKind,
  GlobalSearchKindSpec,
  KindGateContext,
  SearchRouteContext,
} from '@/config/searchKinds';

/** Shortest query the server will act on — mirrors the length guard inside `global_search`. */
export const MIN_QUERY_LENGTH = 2;

export async function globalSearch(
  workspaceId: string | null,
  query: string,
  kinds: readonly GlobalSearchKind[],
  perKind = 5,
): Promise<GlobalSearchHit[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH || kinds.length === 0) return [];

  // Not in the generated types yet (`types:generate` needs an access token this checkout lacks).
  const { data, error } = await (supabase as any).rpc('global_search', {
    p_workspace_id: workspaceId,
    p_query: q,
    p_kinds: kinds,
    p_per_kind: perKind,
  });
  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((row) => SPEC_BY_KIND.has(row?.kind))
    .map((row) => ({
      kind: row.kind as GlobalSearchKind,
      id: String(row.id),
      title: row.title || 'Untitled',
      subtitle: row.subtitle ?? null,
      badge: row.badge ?? null,
      matchRank: typeof row.match_rank === 'number' ? row.match_rank : 2,
    }));
}

/**
 * Resolve thumbnails for product hits — the one kind the palette showed an image for before this
 * became a general search, and worth a second query to keep. Failure is silent: a missing
 * thumbnail falls back to the kind icon, which is not worth losing the whole palette over.
 */
export async function attachProductImages(hits: GlobalSearchHit[]): Promise<GlobalSearchHit[]> {
  const ids = hits.filter((hit) => hit.kind === 'product').map((hit) => hit.id);
  if (ids.length === 0) return hits;

  try {
    const { getProductImageUrl, PRODUCT_IMAGE_SELECT } = await import('@/utils/productMetadata');
    const { data } = await supabase
      .from('products')
      .select(`id, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .in('id', ids);

    const byId = new Map<string, string | null>(
      ((data ?? []) as any[]).map((row) => [String(row.id), getProductImageUrl(row)]),
    );
    return hits.map((hit) =>
      hit.kind === 'product' ? { ...hit, imageUrl: byId.get(hit.id) ?? null } : hit,
    );
  } catch {
    return hits;
  }
}
