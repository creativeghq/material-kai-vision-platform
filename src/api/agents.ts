/**
 * Agent API Routes
 * Endpoints for agent execution with role-based access control
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { agentManager } from '@/services/agents/agentManager';
import { agentFileUploadService } from '@/services/agents/agentFileUploadService';
import { agentChatHistoryService } from '@/services/agents/agentChatHistoryService';
import { useUserRole } from '@/hooks/useUserRole';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

/**
 * GET /api/agents
 * List all available agents for the current user
 */
router.get('/agents', async (req: Request, res: Response) => {
  try {
    // Get user role from request (would be set by auth middleware)
    const userRole = (req as any).userRole || 'member';

    const agents = agentManager.getAccessibleAgents(userRole);

    res.json({
      success: true,
      agents: agents.map(agent => ({
        id: agent.agentId,
        name: agent.agentName,
        description: agent.description,
        allowedRoles: agent.allowedRoles,
        tools: agent.toolAccess.map(t => ({
          id: t.toolId,
          name: t.toolName,
          description: t.description,
        })),
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list agents',
    });
  }
});

/**
 * GET /api/agents/:agentId
 * Get details about a specific agent
 */
router.get('/agents/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const userRole = (req as any).userRole || 'member';

    const agent = agentManager.getAllAgents().find(a => a.agentId === agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
      });
    }

    if (!agentManager.getAccessibleAgents(userRole).find(a => a.agentId === agentId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this agent',
      });
    }

    res.json({
      success: true,
      agent: {
        id: agent.agentId,
        name: agent.agentName,
        description: agent.description,
        allowedRoles: agent.allowedRoles,
        tools: agent.toolAccess,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get agent details',
    });
  }
});

/**
 * POST /api/agents/:agentId/execute
 * Execute an agent with the provided parameters
 */
router.post('/agents/:agentId/execute', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { parameters } = req.body;
    const userId = (req as any).userId || 'anonymous';
    const userRole = (req as any).userRole || 'member';

    // Initialize agent manager if needed
    if (!agentManager) {
      await agentManager.initialize();
    }

    // Execute the agent
    const response = await agentManager.executeAgent({
      agentId,
      userId,
      userRole,
      parameters: parameters || {},
    });

    if (!response.success) {
      return res.status(403).json(response);
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      agentId: req.params.agentId,
      error: error instanceof Error ? error.message : 'Agent execution failed',
      executionTime: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/agents/tools/available
 * List all tools available to the current user
 */
router.get('/agents/tools/available', async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).userRole || 'member';

    const tools = agentManager.getAccessibleTools(userRole);

    res.json({
      success: true,
      tools: tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        riskLevel: tool.riskLevel,
        requiresApproval: tool.requiresApproval,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list tools',
    });
  }
});

/**
 * GET /api/agents/execution-history
 * Get execution history (admin only)
 */
router.get('/agents/execution-history', async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).userRole || 'member';

    // Only admins can view execution history
    if (userRole !== 'admin' && userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Only admins can view execution history',
      });
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const history = agentManager.getExecutionHistory(limit);

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get execution history',
    });
  }
});

/**
 * POST /api/agents/files/upload
 * Upload a file for agent processing
 */
router.post('/agents/files/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const agentId = req.body.agentId as string;

    if (!userId || !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId or agentId',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided',
      });
    }

    // Convert multer file to File object
    const file = new File([req.file.buffer], req.file.originalname, {
      type: req.file.mimetype,
    });

    const result = await agentFileUploadService.uploadFile(file, {
      agentId,
      userId,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'File upload failed',
    });
  }
});

/**
 * GET /api/agents/:agentId/files
 * Get uploaded files for an agent
 */
router.get('/agents/:agentId/files', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const agentId = req.params.agentId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const files = await agentFileUploadService.getAgentFiles(userId, agentId);

    res.json({
      success: true,
      files,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get files',
    });
  }
});

/**
 * DELETE /api/agents/files/:fileId
 * Delete an uploaded file
 */
router.delete('/agents/files/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const fileId = req.params.fileId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const success = await agentFileUploadService.deleteFile(fileId, userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    res.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete file',
    });
  }
});

/**
 * POST /api/agents/chat/conversations
 * Create a new chat conversation
 */
router.post('/agents/chat/conversations', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { agentId, title, description } = req.body;

    if (!userId || !agentId || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, agentId, title',
      });
    }

    const conversation = await agentChatHistoryService.createConversation({
      userId,
      agentId,
      title,
      description,
    });

    if (!conversation) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create conversation',
      });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create conversation',
    });
  }
});

/**
 * GET /api/agents/chat/conversations
 * Get user's conversations
 */
router.get('/agents/chat/conversations', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const agentId = req.query.agentId as string | undefined;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const conversations = await agentChatHistoryService.getUserConversations(userId, agentId);

    res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get conversations',
    });
  }
});

/**
 * GET /api/agents/chat/conversations/:conversationId
 * Get conversation details and messages
 */
router.get('/agents/chat/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.conversationId;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const conversation = await agentChatHistoryService.getConversation(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    const messages = await agentChatHistoryService.getConversationMessages(conversationId, userId, limit);

    res.json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get conversation',
    });
  }
});

/**
 * POST /api/agents/chat/messages
 * Save a message to conversation
 */
router.post('/agents/chat/messages', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { conversationId, role, content, attachmentIds, metadata } = req.body;

    if (!userId || !conversationId || !role || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: conversationId, role, content',
      });
    }

    const message = await agentChatHistoryService.saveMessage({
      conversationId,
      role,
      content,
      attachmentIds,
      metadata,
    });

    if (!message) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save message',
      });
    }

    res.json({
      success: true,
      message,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save message',
    });
  }
});

/**
 * PUT /api/agents/chat/conversations/:conversationId
 * Update conversation title
 */
router.put('/agents/chat/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.conversationId;
    const { title } = req.body;

    if (!userId || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title',
      });
    }

    const success = await agentChatHistoryService.updateConversationTitle(conversationId, userId, title);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    res.json({
      success: true,
      message: 'Conversation updated',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update conversation',
    });
  }
});

/**
 * DELETE /api/agents/chat/conversations/:conversationId
 * Delete a conversation
 */
router.delete('/agents/chat/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const conversationId = req.params.conversationId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const success = await agentChatHistoryService.deleteConversation(conversationId, userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    res.json({
      success: true,
      message: 'Conversation deleted',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete conversation',
    });
  }
});

export default router;

