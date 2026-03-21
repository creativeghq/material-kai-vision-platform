/**
 * Background Agents — Monitoring Dashboard
 *
 * Read-only view of all background task runs dispatched by KAI chat
 * or any other trigger. Admins can inspect task details, view live logs,
 * and cancel running tasks, but cannot create/edit/delete agents from here.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Bot, RefreshCw, CheckCircle, XCircle, Clock, Loader2,
  ChevronDown, ChevronRight, XCircle as CancelIcon, Eye,
} from 'lucide-react';
import { Button }  from '@/components/core/ui/button';
import { Badge }   from '@/components/core/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { AgentLogsViewer }     from './AgentLogsViewer';
import { AgentRunHistoryDrawer } from './AgentRunHistoryDrawer';
import {
  listAgents, listRuns, cancelRun,
  formatDuration, statusColor,
} from '@/services/backgroundAgents';
import type { AgentRun, BackgroundAgent } from '@/services/backgroundAgents';
import { useToast } from '@/hooks/use-toast';

// ── Status icon helper ─────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed:  <CheckCircle className="h-4 w-4 text-green-500"                 />,
  failed:     <XCircle     className="h-4 w-4 text-red-500"                   />,
  processing: <Loader2     className="h-4 w-4 text-blue-500 animate-spin"     />,
  pending:    <Clock       className="h-4 w-4 text-yellow-500"                />,
  cancelled:  <XCircle     className="h-4 w-4 text-gray-400"                  />,
};

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

// ── Component ─────────────────────────────────────────────────────────────────

export function BackgroundAgentsPage() {
  const { toast } = useToast();

  const [agents,    setAgents]    = useState<BackgroundAgent[]>([]);
  const [runs,      setRuns]      = useState<AgentRun[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Per-row expanded logs
  const [expanded,  setExpanded]  = useState<string | null>(null);

  // Full history drawer (per agent)
  const [historyAgent, setHistoryAgent] = useState<BackgroundAgent | null>(null);

  // ── Load all recent runs across all agents ─────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const agentList = await listAgents();
      setAgents(agentList);

      // Pull latest 100 runs across all agents (30 per agent, then flatten + sort)
      const runArrays = await Promise.all(
        agentList.map(a => listRuns(a.id, 50).catch(() => [] as AgentRun[])),
      );
      const all = runArrays
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 100);
      setRuns(all);
    } catch (err: any) {
      toast({ title: 'Failed to load runs', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── Cancel a run ──────────────────────────────────────────────────────────
  const handleCancel = async (runId: string) => {
    try {
      await cancelRun(runId);
      setRuns(prev => prev.map(r =>
        r.id === runId ? { ...r, status: 'cancelled' } : r,
      ));
      toast({ title: 'Task cancelled' });
    } catch (err: any) {
      toast({ title: 'Cancel failed', description: err.message, variant: 'destructive' });
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const agentMap = new Map(agents.map(a => [a.id, a]));

  const getTaskTitle = (run: AgentRun): string => {
    const prompt = run.input_data?.task_prompt as string | undefined;
    if (prompt) return prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt;
    const agentName = agentMap.get(run.agent_id)?.name ?? 'Background Task';
    return agentName;
  };

  const filtered = statusFilter === 'all'
    ? runs
    : runs.filter(r => r.status === statusFilter);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = {
    total:      runs.length,
    running:    runs.filter(r => r.status === 'processing' || r.status === 'pending').length,
    completed:  runs.filter(r => r.status === 'completed').length,
    failed:     runs.filter(r => r.status === 'failed').length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Background Tasks</h1>
            <p className="text-sm text-muted-foreground">
              Monitor AI tasks dispatched from JARVIS chat and other triggers
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { label: 'Total Runs',  value: stats.total,     color: 'text-foreground'  },
          { label: 'Running',     value: stats.running,   color: 'text-blue-600'    },
          { label: 'Completed',   value: stats.completed, color: 'text-green-600'   },
          { label: 'Failed',      value: stats.failed,    color: 'text-red-600'     },
        ] as const).map(s => (
          <div key={s.label} className="border rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">All ({runs.length})</TabsTrigger>
          <TabsTrigger value="processing">Running ({stats.running})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({stats.failed})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading tasks…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No tasks yet</p>
          <p className="text-sm text-muted-foreground">
            Tasks will appear here when dispatched from JARVIS chat or triggered automatically
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((run) => {
            const agent     = agentMap.get(run.agent_id);
            const isExpanded = expanded === run.id;
            const isLive     = run.status === 'processing';

            return (
              <div key={run.id} className="border rounded-lg overflow-hidden">
                {/* Run header row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left"
                  onClick={() => setExpanded(isExpanded ? null : run.id)}
                >
                  {isExpanded
                    ? <ChevronDown  className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

                  {/* Status icon */}
                  <span className="shrink-0">{STATUS_ICON[run.status] ?? STATUS_ICON.pending}</span>

                  {/* Task title */}
                  <span className="flex-1 text-sm font-medium truncate">
                    {getTaskTitle(run)}
                  </span>

                  {/* Metadata chips */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs ${statusColor(run.status as any)}`}>
                      {run.status}
                    </Badge>

                    {agent && (
                      <Badge variant="outline" className="text-xs">
                        {agent.name}
                      </Badge>
                    )}

                    {run.delegated_to_python && (
                      <Badge variant="secondary" className="text-xs">Python</Badge>
                    )}

                    <span className="text-xs text-muted-foreground">
                      {formatDuration(run.duration_ms)}
                    </span>

                    <span className="text-xs text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </span>

                    {/* Cancel button for active runs */}
                    {(run.status === 'pending' || run.status === 'processing') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 ml-1"
                        title="Cancel task"
                        onClick={(e) => { e.stopPropagation(); handleCancel(run.id); }}
                      >
                        <CancelIcon className="h-3 w-3 text-red-500" />
                      </Button>
                    )}

                    {/* View agent history */}
                    {agent && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="All runs for this agent"
                        onClick={(e) => { e.stopPropagation(); setHistoryAgent(agent); }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t bg-muted/20">
                    {/* Full task prompt */}
                    {run.input_data?.task_prompt && (
                      <div className="pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Task</p>
                        <p className="text-sm whitespace-pre-wrap">{run.input_data.task_prompt as string}</p>
                      </div>
                    )}

                    {/* Token & credit summary */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>In: {run.input_tokens.toLocaleString()} tokens</span>
                      <span>Out: {run.output_tokens.toLocaleString()} tokens</span>
                      {run.credits_debited > 0 && (
                        <span>{run.credits_debited.toFixed(2)} credits</span>
                      )}
                      {run.triggered_by && (
                        <span className="capitalize">Triggered by: {run.triggered_by}</span>
                      )}
                    </div>

                    {/* Error message */}
                    {run.error_message && (
                      <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded p-2">
                        {run.error_message}
                      </div>
                    )}

                    {/* Output report */}
                    {run.output_data && Object.keys(run.output_data).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Output</p>
                        {typeof (run.output_data as any).report === 'string' ? (
                          <div className="text-sm whitespace-pre-wrap bg-background rounded border p-3 max-h-64 overflow-y-auto">
                            {(run.output_data as any).report}
                          </div>
                        ) : (
                          <pre className="text-xs bg-background rounded border p-3 overflow-auto max-h-40">
                            {JSON.stringify(run.output_data, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Live logs */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Logs {isLive && <span className="text-blue-500 ml-1">● live</span>}
                      </p>
                      <AgentLogsViewer runId={run.id} live={isLive} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Per-agent full history drawer */}
      <AgentRunHistoryDrawer
        agent={historyAgent}
        open={!!historyAgent}
        onClose={() => setHistoryAgent(null)}
      />
    </div>
  );
}
