import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Workflow } from 'lucide-react';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { HqTabbedPage } from '@/components/Admin/HQ/HqTabbedPage';
import { MyFlowsTab } from './MyFlowsTab';
import { FlowBuilderTab } from './FlowBuilderTab';
import { RunHistoryTab } from './RunHistoryTab';
import { SystemAreasTab } from './SystemAreasTab';
import { useFlowBuilder } from './hooks/useFlowBuilder';
import { flowService } from '@/services/flows';
import type { Flow, FlowRunStats } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';
import { formatNumber } from '@/utils/decimal';

/** Operator Flows: the global (platform-default) automations. Tenants manage theirs at /automations. */
export const FlowsManagement: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [stats, setStats] = useState<Map<string, FlowRunStats>>(new Map());
  const [statsError, setStatsError] = useState(false);
  const { toast } = useToast();
  const selectedFlowId = params.get('flow');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [allFlows, runStats] = await Promise.all([
        flowService.listFlows(),
        flowService.getFlowRunStats().catch(() => null),
      ]);
      setFlows(allFlows);
      setStats(runStats ?? new Map());
      setStatsError(runStats === null);
    } catch (error) {
      toast({ title: 'Could not load flows', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadData(); }, [loadData]);

  const openBuilder = useCallback((flowId: string | null) => {
    const builder = useFlowBuilder.getState();
    if (builder.isDirty && builder.flowId && builder.flowId !== flowId
      && !window.confirm(`"${builder.flowName}" has unsaved changes. Leave without saving?`)) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'builder');
      if (flowId) next.set('flow', flowId); else next.delete('flow');
      return next;
    });
  }, [setParams]);

  const totals = useMemo(() => {
    let runs = 0;
    let failed = 0;
    let failing = 0;
    for (const s of stats.values()) {
      runs += s.runs30d;
      failed += s.failed7d;
      if (s.failed7d > 0) failing++;
    }
    return { active: flows.filter((f) => f.status === 'active').length, runs, failed, failing };
  }, [flows, stats]);

  const unknown = statsError ? '—' : null;

  return (
    <HqTabbedPage
      icon={Workflow}
      title="Flows"
      subtitle="Platform notification and automation flows: what triggers them, what they do, and whether they are working. Workspaces manage their own under Automations."
      tabs={[
        {
          id: 'my-flows',
          label: 'My Flows',
          count: totals.failing || undefined,
          render: () => (
            <>
              <HubStatGrid>
                <HubStatTile label="Flows" value={formatNumber(flows.length)} category={`${formatNumber(totals.active)} active`} />
                <HubStatTile label="Runs (30 Days)" value={unknown ?? formatNumber(totals.runs)} category={statsError ? 'Run history could not be read' : 'Real runs, tests excluded'} />
                <HubStatTile label="Failed Runs (7 Days)" value={unknown ?? formatNumber(totals.failed)} category="Runs that ended failed" />
                <HubStatTile label="Flows Failing" value={unknown ?? formatNumber(totals.failing)} category="At least one failure in 7 days" />
              </HubStatGrid>
              <MyFlowsTab flows={flows} loading={loading} stats={stats} onRefresh={() => void loadData()} onOpenBuilder={openBuilder} />
            </>
          ),
        },
        {
          id: 'builder',
          label: 'Flow Builder',
          render: () => <FlowBuilderTab flowId={selectedFlowId} flows={flows} onSelectFlow={openBuilder} onSaved={() => void loadData()} />,
        },
        { id: 'areas', label: 'System Areas', render: () => <SystemAreasTab flows={flows} onRefresh={() => void loadData()} onOpenBuilder={openBuilder} /> },
        { id: 'history', label: 'Run History', render: () => <RunHistoryTab flows={flows} /> },
      ]}
    />
  );
};
