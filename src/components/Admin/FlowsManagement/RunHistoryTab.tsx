import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Play, RefreshCw, TestTube } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { FilterBar, useFilters } from '@/components/core/filters';
import { flowService } from '@/services/flows';
import type { Flow, FlowRunResult, FlowRunStep, FlowRunStatus, FlowStepStatus } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import { DataFields } from '@/components/shared/DataFields';
import { buildFlowRunFilters } from './flowRunFilters';
import { triggerLabel } from './utils/paletteItems';

type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const RUN_TONE: Record<FlowRunStatus, Tone> = {
  pending: 'neutral', running: 'info', completed: 'success', failed: 'error', cancelled: 'warning', timed_out: 'error',
};
const STEP_TONE: Record<FlowStepStatus, Tone> = {
  pending: 'neutral', running: 'info', completed: 'success', skipped: 'warning', failed: 'error',
};

const PAGE_SIZE = 50;

const fmtMs = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${formatNumber(ms / 1000, { maxDecimals: 1 })} s`);

/** Why a skipped step did nothing, from the engine's `{ skipped, reason }` output. */
const skipReason = (step: FlowRunStep) => {
  const r = (step.output_data as { reason?: unknown } | null)?.reason;
  return typeof r === 'string' ? humanizeLabel(r) : null;
};

export function RunHistoryTab({ flows }: { flows: Flow[] }) {
  const [runs, setRuns] = useState<FlowRunResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<FlowRunStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const { toast } = useToast();

  const flowName = useMemo(() => new Map(flows.map((f) => [f.id, f.name])), [flows]);
  const filterGroups = useMemo(() => buildFlowRunFilters(runs, flows), [runs, flows]);
  const { values: filterValues, setValues: setFilterValues, filtered: visibleRuns, previewCount, activeCount, reset } =
    useFilters<FlowRunResult>(runs, filterGroups);

  // status + flow_id narrow the query itself, so a page is PAGE_SIZE matching runs.
  const statusFilter = filterValues.status as string | undefined;
  const flowFilter = filterValues.flow_id as string | undefined;

  useEffect(() => { setPage(0); }, [statusFilter, flowFilter]);

  const loadRuns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await flowService.getFlowRuns(flowFilter, {
        status: statusFilter, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
      });
      setRuns(res.runs);
      setTotal(res.total);
    } catch (error) {
      toast({ title: 'Could not load run history', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, flowFilter, page, toast]);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const toggleExpand = useCallback(async (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setExpandedSteps([]);
      return;
    }
    setExpandedRunId(runId);
    setLoadingSteps(true);
    try {
      setExpandedSteps((await flowService.getRunDetails(runId)).steps);
    } catch {
      setExpandedSteps([]);
    } finally {
      setLoadingSteps(false);
    }
  }, [expandedRunId]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            title="Filter flow runs"
            searchPlaceholder="Search trigger / error…"
          />
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatNumber(total)} run{total === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Newer runs">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">Page {page + 1} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Older runs">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => void loadRuns()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visibleRuns.length === 0 ? (
        activeCount > 0 ? (
          <HubEmptyState variant="filtered" title="No runs match these filters" action={<Button size="sm" variant="outline" onClick={reset}>Clear filters</Button>} />
        ) : (
          <HubEmptyState icon={Play} title="No runs yet" description="A run appears here when a flow fires, or when you run or test one from My Flows." />
        )
      ) : (
        <div className="space-y-2">
          {visibleRuns.map((run) => {
            const isExpanded = expandedRunId === run.id;
            const skipped = run.skipped_steps ?? 0;
            return (
              <Card key={run.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    onClick={() => void toggleExpand(run.id)}
                    className="w-full flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <Badge variant={RUN_TONE[run.status] ?? 'neutral'}>{humanizeLabel(run.status)}</Badge>
                      {run.status === 'completed' && skipped > 0 && <Badge variant="warning">{skipped} Skipped</Badge>}
                      {run.is_test_run && <Badge variant="info"><TestTube className="h-3 w-3 mr-1" />Test</Badge>}
                      <span className="truncate text-sm font-medium">{flowName.get(run.flow_id) ?? 'Deleted flow'}</span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{triggerLabel(run.trigger_type)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                      <span>{fmtMs(run.duration_ms)}</span>
                      <span>{formatDate(run.created_at, { withTime: true })}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-hairline px-4 py-3 bg-surface-sunken">
                      {run.error_message && (
                        <div className="mb-3 rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] p-2 text-sm text-[hsl(var(--error))]">
                          {run.error_message}
                        </div>
                      )}
                      {loadingSteps ? (
                        <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                      ) : expandedSteps.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">This run recorded no steps.</p>
                      ) : (
                        <ol className="space-y-1.5">
                          {expandedSteps.map((step, i) => (
                            <li key={step.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                              <Badge variant={STEP_TONE[step.status] ?? 'neutral'}>{humanizeLabel(step.status)}</Badge>
                              <span className="font-medium">{step.node_label || humanizeLabel(step.node_type)}</span>
                              <span className="text-muted-foreground">{humanizeLabel(step.node_type)}</span>
                              {step.branch_taken && <span className="text-muted-foreground">→ {humanizeLabel(step.branch_taken)}</span>}
                              <span className="text-muted-foreground tabular-nums">{fmtMs(step.duration_ms)}</span>
                              {step.status === 'skipped' && skipReason(step) && (
                                <span className="text-muted-foreground">({skipReason(step)})</span>
                              )}
                              {step.error_message && <span className="text-[hsl(var(--error))] break-words">{step.error_message}</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                      {run.trigger_event_data && Object.keys(run.trigger_event_data).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-hairline">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Trigger Data</p>
                          <DataFields data={run.trigger_event_data} raw className="text-xs bg-card rounded-sm p-2 overflow-auto max-h-48" />
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
