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
  research: {
    id: 'research',
    name: 'Research Agent',
    description: 'Deep research and analysis on materials and industry trends',
    allowedRoles: ['admin', 'owner'],
    icon: 'Bot',
    color: 'text-purple-500',
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Data analysis, performance metrics, and usage analytics',
    allowedRoles: ['admin', 'owner'],
    icon: 'BarChart3',
    color: 'text-green-500',
  },
  business: {
    id: 'business',
    name: 'Business Agent',
    description: 'Business intelligence, market analysis, and trend identification',
    allowedRoles: ['admin', 'owner'],
    icon: 'Briefcase',
    color: 'text-orange-500',
  },
  product: {
    id: 'product',
    name: 'Product Agent',
    description: 'Product management, catalog operations, and recommendations',
    allowedRoles: ['admin', 'owner'],
    icon: 'Package',
    color: 'text-pink-500',
  },
  admin: {
    id: 'admin',
    name: 'Admin Agent',
    description: 'Administrative tasks, system management, and user management',
    allowedRoles: ['owner'],
    icon: 'Settings',
    color: 'text-red-500',
  },
  demo: {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Showcase platform capabilities with realistic demo data',
    allowedRoles: ['admin', 'owner'],
    icon: 'Sparkles',
    color: 'text-yellow-500',
  },
  'pdf-processor': {
    id: 'pdf-processor',
    name: 'PDF Processing Agent',
    description: 'Intelligent PDF processing with multi-tool monitoring and diagnostics',
    allowedRoles: ['admin', 'owner'],
    icon: 'FileUp',
    color: 'text-indigo-500',
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

