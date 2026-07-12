/**
 * Automations — the workspace-owner surface for the Flows toolkit (#256).
 *
 * Chat (the KAI agent's `manage_flows` tool) is the primary CREATE surface; this page is the
 * lightweight management view: list the workspace's own automations and pause / resume / delete
 * them. Reads go through RLS (`flows_tenant_select`); mutations go through the workspace-safe
 * SECURITY DEFINER RPCs (`toggle_simple_flow` / `delete_simple_flow`). Operator/global/system
 * flows are never visible or editable here.
 *
 * Layout follows the design-system New-Page checklist: <PageHeader> + `p-3 sm:p-6` wrapper +
 * `div.dashboard-card` sections (no ad-hoc container / <Card> / inline h1).
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow, Play, Pause, Trash2, Sparkles, Clock, Zap, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { FlowFormModal, type FlowFormState, type SimpleFlowPayload } from '@/components/features/ai/FlowFormModal';

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
  scheduled: 'On a schedule',
  invoice_paid: 'Invoice paid',
  payment_received: 'Payment received',
  quote_approved: 'Quote approved',
  product_added: 'Product added',
  'inbox.message_received': 'Inbox message',
  appointment_booked: 'Appointment booked',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500',
  paused: 'bg-amber-500/10 text-amber-500',
  draft: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-red-500/10 text-red-500',
};

export default function FlowsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [flows, setFlows] = useState<WorkspaceFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [formState, setFormState] = useState<FlowFormState>(null);

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
    } else {
      setFlows((data ?? []) as WorkspaceFlow[]);
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

  // Manual create — open the guided form; on submit it calls create_simple_flow directly.
  const openManualForm = () => setFormState({ default_trigger_type: 'invoice_paid' });

  const createFlow = async (payload: SimpleFlowPayload) => {
    if (!activeWorkspaceId) return;
    const { error } = await supabase.rpc('create_simple_flow', {
      p_workspace_id: activeWorkspaceId,
      p_name: payload.name,
      p_trigger_type: payload.trigger_type,
      p_trigger_config: payload.trigger_config,
      p_actions: payload.actions,
      p_activate: true,
    });
    if (error) { toast({ title: 'Could not create', description: error.message, variant: 'destructive' }); throw error; }
    toast({ title: 'Automation created', description: `"${payload.name}" is now active.` });
    void load();
  };

  // AI create — deep-link to the KAI agent. The page reads `?prompt=` and auto-sends it, so the
  // agent opens the guided flow (manage_flows) in chat.
  const createViaAgent = () => {
    navigate('/agent-hub?agent=kai&prompt=' + encodeURIComponent('Set up a new automation for my workspace'));
  };

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
            <Button onClick={openManualForm} className="gap-2">
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
              Build one manually, or ask the assistant — e.g. “email the customer when their invoice is paid”.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={openManualForm} className="gap-2">
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
            {flows.map((flow) => (
              <div
                key={flow.id}
                className="dashboard-card rounded-2xl border-0 shadow-sm p-4 flex items-center gap-4 hover:bg-accent transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{flow.name}</h3>
                    <Badge variant="outline" className={STATUS_STYLES[flow.status] || ''}>{flow.status}</Badge>
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
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === flow.id} onClick={() => toggle(flow)}>
                    {flow.status === 'active' ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Resume</>}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === flow.id} onClick={() => remove(flow)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FlowFormModal
        state={formState}
        onClose={() => setFormState(null)}
        onCreate={createFlow}
      />
    </div>
  );
}
