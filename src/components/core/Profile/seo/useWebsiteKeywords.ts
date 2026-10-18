import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { trackedKeywordStore, websiteMarketStore, type WebsiteMarket } from '@/services/userWebsitesService';

export function refreshTrackedKeywords(websiteId: string): Promise<void> {
  return trackedKeywordStore.refresh(websiteId);
}

export function refreshWebsiteMarket(websiteId: string): Promise<void> {
  return websiteMarketStore.refresh(websiteId);
}

/** One tracked-keyword set per website, shared by every row on the dashboard so "Tracked" agrees everywhere. */
export function useTrackedKeywords(websiteId: string): { tracked: Set<string>; ready: boolean } {
  const subscribe = useCallback((l: () => void) => trackedKeywordStore.subscribe(websiteId, l), [websiteId]);
  const tracked = useSyncExternalStore(subscribe, () => trackedKeywordStore.slot(websiteId).value);
  const slot = trackedKeywordStore.slot(websiteId);
  useEffect(() => { if (!slot.ready && !slot.inflight) void trackedKeywordStore.refresh(websiteId); }, [slot, websiteId]);
  return { tracked, ready: slot.ready };
}

/** The site's search market from `website_market`, shared so a change in the market control reaches every panel. */
export function useWebsiteMarket(websiteId: string): { market: WebsiteMarket | null; loading: boolean; reload: () => void } {
  const subscribe = useCallback((l: () => void) => websiteMarketStore.subscribe(websiteId, l), [websiteId]);
  const market = useSyncExternalStore(subscribe, () => websiteMarketStore.slot(websiteId).value);
  const slot = websiteMarketStore.slot(websiteId);
  useEffect(() => { if (!slot.ready && !slot.inflight) void websiteMarketStore.refresh(websiteId); }, [slot, websiteId]);
  const reload = useCallback(() => { void websiteMarketStore.refresh(websiteId); }, [websiteId]);
  return { market, loading: !slot.ready, reload };
}
