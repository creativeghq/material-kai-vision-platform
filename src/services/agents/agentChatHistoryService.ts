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

      return this.mapConversationFromDB(data);
    } catch (error) {
      console.error('Error creating conversation:', error);
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
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map(this.mapConversationFromDB);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      return [];
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<ChatConversation | null> {
    try {
      const { data, error } = await supabase
        .from('agent_chat_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (error) {
        throw error;
      }

      return this.mapConversationFromDB(data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
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

      // Update conversation's message count and last_message_at
      await supabase
        .from('agent_chat_conversations')
        .update({
          message_count: supabase.rpc('increment', { row_id: options.conversationId }),
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', options.conversationId);

      return this.mapMessageFromDB(data);
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      return (data || []).map(this.mapMessageFromDB);
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(conversationId: string, title: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('agent_chat_conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error updating conversation title:', error);
      return false;
    }
  }

  /**
   * Archive a conversation
   */
  async archiveConversation(conversationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('agent_chat_conversations')
        .update({ is_archived: true, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error archiving conversation:', error);
      return false;
    }
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      // Delete messages first
      await supabase.from('agent_chat_messages').delete().eq('conversation_id', conversationId);

      // Delete conversation
      const { error } = await supabase
        .from('agent_chat_conversations')
        .delete()
        .eq('id', conversationId);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  }

  /**
   * Map database row to ChatConversation
   */
  private mapConversationFromDB(data: any): ChatConversation {
    return {
      id: data.id,
      userId: data.user_id,
      agentId: data.agent_id,
      title: data.title,
      description: data.description,
      messageCount: data.message_count || 0,
      lastMessageAt: data.last_message_at || data.created_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      isArchived: data.is_archived || false,
    };
  }

  /**
   * Map database row to ChatMessage
   */
  private mapMessageFromDB(data: any): ChatMessage {
    return {
      id: data.id,
      conversationId: data.conversation_id,
      role: data.role,
      content: data.content,
      metadata: data.metadata || {},
      createdAt: data.created_at,
    };
  }
}

// Export singleton instance
export const agentChatHistoryService = new AgentChatHistoryService();

