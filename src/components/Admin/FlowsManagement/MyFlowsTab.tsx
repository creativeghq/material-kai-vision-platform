import React, { useMemo, useState } from 'react';
import {
  Plus, Copy, Trash2, Play, PlayCircle, Pause, Pencil, MoreHorizontal, Zap, Globe, Lock, Unlock,
  Building2, EyeOff, SlidersHorizontal, GitBranch, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { FilterBar, optionsFromRows, useFilters, type FilterGroupDef } from '@/components/core/filters';
import { flowService, RUNNABLE_FLOW_STATUSES } from '@/services/flows';
import type { ActionNodeData, Flow, FlowRunStats, FlowStatus } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';
import { triggerIcons } from './nodes/TriggerNode';
import { actionPaletteItems, triggerLabel } from './utils/paletteItems';
import { runOutcomeToast } from './utils/runOutcome';

interface MyFlowsTabProps {
  flows: Flow[];
  loading: boolean;
  stats: Map<string, FlowRunStats>;
  onRefresh: () => void;
  onOpenBuilder: (flowId: string) => void;
}

const STATUS_TONE: Record<FlowStatus, 'success' | 'neutral' | 'warning'> = {
  active: 'success', draft: 'neutral', paused: 'warning', archived: 'neutral',
};

const SORTS = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'name', label: 'Name' },
  { value: 'last_run', label: 'Last Run' },
  { value: 'failures', label: 'Most Failures (7 Days)' },
] as const;
type SortKey = (typeof SORTS)[number]['value'];

const actionLabel = new Map(actionPaletteItems.map((i) => [(i.defaultData as ActionNodeData).actionType as string, i.label]));

/** What a flow does and to whom, read off its action nodes: "In-App Notification → trigger user id". */
function actionSummary(flow: Flow): { channels: string[]; recipients: string[] } {
  const channels = new Set<string>();
  const recipients = new Set<string>();
  for (const n of flow.graph_definition?.nodes ?? []) {
    if (n.type !== 'actionNode') continue;
    const d = n.data as ActionNodeData;
    channels.add(actionLabel.get(d.actionType) ?? humanizeLabel(d.actionType));
    const cfg = (d.config ?? {}) as Record<string, unknown>;
    for (const k of ['to', 'user_id', 'role', 'roles', 'recipient']) {
      const v = cfg[k];
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) {
        if (typeof x !== 'string' || !x.trim()) continue;
        const tpl = x.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
        recipients.add(tpl ? humanizeLabel(tpl[1].replace(/^trigger\.data\./, '').replace(/\./g, ' ')) : x);
      }
    }
  }
  return { channels: [...channels], recipients: [...recipients] };
}

export const MyFlowsTab: React.FC<MyFlowsTabProps> = ({ flows, loading, stats, onRefresh, onOpenBuilder }) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Flow | null>(null);
  const [newFlow, setNewFlow] = useState({ name: '', description: '' });
  const [sort, setSort] = useState<SortKey>('updated');
  const { toast } = useToast();

  const statOf = (f: Flow) => stats.get(f.id);

  const groups = useMemo<FilterGroupDef[]>(() => [
    {
      key: 'general', label: 'General', icon: GitBranch,
      fields: [
        { key: 'q', type: 'text', label: 'Search', placeholder: 'Search name or description…', accessor: (f: Flow) => [f.name, f.description] },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: (['active', 'draft', 'paused', 'archived'] as FlowStatus[]).map((s) => ({ value: s, label: humanizeLabel(s) })),
          accessor: (f: Flow) => f.status,
        },
        {
          key: 'trigger_type', type: 'multi', label: 'Trigger', searchable: true,
          options: optionsFromRows(flows, (f) => f.trigger_type, triggerLabel),
          accessor: (f: Flow) => f.trigger_type,
        },
        {
          key: 'scope', type: 'select', label: 'Scope',
          options: [{ value: 'global', label: 'Global' }, { value: 'workspace', label: 'Workspace' }],
          accessor: (f: Flow) => (f.is_global ? 'global' : 'workspace'),
        },
        { key: 'failing', type: 'bool', label: 'Failed in the Last 7 Days', trueLabel: 'Failing', falseLabel: 'Not failing', accessor: (f: Flow) => (statOf(f)?.failed7d ?? 0) > 0 },
        { key: 'is_locked', type: 'bool', label: 'Locked', trueLabel: 'Locked', falseLabel: 'Unlocked', accessor: (f: Flow) => !!f.is_locked },
        { key: 'tenant_configurable', type: 'bool', label: 'Workspace-Configurable', trueLabel: 'Yes', falseLabel: 'No', accessor: (f: Flow) => !!f.tenant_configurable },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [{ key: 'updated_at', type: 'dateRange', label: 'Updated', accessor: (f: Flow) => f.updated_at }],
    },
    // statOf reads `stats`, so it is a dependency in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [flows, stats]);

  const { values, setValues, filtered, previewCount, activeCount, reset } = useFilters<Flow>(flows, groups);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const lastRun = (f: Flow) => statOf(f)?.lastRunAt ?? '';
    if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'last_run') rows.sort((a, b) => lastRun(b).localeCompare(lastRun(a)));
    else if (sort === 'failures') rows.sort((a, b) => (statOf(b)?.failed7d ?? 0) - (statOf(a)?.failed7d ?? 0));
    else rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, stats]);

  const fail = (title: string, error: unknown) =>
    toast({ title, description: error instanceof Error ? error.message : undefined, variant: 'destructive' });

  const handleRunNow = async (flow: Flow) => {
    try {
      setRunningId(flow.id);
      toast(runOutcomeToast(flow.name, await flowService.executeFlow(flow.id, {})));
      onRefresh();
    } catch (error) {
      fail(`"${flow.name}" did not run`, error);
    } finally {
      setRunningId(null);
    }
  };

  const handleToggleLock = async (flow: Flow) => {
    try {
      await flowService.setFlowLocked(flow.id, !flow.is_locked);
      toast({ title: flow.is_locked ? 'Unlocked' : 'Locked', description: flow.is_locked ? `"${flow.name}" can now be deleted.` : `"${flow.name}" is protected from deletion.` });
      onRefresh();
    } catch (error) { fail('Could not change the lock', error); }
  };

  // A global flow fires in every workspace; a workspace-scoped one only in its own workspace_id.
  const handleToggleGlobal = async (flow: Flow) => {
    const nextGlobal = !flow.is_global;
    if (!nextGlobal && !flow.workspace_id) {
      toast({ title: 'Cannot scope this flow', description: 'This flow has no workspace, so turning off "Global action" would stop it from ever firing. Leave it global.', variant: 'destructive' });
      return;
    }
    try {
      await flowService.updateFlow(flow.id, { is_global: nextGlobal });
      toast({ title: nextGlobal ? 'Now a global action' : 'Now workspace-scoped', description: nextGlobal ? `"${flow.name}" will run for all workspaces.` : `"${flow.name}" will run only for its own workspace.` });
      onRefresh();
    } catch (error) { fail('Could not change the scope', error); }
  };

  // Lists the global flow under Automations → Platform defaults, where an owner may switch it off.
  const handleToggleTenantConfigurable = async (flow: Flow) => {
    const next = !flow.tenant_configurable;
    if (next && !flow.is_global) {
      toast({ title: 'Not a platform default', description: 'Only a global flow runs inside other workspaces, so only a global flow has anything for an owner to switch off.', variant: 'destructive' });
      return;
    }
    try {
      await flowService.updateFlow(flow.id, { tenant_configurable: next });
      toast({
        title: next ? 'Workspace-configurable' : 'Operator-only',
        description: next
          ? `Workspace owners can now switch "${flow.name}" off or mute one of its channels.`
          : `"${flow.name}" is hidden from tenants again. Existing per-workspace settings are kept but stop applying.`,
      });
      onRefresh();
    } catch (error) { fail('Could not change workspace visibility', error); }
  };

  const handleCreate = async () => {
    if (!newFlow.name.trim()) {
      toast({ title: 'A flow needs a name', variant: 'destructive' });
      return;
    }
    try {
      setCreating(true);
      const created = await flowService.createFlow({ name: newFlow.name.trim(), description: newFlow.description.trim() || undefined });
      setShowCreateDialog(false);
      setNewFlow({ name: '', description: '' });
      onRefresh();
      onOpenBuilder(created.id);
    } catch (error) {
      fail('Could not create the flow', error);
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    const flow = pendingDelete;
    setPendingDelete(null);
    if (!flow) return;
    try {
      await flowService.deleteFlow(flow.id);
      toast({ title: 'Deleted', description: `"${flow.name}" has been deleted` });
      onRefresh();
    } catch (error) { fail('Could not delete the flow', error); }
  };

  const handleDuplicate = async (flow: Flow) => {
    try {
      await flowService.duplicateFlow(flow.id, `${flow.name} (Copy)`);
      toast({ title: 'Duplicated', description: `"${flow.name} (Copy)" keeps the same trigger and schedule.` });
      onRefresh();
    } catch (error) { fail('Could not duplicate the flow', error); }
  };

  const handleToggleStatus = async (flow: Flow) => {
    try {
      if (flow.status === 'active') {
        await flowService.pauseFlow(flow.id);
        toast({ title: 'Paused', description: `"${flow.name}" has been paused` });
      } else {
        await flowService.activateFlow(flow.id);
        toast({ title: 'Activated', description: `"${flow.name}" is now active` });
      }
      onRefresh();
    } catch (error) { fail('Could not change the status', error); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <FilterBar groups={groups} values={values} onChange={setValues} previewCount={previewCount} title="Filter flows" searchPlaceholder="Search name or description…" />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-9 w-[200px]" aria-label="Sort flows"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground tabular-nums">
            {sorted.length === flows.length ? `${formatNumber(flows.length)} flows` : `${formatNumber(sorted.length)} of ${formatNumber(flows.length)} flows`}
          </span>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create flow
        </Button>
      </div>

      {flows.length === 0 ? (
        <HubEmptyState icon={Zap} title="No flows yet" description="Create a flow, then add its trigger and actions in the builder."
          action={<Button size="sm" onClick={() => setShowCreateDialog(true)}><Plus className="h-4 w-4 mr-1" />Create flow</Button>} />
      ) : sorted.length === 0 ? (
        <HubEmptyState variant="filtered" title="No flows match these filters" action={activeCount > 0 ? <Button size="sm" variant="outline" onClick={reset}>Clear filters</Button> : undefined} />
      ) : (
        <div className="grid gap-3">
          {sorted.map((flow) => {
            const TriggerIcon = triggerIcons[flow.trigger_type] || Zap;
            const st = statOf(flow);
            const runnable = RUNNABLE_FLOW_STATUSES.has(flow.status);
            const { channels, recipients } = actionSummary(flow);
            return (
              <Card key={flow.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="rounded-sm bg-primary/10 p-2"><TriggerIcon className="h-5 w-5 text-primary" /></div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="truncate font-medium">{flow.name}</h4>
                          <Badge variant={STATUS_TONE[flow.status]}>{humanizeLabel(flow.status)}</Badge>
                          {flow.is_global ? <Badge variant="info"><Globe className="h-3 w-3 mr-1" />Global</Badge> : <Badge variant="neutral"><Building2 className="h-3 w-3 mr-1" />Workspace</Badge>}
                          {flow.is_global && flow.tenant_configurable && <Badge variant="neutral"><SlidersHorizontal className="h-3 w-3 mr-1" />Workspace-Configurable</Badge>}
                          {flow.is_locked && <Badge variant="neutral"><Lock className="h-3 w-3 mr-1" />Locked</Badge>}
                          {(st?.failed7d ?? 0) > 0 && <Badge variant="error">{st!.failed7d} Failed in 7 Days</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Trigger: {triggerLabel(flow.trigger_type)}</span>
                          <span className="tabular-nums">{formatNumber(st?.runs30d ?? 0)} runs in 30 days</span>
                          <span>Last run: {st?.lastRunAt ? formatDate(st.lastRunAt, { withTime: true }) : '—'}</span>
                        </div>
                        {channels.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Does: {channels.join(' · ')}{recipients.length > 0 && <> → {recipients.slice(0, 3).join(', ')}{recipients.length > 3 ? ` +${recipients.length - 3}` : ''}</>}
                          </p>
                        )}
                        {flow.description && <p className="truncate text-xs text-muted-foreground">{flow.description}</p>}
                        {(st?.failed7d ?? 0) > 0 && st?.lastError && (
                          <p className="line-clamp-2 text-xs text-[hsl(var(--error))]">Last failure {formatDate(st.lastFailureAt!, { withTime: true })}: {st.lastError}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handleRunNow(flow)} disabled={runningId === flow.id || !runnable}
                        title={runnable ? undefined : `A ${flow.status} flow cannot run. Activate it first.`} className="gap-1">
                        {runningId === flow.id
                          ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          : <PlayCircle className="h-3.5 w-3.5" />}
                        Run Now
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onOpenBuilder(flow.id)} className="gap-1">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" aria-label={`More actions for ${flow.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void handleToggleStatus(flow)}>
                            {flow.status === 'active' ? <><Pause className="h-4 w-4 mr-2" />Pause</> : <><Play className="h-4 w-4 mr-2" />Activate</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleDuplicate(flow)}><Copy className="h-4 w-4 mr-2" />Duplicate</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleToggleGlobal(flow)}>
                            {flow.is_global ? <><Building2 className="h-4 w-4 mr-2" />Make workspace-only</> : <><Globe className="h-4 w-4 mr-2" />Make global action</>}
                          </DropdownMenuItem>
                          {flow.is_global && (
                            <DropdownMenuItem onClick={() => void handleToggleTenantConfigurable(flow)}>
                              {flow.tenant_configurable
                                ? <><EyeOff className="h-4 w-4 mr-2" />Hide from workspace owners</>
                                : <><SlidersHorizontal className="h-4 w-4 mr-2" />Let workspaces switch this off</>}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => void handleToggleLock(flow)}>
                            {flow.is_locked ? <><Unlock className="h-4 w-4 mr-2" />Unlock (allow delete)</> : <><Lock className="h-4 w-4 mr-2" />Lock (prevent delete)</>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setPendingDelete(flow)} disabled={flow.is_locked} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            {flow.is_locked ? 'Delete (locked)' : 'Delete'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Flow</DialogTitle>
            <DialogDescription>Name the flow; the builder opens next so you can add its trigger and actions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Name</Label>
              <Input id="flow-name" placeholder="e.g., Welcome Email on Signup" value={newFlow.name} onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-description">Description (optional)</Label>
              <Textarea id="flow-description" placeholder="What does this flow do?" value={newFlow.description} onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>{creating ? 'Creating…' : 'Create flow'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The flow, its builder graph and its whole run history are removed. This cannot be undone; pause it instead to keep the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
