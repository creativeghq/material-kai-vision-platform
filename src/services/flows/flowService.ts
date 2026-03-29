import { supabase } from '@/integrations/supabase/client';
import type {
  Flow,
  FlowStatus,
  FlowRun,
  FlowRunStep,
  FlowGraphDefinition,
  TriggerType,
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
    if (error) throw new Error(`Failed to delete flow: ${error.message}`);
  }

  async duplicateFlow(id: string, newName: string): Promise<Flow> {
    const original = await this.getFlow(id);
    return this.createFlowFromGraph(newName, original.description, original.trigger_type, original.graph_definition);
  }

  // ── Graph operations ────────────────────────────────────

  async saveGraph(flowId: string, graph: FlowGraphDefinition, expectedVersion: number): Promise<Flow> {
    const { data: { user } } = await supabase.auth.getUser();

    // Extract trigger type from the graph's trigger node
    const triggerNode = graph.nodes.find(n => n.type === 'triggerNode');
    const triggerType = triggerNode?.data.category === 'trigger'
      ? (triggerNode.data as { triggerType: TriggerType }).triggerType
      : 'manual';

    const { data, error } = await supabase
      .from('flows')
      .update({
        graph_definition: graph as unknown as Record<string, unknown>,
        trigger_type: triggerType,
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
    return data as FlowRun;
  }

  async testFlow(flowId: string, sampleData: Record<string, unknown>): Promise<FlowRun> {
    const { data, error } = await supabase.functions.invoke('flow-engine', {
      body: { action: 'test-flow', flow_id: flowId, trigger_data: sampleData },
    });
    if (error) throw new Error(`Failed to test flow: ${error.message}`);
    return data as FlowRun;
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
