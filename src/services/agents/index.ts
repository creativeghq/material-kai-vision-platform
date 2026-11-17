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

// Never add full-response caching for the KAI agent: a cached answer replays stale
// full text and short-circuits the live agent.
