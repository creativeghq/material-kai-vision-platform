import React, { useCallback, useEffect, useSyncExternalStore } from 'react';

import { collectorEstimateStore, type CollectorKind } from '@/services/userWebsitesService';
import { formatNumber } from '@/utils/decimal';

/** "· up to N cr" beside a button that runs a paid collector once, from the price the schedule view shows. */
export const RunPrice: React.FC<{ websiteId: string; collector: CollectorKind }> = ({ websiteId, collector }) => {
  const subscribe = useCallback((l: () => void) => collectorEstimateStore.subscribe(websiteId, l), [websiteId]);
  const estimates = useSyncExternalStore(subscribe, () => collectorEstimateStore.slot(websiteId).value);
  const slot = collectorEstimateStore.slot(websiteId);
  useEffect(() => { if (!slot.ready && !slot.inflight) void collectorEstimateStore.refresh(websiteId); }, [slot, websiteId]);
  const credits = estimates?.find((e) => e.collector === collector)?.per_run_max_credits;
  if (credits == null) return null;
  return <span className="ml-1 text-[11px] font-normal text-muted-foreground">· up to {formatNumber(credits)} cr</span>;
};
