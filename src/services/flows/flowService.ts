import { supabase } from '@/integrations/supabase/client';
import type {
  Flow,
  FlowStatus,
  FlowRun,
  FlowRunStep,
  FlowGraphDefinition,
  TriggerType,
  FlowAreaRegistryEntry,
} from './types';

interface ListFlowsFilters {
  status?: FlowStatus;
  trigger_type?: TriggerType;
}

interface RunFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

/** Per-flow activity, derived from `flow_runs` — there is no stored run counter. */
export interface FlowRunStats {
  runs30d: number;
  failed7d: number;
  lastRunAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

/** A run plus how many of its actions were skipped (did nothing). */
export type FlowRunResult = FlowRun & { steps?: FlowRunStep[]; skipped_steps?: number };

/** The engine's own message: `functions.invoke` replaces a non-2xx body with a generic one. */
async function invokeEngine(body: Record<string, unknown>, fallback: string): Promise<FlowRunResult> {
  const { data, error } = await supabase.functions.invoke('flow-engine', { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    if (ctx?.json) {
      try {
        const j = (await ctx.json()) as { error?: string; message?: string };
        message = j?.error || j?.message || message;
      } catch { /* body was not JSON */ }
    }
    throw new Error(message || fallback);
  }
  const env = data as { success?: boolean; error?: string; data?: FlowRunResult };
  if (env?.success === false) throw new Error(env.error || fallback);
  const run = (env?.data ?? env) as FlowRunResult;
  run.skipped_steps = (run.steps ?? []).filter((s) => s.status === 'skipped').length;
  return run;
}

/** Statuses the engine will run; anything else is refused with "Flow is … and cannot be executed". */
export const RUNNABLE_FLOW_STATUSES: ReadonlySet<FlowStatus> = new Set<FlowStatus>(['active', 'draft']);

class FlowService {
  // ── CRUD ────────────────────────────────────────────────

  async listFlows(filters?: ListFlowsFilters): Promise<Flow[]> {
    let query = supabase
      .from('flows')
      .select('*')
      .order('updated_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.trigger_type) {
      query = query.eq('trigger_type', filters.trigger_type);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list flows: ${error.message}`);
    return (data ?? []) as unknown as Flow[];
  }

  async getFlow(id: string): Promise<Flow> {
    const { data, error } = await supabase
      .from('flows')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(`Failed to get flow: ${error.message}`);
    return data as unknown as Flow;
  }

  /** An OPERATOR flow: global (fires in every workspace). Tenant flows use createFlowForWorkspace. */
  async createFlow(flow: {
    name: string;
    description?: string | null;
    trigger_type?: TriggerType;
    trigger_config?: Record<string, unknown>;
    graph_definition?: FlowGraphDefinition;
  }): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('flows')
      .insert({
        name: flow.name,
        description: flow.description || null,
        trigger_type: flow.trigger_type || 'manual',
        trigger_config: (flow.trigger_config ?? {}) as unknown as Record<string, unknown>,
        graph_definition: (flow.graph_definition
          ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }) as unknown as Record<string, unknown>,
        is_global: true,
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create flow: ${error.message}`);
    return data as unknown as Flow;
  }

  /**
   * Create an empty WORKSPACE (tenant) flow for the visual builder. Unlike createFlow
   * (which makes operator/global flows on the admin surface), this sets workspace_id + is_global
   * false so it's owned by the workspace and subject to the tenant allowlist guard. Tenant write
   * RLS + the flows_tenant_allowlist_guard trigger enforce scope + safe nodes at the DB.
   */
  async createFlowForWorkspace(name: string, workspaceId: string): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('flows')
      .insert({
        name: name.trim() || 'New automation',
        trigger_type: 'manual',
        trigger_config: {},
        graph_definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        workspace_id: workspaceId,
        is_global: false,
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create automation: ${error.message}`);
    return data as unknown as Flow;
  }

  /** List a workspace's own (non-global) flows — RLS-scoped to the caller's workspace. */
  async listWorkspaceFlows(workspaceId: string): Promise<Flow[]> {
    const { data, error } = await supabase
      .from('flows')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_global', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to list automations: ${error.message}`);
    return (data ?? []) as unknown as Flow[];
  }

  async updateFlow(id: string, updates: Partial<Pick<Flow, 'name' | 'description' | 'status' | 'trigger_type' | 'trigger_config' | 'tags' | 'is_global' | 'tenant_configurable'>>): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('flows')
      .update({ ...updates, updated_by: user?.id })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update flow: ${error.message}`);
    return data as unknown as Flow;
  }

  async deleteFlow(id: string): Promise<void> {
    const { error } = await supabase.from('flows').delete().eq('id', id);
    if (error) {
      // The DB trigger raises a clear message for locked flows; surface it.
      throw new Error(
        /locked/i.test(error.message)
          ? 'This flow is locked and cannot be deleted. Unlock it first.'
          : `Failed to delete flow: ${error.message}`,
      );
    }
  }

  /** Lock or unlock a flow. Locked flows are protected from deletion. */
  async setFlowLocked(id: string, locked: boolean): Promise<void> {
    const { error } = await supabase.from('flows').update({ is_locked: locked }).eq('id', id);
    if (error) throw new Error(`Failed to ${locked ? 'lock' : 'unlock'} flow: ${error.message}`);
  }

  // ── System Areas (coverage registry) ────────────────────
  async listAreas(): Promise<FlowAreaRegistryEntry[]> {
    const { data, error } = await supabase
      .from('flow_area_registry')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`Failed to list areas: ${error.message}`);
    return (data ?? []) as unknown as FlowAreaRegistryEntry[];
  }

  /** Point an area at a specific flow (or clear it by passing null). */
  async bindArea(areaKey: string, flowId: string | null): Promise<void> {
    const { error } = await supabase
      .from('flow_area_registry')
      .update({ bound_flow_id: flowId })
      .eq('area_key', areaKey);
    if (error) throw new Error(`Failed to bind area: ${error.message}`);
  }

  async duplicateFlow(id: string, newName: string): Promise<Flow> {
    const original = await this.getFlow(id);
    return this.createFlow({
      name: newName,
      description: original.description,
      trigger_type: original.trigger_type,
      trigger_config: original.trigger_config as Record<string, unknown>,
      graph_definition: original.graph_definition,
    });
  }

  // ── Graph operations ────────────────────────────────────

  async saveGraph(flowId: string, graph: FlowGraphDefinition, expectedVersion: number): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    // The trigger node's config (cron, webhook secret, …) is mirrored to flows.trigger_config,
    // which flow-scheduler-cron and flow-webhook read. With no trigger node the stored trigger is
    // left as it is — rewriting it to manual silently stopped scheduled and webhook flows.
    const triggerNode = graph.nodes.find(n => n.type === 'triggerNode');
    const triggerFields = triggerNode?.data.category === 'trigger'
      ? {
        trigger_type: (triggerNode.data as { triggerType: TriggerType }).triggerType,
        trigger_config: ((triggerNode.data as unknown as { config?: Record<string, unknown> }).config ?? {}) as unknown as Record<string, unknown>,
      }
      : {};

    const { data, error } = await supabase
      .from('flows')
      .update({
        graph_definition: graph as unknown as Record<string, unknown>,
        ...triggerFields,
        version: expectedVersion + 1,
        updated_by: user?.id,
      })
      .eq('id', flowId)
      .eq('version', expectedVersion)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Flow was modified by another user. Please refresh and try again.');
      }
      throw new Error(`Failed to save graph: ${error.message}`);
    }
    return data as unknown as Flow;
  }

  // ── Status management ───────────────────────────────────

  async activateFlow(flowId: string): Promise<Flow> {
    return this.updateFlow(flowId, { status: 'active' });
  }

  async pauseFlow(flowId: string): Promise<Flow> {
    return this.updateFlow(flowId, { status: 'paused' });
  }

  // ── Execution (Phase 3 — via edge function) ─────────────

  async executeFlow(flowId: string, triggerData?: Record<string, unknown>): Promise<FlowRunResult> {
    return invokeEngine({ action: 'execute-flow', flow_id: flowId, trigger_data: triggerData || {} }, 'Flow execution failed');
  }

  async testFlow(flowId: string, sampleData: Record<string, unknown>): Promise<FlowRunResult> {
    return invokeEngine({ action: 'test-flow', flow_id: flowId, trigger_data: sampleData }, 'Flow test failed');
  }

  /** Runs in the last 30 days per flow, failures in the last 7, and the latest failure reason. */
  async getFlowRunStats(): Promise<Map<string, FlowRunStats>> {
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('flow_runs')
      .select('flow_id, status, error_message, created_at')
      .gte('created_at', since30)
      .eq('is_test_run', false)
      .order('created_at', { ascending: false })
      .limit(10000);
    if (error) throw new Error(`Failed to read flow run stats: ${error.message}`);
    const out = new Map<string, FlowRunStats>();
    for (const r of (data ?? []) as Array<{ flow_id: string; status: string; error_message: string | null; created_at: string }>) {
      const s = out.get(r.flow_id) ?? { runs30d: 0, failed7d: 0, lastRunAt: null, lastFailureAt: null, lastError: null };
      s.runs30d++;
      s.lastRunAt ??= r.created_at;
      if (r.status === 'failed') {
        if (r.created_at >= since7) s.failed7d++;
        if (!s.lastFailureAt) { s.lastFailureAt = r.created_at; s.lastError = r.error_message; }
      }
      out.set(r.flow_id, s);
    }
    return out;
  }

  // ── Run History ─────────────────────────────────────────

  /** One page of runs, newest first, each with its skipped-action count, plus the total. */
  async getFlowRuns(flowId?: string, filters?: RunFilters): Promise<{ runs: FlowRunResult[]; total: number }> {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    let query = supabase
      .from('flow_runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (flowId) query = query.eq('flow_id', flowId);
    if (filters?.status) query = query.eq('status', filters.status as FlowRun['status']);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to get flow runs: ${error.message}`);
    const runs = (data ?? []) as unknown as FlowRunResult[];
    if (runs.length) {
      const { data: skipped } = await supabase
        .from('flow_run_steps')
        .select('flow_run_id')
        .in('flow_run_id', runs.map((r) => r.id))
        .eq('status', 'skipped');
      const counts = new Map<string, number>();
      for (const s of (skipped ?? []) as Array<{ flow_run_id: string }>) counts.set(s.flow_run_id, (counts.get(s.flow_run_id) ?? 0) + 1);
      for (const r of runs) r.skipped_steps = counts.get(r.id) ?? 0;
    }
    return { runs, total: count ?? runs.length };
  }

  async getRunDetails(runId: string): Promise<FlowRun & { steps: FlowRunStep[] }> {
    const [runResult, stepsResult] = await Promise.all([
      supabase.from('flow_runs').select('*').eq('id', runId).single(),
      supabase.from('flow_run_steps').select('*').eq('flow_run_id', runId).order('execution_order', { ascending: true }),
    ]);

    if (runResult.error) throw new Error(`Failed to get run: ${runResult.error.message}`);

    return {
      ...(runResult.data as unknown as FlowRun),
      steps: (stepsResult.data ?? []) as unknown as FlowRunStep[],
    };
  }
}

export const flowService = new FlowService();
