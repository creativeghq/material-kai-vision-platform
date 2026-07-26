/**
 * Automations — the workspace-owner surface for the Flows toolkit (#256).
 *
 * Two views: a LIST of the workspace's own automations, and the VISUAL BUILDER (the same
 * xyflow builder the admin uses, in `tenantMode` so the palette is trimmed to the safe subset).
 * New/Edit open the builder; the DB (tenant write RLS + the flows_tenant_allowlist_guard trigger)
 * is the real security boundary. Operator/global flows are never visible or editable here.
 * "Create with AI" deep-links to the KAI agent as an alternative create path.
 *
 * Layout follows the design-system New-Page checklist: <PageHeader> + `p-3 sm:p-6` wrapper +
 * `div.dashboard-card` sections.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, Play, Pause, Trash2, Sparkles, Clock, Zap, Plus, Pencil, ArrowLeft, AlertTriangle, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { PageHeader } from '@/components/shared/PageHeader';
import { FlowBuilderTab } from '@/components/Admin/FlowsManagement/FlowBuilderTab';
import { flowService } from '@/services/flows';

interface WorkspaceFlow {
  id: string;
  name: string;
  trigger_type: string;
  status: string;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  scheduled: 'On a schedule',
  invoice_paid: 'Invoice paid',
  payment_received: 'Payment received',
  quote_approved: 'Quote approved',
  'inbox.message_received': 'Inbox message',
  appointment_booked: 'Appointment booked',
};

export default function FlowsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [flows, setFlows] = useState<WorkspaceFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // null = list view; a string = the flow id open in the builder.
  const [builderFlowId, setBuilderFlowId] = useState<string | null>(null);
  // flow_id → last run { status, error_message } so we can surface WHY a flow failed.
  const [lastRuns, setLastRuns] = useState<Record<string, { status: string; error: string | null }>>({});

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('flows')
      .select('id, name, trigger_type, status, run_count, last_run_at, created_at')
      .eq('workspace_id', activeWorkspaceId)
      .eq('is_global', false)
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Could not load automations', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as WorkspaceFlow[];
    setFlows(rows);

    // Latest run per flow → surface the last failure reason inline.
    const ids = rows.map((f) => f.id);
    if (ids.length) {
      const { data: runs } = await supabase
        .from('flow_runs')
        .select('flow_id, status, error_message, created_at')
        .in('flow_id', ids)
        .order('created_at', { ascending: false })
        .limit(300);
      const map: Record<string, { status: string; error: string | null }> = {};
      for (const r of (runs ?? []) as Array<{ flow_id: string; status: string; error_message: string | null }>) {
        if (!map[r.flow_id]) map[r.flow_id] = { status: r.status, error: r.error_message };
      }
      setLastRuns(map);
    } else {
      setLastRuns({});
    }
    setLoading(false);
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (flow: WorkspaceFlow) => {
    if (!activeWorkspaceId) return;
    setBusy(flow.id);
    const { error } = await supabase.rpc('toggle_simple_flow', {
      p_workspace_id: activeWorkspaceId,
      p_flow_id: flow.id,
      p_active: flow.status !== 'active',
    });
    setBusy(null);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    void load();
  };

  const remove = async (flow: WorkspaceFlow) => {
    if (!activeWorkspaceId) return;
    if (!confirm(`Delete the automation "${flow.name}"? This cannot be undone.`)) return;
    setBusy(flow.id);
    const { data, error } = await supabase.rpc('delete_simple_flow', {
      p_workspace_id: activeWorkspaceId,
      p_flow_id: flow.id,
    });
    setBusy(null);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    if (data !== true) { toast({ title: 'Not deleted', description: 'This automation could not be removed.', variant: 'destructive' }); return; }
    toast({ title: 'Deleted', description: `"${flow.name}" was removed.` });
    void load();
  };

  // New automation → create an empty workspace flow, then open the builder on it.
  const createNew = async () => {
    if (!activeWorkspaceId) return;
    const name = (window.prompt('Name your automation', 'New automation') || '').trim();
    if (name === '') return; // cancelled
    try {
      const flow = await flowService.createFlowForWorkspace(name, activeWorkspaceId);
      setBuilderFlowId(flow.id);
    } catch (e) {
      toast({ title: 'Could not create', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const closeBuilder = () => { setBuilderFlowId(null); void load(); };

  const createViaAgent = () => {
    navigate('/agent-hub?agent=kai&prompt=' + encodeURIComponent('Set up a new automation for my workspace'));
  };

  // ── Builder view ────────────────────────────────────────────────────────
  if (builderFlowId) {
    return (
      <div className="min-h-screen">
        <PageHeader
          icon={Workflow}
          title="Edit automation"
          subtitle="Drag triggers and actions onto the canvas, connect them, then Save"
          actions={
            <Button variant="outline" onClick={closeBuilder} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to automations
            </Button>
          }
        />
        <div className="p-3 sm:p-6">
          <FlowBuilderTab flowId={builderFlowId} tenantMode />
        </div>
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Workflow}
        title="Automations"
        subtitle="Run an action automatically when something happens in your workspace"
        actions={
          <>
            <Button variant="outline" onClick={createViaAgent} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Create with AI
            </Button>
            <Button onClick={createNew} className="gap-2">
              <Plus className="h-4 w-4" />
              New automation
            </Button>
          </>
        }
      />

      <div className="p-3 sm:p-6 space-y-4">
        <p className="text-xs text-muted-foreground">
          Each run costs 20 credits ($0.20) from your workspace pool, plus any per-action cost.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </div>
        ) : flows.length === 0 ? (
          <div className="dashboard-card rounded-2xl border-0 shadow-sm py-14 text-center">
            <Zap className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
            <p className="font-medium">No automations yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Build one in the visual editor, or ask the assistant — e.g. “email the customer when their invoice is paid”.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={createNew} className="gap-2">
                <Plus className="h-4 w-4" />
                New automation
              </Button>
              <Button variant="outline" onClick={createViaAgent} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Create with AI
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map((flow) => {
              const run = lastRuns[flow.id];
              const failed = run?.status === 'failed';
              const rawErr = run?.error || '';
              const isEmailNotConfigured = /email_sender_not_configured/i.test(rawErr);
              // Strip the machine prefix for display.
              const errText = rawErr.replace(/^email_sender_not_configured:\s*/i, '').trim();
              return (
                <div
                  key={flow.id}
                  className="dashboard-card rounded-2xl border-0 shadow-sm p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate">{flow.name}</h3>
                        <span className={`text-xs capitalize ${statusTone(flow.status)}`}>{flow.status}</span>
                        {failed && (
                          <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-500">
                            <AlertTriangle className="h-3 w-3" />
                            Last run failed
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {TRIGGER_LABELS[flow.trigger_type] || flow.trigger_type}
                        </span>
                        <span>{flow.run_count} runs</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => setBuilderFlowId(flow.id)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" disabled={busy === flow.id} onClick={() => toggle(flow)}>
                        {flow.status === 'active' ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Resume</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === flow.id} onClick={() => remove(flow)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {failed && errText && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="leading-snug">{errText}</p>
                        {isEmailNotConfigured && (
                          <Button
                            size="sm" variant="outline"
                            className="mt-2 h-7 gap-1 border-red-500/30 text-red-500 hover:bg-red-500/10"
                            onClick={() => navigate('/profile?tab=keys')}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            Connect your email
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
