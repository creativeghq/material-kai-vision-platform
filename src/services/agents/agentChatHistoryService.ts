/**
 * Agent Chat History Service
 * Manages chat conversations and history for agents with user-specific storage
 */

import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
  }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  description?: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface CreateConversationOptions {
  title: string;
  description?: string;
  agentId: string;
  userId: string;
}

export interface SaveMessageOptions {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachmentIds?: string[];
  metadata?: Record<string, unknown>;
}

export class AgentChatHistoryService {
  private static instance: AgentChatHistoryService;

  private constructor() {}

  static getInstance(): AgentChatHistoryService {
    if (!AgentChatHistoryService.instance) {
      AgentChatHistoryService.instance = new AgentChatHistoryService();
    }
    return AgentChatHistoryService.instance;
  }

  /**
   * Create a new conversation
   */
  async createConversation(options: CreateConversationOptions): Promise<ChatConversation | null> {
    try {
      const { data, error } = await supabase
        .from('agent_chat_conversations')
        .insert({
          user_id: options.userId,
          agent_id: options.agentId,
          title: options.title,
          description: options.description,
          message_count: 0,
          is_archived: false,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        agentId: data.agent_id,
        title: data.title,
        description: data.description,
        messageCount: data.message_count,
        lastMessageAt: data.last_message_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isArchived: data.is_archived,
      };
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(userId: string, agentId?: string): Promise<ChatConversation[]> {
    try {
      let query = supabase
        .from('agent_chat_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .order('last_message_at', { ascending: false });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map(conv => ({
        id: conv.id,
        userId: conv.user_id,
        agentId: conv.agent_id,
        title: conv.title,
        description: conv.description,
        messageCount: conv.message_count,
        lastMessageAt: conv.last_message_at,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        isArchived: conv.is_archived,
      }));
    } catch (error) {
      console.error('Failed to get conversations:', error);
      return [];
    }
  }

  /**
   * Get conversation details
   */
  async getConversation(conversationId: string, userId: string): Promise<ChatConversation | null> {
    try {
      const { data, error } = await supabase
        .from('agent_chat_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (error) {
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        agentId: data.agent_id,
        title: data.title,
        description: data.description,
        messageCount: data.message_count,
        lastMessageAt: data.last_message_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        isArchived: data.is_archived,
      };
    } catch (error) {
      console.error('Failed to get conversation:', error);
      return null;
    }
  }

  /**
   * Save a message to conversation
   */
  async saveMessage(options: SaveMessageOptions): Promise<ChatMessage | null> {
    try {
      const { data, error } = await supabase
        .from('agent_chat_messages')
        .insert({
          conversation_id: options.conversationId,
          role: options.role,
          content: options.content,
          attachment_ids: options.attachmentIds || [],
          metadata: options.metadata || {},
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Update conversation's last_message_at and message_count
      await supabase
        .from('agent_chat_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          message_count: supabase.rpc('increment_message_count', {
            conversation_id: options.conversationId,
          }),
        })
        .eq('id', options.conversationId);

      return {
        id: data.id,
        conversationId: data.conversation_id,
        role: data.role,
        content: data.content,
        attachments: data.attachment_ids || [],
        metadata: data.metadata,
        createdAt: data.created_at,
      };
    } catch (error) {
      console.error('Failed to save message:', error);
      return null;
    }
  }

  /**
   * Get conversation messages
   */
  async getConversationMessages(conversationId: string, userId: string, limit = 50): Promise<ChatMessage[]> {
    try {
      // First verify user owns this conversation
      const { data: conv, error: convError } = await supabase
        .from('agent_chat_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (convError || !conv) {
        throw new Error('Conversation not found or access denied');
      }

      const { data, error } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []).map(msg => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        role: msg.role,
        content: msg.content,
        attachments: msg.attachment_ids || [],
        metadata: msg.metadata,
        createdAt: msg.created_at,
      }));
    } catch (error) {
      console.error('Failed to get messages:', error);
      return [];
    }
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('agent_chat_conversations')
        .update({ is_archived: true })
        .eq('id', conversationId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Failed to archive conversation:', error);
      return false;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    try {
      // Delete messages first
      await supabase
        .from('agent_chat_messages')
        .delete()
        .eq('conversation_id', conversationId);

      // Delete conversation
      const { error } = await supabase
        .from('agent_chat_conversations')
        .delete()
        .eq('id', conversationId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      return false;
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(conversationId: string, userId: string, title: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('agent_chat_conversations')
        .update({ title })
        .eq('id', conversationId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Failed to update conversation title:', error);
      return false;
    }
  }
}

export const agentChatHistoryService = AgentChatHistoryService.getInstance();

