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

  async createFlow(flow: {
    name: string;
    description?: string;
    trigger_type?: TriggerType;
  }): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('flows')
      .insert({
        name: flow.name,
        description: flow.description || null,
        trigger_type: flow.trigger_type || 'manual',
        trigger_config: {},
        graph_definition: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create flow: ${error.message}`);
    return data as unknown as Flow;
  }

  async updateFlow(id: string, updates: Partial<Pick<Flow, 'name' | 'description' | 'status' | 'trigger_type' | 'trigger_config' | 'tags'>>): Promise<Flow> {
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
    return this.createFlowFromGraph(newName, original.description, original.trigger_type, original.graph_definition);
  }

  // ── Graph operations ────────────────────────────────────

  async saveGraph(flowId: string, graph: FlowGraphDefinition, expectedVersion: number): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    // Extract trigger type + config from the graph's trigger node. The trigger node's
    // `config` (cron expression, webhook secret, HTTP method, …) MUST be mirrored to the
    // top-level `flows.trigger_config` — that's what flow-scheduler-cron reads for the
    // cron and what flow-webhook reads for the secret. Previously only the graph was
    // saved, so scheduled flows never fired and webhook secrets were never enforced
    // (audit #217 H1).
    const triggerNode = graph.nodes.find(n => n.type === 'triggerNode');
    const triggerIsTrigger = triggerNode?.data.category === 'trigger';
    const triggerType = triggerIsTrigger
      ? (triggerNode!.data as { triggerType: TriggerType }).triggerType
      : 'manual';
    const triggerConfig = triggerIsTrigger
      ? ((triggerNode!.data as unknown as { config?: Record<string, unknown> }).config ?? {})
      : {};

    const { data, error } = await supabase
      .from('flows')
      .update({
        graph_definition: graph as unknown as Record<string, unknown>,
        trigger_type: triggerType,
        trigger_config: triggerConfig as unknown as Record<string, unknown>,
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

  async executeFlow(flowId: string, triggerData?: Record<string, unknown>): Promise<FlowRun> {
    const { data, error } = await supabase.functions.invoke('flow-engine', {
      body: { action: 'execute-flow', flow_id: flowId, trigger_data: triggerData || {} },
    });
    if (error) throw new Error(`Failed to execute flow: ${error.message}`);
    // flow-engine returns { success, data: {...run} }. The run lives under `.data`,
    // not the outer envelope — casting the wrapper left run.status/id undefined and
    // the Flow Builder always toasted "status: unknown" (audit #217 H12).
    const env = data as { success?: boolean; error?: string; data?: FlowRun };
    if (env?.success === false) throw new Error(env.error || 'Flow execution failed');
    return (env?.data ?? env) as FlowRun;
  }

  async testFlow(flowId: string, sampleData: Record<string, unknown>): Promise<FlowRun> {
    const { data, error } = await supabase.functions.invoke('flow-engine', {
      body: { action: 'test-flow', flow_id: flowId, trigger_data: sampleData },
    });
    if (error) throw new Error(`Failed to test flow: ${error.message}`);
    const env = data as { success?: boolean; error?: string; data?: FlowRun };
    if (env?.success === false) throw new Error(env.error || 'Flow test failed');
    return (env?.data ?? env) as FlowRun;
  }

  // ── Run History ─────────────────────────────────────────

  async getFlowRuns(flowId?: string, filters?: RunFilters): Promise<FlowRun[]> {
    let query = supabase
      .from('flow_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 50);

    if (flowId) {
      query = query.eq('flow_id', flowId);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get flow runs: ${error.message}`);
    return (data ?? []) as unknown as FlowRun[];
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

  // ── Helpers ─────────────────────────────────────────────

  private async createFlowFromGraph(
    name: string,
    description: string | null,
    triggerType: TriggerType,
    graph: FlowGraphDefinition,
  ): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('flows')
      .insert({
        name,
        description,
        trigger_type: triggerType,
        trigger_config: {},
        graph_definition: graph as unknown as Record<string, unknown>,
        created_by: user?.id,
        updated_by: user?.id,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to duplicate flow: ${error.message}`);
    return data as unknown as Flow;
  }
}

export const flowService = new FlowService();
