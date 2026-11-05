/** Commercial → Cost report: is this job making money. Daily work lives in Invoicing and Purchases. */
import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Loader2, ArrowDownLeft, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/core/ui/card';
import { HubStatGrid, HubStatTile } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { JobCostCard } from '../JobCostCard';
import { CvrCard } from '../CvrCard';
import { CostControlCard } from '../CostControlCard';
import { ProjectLabourCard } from '../ProjectLabourCard';
import { ProjectStockCard } from '../ProjectStockCard';
import { projectsService, type ProjectFinanceSummary } from '../../services/projectsService';
import type { ProjectTab } from '../../projectSections';

export const CostReportTab: React.FC<{ projectId: string; onOpenSection: (tab: ProjectTab) => void }> = ({ projectId, onOpenSection }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [summary, setSummary] = useState<ProjectFinanceSummary | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await projectsService.getProjectFinanceSummary(projectId));
      setFailed(false);
    } catch {
      setFailed(true);
      toast({ title: 'Failed to load receivables and payables', variant: 'destructive' });
    }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const currency = summary?.currencies[0] ?? 'EUR';
  const mixed = (summary?.currencies.length ?? 0) > 1;
  const t = summary?.totals;

  return (
    <div className="space-y-4">
      <JobCostCard projectId={projectId} workspaceId={activeWorkspaceId} />
      <CvrCard projectId={projectId} currency={currency} />
      <CostControlCard projectId={projectId} currency={currency} />
      <ProjectLabourCard projectId={projectId} currency={summary?.currencies[0] ?? null} />
      <ProjectStockCard projectId={projectId} />

      {mixed && (
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          This project mixes {summary?.currencies.join(', ')}. The totals below add different
          currencies together and are indicative only.
        </p>
      )}
      {failed ? (
        <Card className="p-4 text-sm text-amber-800 dark:text-amber-300">
          Receivables and payables could not be loaded. They are unknown, not zero.
        </Card>
      ) : !t ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <HubStatGrid>
          <HubStatTile
            label="Customers Owe"
            category={`of ${formatMoney(t.receivable_total, currency)} billed`}
            value={<span className="inline-flex items-center gap-1.5"><ArrowDownLeft className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />{formatMoney(t.receivable_due, currency)}</span>}
            onClick={() => onOpenSection('billing')}
          />
          <HubStatTile
            label="We Owe Suppliers"
            category={`of ${formatMoney(t.payable_total, currency)} billed`}
            value={<span className="inline-flex items-center gap-1.5"><ArrowUpRight className="h-4 w-4 text-amber-800 dark:text-amber-400" />{formatMoney(t.payable_due, currency)}</span>}
            onClick={() => onOpenSection('purchases')}
          />
        </HubStatGrid>
      )}
    </div>
  );
};
