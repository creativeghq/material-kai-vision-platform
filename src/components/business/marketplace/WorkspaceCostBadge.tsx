import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useShowPrices } from '@/hooks/useShowPrices';
import { marketplacePricingService, type WorkspacePrice } from '@/services/marketplacePricingService';

/**
 * Shows a reseller (dealer/architect) workspace its own buy price for an operator-catalog
 * product — i.e. what THEY pay (cost_basis = the resale-chain cost). Hidden for the operator
 * itself, for products with no resolvable cost, and when the global Show-Prices toggle is off.
 */
export const WorkspaceCostBadge: React.FC<{ productId: string; className?: string }> = ({ productId, className }) => {
  const { activeWorkspaceId } = useWorkspace();
  const { isOperator } = usePermissions();
  const { showPrices } = useShowPrices();
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

  // Only for resellers (the operator sees its own pricing elsewhere), and respects Show Prices.
  if (isOperator || !showPrices) return null;
  if (!price || price.mode !== 'operator_catalog' || price.cost_basis == null) return null;

  const cur = price.currency || 'EUR';
  return (
    <div className={`text-xs rounded-md border border-primary/30 bg-primary/5 p-2 ${className ?? ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Your cost</span>
        <span className="font-medium">{cur} {price.cost_basis.toFixed(2)}</span>
      </div>
      <div className="text-[10px] text-muted-foreground/80 italic mt-0.5">
        Indicative — finalised on the invoice date.
      </div>
    </div>
  );
};
