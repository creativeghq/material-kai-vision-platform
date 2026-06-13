/**
 * #214 — "X / Y used" badge for a per-plan quota on the active workspace. Hidden when the limit
 * is unlimited (-1, incl. the operator root) so it only nags plans that actually have a cap.
 *
 *   <WorkspaceQuotaBadge table="crm_contacts" quotaKey="max_contacts" label="contacts" />
 */
import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/core/ui/badge';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  /** A workspace-scoped table to count rows of (must have a `workspace_id` column). */
  table: string;
  /** The plan-limit key (e.g. 'max_contacts'). */
  quotaKey: string;
  /** Noun for the label, e.g. 'contacts'. */
  label: string;
}

export const WorkspaceQuotaBadge: React.FC<Props> = ({ table, quotaKey, label }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [used, setUsed] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    void (async () => {
      const [countRes, quotaRes] = await Promise.all([
        supabase.from(table).select('*', { count: 'exact', head: true }).eq('workspace_id', activeWorkspaceId),
        supabase.rpc('workspace_quota', { p_workspace_id: activeWorkspaceId, p_key: quotaKey }),
      ]);
      if (cancelled) return;
      setUsed(countRes.count ?? 0);
      setLimit(typeof quotaRes.data === 'number' ? quotaRes.data : -1);
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId, table, quotaKey]);

  // Unlimited (or still loading) → no badge.
  if (used === null || limit === null || limit < 0) return null;

  const atLimit = used >= limit;
  return (
    <Badge variant={atLimit ? 'destructive' : 'secondary'} className="text-[11px]" title={`${used} of ${limit} ${label} used on your plan`}>
      {used} / {limit} {label}
    </Badge>
  );
};
