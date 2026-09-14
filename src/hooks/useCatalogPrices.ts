/**
 * Each viewer's OWN price for a set of products, in one call (#405).
 *
 * There is ONE price ladder — `get_product_price_for_workspace` — and
 * `get_catalog_prices_for_workspace` loops it. Nothing here recomputes a price from parts: a
 * second derivation is how a list and a detail screen start disagreeing about what a product
 * costs, and a wrong price is a valid number.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CatalogPrice {
  price: number | null;
  discount_pct: number;
  currency: string;
  /** What the number IS, said by the resolver — never inferred from `discount_pct > 0`. */
  kind: 'your_price' | 'retail' | 'seller';
  /** No price has been set. Rendered as `—` with a reason, never as 0 (rule 3). */
  unpriced: boolean;
}

export interface CatalogPrices {
  byProduct: Record<string, CatalogPrice>;
  /** True when more ids were asked for than the resolver will answer in one call. */
  capped: boolean;
  loading: boolean;
  /**
   * The resolver refused or was unreachable. DISTINCT from "this product has no price": the live
   * function raises 42501 for a non-member, and rendering that as "no price set" would be a
   * positive claim about the catalog built out of a failure (rule 3).
   */
  failed: boolean;
}

export function useCatalogPrices(
  workspaceId: string | null | undefined,
  productIds: string[],
): CatalogPrices {
  const [byProduct, setByProduct] = useState<Record<string, CatalogPrice>>({});
  const [capped, setCapped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Stable key so the fetch fires on the actual product set, not on every parent re-render.
  const idsKey = useMemo(() => productIds.filter(Boolean).join(','), [productIds]);

  useEffect(() => {
    // Nothing to ask about is not a pending state: leaving `loading` true here left every
    // consumer rendering nothing, for ever.
    if (!workspaceId || !idsKey) {
      setByProduct({}); setCapped(false); setFailed(false); setLoading(false); return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    supabase
      .rpc('get_catalog_prices_for_workspace' as never, {
        p_workspace_id: workspaceId, p_product_ids: idsKey.split(','),
      } as never)
      .then(({ data, error }) => {
        if (cancelled) return;
        // A PostgREST refusal is NOT a throw: it arrives as { data: null, error }. Read as a
        // clean empty answer it becomes the positive claim "this product has no price".
        if (error) { setByProduct({}); setCapped(false); setFailed(true); return; }
        const payload = data as unknown as {
          prices?: Array<Record<string, unknown>>; asked?: number; returned?: number;
        } | null;
        const rows = Array.isArray(payload?.prices) ? payload!.prices! : [];
        const map: Record<string, CatalogPrice> = {};
        for (const r of rows) {
          map[String(r.product_id)] = {
            price: r.price != null ? Number(r.price) : null,
            discount_pct: Number(r.discount_pct) || 0,
            currency: String(r.currency || 'EUR'),
            kind: (r.kind as CatalogPrice['kind']) ?? 'retail',
            unpriced: !!r.unpriced,
          };
        }
        setByProduct(map);
        // Said out loud: a capped call that silently answered fewer products would render the
        // rest as "no price", which is a different fact.
        setCapped(Number(payload?.asked ?? 0) > Number(payload?.returned ?? 0));
      })
      .catch(() => { if (!cancelled) { setByProduct({}); setCapped(false); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, idsKey]);

  return { byProduct, capped, loading, failed };
}
