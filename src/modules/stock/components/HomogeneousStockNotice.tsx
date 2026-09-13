/**
 * Can this line be filled from ONE lot? (#420)
 *
 * 200 m² split across three tones cannot fill a 200 m² order. Mixing shows on the floor —
 * especially after grouting — so the answer has to appear at quote time, not on delivery day,
 * and it has to be the largest single pool rather than the sum that looks so much better.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Layers, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  stockPoolService, wouldMixPools, describePool,
  type HomogeneousAvailability,
} from '@/modules/stock/services/stockPoolService';

export const HomogeneousStockNotice: React.FC<{
  /** The product, resolved to its pools server-side: a quote line knows nothing about shelves. */
  productId: string | null | undefined;
  quantity: number;
}> = ({ productId, quantity }) => {
  const { activeWorkspaceId: workspaceId } = useWorkspace();
  const [availability, setAvailability] = useState<HomogeneousAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !productId || !(quantity > 0)) { setAvailability(null); return; }
    setLoading(true);
    stockPoolService.availabilityForProduct(workspaceId, productId, quantity)
      .then((a) => { if (!cancelled) { setAvailability(a); setFailed(false); } })
      .catch(() => { if (!cancelled) { setAvailability(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, productId, quantity]);

  if (loading && !availability) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking lots…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="text-[11px] text-muted-foreground">
        The lots could not be checked just now. That is not a statement that this comes from one.
      </p>
    );
  }

  if (!availability || availability.status === 'not_found') return null;

  // A line that fits one pool says which, quietly: the operator needs the lot on the picking
  // note, and a green tick tells them nothing they can act on.
  if (!wouldMixPools(availability)) {
    const where = describePool(availability);
    return where
      ? <p className="text-[11px] text-muted-foreground">From one pool — {where}.</p>
      : null;
  }

  return (
    <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-1.5 text-[11px] text-amber-800 dark:text-amber-300">
      {availability.status === 'only_opened_packs'
        ? <Layers className="mt-0.5 h-3 w-3 shrink-0" />
        : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
      <span>{availability.reason}</span>
    </p>
  );
};
