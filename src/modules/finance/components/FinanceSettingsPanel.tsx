/**
 * Finance Settings — panel surface for `/admin/modules/sales-finance/settings`.
 *
 * Thin wrapper around the existing SettingsTab (which is also mounted as a tab
 * inside `/admin/finance`). Resolves the current user's workspace_id and
 * passes a no-op `onSettingsChanged` callback (the FinancePage uses that
 * callback to refresh its own state; the Module Settings page doesn't care).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SettingsTab } from '../tabs/SettingsTab';

interface Props {
  embedded?: boolean;
}

export const FinanceSettingsPanel: React.FC<Props> = (_props) => {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) { setError('Not authenticated'); setLoading(false); } return; }
        const { data: member } = await (supabase as any)
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!cancelled) {
          setWorkspaceId(member?.workspace_id ?? null);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || 'Failed to resolve workspace'); setLoading(false); }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

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
