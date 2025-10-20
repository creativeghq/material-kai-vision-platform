/**
 * Agent Role-Based Access Control System
 * Controls which agents and tools are accessible to different user roles
 */

export type UserRole = 'admin' | 'member' | 'owner' | 'guest';

export interface AgentAccessPolicy {
  agentId: string;
  agentName: string;
  description: string;
  allowedRoles: UserRole[];
  requiredPermissions?: string[];
  toolAccess: ToolAccessPolicy[];
}

export interface ToolAccessPolicy {
  toolId: string;
  toolName: string;
  description: string;
  allowedRoles: UserRole[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface AgentCapabilities {
  agentId: string;
  agentName: string;
  capabilities: string[];
  tools: string[];
}

/**
 * Central registry for agent access policies
 */
export class AgentAccessControlManager {
  private static instance: AgentAccessControlManager;
  private agentPolicies: Map<string, AgentAccessPolicy> = new Map();
  private toolPolicies: Map<string, ToolAccessPolicy> = new Map();

  private constructor() {
    this.initializeDefaultPolicies();
  }

  static getInstance(): AgentAccessControlManager {
    if (!AgentAccessControlManager.instance) {
      AgentAccessControlManager.instance = new AgentAccessControlManager();
    }
    return AgentAccessControlManager.instance;
  }

  /**
   * Initialize default agent and tool access policies
   */
  private initializeDefaultPolicies(): void {
    // Research Agent - Admin only
    this.registerAgentPolicy({
      agentId: 'research-agent',
      agentName: 'Research Agent',
      description: 'Advanced research and analysis agent for admins',
      allowedRoles: ['admin', 'owner'],
      requiredPermissions: ['admin:all'],
      toolAccess: [
        {
          toolId: 'web-search',
          toolName: 'Web Search',
          description: 'Search the web for information',
          allowedRoles: ['admin', 'owner'],
          riskLevel: 'low',
        },
        {
          toolId: 'code-analysis',
          toolName: 'Code Analysis',
          description: 'Analyze and understand code',
          allowedRoles: ['admin', 'owner'],
          riskLevel: 'medium',
        },
        {
          toolId: 'data-extraction',
          toolName: 'Data Extraction',
          description: 'Extract data from various sources',
          allowedRoles: ['admin', 'owner'],
          riskLevel: 'high',
        },
      ],
    });

    // MIVAA Search Agent - All users
    this.registerAgentPolicy({
      agentId: 'mivaa-search-agent',
      agentName: 'MIVAA Search Agent',
      description: 'Search and retrieve materials from MIVAA database',
      allowedRoles: ['admin', 'member', 'owner'],
      toolAccess: [
        {
          toolId: 'mivaa-search',
          toolName: 'MIVAA Search',
          description: 'Search materials in MIVAA database',
          allowedRoles: ['admin', 'member', 'owner'],
          riskLevel: 'low',
        },
        {
          toolId: 'material-retrieval',
          toolName: 'Material Retrieval',
          description: 'Retrieve material details and properties',
          allowedRoles: ['admin', 'member', 'owner'],
          riskLevel: 'low',
        },
        {
          toolId: 'vector-search',
          toolName: 'Vector Search',
          description: 'Perform semantic vector search on materials',
          allowedRoles: ['admin', 'member', 'owner'],
          riskLevel: 'low',
        },
      ],
    });
  }

  /**
   * Register an agent access policy
   */
  registerAgentPolicy(policy: AgentAccessPolicy): void {
    this.agentPolicies.set(policy.agentId, policy);
    policy.toolAccess.forEach(tool => {
      this.toolPolicies.set(tool.toolId, tool);
    });
  }

  /**
   * Check if a user role can access an agent
   */
  canAccessAgent(agentId: string, userRole: UserRole): boolean {
    const policy = this.agentPolicies.get(agentId);
    if (!policy) return false;
    return policy.allowedRoles.includes(userRole);
  }

  /**
   * Check if a user role can use a specific tool
   */
  canAccessTool(toolId: string, userRole: UserRole): boolean {
    const policy = this.toolPolicies.get(toolId);
    if (!policy) return false;
    return policy.allowedRoles.includes(userRole);
  }

  /**
   * Get all accessible agents for a user role
   */
  getAccessibleAgents(userRole: UserRole): AgentAccessPolicy[] {
    return Array.from(this.agentPolicies.values()).filter(policy =>
      policy.allowedRoles.includes(userRole),
    );
  }

  /**
   * Get all accessible tools for a user role
   */
  getAccessibleTools(userRole: UserRole): ToolAccessPolicy[] {
    return Array.from(this.toolPolicies.values()).filter(policy =>
      policy.allowedRoles.includes(userRole),
    );
  }

  /**
   * Get agent policy details
   */
  getAgentPolicy(agentId: string): AgentAccessPolicy | undefined {
    return this.agentPolicies.get(agentId);
  }

  /**
   * Get tool policy details
   */
  getToolPolicy(toolId: string): ToolAccessPolicy | undefined {
    return this.toolPolicies.get(toolId);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentAccessPolicy[] {
    return Array.from(this.agentPolicies.values());
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolAccessPolicy[] {
    return Array.from(this.toolPolicies.values());
  }
}

export const agentAccessControl = AgentAccessControlManager.getInstance();

