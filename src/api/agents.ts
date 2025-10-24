/**
 * PraisonAI Agent Service
 * Handles agent execution with role-based access control using PraisonAI Node.js SDK
 * Documentation: https://docs.praison.ai/docs/js/nodejs
 */

import PraisonAI from 'praisonai';

// Initialize PraisonAI client
const praisonClient = new PraisonAI({
  apiKey: process.env.PRAISONAI_API_KEY || '',
});

/**
 * Agent configuration with role-based access
 */
interface AgentConfig {
  agentId: string;
  agentName: string;
  description: string;
  allowedRoles: string[];
  praisonAgentConfig: {
    agent: string;
    role?: string;
    goal?: string;
    backstory?: string;
    tools?: string[];
  };
}

/**
 * Available agents with role-based access control
 */
const agentConfigs: AgentConfig[] = [
  {
    agentId: 'research-agent',
    agentName: 'Research Agent',
    description: 'Advanced research agent for admins with access to all tools',
    allowedRoles: ['admin', 'owner'],
    praisonAgentConfig: {
      agent: 'Research Agent',
      role: 'Senior Research Analyst',
      goal: 'Conduct comprehensive research and analysis on materials and products',
      backstory: 'Expert researcher with deep knowledge of materials science and product analysis',
      tools: ['search', 'scrape', 'analyze'],
    },
  },
  {
    agentId: 'mivaa-search-agent',
    agentName: 'MIVAA Search Agent',
    description: 'Material search and recommendation agent for all users',
    allowedRoles: ['admin', 'owner', 'member', 'viewer'],
    praisonAgentConfig: {
      agent: 'MIVAA Search Agent',
      role: 'Material Search Specialist',
      goal: 'Help users find and discover materials based on their requirements',
      backstory: 'Specialized in material database search and intelligent recommendations',
      tools: ['search', 'recommend'],
    },
  },
];

/**
 * Get accessible agents for a user role
 */
export function getAccessibleAgents(userRole: string): AgentConfig[] {
  return agentConfigs.filter(agent =>
    agent.allowedRoles.includes(userRole)
  );
}

/**
 * Get a specific agent by ID
 */
export function getAgentById(agentId: string): AgentConfig | undefined {
  return agentConfigs.find(agent => agent.agentId === agentId);
}

/**
 * Check if user has access to an agent
 */
export function hasAgentAccess(agentId: string, userRole: string): boolean {
  const agent = getAgentById(agentId);
  if (!agent) return false;
  return agent.allowedRoles.includes(userRole);
}

/**
 * Execute agent parameters
 */
interface ExecuteAgentParams {
  agentId: string;
  userId: string;
  userRole: string;
  task: string;
  context?: Record<string, any>;
}

/**
 * Execute agent response
 */
interface ExecuteAgentResponse {
  success: boolean;
  agentId: string;
  result?: any;
  error?: string;
  executionTime: number;
  timestamp: string;
}

/**
 * Execute an agent using PraisonAI
 */
export async function executeAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResponse> {
  const startTime = Date.now();

  try {
    // Check access
    if (!hasAgentAccess(params.agentId, params.userRole)) {
      return {
        success: false,
        agentId: params.agentId,
        error: 'Access denied to this agent',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    const agent = getAgentById(params.agentId);
    if (!agent) {
      return {
        success: false,
        agentId: params.agentId,
        error: 'Agent not found',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Execute using PraisonAI
    const result = await praisonClient.run({
      agent: agent.praisonAgentConfig.agent,
      task: params.task,
      role: agent.praisonAgentConfig.role,
      goal: agent.praisonAgentConfig.goal,
      backstory: agent.praisonAgentConfig.backstory,
      tools: agent.praisonAgentConfig.tools,
      context: params.context,
    });

    return {
      success: true,
      agentId: params.agentId,
      result,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      agentId: params.agentId,
      error: error instanceof Error ? error.message : 'Agent execution failed',
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Execute agent with streaming response
 */
export async function executeAgentStream(
  params: ExecuteAgentParams,
  onChunk: (chunk: string) => void
): Promise<ExecuteAgentResponse> {
  const startTime = Date.now();

  try {
    // Check access
    if (!hasAgentAccess(params.agentId, params.userRole)) {
      return {
        success: false,
        agentId: params.agentId,
        error: 'Access denied to this agent',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    const agent = getAgentById(params.agentId);
    if (!agent) {
      return {
        success: false,
        agentId: params.agentId,
        error: 'Agent not found',
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Execute with streaming using PraisonAI
    const result = await praisonClient.runStream({
      agent: agent.praisonAgentConfig.agent,
      task: params.task,
      role: agent.praisonAgentConfig.role,
      goal: agent.praisonAgentConfig.goal,
      backstory: agent.praisonAgentConfig.backstory,
      tools: agent.praisonAgentConfig.tools,
      context: params.context,
      onChunk,
    });

    return {
      success: true,
      agentId: params.agentId,
      result,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      agentId: params.agentId,
      error: error instanceof Error ? error.message : 'Agent execution failed',
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// Export all agent functions for use in the platform
export { AgentConfig, ExecuteAgentParams, ExecuteAgentResponse };

