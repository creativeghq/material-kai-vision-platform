/**
 * The two role bags a record link needs: which gates the persona passes, and which of the two
 * facts the destination routes branch on hold.
 *
 * Lifted out of `GlobalSearch.tsx` so the agent result cards ask the SAME question the ⌘K palette
 * asks. Both surfaces offer to open a record; if they disagree about who may, one of them sends
 * somebody to a permission wall — and it would be the one nobody tests, because the palette is
 * used every day and a tool card's link is used the first time a tool returns that record.
 */
import { useMemo } from 'react';

import { useFactoryRole } from '@/hooks/useFactoryRole';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import type { KindGateContext, SearchRouteContext } from '@/config/searchKinds';

export interface RecordLinkAccess {
  route: SearchRouteContext;
  gate: KindGateContext;
}

export function useRecordLinkAccess(): RecordLinkAccess {
  const { isPlatformOperator } = useFactoryRole();
  const { can, isWorkspaceManager } = usePermissions();
  const { isModuleAvailable } = useEntitlements();

  return useMemo(
    () => ({
      route: { isPlatformOperator, isWorkspaceManager },
      gate: { can, isModuleAvailable, isWorkspaceManager },
    }),
    [isPlatformOperator, isWorkspaceManager, can, isModuleAvailable],
  );
}
