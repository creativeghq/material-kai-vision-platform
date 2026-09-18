import { useEffect, useSyncExternalStore } from 'react';

import {
  type DisplayProfile,
  getCachedDisplayProfile,
  requestDisplayProfiles,
  subscribeDisplayProfiles,
} from '@/services/displayProfilesService';

export function useDisplayProfile(userId?: string | null): DisplayProfile | null {
  const profile = useSyncExternalStore(
    subscribeDisplayProfiles,
    () => (userId ? getCachedDisplayProfile(userId) ?? null : null),
    () => null,
  );
  useEffect(() => {
    if (userId) requestDisplayProfiles([userId]);
  }, [userId]);
  return profile;
}
