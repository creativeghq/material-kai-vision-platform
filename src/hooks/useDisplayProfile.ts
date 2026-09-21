import { useEffect, useSyncExternalStore } from 'react';

import {
  type DisplayProfile,
  getCachedDisplayProfile,
  requestDisplayProfiles,
  subscribeDisplayProfiles,
} from '@/services/displayProfilesService';

export function useDisplayProfile(userId?: string | null): DisplayProfile | null {
  const cached = useSyncExternalStore(
    subscribeDisplayProfiles,
    () => (userId ? getCachedDisplayProfile(userId) : null),
    () => null,
  );
  useEffect(() => {
    if (userId && cached === undefined) requestDisplayProfiles([userId]);
  }, [userId, cached]);
  return cached ?? null;
}
