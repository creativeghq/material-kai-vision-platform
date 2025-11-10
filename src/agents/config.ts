/**
 * Mastra Agent Configuration
 * Central configuration for all AI agents in the Material Kai Vision Platform
 */

import { Mastra } from '@mastra/core';
import { searchAgent } from './searchAgent';
import { researchAgent } from './researchAgent';
import { analyticsAgent } from './analyticsAgent';
import { businessAgent } from './businessAgent';
import { productAgent } from './productAgent';
import { adminAgent } from './adminAgent';
import { demoAgent } from './demoAgent';

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
}

/**
 * Agent access control definitions
 */
export const agentAccessControl: Record<string, AgentAccessConfig> = {
  search: {
    id: 'search',
    name: 'Search Agent',
    description: 'RAG-powered knowledge base search for materials and products',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    isDefault: true,
  },
  research: {
    id: 'research',
    name: 'Research Agent',
    description: 'Advanced research with SearchGEO and DataEnrich sub-agents',
    allowedRoles: ['admin', 'owner'],
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Data analysis, performance metrics, and usage analytics',
    allowedRoles: ['admin', 'owner'],
  },
  business: {
    id: 'business',
    name: 'Business Agent',
    description: 'Business intelligence, market analysis, and trend identification',
    allowedRoles: ['admin', 'owner'],
  },
  product: {
    id: 'product',
    name: 'Product Agent',
    description: 'Product management, catalog operations, and recommendations',
    allowedRoles: ['admin', 'owner'],
  },
  admin: {
    id: 'admin',
    name: 'Admin Agent',
    description: 'Administrative tasks, system management, and user management',
    allowedRoles: ['admin', 'owner'],
  },
  demo: {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Showcase platform capabilities with realistic demo data',
    allowedRoles: ['admin', 'owner'],
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
 * Initialize Mastra with all agents
 */
export const mastra = new Mastra({
  agents: [
    searchAgent,
    researchAgent,
    analyticsAgent,
    businessAgent,
    productAgent,
    adminAgent,
    demoAgent,
  ],
  workflows: [],
  // Memory configuration using Supabase
  // memory: {
  //   provider: 'supabase',
  //   config: {
  //     // Will be configured with Supabase client
  //   },
  // },
  // Observability for monitoring and debugging
  // observability: {
  //   enabled: true,
  // },
});

/**
 * Export agent instances for direct access
 */
export {
  searchAgent,
  researchAgent,
  analyticsAgent,
  businessAgent,
  productAgent,
  adminAgent,
  demoAgent,
};

