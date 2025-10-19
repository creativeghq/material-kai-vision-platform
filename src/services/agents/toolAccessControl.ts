/**
 * Tool Access Control System
 * Manages which tools are accessible to different user roles
 */

import { UserRole } from './agentRoleAccessControl';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'analysis' | 'retrieval' | 'admin' | 'utility';
  allowedRoles: UserRole[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval?: boolean;
  rateLimitPerMinute?: number;
}

export interface ToolExecutionContext {
  toolId: string;
  userId: string;
  userRole: UserRole;
  timestamp: string;
  parameters: Record<string, unknown>;
}

export interface ToolExecutionLog {
  id: string;
  toolId: string;
  userId: string;
  userRole: UserRole;
  status: 'success' | 'failed' | 'denied';
  reason?: string;
  executionTime: number;
  timestamp: string;
}

/**
 * Tool Access Control Manager
 */
export class ToolAccessControlManager {
  private static instance: ToolAccessControlManager;
  private tools: Map<string, ToolDefinition> = new Map();
  private executionLogs: ToolExecutionLog[] = [];
  private rateLimitTracker: Map<string, number[]> = new Map();

  private constructor() {
    this.initializeDefaultTools();
  }

  static getInstance(): ToolAccessControlManager {
    if (!ToolAccessControlManager.instance) {
      ToolAccessControlManager.instance = new ToolAccessControlManager();
    }
    return ToolAccessControlManager.instance;
  }

  /**
   * Initialize default tools with access policies
   */
  private initializeDefaultTools(): void {
    // Research tools - Admin only
    this.registerTool({
      id: 'web-search',
      name: 'Web Search',
      description: 'Search the web for information',
      category: 'search',
      allowedRoles: ['admin', 'owner'],
      riskLevel: 'low',
      rateLimitPerMinute: 30,
    });

    this.registerTool({
      id: 'code-analysis',
      name: 'Code Analysis',
      description: 'Analyze and understand code',
      category: 'analysis',
      allowedRoles: ['admin', 'owner'],
      riskLevel: 'medium',
      rateLimitPerMinute: 20,
    });

    this.registerTool({
      id: 'data-extraction',
      name: 'Data Extraction',
      description: 'Extract data from various sources',
      category: 'admin',
      allowedRoles: ['admin', 'owner'],
      riskLevel: 'high',
      requiresApproval: true,
      rateLimitPerMinute: 10,
    });

    // MIVAA tools - All users
    this.registerTool({
      id: 'mivaa-search',
      name: 'MIVAA Search',
      description: 'Search materials in MIVAA database',
      category: 'search',
      allowedRoles: ['admin', 'member', 'owner'],
      riskLevel: 'low',
      rateLimitPerMinute: 60,
    });

    this.registerTool({
      id: 'material-retrieval',
      name: 'Material Retrieval',
      description: 'Retrieve material details and properties',
      category: 'retrieval',
      allowedRoles: ['admin', 'member', 'owner'],
      riskLevel: 'low',
      rateLimitPerMinute: 100,
    });

    this.registerTool({
      id: 'vector-search',
      name: 'Vector Search',
      description: 'Perform semantic vector search on materials',
      category: 'search',
      allowedRoles: ['admin', 'member', 'owner'],
      riskLevel: 'low',
      rateLimitPerMinute: 50,
    });

    // Admin tools
    this.registerTool({
      id: 'system-config',
      name: 'System Configuration',
      description: 'Configure system settings',
      category: 'admin',
      allowedRoles: ['admin', 'owner'],
      riskLevel: 'high',
      requiresApproval: true,
      rateLimitPerMinute: 5,
    });

    this.registerTool({
      id: 'user-management',
      name: 'User Management',
      description: 'Manage users and permissions',
      category: 'admin',
      allowedRoles: ['admin', 'owner'],
      riskLevel: 'high',
      requiresApproval: true,
      rateLimitPerMinute: 10,
    });
  }

  /**
   * Register a new tool
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  /**
   * Check if a user can access a tool
   */
  canAccessTool(toolId: string, userRole: UserRole): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) return false;
    return tool.allowedRoles.includes(userRole);
  }

  /**
   * Check rate limit for a tool
   */
  checkRateLimit(toolId: string, userId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool || !tool.rateLimitPerMinute) return true;

    const key = `${toolId}:${userId}`;
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Get or create execution times for this tool/user
    let times = this.rateLimitTracker.get(key) || [];

    // Remove old entries
    times = times.filter(t => t > oneMinuteAgo);

    // Check if limit exceeded
    if (times.length >= tool.rateLimitPerMinute) {
      return false;
    }

    // Add current execution
    times.push(now);
    this.rateLimitTracker.set(key, times);

    return true;
  }

  /**
   * Log tool execution
   */
  logExecution(context: ToolExecutionContext, status: 'success' | 'failed' | 'denied', reason?: string): void {
    const log: ToolExecutionLog = {
      id: `${context.toolId}-${context.userId}-${Date.now()}`,
      toolId: context.toolId,
      userId: context.userId,
      userRole: context.userRole,
      status,
      reason,
      executionTime: Date.now() - new Date(context.timestamp).getTime(),
      timestamp: new Date().toISOString(),
    };

    this.executionLogs.push(log);

    // Keep only last 1000 logs
    if (this.executionLogs.length > 1000) {
      this.executionLogs = this.executionLogs.slice(-1000);
    }
  }

  /**
   * Get tool definition
   */
  getTool(toolId: string): ToolDefinition | undefined {
    return this.tools.get(toolId);
  }

  /**
   * Get all tools accessible to a role
   */
  getAccessibleTools(userRole: UserRole): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(tool =>
      tool.allowedRoles.includes(userRole)
    );
  }

  /**
   * Get execution logs
   */
  getExecutionLogs(toolId?: string, userId?: string): ToolExecutionLog[] {
    return this.executionLogs.filter(log =>
      (!toolId || log.toolId === toolId) &&
      (!userId || log.userId === userId)
    );
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const toolAccessControl = ToolAccessControlManager.getInstance();

