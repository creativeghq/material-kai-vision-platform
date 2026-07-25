import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, XCircle } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/core/ui/sheet';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { listRuns, cancelRun, formatDuration } from '@/services/backgroundAgents';
import type { BackgroundAgent, AgentRun } from '@/services/backgroundAgents';
import { statusTone } from '@/utils/statusTone';
import { AgentLogsViewer } from './AgentLogsViewer';
import { JobResearchSavedJobsPanel } from './JobResearchSavedJobsPanel';
import { TechRadarFindingsPanel } from './TechRadarFindingsPanel';

interface AgentRunHistoryDrawerProps {
  agent:   BackgroundAgent | null;
  open:    boolean;
  onClose: () => void;
}

export function AgentRunHistoryDrawer({ agent, open, onClose }: AgentRunHistoryDrawerProps) {
  const [runs, setRuns]       = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    if (!agent) return;
    setLoading(true);
    try {
      setRuns(await listRuns(agent.id, 30));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && agent) load();
  }, [open, agent]);

  const handleCancel = async (runId: string) => {
    await cancelRun(runId);
    load();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center justify-between gap-2">
            <span>Run History — {agent?.name}</span>
            <Button size="icon" variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </SheetTitle>
        </SheetHeader>

        {/* v0.3: job-research agents get an inline saved/applied triage panel above the run history */}
        {agent?.agent_type === 'job-research' && (agent.config?.tracked_job_id as string | undefined) && (
          <div className="mb-6 pb-4 border-b">
            <JobResearchSavedJobsPanel trackedJobId={agent.config.tracked_job_id as string} />
          </div>
        )}

        {/* tech-radar agents get their accumulated findings inline above the run history */}
        {agent?.agent_type === 'tech-radar' && (agent.config?.subject_id as string | undefined) && (
          <div className="mb-6 pb-4 border-b">
            <TechRadarFindingsPanel subjectId={agent.config.subject_id as string} />
          </div>
        )}

        {runs.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No runs yet. Trigger the agent manually to create the first run.
          </p>
        )}

        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="border rounded-lg overflow-hidden">
              {/* Run header */}
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left cursor-pointer"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(expanded === run.id ? null : run.id); } }}
              >
                {expanded === run.id
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}

                <span className={`text-xs capitalize ${statusTone(run.status)}`}>
                  {run.status}
                </span>

                <span className="text-xs text-muted-foreground capitalize">{run.triggered_by}</span>

                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDuration(run.duration_ms)}
                </span>

                <span className="text-xs text-muted-foreground">
                  {new Date(run.created_at).toLocaleString()}
                </span>

                {(run.status === 'pending' || run.status === 'processing') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 ml-1"
                    onClick={(e) => { e.stopPropagation(); handleCancel(run.id); }}
                    title="Cancel"
                  >
                    <XCircle className="h-3 w-3 text-red-500" />
                  </Button>
                )}
              </div>

              {/* Expanded detail */}
              {expanded === run.id && (
                <div className="px-3 pb-3 space-y-3 border-t">
                  {/* Tokens + credits + model + chain */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2">
                    <span>In: {run.input_tokens.toLocaleString()} tok</span>
                    <span>Out: {run.output_tokens.toLocaleString()} tok</span>
                    {run.credits_debited > 0 && (
                      <span>{run.credits_debited.toFixed(2)} credits</span>
                    )}
                    {run.model_used && <span>Model: {run.model_used}</span>}
                    {run.trigger_event_type && <span>Event: {run.trigger_event_type}</span>}
                    {run.parent_run_id && (
                      <span>Chain parent: <code>{run.parent_run_id.slice(0, 8)}…</code></span>
                    )}
                    {run.recovery_attempts > 0 && (
                      <Badge variant="outline" className="text-xs">recovered {run.recovery_attempts}×</Badge>
                    )}
                    {run.delegated_to_python && (
                      <Badge variant="outline" className="text-xs">Python backend</Badge>
                    )}
                  </div>

                  {/* Error */}
                  {run.error_message && (
                    <div className="text-xs text-red-500 bg-red-50 rounded p-2">
                      {run.error_message}
                    </div>
                  )}

                  {/* Output */}
                  {run.output_data && Object.keys(run.output_data).length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-1">Output</p>
                      <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">
                        {JSON.stringify(run.output_data, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Logs */}
                  <div>
                    <p className="text-xs font-medium mb-1">Logs</p>
                    <AgentLogsViewer
                      runId={run.id}
                      live={run.status === 'processing'}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
