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
  /** Toolkit IDs active in this conversation. Always contains 'core'. */
  toolkits: string[];
}

export interface CreateConversationOptions {
  title: string;
  description?: string;
  agentId: string;
  userId: string;
  /** Toolkit IDs active when this conversation was started. Defaults to ['core']. */
  toolkits?: string[];
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
          toolkits: options.toolkits && options.toolkits.length > 0 ? options.toolkits : ['core'],
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

  // Legacy agent IDs that were merged into 'kai'
  private static readonly KAI_ALIASES = ['kai', 'search', 'insights', 'seo'];

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
        // 'kai' also covers legacy agent IDs that were merged into it
        const ids = agentId === 'kai' ? AgentChatHistoryService.KAI_ALIASES : [agentId];
        query = query.in('agent_id', ids);
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
      // First get current message count
      const { data: convo, error: convoErr } = await supabase
        .from('agent_chat_conversations')
        .select('message_count')
        .eq('id', options.conversationId)
        .single();

      if (convoErr) {
        console.warn('Could not fetch conversation message_count, defaulting to 0:', convoErr.message);
      }

      const currentCount = convo?.message_count ?? 0;

      const { error: updateErr } = await supabase
        .from('agent_chat_conversations')
        .update({
          message_count: currentCount + 1,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', options.conversationId);

      if (updateErr) {
        console.warn('Could not update conversation metadata:', updateErr.message);
      }

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
   * Rename a conversation
   */
  async renameConversation(conversationId: string, title: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('agent_chat_conversations')
        .update({ title: title.trim(), updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error renaming conversation:', error);
      return false;
    }
  }

  /**
   * Delete a conversation and all its messages.
   *
   * The FK on agent_chat_messages.conversation_id is ON DELETE CASCADE, so the
   * message rows go in one transaction. Session storage files (under
   * generation-images `u/{uid}/sessions/{conversationId}/`) are NOT deleted
   * synchronously — there is no AFTER DELETE storage trigger. Once the conversation
   * row is gone its session prefix and message URLs drop out of
   * build_storage_reference_set, and storage-orphan-cleanup-cron garbage-collects the
   * files (generation-images 14d grace).
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
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
   * Export conversation to JSON
   */
  async exportConversation(conversationId: string): Promise<string | null> {
    try {
      // Get conversation details
      const conversation = await this.getConversation(conversationId);
      if (!conversation) {
        console.error('Conversation not found');
        return null;
      }

      // Get all messages
      const messages = await this.getConversationMessages(conversationId);

      // Create export object
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        conversation: {
          id: conversation.id,
          title: conversation.title,
          description: conversation.description,
          agentId: conversation.agentId,
          messageCount: conversation.messageCount,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
        },
        messages: messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          attachments: msg.attachments,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
        })),
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting conversation:', error);
      return null;
    }
  }

  /**
   * Import conversation from JSON
   */
  async importConversation(
    jsonData: string,
    userId: string,
  ): Promise<ChatConversation | null> {
    try {
      const importData = JSON.parse(jsonData);

      // Validate import data
      if (!importData.conversation || !importData.messages) {
        console.error('Invalid import data format');
        return null;
      }

      // Create new conversation
      const conversation = await this.createConversation({
        userId,
        agentId: importData.conversation.agentId,
        title: `${importData.conversation.title} (Imported)`,
        description: importData.conversation.description,
      });

      if (!conversation) {
        console.error('Failed to create conversation');
        return null;
      }

      // Import messages
      for (const msg of importData.messages) {
        await this.saveMessage({
          conversationId: conversation.id,
          role: msg.role,
          content: msg.content,
          attachmentIds: msg.attachmentIds || [],
          metadata: msg.metadata || {},
        });
      }

      return conversation;
    } catch (error) {
      console.error('Error importing conversation:', error);
      return null;
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
      toolkits: Array.isArray(data.toolkits) && data.toolkits.length > 0 ? data.toolkits : ['core'],
    };
  }

  /**
   * Update the toolkit set on a conversation. Called whenever the user toggles
   * a toolkit while in an active conversation so the choice survives reload.
   * Always force-includes 'core' to match the always-on rule.
   */
  async updateConversationToolkits(conversationId: string, toolkits: string[]): Promise<boolean> {
    try {
      const next = Array.from(new Set([...(toolkits || []), 'core']));
      const { error } = await supabase
        .from('agent_chat_conversations')
        .update({ toolkits: next, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating conversation toolkits:', error);
      return false;
    }
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

