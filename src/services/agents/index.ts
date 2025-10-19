/**
 * Agent System Exports
 * Central export point for all agent-related functionality
 */

// Access Control
export {
  AgentAccessControlManager,
  agentAccessControl,
  type AgentAccessPolicy,
  type ToolAccessPolicy,
  type AgentCapabilities,
  type UserRole,
} from './agentRoleAccessControl';

// Tool Access Control
export {
  ToolAccessControlManager,
  toolAccessControl,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionLog,
} from './toolAccessControl';

// Research Agent
export {
  ResearchAgent,
  createResearchAgent,
  type ResearchAgentConfig,
  type ResearchQuery,
  type ResearchResult,
} from './researchAgent';

// MIVAA Search Agent
export {
  MivaaSearchAgent,
  createMivaaSearchAgent,
  type MivaaSearchAgentConfig,
  type MaterialSearchQuery,
  type MaterialSearchResult,
  type MaterialMatch,
} from './mivaaSearchAgent';

// Agent Manager
export {
  AgentManager,
  agentManager,
  type AgentExecutionRequest,
  type AgentExecutionResponse,
} from './agentManager';

// File Upload Service
export {
  AgentFileUploadService,
  agentFileUploadService,
  type UploadedFile,
  type FileUploadOptions,
  type FileUploadResult,
} from './agentFileUploadService';

// Chat History Service
export {
  AgentChatHistoryService,
  agentChatHistoryService,
  type ChatMessage,
  type ChatConversation,
  type CreateConversationOptions,
  type SaveMessageOptions,
} from './agentChatHistoryService';

