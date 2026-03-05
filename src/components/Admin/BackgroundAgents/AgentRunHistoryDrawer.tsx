import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, XCircle } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/core/ui/sheet';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { listRuns, cancelRun, formatDuration, statusColor } from '@/services/backgroundAgents';
import type { BackgroundAgent, AgentRun } from '@/services/backgroundAgents';
import { AgentLogsViewer } from './AgentLogsViewer';

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

        {runs.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No runs yet. Trigger the agent manually to create the first run.
          </p>
        )}

        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="border rounded-lg overflow-hidden">
              {/* Run header */}
              <button
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                {expanded === run.id
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}

                <Badge className={`text-xs ${statusColor(run.status)}`}>
                  {run.status}
                </Badge>

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
              </button>

              {/* Expanded detail */}
              {expanded === run.id && (
                <div className="px-3 pb-3 space-y-3 border-t">
                  {/* Tokens + credits */}
                  <div className="flex gap-4 text-xs text-muted-foreground pt-2">
                    <span>In: {run.input_tokens.toLocaleString()} tok</span>
                    <span>Out: {run.output_tokens.toLocaleString()} tok</span>
                    {run.credits_debited > 0 && (
                      <span>{run.credits_debited.toFixed(2)} credits</span>
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
