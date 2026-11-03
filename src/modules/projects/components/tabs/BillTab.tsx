/** Specification → Bill: the priced schedule, with the takeoff lines a newer revision has moved (#532). */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PricedScheduleCard } from '../PricedScheduleCard';
import { takeoffService, type ProjectTakeoffSummary } from '../../services/takeoffService';
import { projectSectionPath } from '../../projectSections';

export const BillTab: React.FC<{ projectId: string; currency?: string | null }> = ({ projectId, currency }) => {
  const navigate = useNavigate();
  const { isWorkspaceManager } = usePermissions();
  const { activeWorkspaceId } = useWorkspace();
  const [summary, setSummary] = useState<ProjectTakeoffSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSummary(await takeoffService.projectSummary(projectId)); setSummaryError(null); }
    catch (e) { setSummary(null); setSummaryError((e as Error).message); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const remeasure = summary?.remeasure ?? [];
  const unread = summary?.not_analysed ?? [];

  return (
    <div className="space-y-4">
      {summaryError && (
        <div className="flex flex-wrap items-start gap-3 rounded-sm border border-hairline bg-card px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Could not check whether the drawings behind this bill have changed</p>
            <p className="text-xs text-muted-foreground">{summaryError}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
        </div>
      )}
      {unread.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-sm border border-hairline bg-card px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">The bill still quotes an older revision</p>
            <p className="text-xs text-muted-foreground">
              {unread.map((d) => `${d.label}: Rev ${d.rev_label} is not analysed, the bill uses Rev ${d.billed_rev_label}`).join(' · ')}
            </p>
          </div>
          <Button size="sm" variant="outline"
            onClick={() => navigate(projectSectionPath(projectId, 'takeoff', { revision: unread[0].revision_id }))}>
            Analyse in Takeoff
          </Button>
        </div>
      )}
      {remeasure.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-sm border border-hairline bg-card px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {remeasure.length} line{remeasure.length === 1 ? '' : 's'} depend{remeasure.length === 1 ? 's' : ''} on areas a newer drawing revision changed
            </p>
            <p className="text-xs text-muted-foreground">
              {remeasure.slice(0, 6).map((r) => [r.item_ref, r.description].filter(Boolean).join(' ')).join(' · ')}
              {remeasure.length > 6 ? ' …' : ''}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(projectSectionPath(projectId, 'takeoff'))}>
            Review in Takeoff
          </Button>
        </div>
      )}
      <PricedScheduleCard
        projectId={projectId}
        workspaceId={activeWorkspaceId}
        currency={currency ?? 'EUR'}
        isOwner={isWorkspaceManager}
        onChanged={() => void load()}
      />
    </div>
  );
};

export default BillTab;
