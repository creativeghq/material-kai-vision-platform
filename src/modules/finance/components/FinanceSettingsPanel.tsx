/**
 * Finance Settings — panel surface for `/admin/modules/sales-finance/settings`.
 *
 * Thin wrapper around the existing SettingsTab (which is also mounted as a tab
 * inside `/admin/finance`). Resolves the current user's workspace_id and
 * passes a no-op `onSettingsChanged` callback (the FinancePage uses that
 * callback to refresh its own state; the Module Settings page doesn't care).
 */
import React, { useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { SettingsTab } from '../tabs/SettingsTab';

interface Props {
  embedded?: boolean;
}

export const FinanceSettingsPanel: React.FC<Props> = (_props) => {
  // Operate on the ACTIVE workspace (WorkspaceContext) — replaces the old
  // oldest-membership query that broke for multi-workspace users (#194).
  const { activeWorkspaceId, loading } = useWorkspace();
  const workspaceId = activeWorkspaceId;
  const error: string | null = null;

  const handleSettingsChanged = useCallback(() => {
    // No-op when mounted inside the Module Settings page — there's no parent
    // FinancePage to notify. Embedded surface only persists settings; the next
    // navigation to /admin/finance will pick up the fresh values.
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !workspaceId) {
    return (
      <div className="text-sm text-destructive py-6 text-center">
        {error || 'No workspace found for this user — Finance settings need a workspace context.'}
      </div>
    );
  }

  return <SettingsTab workspaceId={workspaceId} onSettingsChanged={handleSettingsChanged} />;
};
