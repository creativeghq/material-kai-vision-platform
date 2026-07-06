/**
 * Agent System Exports
 * Central export point for all agent-related functionality
 */

// Chat History Service
export {
  AgentChatHistoryService,
  agentChatHistoryService,
  type ChatMessage,
  type ChatConversation,
  type CreateConversationOptions,
  type SaveMessageOptions,
} from './agentChatHistoryService';

// NOTE: the agent response cache (agentChatCache) was removed 2026-07-06 — it replayed
// stale full-text answers and short-circuited the live agent. Do not reintroduce
// full-response caching for the KAI agent.
