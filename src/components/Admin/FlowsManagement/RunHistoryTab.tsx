import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  ChevronDown,
  ChevronRight,
  TestTube,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { FilterBar, useFilters } from '@/components/core/filters';
import { flowService } from '@/services/flows';
import type { Flow, FlowRun, FlowRunStep, FlowRunStatus } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';
import { buildFlowRunFilters } from './flowRunFilters';

const statusConfig: Record<FlowRunStatus, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-gray-500', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-amber-500', label: 'Cancelled' },
  timed_out: { icon: AlertTriangle, color: 'text-orange-500', label: 'Timed Out' },
};

const stepStatusColors: Record<string, string> = {
  pending: 'bg-gray-400',
  running: 'bg-blue-400',
  completed: 'bg-emerald-400',
  skipped: 'bg-gray-300',
  failed: 'bg-red-400',
};

export function RunHistoryTab() {
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<FlowRunStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const { toast } = useToast();

  const filterGroups = useMemo(() => buildFlowRunFilters(runs, flows), [runs, flows]);
  const { values: filterValues, setValues: setFilterValues, filtered: visibleRuns, previewCount } =
    useFilters<FlowRun>(runs, filterGroups);

  // status + flow_id are the two server-side fields — they narrow the query itself so the
  // 50-row page is 50 matching runs, not 50 recent runs of which a few match.
  const statusFilter = filterValues.status as string | undefined;
  const flowFilter = filterValues.flow_id as string | undefined;

  const loadRuns = useCallback(async () => {
    try {
      setLoading(true);
      const [data, flowList] = await Promise.all([
        flowService.getFlowRuns(flowFilter, statusFilter ? { status: statusFilter } : undefined),
        flowService.listFlows(),
      ]);
      setRuns(data);
      setFlows(flowList);
    } catch (_error) {
      toast({
        title: 'Error',
        description: 'Failed to load run history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, flowFilter, toast]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const toggleExpand = useCallback(async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setExpandedSteps([]);
      return;
    }

    setExpandedRunId(runId);
    setLoadingSteps(true);
    try {
      const details = await flowService.getRunDetails(runId);
      setExpandedSteps(details.steps);
    } catch {
      setExpandedSteps([]);
    } finally {
      setLoadingSteps(false);
    }
  }, [expandedRunId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            title="Filter flow runs"
            searchPlaceholder="Search trigger / error…"
          />
          <span className="text-sm text-muted-foreground">
            {visibleRuns.length} run{visibleRuns.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={loadRuns} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Empty state */}
      {visibleRuns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Play className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No runs yet</h3>
            <p className="text-sm text-muted-foreground">
              Execute or test a flow to see run history here
            </p>
          </CardContent>
        </Card>
      )}

      {/* Runs list */}
      <div className="space-y-2">
        {visibleRuns.map((run) => {
          const cfg = statusConfig[run.status] || statusConfig.pending;
          const StatusIcon = cfg.icon;
          const isExpanded = expandedRunId === run.id;

          return (
            <Card key={run.id} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Run header */}
                <button
                  onClick={() => toggleExpand(run.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className={`text-xs inline-flex items-center ${cfg.color}`}>
                      <StatusIcon className={`h-3 w-3 mr-1 ${run.status === 'running' ? 'animate-spin' : ''}`} />
                      {cfg.label}
                    </span>
                    {run.is_test_run && (
                      <span className="text-xs inline-flex items-center text-purple-500">
                        <TestTube className="h-3 w-3 mr-1" />
                        Test
                      </span>
                    )}
                    <span className="text-sm font-medium">
                      {run.trigger_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {run.duration_ms && (
                      <span>{run.duration_ms}ms</span>
                    )}
                    <span>
                      {format(new Date(run.created_at), 'MMM d, HH:mm:ss')}
                    </span>
                  </div>
                </button>

                {/* Expanded: step details */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-muted/20">
                    {run.error_message && (
                      <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
                        {run.error_message}
                      </div>
                    )}

                    {loadingSteps ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : expandedSteps.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No step data available</p>
                    ) : (
                      <div className="space-y-1.5">
                        {expandedSteps.map((step, i) => (
                          <div
                            key={step.id}
                            className="flex items-center gap-3 text-xs py-1.5"
                          >
                            <span className="text-muted-foreground w-5 text-right">
                              {i + 1}
                            </span>
                            {/* The status word appears NOWHERE else in this row (node label,
                                type, branch, duration and error are all rendered, but not the
                                status), so colour was the sole carrier — WCAG 1.4.1. Worse,
                                `pending` and `skipped` are gray-400 and gray-300, which are
                                indistinguishable to a SIGHTED user too. Rendered as a visible
                                word rather than sr-only for exactly that reason. */}
                            <div
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${stepStatusColors[step.status] || 'bg-gray-400'}`}
                              aria-hidden="true"
                            />
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground min-w-[62px]">
                              {step.status}
                            </span>
                            <span className="font-medium min-w-[80px]">
                              {step.node_label || step.node_type}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {step.node_type}
                            </span>
                            {step.branch_taken && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                {step.branch_taken}
                              </span>
                            )}
                            {step.duration_ms !== null && (
                              <span className="text-muted-foreground">
                                {step.duration_ms}ms
                              </span>
                            )}
                            {step.error_message && (
                              <span className="text-red-500 truncate max-w-[200px]">
                                {step.error_message}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Trigger data */}
                    {run.trigger_event_data && Object.keys(run.trigger_event_data).length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Trigger Data</p>
                        <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-32">
                          {JSON.stringify(run.trigger_event_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
