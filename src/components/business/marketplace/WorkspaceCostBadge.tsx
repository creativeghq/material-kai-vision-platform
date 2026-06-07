import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { marketplacePricingService, type WorkspacePrice } from '@/services/marketplacePricingService';

/**
 * Shows the active workspace's cascade cost for an operator-catalog product
 * (base + ancestor commissions, C2). Renders nothing for the operator itself or
 * when there's no commission uplift — so it's safe to drop anywhere.
 */
export const WorkspaceCostBadge: React.FC<{ productId: string; className?: string }> = ({ productId, className }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [price, setPrice] = useState<WorkspacePrice | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId || !productId) return;
    let cancelled = false;
    marketplacePricingService
      .getProductPrice(activeWorkspaceId, productId)
      .then((p) => { if (!cancelled) setPrice(p); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeWorkspaceId, productId]);

  if (!price || price.mode !== 'operator_catalog' || !price.cost_basis || price.ancestor_commission_pct <= 0) {
    return null;
  }
  const cur = price.currency || 'EUR';
  return (
    <div className={`text-xs rounded-md border border-primary/30 bg-primary/5 p-2 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Your cost</span>
        <span className="font-medium">{cur} {price.cost_basis.toFixed(2)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        base {cur} {price.base_price?.toFixed(2)} + {price.ancestor_commission_pct}% commission
      </div>
      <div className="text-[10px] text-muted-foreground/80 italic mt-0.5">
        Indicative — finalised at the base price on the invoice date.
      </div>
    </div>
  );
};
