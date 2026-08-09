import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Wrench, FileWarning, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Skeleton } from '@/components/core/ui/skeleton';
import type { JobFailureSummary, PipelineError } from '../types';
import { formatDate } from '@/utils/datetime';

interface Props {
  jobId: string;
  failureSummary: JobFailureSummary | null | undefined;
}

const sourceIcon: Record<PipelineError['source'], JSX.Element> = {
  product_failure: <FileWarning className="h-4 w-4" />,
  job_failure: <AlertTriangle className="h-4 w-4" />,
  ocr_failure: <Wrench className="h-4 w-4" />,
  recovery_attempt: <RotateCcw className="h-4 w-4" />,
};

const sourceLabel: Record<PipelineError['source'], string> = {
  product_failure: 'Product',
  job_failure: 'Job',
  ocr_failure: 'OCR',
  recovery_attempt: 'Recovery',
};

const severityClass = (s: PipelineError['severity']): string => {
  switch (s) {
    case 'error':
      return 'border-red-500/40 bg-red-500/10 text-red-300';
    case 'warning':
      return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300';
    default:
      return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
  }
};

/**
 * Pipeline error observability panel — embedded in the AsyncJobQueueMonitor
 * job-detail modal. Pulls from the `pipeline_errors` SQL view (unified across
 * product_processing_status / background_jobs / paddleocr_metrics /
 * recovery_history) and the `failure_summary` aggregate on background_jobs.
 *
 * Renders nothing when failureSummary is null/undefined (clean job).
 */
export function PipelineErrorsPanel({ jobId, failureSummary }: Props) {
  const [errors, setErrors] = useState<PipelineError[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    // Don't bother fetching if the aggregate says there's nothing to show.
    if (!failureSummary) {
      setErrors([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('pipeline_errors' as any)
        .select('*')
        .eq('job_id', jobId)
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(50);

      if (cancelled) return;
      if (error) {
        console.error('[PipelineErrorsPanel] fetch failed', error);
        setErrors([]);
      } else {
        setErrors((data || []) as unknown as PipelineError[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, failureSummary]);

  if (!failureSummary) return null;

  const summaryChips: { label: string; value: number; tone: string }[] = [];
  if (failureSummary.products_failed > 0) {
    summaryChips.push({
      label: 'Products failed',
      value: failureSummary.products_failed,
      tone: 'border-red-500/40 bg-red-500/10 text-red-300',
    });
  }
  if (failureSummary.ocr_failures > 0) {
    summaryChips.push({
      label: 'OCR failures',
      value: failureSummary.ocr_failures,
      tone: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
    });
  }
  if (failureSummary.ocr_retries_succeeded > 0) {
    summaryChips.push({
      label: 'OCR recovered after retry',
      value: failureSummary.ocr_retries_succeeded,
      tone: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
    });
  }
  if (failureSummary.recovery_attempts > 0) {
    summaryChips.push({
      label: failureSummary.recovery_succeeded > 0
        ? `Recovery (${failureSummary.recovery_succeeded}/${failureSummary.recovery_attempts} ok)`
        : 'Recovery attempts',
      value: failureSummary.recovery_attempts,
      tone:
        failureSummary.recovery_exhausted > 0
          ? 'border-red-500/40 bg-red-500/10 text-red-300'
          : 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    });
  }

  const stageBreakdown = Object.entries(failureSummary.products_failed_by_stage || {}).filter(
    ([, n]) => n > 0,
  );

  return (
    <Card className="dashboard-card border-red-500/30">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h3 className="font-semibold text-foreground">Pipeline Errors</h3>
            <span className="text-xs text-muted-foreground">
              ({errors.length} {errors.length === 1 ? 'event' : 'events'})
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="h-7 px-2"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {/* Summary chips — always visible */}
        <div className="flex flex-wrap gap-2">
          {summaryChips.map((chip) => (
            <Badge
              key={chip.label}
              variant="outline"
              className={`${chip.tone} font-mono`}
            >
              {chip.label}: {chip.value}
            </Badge>
          ))}
          {stageBreakdown.length > 0 && (
            <Badge variant="outline" className="border-white/20 font-mono text-xs">
              Stages: {stageBreakdown.map(([s, n]) => `${s}=${n}`).join(' · ')}
            </Badge>
          )}
        </div>

        {/* Detailed event list — collapsible */}
        {expanded && (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {loading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : errors.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                No detailed events recorded for this job.
              </div>
            ) : (
              errors.map((err, i) => (
                <div
                  key={`${err.source}-${err.occurred_at ?? 'n/a'}-${i}`}
                  className={`rounded border px-2.5 py-1.5 text-xs ${severityClass(err.severity)}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {sourceIcon[err.source]}
                    <span className="font-semibold">{sourceLabel[err.source]}</span>
                    {err.product_name && (
                      <span className="font-mono text-foreground/80">{err.product_name}</span>
                    )}
                    {err.stage && (
                      <span className="text-[10px] text-muted-foreground">{err.stage}</span>
                    )}
                    {err.occurred_at && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatDate(err.occurred_at, { withTime: true })}
                      </span>
                    )}
                  </div>
                  {err.error_message && (
                    <div className="text-foreground/90 break-words">{err.error_message}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
