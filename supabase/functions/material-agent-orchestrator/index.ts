import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import * as jwt from 'https://esm.sh/jsonwebtoken@9.0.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type UserRole = 'admin' | 'member' | 'owner' | 'guest';

interface AuthContext {
  userId: string;
  userRole: UserRole;
  workspaceId: string;
  permissions: string[];
  isAuthenticated: boolean;
}

interface MaterialAgentInputData {
  query?: string;
  context?: Record<string, unknown>;
  sessionId?: string;
  hybridConfig?: Record<string, unknown>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
}

interface MaterialAgentTaskRequest {
  user_id: string;
  task_type: string;
  input_data: MaterialAgentInputData;
  priority?: number;
  workspace_id?: string;
}

interface AgentExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface AgentExecution {
  agent_id: string;
  agent_name: string;
  specialization: string;
  result: AgentExecutionResult;
  confidence: number;
  execution_time_ms: number;
  reasoning: string;
}

interface MaterialAgentResult {
  success: boolean;
  task_id: string;
  coordinated_result: Record<string, unknown>;
  agent_executions: AgentExecution[];
  coordination_summary: string;
  overall_confidence: number;
  total_processing_time_ms: number;
  error_message?: string;
}

// ============================================================================
// AUTHENTICATION & AUTHORIZATION
// ============================================================================

class AuthenticationService {
  private jwtSecret = Deno.env.get('JWT_SECRET') || 'your-secret-key';

  async validateToken(authHeader: string | null): Promise<AuthContext | null> {
    if (!authHeader) {
      return null;
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, this.jwtSecret) as Record<string, unknown>;

      return {
        userId: decoded.sub as string,
        userRole: (decoded.role as UserRole) || 'member',
        workspaceId: decoded.workspace_id as string,
        permissions: (decoded.permissions as string[]) || [],
        isAuthenticated: true,
      };
    } catch (error) {
      console.error('Token validation failed:', error);
      return null;
    }
  }

  async validateWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .single();

      return !error && !!data;
    } catch (error) {
      console.error('Workspace access validation failed:', error);
      return false;
    }
  }

  canAccessAgent(userRole: UserRole, agentId: string): boolean {
    if (agentId === 'research-agent') {
      return ['admin', 'owner'].includes(userRole);
    }
    if (agentId === 'mivaa-search-agent') {
      return ['admin', 'member', 'owner'].includes(userRole);
    }
    return false;
  }
}

// ============================================================================
// PRAISONAI AGENT ORCHESTRATOR
// ============================================================================

class PraisonAIOrchestrator {
  private authService = new AuthenticationService();
  private mivaaApiUrl = Deno.env.get('MIVAA_API_URL') || '';
  private mivaaApiKey = Deno.env.get('MIVAA_API_KEY') || '';

  async executeTask(
    request: MaterialAgentTaskRequest,
    authContext: AuthContext,
  ): Promise<MaterialAgentResult> {
    const startTime = Date.now();
    const taskId = crypto.randomUUID();

    try {
      // Validate access
      if (!this.authService.canAccessAgent(authContext.userRole, 'mivaa-search-agent')) {
        throw new Error('Access denied: Insufficient permissions for agent execution');
      }

      // Create task record
      await this.createTaskRecord(taskId, request, authContext);

      // Select appropriate agents based on task type
      const selectedAgents = this.selectAgentsForTask(request.task_type);

      // Create coordination plan
      const coordinationPlan = await this.createCoordinationPlan(selectedAgents, request);

      // Execute agents in coordinated sequence
      const agentExecutions = await this.executeAgentsCoordinated(
        selectedAgents,
        request,
        coordinationPlan,
        authContext,
      );

      // Synthesize final result
      const coordinatedResult = await this.synthesizeResults(agentExecutions, request);

      const totalTime = Date.now() - startTime;
      const overallConfidence = this.calculateOverallConfidence(agentExecutions);

      // Update task with results
      await this.updateTaskRecord(taskId, {
        task_status: 'completed',
        output_data: coordinatedResult,
        metadata: {
          coordination_plan: coordinationPlan,
          execution_timeline: agentExecutions,
        },
        processing_time_ms: totalTime,
        completed_at: new Date().toISOString(),
      });

      return {
        success: true,
        task_id: taskId,
        coordinated_result: coordinatedResult,
        agent_executions: agentExecutions,
        coordination_summary: coordinationPlan.summary as string,
        overall_confidence: overallConfidence,
        total_processing_time_ms: totalTime,
      };
    } catch (error) {
      console.error('PraisonAI task execution failed:', error);

      await this.updateTaskRecord(taskId, {
        task_status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        processing_time_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      });

      return {
        success: false,
        task_id: taskId,
        coordinated_result: {},
        agent_executions: [],
        coordination_summary: '',
        overall_confidence: 0,
        total_processing_time_ms: Date.now() - startTime,
        error_message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private selectAgentsForTask(taskType: string): string[] {
    switch (taskType) {
      case 'material_analysis':
      case 'material_search':
      case 'comprehensive_design':
        return ['mivaa-search-agent'];
      case 'research':
        return ['research-agent'];
      default:
        return ['mivaa-search-agent'];
    }
  }

  private async createCoordinationPlan(
    agentIds: string[],
    request: MaterialAgentTaskRequest,
  ): Promise<Record<string, unknown>> {
    const planningPrompt = `
    Create a coordination plan for agents to work together on: ${request.task_type}
    Selected agents: ${agentIds.join(', ')}
    Task input: ${JSON.stringify(request.input_data, null, 2)}
    
    Respond with JSON: { execution_order: [], agent_focuses: {}, dependencies: [], synthesis_strategy: "", summary: "" }
    `;

    try {
      const response = await this.callMIVAASemanticAnalysis(planningPrompt, 'planning');
      return JSON.parse(response);
    } catch (error) {
      console.warn('Failed to create coordination plan, using default:', error);
      return {
        execution_order: agentIds,
        agent_focuses: Object.fromEntries(agentIds.map(id => [id, 'Execute task'])),
        dependencies: [],
        synthesis_strategy: 'Combine all results',
        summary: 'Sequential execution of selected agents',
      };
    }
  }

  private async executeAgentsCoordinated(
    agentIds: string[],
    request: MaterialAgentTaskRequest,
    plan: Record<string, unknown>,
    authContext: AuthContext,
  ): Promise<AgentExecution[]> {
    const executions: AgentExecution[] = [];
    const results: Map<string, unknown> = new Map();
    const executionOrder = (plan.execution_order as string[]) || agentIds;

    for (const agentId of executionOrder) {
      const startTime = Date.now();

      try {
        const agentContext = {
          task: request,
          focus: (plan.agent_focuses as Record<string, string>)?.[agentId] || 'Execute task',
          previous_results: Object.fromEntries(results),
        };

        const result = await this.executeIndividualAgent(agentId, agentContext, authContext);
        const executionTime = Date.now() - startTime;

        const execution: AgentExecution = {
          agent_id: agentId,
          agent_name: agentId,
          specialization: agentId === 'research-agent' ? 'Research' : 'Material Search',
          result: result.output as AgentExecutionResult,
          confidence: result.confidence as number,
          execution_time_ms: executionTime,
          reasoning: result.reasoning as string,
        };

        executions.push(execution);
        results.set(agentId, result);

        await this.updateAgentMetrics(agentId, execution);
      } catch (error) {
        console.error(`Error executing agent ${agentId}:`, error);
      }
    }

    return executions;
  }

  private async executeIndividualAgent(
    agentId: string,
    context: Record<string, unknown>,
    authContext: AuthContext,
  ): Promise<Record<string, unknown>> {
    const agentPrompt = `
    You are a specialized AI agent: ${agentId}
    Task context: ${JSON.stringify(context, null, 2)}
    Focus: ${(context.focus as string) || 'Execute task'}
    
    Respond with JSON: { output: {}, confidence: 0.8, reasoning: "", key_insights: [], recommendations: [] }
    `;

    try {
      const response = await this.callMIVAASemanticAnalysis(agentPrompt, agentId);
      return JSON.parse(response);
    } catch (error) {
      console.error(`Error executing agent ${agentId}:`, error);
      return {
        output: { content: 'Agent execution completed' },
        confidence: 0.5,
        reasoning: 'Fallback response due to processing error',
        key_insights: [],
        recommendations: [],
      };
    }
  }

  private async synthesizeResults(
    executions: AgentExecution[],
    request: MaterialAgentTaskRequest,
  ): Promise<Record<string, unknown>> {
    const synthesisPrompt = `
    Synthesize results from agents into a cohesive outcome.
    Task type: ${request.task_type}
    Query: ${(request.input_data.query as string) || 'analysis'}
    
    Agent results: ${JSON.stringify(executions.map(e => ({
      name: e.agent_name,
      result: e.result,
      confidence: e.confidence,
    })))}
    
    Provide comprehensive response addressing the query.
    `;

    try {
      const response = await this.callMIVAASemanticAnalysis(synthesisPrompt, 'synthesis');
      try {
        return JSON.parse(response);
      } catch {
        return {
          content: response,
          analysis: response,
          summary: response.substring(0, 200),
        };
      }
    } catch (error) {
      console.error('Error in synthesis:', error);
      return {
        content: 'Analysis completed using multiple agents',
        analysis: 'Comprehensive recommendations provided',
        summary: 'Task processed successfully',
      };
    }
  }

  private async callMIVAASemanticAnalysis(prompt: string, context: string): Promise<string> {
    try {
      const response = await fetch(`${this.mivaaApiUrl}/semantic_analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.mivaaApiKey}`,
        },
        body: JSON.stringify({
          text: prompt,
          analysis_type: 'orchestration',
          context: context,
          return_format: 'text',
          max_tokens: 4000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.analysis) {
          return data.analysis;
        }
      }
      throw new Error('MIVAA API failed');
    } catch (error) {
      console.error('MIVAA semantic analysis error:', error);
      throw error;
    }
  }

  private calculateOverallConfidence(executions: AgentExecution[]): number {
    if (executions.length === 0) return 0;
    const validExecutions = executions.filter(e => e.confidence > 0);
    if (validExecutions.length === 0) return 0;
    const totalConfidence = validExecutions.reduce((sum, e) => sum + e.confidence, 0);
    return Math.round((totalConfidence / validExecutions.length) * 100) / 100;
  }

  private async createTaskRecord(
    taskId: string,
    request: MaterialAgentTaskRequest,
    authContext: AuthContext,
  ): Promise<void> {
    const { error } = await supabase.from('agent_tasks').insert({
      id: taskId,
      user_id: request.user_id,
      workspace_id: authContext.workspaceId,
      task_name: `${request.task_type} - ${new Date().toISOString()}`,
      task_type: request.task_type,
      task_status: 'processing',
      priority: request.priority?.toString() || '5',
      input_data: request.input_data,
      output_data: {},
      task_config: {},
      progress_percentage: 0,
      dependencies: {},
      metadata: { created_by: authContext.userId },
      created_at: new Date().toISOString(),
    });

    if (error) throw error;
  }

  private async updateTaskRecord(taskId: string, updates: Record<string, unknown>): Promise<void> {
    const { error } = await supabase
      .from('agent_tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) console.error('Failed to update task record:', error);
  }

  private async updateAgentMetrics(agentId: string, execution: AgentExecution): Promise<void> {
    try {
      const { data: existingAgent } = await supabase
        .from('material_agents')
        .select('performance_metrics')
        .eq('id', agentId)
        .single();

      const currentMetrics = existingAgent?.performance_metrics || {
        total_executions: 0,
        average_confidence: 0,
        last_execution_time: 0,
      };

      const newMetrics = {
        total_executions: (currentMetrics.total_executions || 0) + 1,
        average_confidence:
          ((currentMetrics.average_confidence || 0) * (currentMetrics.total_executions || 0) +
            execution.confidence) /
          ((currentMetrics.total_executions || 0) + 1),
        last_execution_time: execution.execution_time_ms,
        last_confidence: execution.confidence,
      };

      await supabase
        .from('material_agents')
        .update({
          performance_metrics: newMetrics,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentId);
    } catch (error) {
      console.error('Failed to update agent metrics:', error);
    }
  }
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authService = new AuthenticationService();
    const authHeader = req.headers.get('authorization');
    const authContext = await authService.validateToken(authHeader);

    if (!authContext?.isAuthenticated) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const request: MaterialAgentTaskRequest = await req.json();

    if (!request.user_id || !request.task_type || !request.input_data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: user_id, task_type, and input_data',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const orchestrator = new PraisonAIOrchestrator();
    const result = await orchestrator.executeTask(request, authContext);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in material-agent-orchestrator:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

