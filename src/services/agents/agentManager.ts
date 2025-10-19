/**
 * Agent Manager
 * Central orchestrator for agent execution with role-based access control
 */

import { agentAccessControl, UserRole } from './agentRoleAccessControl';
import { toolAccessControl, ToolExecutionContext } from './toolAccessControl';
import { ResearchAgent, createResearchAgent, ResearchQuery, ResearchResult } from './researchAgent';
import { MivaaSearchAgent, createMivaaSearchAgent, MaterialSearchQuery, MaterialSearchResult } from './mivaaSearchAgent';

export interface AgentExecutionRequest {
  agentId: string;
  userId: string;
  userRole: UserRole;
  parameters: Record<string, unknown>;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>;
}

export interface AgentExecutionResponse {
  success: boolean;
  agentId: string;
  result?: unknown;
  error?: string;
  executionTime: number;
  timestamp: string;
}

/**
 * Central Agent Manager
 */
export class AgentManager {
  private static instance: AgentManager;
  private researchAgent: ResearchAgent | null = null;
  private mivaaSearchAgent: MivaaSearchAgent | null = null;
  private executionHistory: AgentExecutionResponse[] = [];

  private constructor() {}

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Initialize agents
   */
  async initialize(): Promise<void> {
    try {
      this.researchAgent = createResearchAgent();
      this.mivaaSearchAgent = createMivaaSearchAgent();
      console.log('Agent Manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Agent Manager:', error);
      throw error;
    }
  }

  /**
   * Execute an agent with role-based access control
   */
  async executeAgent(request: AgentExecutionRequest): Promise<AgentExecutionResponse> {
    const startTime = Date.now();

    try {
      // Check if user can access the agent
      if (!agentAccessControl.canAccessAgent(request.agentId, request.userRole)) {
        return {
          success: false,
          agentId: request.agentId,
          error: `Access denied: User role '${request.userRole}' cannot access agent '${request.agentId}'`,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      }

      // Execute the appropriate agent
      let result: unknown;

      switch (request.agentId) {
        case 'research-agent':
          result = await this.executeResearchAgent(request);
          break;

        case 'mivaa-search-agent':
          result = await this.executeMivaaSearchAgent(request);
          break;

        default:
          return {
            success: false,
            agentId: request.agentId,
            error: `Unknown agent: ${request.agentId}`,
            executionTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          };
      }

      const response: AgentExecutionResponse = {
        success: true,
        agentId: request.agentId,
        result,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      this.executionHistory.push(response);
      return response;
    } catch (error) {
      const response: AgentExecutionResponse = {
        success: false,
        agentId: request.agentId,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      this.executionHistory.push(response);
      return response;
    }
  }

  /**
   * Execute Research Agent
   */
  private async executeResearchAgent(request: AgentExecutionRequest): Promise<ResearchResult> {
    if (!this.researchAgent) {
      throw new Error('Research Agent not initialized');
    }

    const query = request.parameters as ResearchQuery;
    return this.researchAgent.research(query);
  }

  /**
   * Execute MIVAA Search Agent
   */
  private async executeMivaaSearchAgent(request: AgentExecutionRequest): Promise<MaterialSearchResult> {
    if (!this.mivaaSearchAgent) {
      throw new Error('MIVAA Search Agent not initialized');
    }

    const query = request.parameters as MaterialSearchQuery;
    return this.mivaaSearchAgent.searchMaterials(query);
  }

  /**
   * Check tool access for a user
   */
  checkToolAccess(toolId: string, userRole: UserRole): boolean {
    return toolAccessControl.canAccessTool(toolId, userRole);
  }

  /**
   * Log tool execution
   */
  logToolExecution(context: ToolExecutionContext, status: 'success' | 'failed' | 'denied', reason?: string): void {
    toolAccessControl.logExecution(context, status, reason);
  }

  /**
   * Get accessible agents for a user role
   */
  getAccessibleAgents(userRole: UserRole) {
    return agentAccessControl.getAccessibleAgents(userRole);
  }

  /**
   * Get accessible tools for a user role
   */
  getAccessibleTools(userRole: UserRole) {
    return toolAccessControl.getAccessibleTools(userRole);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit: number = 100): AgentExecutionResponse[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get all registered agents
   */
  getAllAgents() {
    return agentAccessControl.getAllAgents();
  }

  /**
   * Get all registered tools
   */
  getAllTools() {
    return toolAccessControl.getAllTools();
  }
}

export const agentManager = AgentManager.getInstance();

