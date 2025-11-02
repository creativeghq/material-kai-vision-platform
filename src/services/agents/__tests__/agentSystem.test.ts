/**
 * Agent System Tests
 * Tests for role-based access control and agent execution
 */

import { agentAccessControl } from '../agentRoleAccessControl';
import { toolAccessControl } from '../toolAccessControl';
import { agentManager } from '../agentManager';

describe('Agent Role-Based Access Control', () => {
  describe('Agent Access Control', () => {
    it('should allow admin to access research agent', () => {
      const canAccess = agentAccessControl.canAccessAgent(
        'research-agent',
        'admin',
      );
      expect(canAccess).toBe(true);
    });

    it('should deny member access to research agent', () => {
      const canAccess = agentAccessControl.canAccessAgent(
        'research-agent',
        'member',
      );
      expect(canAccess).toBe(false);
    });

    it('should allow all roles to access mivaa search agent', () => {
      const adminAccess = agentAccessControl.canAccessAgent(
        'mivaa-search-agent',
        'admin',
      );
      const memberAccess = agentAccessControl.canAccessAgent(
        'mivaa-search-agent',
        'member',
      );
      const ownerAccess = agentAccessControl.canAccessAgent(
        'mivaa-search-agent',
        'owner',
      );

      expect(adminAccess).toBe(true);
      expect(memberAccess).toBe(true);
      expect(ownerAccess).toBe(true);
    });

    it('should return accessible agents for a role', () => {
      const memberAgents = agentAccessControl.getAccessibleAgents('member');
      const adminAgents = agentAccessControl.getAccessibleAgents('admin');

      expect(memberAgents.length).toBeGreaterThan(0);
      expect(adminAgents.length).toBeGreaterThan(memberAgents.length);
    });
  });

  describe('Tool Access Control', () => {
    it('should allow admin to access data-extraction tool', () => {
      const canAccess = toolAccessControl.canAccessTool(
        'data-extraction',
        'admin',
      );
      expect(canAccess).toBe(true);
    });

    it('should deny member access to data-extraction tool', () => {
      const canAccess = toolAccessControl.canAccessTool(
        'data-extraction',
        'member',
      );
      expect(canAccess).toBe(false);
    });

    it('should allow all roles to access mivaa-search tool', () => {
      const adminAccess = toolAccessControl.canAccessTool(
        'mivaa-search',
        'admin',
      );
      const memberAccess = toolAccessControl.canAccessTool(
        'mivaa-search',
        'member',
      );

      expect(adminAccess).toBe(true);
      expect(memberAccess).toBe(true);
    });

    it('should return accessible tools for a role', () => {
      const memberTools = toolAccessControl.getAccessibleTools('member');
      const adminTools = toolAccessControl.getAccessibleTools('admin');

      expect(memberTools.length).toBeGreaterThan(0);
      expect(adminTools.length).toBeGreaterThan(memberTools.length);
    });

    it('should enforce rate limiting', () => {
      const toolId = 'mivaa-search';
      const userId = 'test-user';

      // First call should succeed
      let canExecute = toolAccessControl.checkRateLimit(toolId, userId);
      expect(canExecute).toBe(true);

      // Subsequent calls should succeed until limit
      for (let i = 0; i < 59; i++) {
        canExecute = toolAccessControl.checkRateLimit(toolId, userId);
        expect(canExecute).toBe(true);
      }

      // 61st call should fail (limit is 60 per minute)
      canExecute = toolAccessControl.checkRateLimit(toolId, userId);
      expect(canExecute).toBe(false);
    });
  });

  describe('Agent Manager', () => {
    beforeAll(async () => {
      await agentManager.initialize();
    });

    it('should deny access to research agent for non-admin', async () => {
      const response = await agentManager.executeAgent({
        agentId: 'research-agent',
        userId: 'test-user',
        userRole: 'member',
        parameters: { topic: 'test' },
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Access denied');
    });

    it('should allow access to mivaa search agent for members', async () => {
      const response = await agentManager.executeAgent({
        agentId: 'mivaa-search-agent',
        userId: 'test-user',
        userRole: 'member',
        parameters: { query: 'test material' },
      });

      // Should not have access denied error
      if (!response.success) {
        expect(response.error).not.toContain('Access denied');
      }
    });

    it('should return accessible agents for a role', () => {
      const memberAgents = agentManager.getAccessibleAgents('member');
      const adminAgents = agentManager.getAccessibleAgents('admin');

      expect(memberAgents.length).toBeGreaterThan(0);
      expect(adminAgents.length).toBeGreaterThan(memberAgents.length);
    });

    it('should return accessible tools for a role', () => {
      const memberTools = agentManager.getAccessibleTools('member');
      const adminTools = agentManager.getAccessibleTools('admin');

      expect(memberTools.length).toBeGreaterThan(0);
      expect(adminTools.length).toBeGreaterThan(memberTools.length);
    });

    it('should track execution history', async () => {
      const initialHistory = agentManager.getExecutionHistory(10);
      const initialLength = initialHistory.length;

      await agentManager.executeAgent({
        agentId: 'mivaa-search-agent',
        userId: 'test-user',
        userRole: 'member',
        parameters: { query: 'test' },
      });

      const updatedHistory = agentManager.getExecutionHistory(10);
      expect(updatedHistory.length).toBeGreaterThanOrEqual(initialLength);
    });
  });

  describe('Agent Policy Registration', () => {
    it('should register new agent policies', () => {
      const initialAgents = agentAccessControl.getAllAgents();
      const initialCount = initialAgents.length;

      agentAccessControl.registerAgentPolicy({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        description: 'A test agent',
        allowedRoles: ['admin'],
        toolAccess: [],
      });

      const updatedAgents = agentAccessControl.getAllAgents();
      expect(updatedAgents.length).toBe(initialCount + 1);
    });

    it('should register new tools', () => {
      const initialTools = toolAccessControl.getAllTools();
      const initialCount = initialTools.length;

      toolAccessControl.registerTool({
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        category: 'utility',
        allowedRoles: ['admin'],
        riskLevel: 'low',
      });

      const updatedTools = toolAccessControl.getAllTools();
      expect(updatedTools.length).toBe(initialCount + 1);
    });
  });

  describe('Tool Execution Logging', () => {
    it('should log tool executions', () => {
      const initialLogs = toolAccessControl.getExecutionLogs();
      const initialCount = initialLogs.length;

      toolAccessControl.logExecution(
        {
          toolId: 'test-tool',
          userId: 'test-user',
          userRole: 'admin',
          timestamp: new Date().toISOString(),
          parameters: { test: true },
        },
        'success',
      );

      const updatedLogs = toolAccessControl.getExecutionLogs();
      expect(updatedLogs.length).toBe(initialCount + 1);
    });

    it('should filter logs by tool ID', () => {
      toolAccessControl.logExecution(
        {
          toolId: 'tool-a',
          userId: 'user-1',
          userRole: 'admin',
          timestamp: new Date().toISOString(),
          parameters: {},
        },
        'success',
      );

      toolAccessControl.logExecution(
        {
          toolId: 'tool-b',
          userId: 'user-2',
          userRole: 'admin',
          timestamp: new Date().toISOString(),
          parameters: {},
        },
        'success',
      );

      const toolALogs = toolAccessControl.getExecutionLogs('tool-a');
      const toolBLogs = toolAccessControl.getExecutionLogs('tool-b');

      expect(toolALogs.every((log) => log.toolId === 'tool-a')).toBe(true);
      expect(toolBLogs.every((log) => log.toolId === 'tool-b')).toBe(true);
    });
  });
});
