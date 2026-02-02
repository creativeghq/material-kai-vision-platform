/**
 * Agent Configuration
 * Central configuration for all AI agents in the Material Kai Vision Platform
 *
 * NOTE: Agent execution now happens in Supabase Edge Functions using LangChain.js
 * This file only contains frontend configuration for UI, RBAC, and agent metadata
 */

/**
 * User roles for role-based access control
 */
export type UserRole = 'viewer' | 'member' | 'admin' | 'owner';

/**
 * Agent access configuration
 */
export interface AgentAccessConfig {
  id: string;
  name: string;
  description: string;
  allowedRoles: UserRole[];
  isDefault?: boolean;
  icon?: string;
  color?: string;
}

/**
 * Agent access control definitions
 * These must match the AGENT_CONFIGS in supabase/functions/agent-chat/index.ts
 */
export const agentAccessControl: Record<string, AgentAccessConfig> = {
  search: {
    id: 'search',
    name: 'Search Agent',
    description: 'RAG-powered knowledge base search for materials and products',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    isDefault: true,
    icon: 'Search',
    color: 'text-blue-500',
  },
  insights: {
    id: 'insights',
    name: 'Insights Agent',
    description: 'Unified intelligence combining research, analytics, business, and product analysis',
    allowedRoles: ['admin', 'owner'],
    icon: 'Lightbulb',
    color: 'text-amber-500',
  },
  'interior-designer': {
    id: 'interior-designer',
    name: 'Interior Designer Agent',
    description: 'AI-powered interior design with spatial analysis and material matching',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    icon: 'Sparkles',
    color: 'text-violet-500',
  },
  demo: {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Showcase platform capabilities with realistic demo data',
    allowedRoles: ['admin', 'owner'],
    icon: 'Package',
    color: 'text-cyan-500',
  },
};

/**
 * Check if user has access to an agent
 */
export function hasAgentAccess(agentId: string, userRole: UserRole): boolean {
  const agentConfig = agentAccessControl[agentId];
  if (!agentConfig) return false;
  return agentConfig.allowedRoles.includes(userRole);
}

/**
 * Get accessible agents for a user role
 */
export function getAccessibleAgents(userRole: UserRole): AgentAccessConfig[] {
  return Object.values(agentAccessControl).filter((agent) =>
    agent.allowedRoles.includes(userRole),
  );
}

/**
 * Get default agent for a user role
 */
export function getDefaultAgent(userRole: UserRole): AgentAccessConfig | null {
  const accessibleAgents = getAccessibleAgents(userRole);
  return accessibleAgents.find((agent) => agent.isDefault) || accessibleAgents[0] || null;
}

/**
 * Get agent configuration by ID
 */
export function getAgentConfig(agentId: string): AgentAccessConfig | null {
  return agentAccessControl[agentId] || null;
}

/**
 * Get all agent configurations
 */
export function getAllAgents(): AgentAccessConfig[] {
  return Object.values(agentAccessControl);
}

