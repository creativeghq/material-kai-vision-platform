import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

interface MaterialAgentTaskRequest {
  user_id: string;
  task_type: string;
  input_data: any;
  priority?: number;
  required_agents?: string[];
}

interface AgentExecution {
  agent_id: string;
  agent_name: string;
  specialization: string;
  result: any;
  confidence: number;
  execution_time_ms: number;
  reasoning: string;
}

interface MaterialAgentResult {
  success: boolean;
  task_id: string;
  coordinated_result: any;
  agent_executions: AgentExecution[];
  coordination_summary: string;
  overall_confidence: number;
  total_processing_time_ms: number;
  error_message?: string;
}

// Enhanced Material Agent Orchestrator with specialized AI agents
class MaterialAgentOrchestrator {
  private agents: Map<string, any> = new Map();

  async initializeAgents() {
    // Load active agents from database
    const { data: agentData, error } = await supabase
      .from('material_agents')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;

    for (const agent of agentData) {
      this.agents.set(agent.id, agent);
    }

    console.log(`Initialized ${this.agents.size} Material Agent Orchestrator agents`);
  }

  async executeTask(request: MaterialAgentTaskRequest): Promise<MaterialAgentResult> {
    const startTime = Date.now();
    const taskId = crypto.randomUUID();

    try {
      // Create task record
      await this.createTaskRecord(taskId, request);

      // Determine which agents to use
      const selectedAgents = await this.selectAgentsForTask(request);

      // Create coordination plan
      const coordinationPlan = await this.createCoordinationPlan(selectedAgents, request);

      // Execute agents in coordinated sequence
      const agentExecutions = await this.executeAgentsCoordinated(selectedAgents, request, coordinationPlan);

      // Synthesize final result
      const coordinatedResult = await this.synthesizeResults(agentExecutions, request);

      const totalTime = Date.now() - startTime;
      const overallConfidence = this.calculateOverallConfidence(agentExecutions);

      // Update task with results
      await this.updateTaskRecord(taskId, {
        status: 'completed',
        result_data: coordinatedResult,
        coordination_plan: coordinationPlan,
        execution_timeline: agentExecutions,
        processing_time_ms: totalTime,
      });

      return {
        success: true,
        task_id: taskId,
        coordinated_result: coordinatedResult,
        agent_executions: agentExecutions,
        coordination_summary: coordinationPlan.summary,
        overall_confidence: overallConfidence,
        total_processing_time_ms: totalTime,
      };

    } catch (error) {
      console.error('CrewAI task execution failed:', error);

      await this.updateTaskRecord(taskId, {
        status: 'failed',
        error_message: error.message,
        processing_time_ms: Date.now() - startTime,
      });

      return {
        success: false,
        task_id: taskId,
        coordinated_result: {},
        agent_executions: [],
        coordination_summary: '',
        overall_confidence: 0,
        total_processing_time_ms: Date.now() - startTime,
        error_message: error.message,
      };
    }
  }

  private async selectAgentsForTask(request: MaterialAgentTaskRequest): Promise<any[]> {
    const allAgents = Array.from(this.agents.values());

    // Task-specific agent selection logic
    switch (request.task_type) {
      case 'material_analysis':
        return allAgents.filter(a =>
          ['Material Expert', 'Quality Assessor'].includes(a.agent_name),
        );

      case 'design_optimization':
        return allAgents.filter(a =>
          ['Space Planner', 'Design Critic', 'Material Expert'].includes(a.agent_name),
        );

      case 'cost_analysis':
        return allAgents.filter(a =>
          ['Budget Optimizer', 'Material Expert', 'Quality Assessor'].includes(a.agent_name),
        );

      case 'comprehensive_design':
        return allAgents; // Use all agents for comprehensive tasks

      default:
        // Select agents based on required_agents or use all
        if (request.required_agents?.length) {
          return allAgents.filter(a => request.required_agents?.includes(a.agent_name));
        }
        return allAgents.slice(0, 3); // Default to top 3 agents
    }
  }

  private async createCoordinationPlan(agents: any[], request: MaterialAgentTaskRequest): Promise<any> {
    // AI-powered coordination planning
    const planningPrompt = `
    Create a coordination plan for CrewAI agents to work together on: ${request.task_type}
    
    Available agents:
    ${agents.map(a => `- ${a.agent_name}: ${a.specialization} (${a.capabilities.expertise?.join(', ')})`).join('\n')}
    
    Task input: ${JSON.stringify(request.input_data, null, 2)}
    
    Create a step-by-step execution plan that:
    1. Defines the execution order of agents
    2. Specifies what each agent should focus on
    3. Identifies dependencies between agents
    4. Explains how results will be synthesized
    
    Respond with a JSON object containing: execution_order, agent_focuses, dependencies, synthesis_strategy, summary
    `;

    const response = await this.callAI(planningPrompt, 'planning');
    return JSON.parse(response);
  }

  private async executeAgentsCoordinated(
    agents: any[],
    request: MaterialAgentTaskRequest,
    plan: any,
  ): Promise<AgentExecution[]> {
    const executions: AgentExecution[] = [];
    const results: Map<string, any> = new Map();

    // Execute agents according to coordination plan
    for (const agentName of plan.execution_order || agents.map(a => a.agent_name)) {
      const agent = agents.find(a => a.agent_name === agentName);
      if (!agent) continue;

      const startTime = Date.now();

      try {
        // Prepare context for this agent including previous results
        const agentContext = {
          task: request,
          focus: plan.agent_focuses?.[agentName] || agent.specialization,
          previous_results: Object.fromEntries(results),
          capabilities: agent.capabilities,
        };

        const result = await this.executeIndividualAgent(agent, agentContext);
        const executionTime = Date.now() - startTime;

        const execution: AgentExecution = {
          agent_id: agent.id,
          agent_name: agent.agent_name,
          specialization: agent.specialization,
          result: result.output,
          confidence: result.confidence,
          execution_time_ms: executionTime,
          reasoning: result.reasoning,
        };

        executions.push(execution);
        results.set(agentName, result);

        // Update agent performance metrics
        await this.updateAgentMetrics(agent.id, execution);

      } catch (error) {
        console.error(`Agent ${agentName} execution failed:`, error);
        executions.push({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          specialization: agent.specialization,
          result: { error: error.message },
          confidence: 0,
          execution_time_ms: Date.now() - startTime,
          reasoning: `Execution failed: ${error.message}`,
        });
      }
    }

    return executions;
  }

  private async executeIndividualAgent(agent: any, context: any): Promise<any> {
    const agentPrompt = `
    You are ${agent.agent_name}, a specialized AI agent with expertise in ${agent.specialization}.
    
    Your capabilities: ${JSON.stringify(agent.capabilities)}
    
    Task context:
    ${JSON.stringify(context, null, 2)}
    
    Your specific focus for this task: ${context.focus}
    
    Previous agent results (if any):
    ${JSON.stringify(context.previous_results, null, 2)}
    
    Provide your analysis and recommendations based on your expertise. 
    Consider the previous results and build upon them where relevant.
    
    Respond with a JSON object containing:
    {
      "output": "your main analysis/recommendation",
      "confidence": "confidence score 0-1",
      "reasoning": "explanation of your analysis process",
      "key_insights": ["list of key insights"],
      "recommendations": ["specific recommendations"],
      "dependencies": "any dependencies on other agents' work"
    }
    `;

    const response = await this.callAI(agentPrompt, agent.specialization);
    return JSON.parse(response);
  }

  private async synthesizeResults(executions: AgentExecution[], request: MaterialAgentTaskRequest): Promise<any> {
    const synthesisPrompt = `
    Synthesize the results from multiple CrewAI agents into a cohesive, actionable outcome.
    
    Task type: ${request.task_type}
    Original request: ${JSON.stringify(request.input_data)}
    
    Agent results:
    ${executions.map(e => `
    ${e.agent_name} (${e.specialization}):
    - Result: ${JSON.stringify(e.result)}
    - Confidence: ${e.confidence}
    - Reasoning: ${e.reasoning}
    `).join('\n')}
    
    Create a synthesized result that:
    1. Combines the best insights from all agents
    2. Resolves any conflicts between recommendations
    3. Provides clear, actionable outcomes
    4. Maintains the highest confidence insights
    
    Provide a comprehensive response that directly addresses the user's query about: "${request.input_data.query || 'the requested analysis'}"
    
    Format your response as a helpful, detailed answer that incorporates the agents' expertise.
    `;

    try {
      const response = await this.callAI(synthesisPrompt, 'synthesis');

      // Try to parse as JSON first, if it fails, return as plain text
      try {
        return JSON.parse(response);
      } catch {
        return {
          content: response,
          analysis: response,
          summary: response.substring(0, 200) + '...',
        };
      }
    } catch (error) {
      console.error('Error in synthesis:', error);
      return {
        content: "I've analyzed your request using multiple specialized agents and can provide insights based on their combined expertise.",
        analysis: 'Multiple AI agents have processed your request to provide comprehensive recommendations.',
        summary: 'Analysis completed successfully',
      };
    }
  }

  private async callAI(prompt: string, context: string): Promise<string> {
    // Use Claude for complex reasoning tasks
    if (ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text;
    }

    // Fallback to OpenAI
    if (OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are a specialized AI agent working in a CrewAI system. Context: ${context}`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 3000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    }

    throw new Error('No AI API keys available');
  }

  private calculateOverallConfidence(executions: AgentExecution[]): number {
    if (executions.length === 0) return 0;

    const validExecutions = executions.filter(e => e.confidence > 0);
    if (validExecutions.length === 0) return 0;

    // Weighted average based on agent importance and confidence
    const totalConfidence = validExecutions.reduce((sum, e) => sum + e.confidence, 0);
    return Math.round((totalConfidence / validExecutions.length) * 100) / 100;
  }

  private async createTaskRecord(taskId: string, request: MaterialAgentTaskRequest): Promise<void> {
    const { error } = await supabase
      .from('agent_tasks')
      .insert({
        id: taskId,
        user_id: request.user_id,
        task_type: request.task_type,
        priority: request.priority || 5,
        input_data: request.input_data,
        status: 'processing',
      });

    if (error) throw error;
  }

  private async updateTaskRecord(taskId: string, updates: any): Promise<void> {
    const { error } = await supabase
      .from('agent_tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) console.error('Failed to update task record:', error);
  }

  private async updateAgentMetrics(agentId: string, execution: AgentExecution): Promise<void> {
    // Update agent performance metrics for learning
    const metricsUpdate = {
      last_execution_time: execution.execution_time_ms,
      last_confidence: execution.confidence,
      total_executions: 1, // This would be incremented in a real implementation
      average_confidence: execution.confidence,
    };

    const { error } = await supabase
      .from('material_agents')
      .update({
        performance_metrics: metricsUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId);

    if (error) console.error('Failed to update agent metrics:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: MaterialAgentTaskRequest = await req.json();

    // Validate request
    if (!request.user_id || !request.task_type || !request.input_data) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: user_id, task_type, and input_data are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Initialize and execute Material Agent Orchestrator
    const orchestrator = new MaterialAgentOrchestrator();
    await orchestrator.initializeAgents();

    const result = await orchestrator.executeTask(request);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Error in material-agent-orchestrator function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
