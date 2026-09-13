/**
 * "This is your price", read-only (#405).
 *
 * Seeing a price and editing one were the same permission — the whole Pricing tab sits behind
 * `pricing.manage` — so a member or a sales rep saw no price anywhere in the product modal, while
 * they see one the moment they put the product on a quote. Hiding it here only added a detour.
 *
 * Cost, margin and the editors stay on the admin tab. The number comes from the ONE ladder, so
 * this line and a quote line cannot disagree.
 */
import React from 'react';
import { Tag } from 'lucide-react';
import { useCatalogPrices } from '@/hooks/useCatalogPrices';

export const ProductPriceLine: React.FC<{ workspaceId: string; productId: string }> = ({
  workspaceId, productId,
}) => {
  const ids = React.useMemo(() => [productId], [productId]);
  const { byProduct, loading, failed } = useCatalogPrices(workspaceId, ids);
  const price = byProduct[productId];

  if (loading) return null;
  // A refusal or an unreachable resolver is UNKNOWN, not "no price set" -- the live function
  // raises 42501 for a non-member, and saying the catalog has no price for this product would
  // be a positive claim built out of a failure (rule 3).
  if (failed) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-sunken px-3 py-2">
        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Price unavailable — could not be read just now.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface-sunken px-3 py-2">
      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        {price?.kind === 'your_price' ? 'Your price' : 'Retail'}
      </span>
      {price?.price != null ? (
        <>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {price.currency === 'EUR' ? '€' : `${price.currency} `}{price.price.toFixed(2)}
          </span>
          {price.discount_pct > 0 && (
            <span className="text-xs text-primary">({price.discount_pct}% off)</span>
          )}
        </>
      ) : (
        // A stated reason, never a 0 — which reads as free (rule 3).
        <span className="text-sm text-muted-foreground">
          — <span className="text-xs">no price set for this product in this workspace</span>
        </span>
      )}
    </div>
  );
};
