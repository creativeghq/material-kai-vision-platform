/**
 * Background Agents — Monitoring Dashboard
 *
 * Read-only view of all registered agents and their run history.
 * Admins can inspect run details, stream live logs, and cancel stuck runs.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Bot, RefreshCw, CheckCircle, XCircle, Clock, Loader2,
  ChevronDown, ChevronRight, XCircle as CancelIcon, Eye,
  AlertTriangle, Link2, MessageSquare,
} from 'lucide-react';
import { Button }  from '@/components/core/ui/button';
import { Badge }   from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { FilterBar, applyFilters, useFilters } from '@/components/core/filters';
import { AgentLogsViewer }     from './AgentLogsViewer';
import { AgentRunHistoryDrawer } from './AgentRunHistoryDrawer';
import { ChatActivityTab }     from './ChatActivityTab';
import { buildAgentRunFilters } from './backgroundAgentFilters';
import {
  listAgents, listAllRuns, cancelRun,
  formatDuration, isStuck,
} from '@/services/backgroundAgents';
import type { AgentRun, BackgroundAgent } from '@/services/backgroundAgents';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed:  <CheckCircle className="h-4 w-4 text-green-500"                 />,
  failed:     <XCircle     className="h-4 w-4 text-red-500"                   />,
  processing: <Loader2     className="h-4 w-4 text-blue-500 animate-spin"     />,
  pending:    <Clock       className="h-4 w-4 text-yellow-500"                />,
  cancelled:  <XCircle     className="h-4 w-4 text-gray-400"                  />,
};

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'stuck';

function relTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BackgroundAgentsPage() {
  const { toast } = useToast();

  const [agents,       setAgents]       = useState<BackgroundAgent[]>([]);
  const [runs,         setRuns]         = useState<AgentRun[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [historyAgent, setHistoryAgent] = useState<BackgroundAgent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agentList, runList] = await Promise.all([
        listAgents(),
        listAllRuns(150),
      ]);
      setAgents(agentList);
      setRuns(runList);
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

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

  const agentMap = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);

  const getTaskTitle = (run: AgentRun): string => {
    const prompt = run.input_data?.task_prompt as string | undefined;
    if (prompt) return prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt;
    return agentMap.get(run.agent_id)?.name ?? 'Background Task';
  };

  const filterGroups = useMemo(() => buildAgentRunFilters(runs, agents), [runs, agents]);
  const { values: filterValues, setValues: setFilterValues, filtered: scoped, previewCount } =
    useFilters<AgentRun>(runs, filterGroups);

  // Status is the tab strip, every other dimension is the modal — so the tab counters below
  // are computed over the modal-narrowed set and the two can never disagree.
  const filtered = useMemo(() => {
    if (statusFilter === 'stuck') return scoped.filter(isStuck);
    if (statusFilter !== 'all') return scoped.filter(r => r.status === statusFilter);
    return scoped;
  }, [scoped, statusFilter]);

  // Synthetic "problem" rows injected at top of the tasks list — agent-level health
  // issues that aren't tied to a single run (disabled cron, never-fired schedule, etc.).
  type AgentAlert = {
    key:    string;
    agent:  BackgroundAgent;
    kind:   'disabled' | 'never-ran' | 'last-failed';
    detail: string;
  };

  /** All agent-level alerts, narrowed by the same filter values — used for tab counters. */
  const allAlerts: AgentAlert[] = useMemo(() => {
    const alerts: AgentAlert[] = [];
    agents.forEach(a => {
      if (!a.enabled && (a.trigger_type === 'cron' || a.trigger_type === 'event')) {
        alerts.push({ key: `${a.id}-disabled`, agent: a, kind: 'disabled',
          detail: `${a.trigger_type} agent is disabled — it will never fire` });
      }
      if (a.enabled && a.trigger_type === 'cron' && !a.last_run_at) {
        alerts.push({ key: `${a.id}-never-ran`, agent: a, kind: 'never-ran',
          detail: `cron ${a.schedule ?? '—'} has never fired` });
      }
      // "last-failed" is already visible as the real failed run in the list.
    });
    // An alert has no run row, so match it through a run-shaped stand-in — that way the
    // agent / trigger / date constraints apply to alerts exactly as they do to runs.
    return alerts.filter(al => applyFilters(
      [{
        agent_id:      al.agent.id,
        input_data:    { task_prompt: `${al.agent.name} — ${al.detail}` },
        error_message: al.detail,
        model_used:    null,
        created_at:    al.agent.last_run_at ?? al.agent.created_at,
        started_at:    al.agent.last_run_at,
      }],
      filterGroups,
      filterValues,
    ).length > 0);
  }, [agents, filterGroups, filterValues]);

  /** Alerts visible under the currently-selected status tab. */
  const agentAlerts: AgentAlert[] = useMemo(() => {
    if (statusFilter === 'all' || statusFilter === 'failed' || statusFilter === 'stuck') {
      return allAlerts;
    }
    return [];
  }, [allAlerts, statusFilter]);

  const stats = useMemo(() => {
    // Count alerts per bucket they surface in, so the tab counters reflect what
    // the user actually sees when they click that tab (no phantom rows).
    const alertsN = allAlerts.length;
    return {
      total:     scoped.length + alertsN,
      running:   scoped.filter(r => r.status === 'processing' || r.status === 'pending').length,
      completed: scoped.filter(r => r.status === 'completed').length,
      failed:    scoped.filter(r => r.status === 'failed').length + alertsN,
      cancelled: scoped.filter(r => r.status === 'cancelled').length,
      stuck:     scoped.filter(isStuck).length + alertsN,
    };
  }, [scoped, allAlerts]);

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Top-level mode selector — Background runs vs Chat agent activity */}
      <Tabs defaultValue="background" className="space-y-4 sm:space-y-6">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="background" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Background Tasks
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="background" className="space-y-4 sm:space-y-6 mt-0">

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
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {([
          { label: 'Total Runs', value: stats.total,     color: 'text-foreground' },
          { label: 'Running',    value: stats.running,   color: 'text-blue-600'   },
          { label: 'Completed',  value: stats.completed, color: 'text-green-600'  },
          { label: 'Failed',     value: stats.failed,    color: 'text-red-600'    },
          { label: 'Cancelled',  value: stats.cancelled, color: 'text-gray-500'   },
          { label: 'Stuck',      value: stats.stuck,     color: 'text-yellow-500' },
        ] as const).map(s => (
          <div key={s.label} className="border rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="processing">Running ({stats.running})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
            <TabsTrigger value="failed">Failed ({stats.failed})</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled ({stats.cancelled})</TabsTrigger>
            <TabsTrigger value="stuck">Stuck ({stats.stuck})</TabsTrigger>
          </TabsList>
        </Tabs>

        <FilterBar
          groups={filterGroups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          title="Filter background runs"
          searchPlaceholder="Search task, agent, error…"
        />
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading tasks…
        </div>
      ) : filtered.length === 0 && agentAlerts.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No tasks match</p>
          <p className="text-sm text-muted-foreground">Adjust filters or trigger an agent to see runs here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Agent-level health rows — styled identically to task rows */}
          {agentAlerts.map(al => {
            const toneClass =
              al.kind === 'disabled'
                ? 'text-muted-foreground'
                : 'text-amber-600 dark:text-amber-400';
            const statusLabel =
              al.kind === 'disabled' ? 'disabled' : 'never ran';
            return (
              <div key={al.key} className="border rounded-lg overflow-hidden">
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left cursor-pointer"
                  onClick={() => setHistoryAgent(al.agent)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHistoryAgent(al.agent); } }}
                  title="View run history"
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0" />

                  <span className="shrink-0">
                    {al.kind === 'disabled'
                      ? <XCircle className="h-4 w-4 text-gray-400" />
                      : <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                  </span>

                  <span className="flex-1 text-sm font-medium truncate">
                    {al.agent.name}
                    <span className="text-muted-foreground font-normal"> — {al.detail}</span>
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs capitalize ${toneClass}`}>{statusLabel}</span>

                    <span className="text-xs text-muted-foreground capitalize">
                      {al.agent.trigger_type}
                    </span>

                    {al.agent.schedule && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {al.agent.schedule}
                      </Badge>
                    )}

                    <span className="text-xs text-muted-foreground">—</span>
                    <span className="text-xs text-muted-foreground">
                      {relTime(al.agent.last_run_at)}
                    </span>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="View agent history"
                      onClick={(e) => { e.stopPropagation(); setHistoryAgent(al.agent); }}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.map((run) => {
            const agent      = agentMap.get(run.agent_id);
            const isExpanded = expanded === run.id;
            const isLive     = run.status === 'processing';
            const stuck      = isStuck(run);

            return (
              <div key={run.id} className={`border rounded-lg overflow-hidden ${stuck ? 'border-yellow-500/60' : ''}`}>
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 text-left cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : run.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isExpanded ? null : run.id); } }}
                >
                  {isExpanded
                    ? <ChevronDown  className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

                  <span className="shrink-0">{STATUS_ICON[run.status] ?? STATUS_ICON.pending}</span>

                  <span className="flex-1 text-sm font-medium truncate">
                    {getTaskTitle(run)}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs capitalize ${statusTone(run.status)}`}>
                      {run.status}
                    </span>

                    {stuck && (
                      <span className="text-xs inline-flex items-center text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 mr-1" />stuck
                      </span>
                    )}

                    {run.recovery_attempts > 0 && (
                      <Badge variant="outline" className="text-xs">
                        recovered {run.recovery_attempts}×
                      </Badge>
                    )}

                    {agent && (
                      <Badge variant="outline" className="text-xs">
                        {agent.name}
                      </Badge>
                    )}

                    {run.delegated_to_python && (
                      <Badge variant="secondary" className="text-xs">Python</Badge>
                    )}

                    {run.parent_run_id && (
                      <Badge variant="outline" className="text-xs">
                        <Link2 className="h-3 w-3 mr-1" />chain
                      </Badge>
                    )}

                    <span className="text-xs text-muted-foreground">
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
                        title="Cancel task"
                        onClick={(e) => { e.stopPropagation(); handleCancel(run.id); }}
                      >
                        <CancelIcon className="h-3 w-3 text-red-500" />
                      </Button>
                    )}

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
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t bg-muted/20">
                    {run.input_data?.task_prompt && (
                      <div className="pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Task</p>
                        <p className="text-sm whitespace-pre-wrap">{run.input_data.task_prompt as string}</p>
                      </div>
                    )}

                    {/* Metadata grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <div><span className="font-semibold">In:</span> {run.input_tokens.toLocaleString()} tok</div>
                      <div><span className="font-semibold">Out:</span> {run.output_tokens.toLocaleString()} tok</div>
                      {run.credits_debited > 0 && (
                        <div><span className="font-semibold">Credits:</span> {run.credits_debited.toFixed(2)}</div>
                      )}
                      {run.model_used && (
                        <div className="truncate"><span className="font-semibold">Model:</span> {run.model_used}</div>
                      )}
                      {run.triggered_by && (
                        <div className="capitalize"><span className="font-semibold">Trigger:</span> {run.triggered_by}</div>
                      )}
                      {run.trigger_event_type && (
                        <div className="truncate"><span className="font-semibold">Event:</span> {run.trigger_event_type}</div>
                      )}
                      {run.parent_run_id && (
                        <div className="truncate">
                          <span className="font-semibold">Parent run:</span>{' '}
                          <code className="text-[10px]">{run.parent_run_id.slice(0, 8)}…</code>
                        </div>
                      )}
                      {run.python_job_id && (
                        <div className="truncate">
                          <span className="font-semibold">Python job:</span>{' '}
                          <code className="text-[10px]">{run.python_job_id.slice(0, 8)}…</code>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">Heartbeat:</span> {relTime(run.last_heartbeat)}
                      </div>
                      {run.started_at && (
                        <div><span className="font-semibold">Started:</span> {relTime(run.started_at)}</div>
                      )}
                    </div>

                    {run.error_message && (
                      <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded p-2">
                        {run.error_message}
                      </div>
                    )}

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

      <AgentRunHistoryDrawer
        agent={historyAgent}
        open={!!historyAgent}
        onClose={() => setHistoryAgent(null)}
      />

        </TabsContent>

        {/* Chat Activity Tab — tool calls executed inline by agent-chat */}
        <TabsContent value="chat" className="mt-0">
          <ChatActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
