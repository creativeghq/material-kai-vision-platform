/**
 * Saved Searches Service
 * 
 * Handles all operations related to saved searches including:
 * - CRUD operations
 * - Search execution and tracking
 * - Moodboard integration
 * - Chat/3D generation context linking
 * - Sharing and collaboration
 * - Recommendations and similar searches
 */

import { supabase } from '@/integrations/supabase/client';
import { MaterialFilters } from '@/components/Search/MaterialFiltersPanel';

// ==================== TYPES ====================

export interface SavedSearch {
  id: string;
  user_id: string;
  workspace_id?: string;
  name: string;
  description?: string;
  query: string;
  search_strategy: string;
  filters: Record<string, any>;
  material_filters: MaterialFilters;
  
  // Integration contexts
  conversation_id?: string;
  moodboard_id?: string;
  generation_3d_id?: string;
  spatial_context?: Record<string, any>;
  
  // Results
  results_snapshot?: any[];
  
  // Analytics
  use_count: number;
  last_used_at?: string;
  
  // Sharing
  is_public: boolean;
  shared_with_users: string[];
  
  // Recommendations
  last_executed_at?: string;
  execution_count: number;
  relevance_score: number;
  last_recommendation_sent_at?: string;
  is_active_for_recommendations: boolean;
  recommendation_frequency: 'daily' | 'weekly' | 'never';
  user_engagement_score: number;
  
  // Metadata
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateSavedSearchData {
  name: string;
  description?: string;
  query: string;
  search_strategy?: string;
  filters?: Record<string, any>;
  material_filters?: MaterialFilters;
  conversation_id?: string;
  moodboard_id?: string;
  generation_3d_id?: string;
  spatial_context?: Record<string, any>;
  results_snapshot?: any[];
  is_public?: boolean;
  tags?: string[];
  recommendation_frequency?: 'daily' | 'weekly' | 'never';
}

export interface UpdateSavedSearchData {
  name?: string;
  description?: string;
  query?: string;
  search_strategy?: string;
  filters?: Record<string, any>;
  material_filters?: MaterialFilters;
  is_public?: boolean;
  tags?: string[];
  is_active_for_recommendations?: boolean;
  recommendation_frequency?: 'daily' | 'weekly' | 'never';
}

export interface SimilarSearch {
  id: string;
  name: string;
  query: string;
  search_strategy: string;
  material_filters: MaterialFilters;
  use_count: number;
  similarity_score: number;
}

// ==================== SERVICE CLASS ====================

class SavedSearchesService {
  /**
   * Create a new saved search
   */
  async createSavedSearch(data: CreateSavedSearchData): Promise<SavedSearch> {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      throw new Error('User not authenticated');
    }

    const { data: savedSearch, error } = await supabase
      .from('saved_searches')
      .insert({
        user_id: session.session.user.id,
        name: data.name,
        description: data.description,
        query: data.query,
        search_strategy: data.search_strategy || 'hybrid',
        filters: data.filters || {},
        material_filters: data.material_filters || {},
        conversation_id: data.conversation_id,
        moodboard_id: data.moodboard_id,
        generation_3d_id: data.generation_3d_id,
        spatial_context: data.spatial_context || {},
        results_snapshot: data.results_snapshot || [],
        is_public: data.is_public || false,
        tags: data.tags || [],
        recommendation_frequency: data.recommendation_frequency || 'daily',
      })
      .select()
      .single();

    if (error) throw error;
    return savedSearch;
  }

  /**
   * Get all saved searches for current user
   */
  async getUserSavedSearches(options?: {
    includePublic?: boolean;
    tags?: string[];
    sortBy?: 'created_at' | 'last_used_at' | 'relevance_score' | 'use_count';
    sortOrder?: 'asc' | 'desc';
  }): Promise<SavedSearch[]> {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user) {
      throw new Error('User not authenticated');
    }

    let query = supabase
      .from('saved_searches')
      .select('*')
      .eq('user_id', session.session.user.id);

    // Apply filters
    if (options?.tags && options.tags.length > 0) {
      query = query.contains('tags', options.tags);
    }

    // Apply sorting
    const sortBy = options?.sortBy || 'created_at';
    const sortOrder = options?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const { data: searches, error } = await query;

    if (error) throw error;
    return searches || [];
  }

  /**
   * Get a specific saved search by ID
   */
  async getSavedSearchById(id: string): Promise<SavedSearch> {
    const { data: search, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return search;
  }

  /**
   * Update a saved search
   */
  async updateSavedSearch(id: string, data: UpdateSavedSearchData): Promise<SavedSearch> {
    const { data: updatedSearch, error } = await supabase
      .from('saved_searches')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return updatedSearch;
  }

  /**
   * Delete a saved search
   */
  async deleteSavedSearch(id: string): Promise<void> {
    const { error } = await supabase
      .from('saved_searches')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /**
   * Execute a saved search and update tracking
   */
  async executeSavedSearch(id: string): Promise<SavedSearch> {
    // Update engagement score and execution tracking
    const { data, error } = await supabase.rpc('update_search_engagement', {
      p_search_id: id,
      p_action: 'executed',
    });

    if (error) throw error;

    // Get updated search
    return this.getSavedSearchById(id);
  }

  /**
   * Get saved searches by conversation ID (chat context)
   */
  async getSearchesByConversation(conversationId: string): Promise<SavedSearch[]> {
    const { data: searches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return searches || [];
  }

  /**
   * Get saved searches by moodboard ID
   */
  async getSearchesByMoodboard(moodboardId: string): Promise<SavedSearch[]> {
    const { data: searches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('moodboard_id', moodboardId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return searches || [];
  }

  /**
   * Get saved searches by 3D generation ID
   */
  async getSearchesBy3DGeneration(generationId: string): Promise<SavedSearch[]> {
    const { data: searches, error } = await supabase
      .from('saved_searches')
      .select('*')
      .eq('generation_3d_id', generationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return searches || [];
  }

  /**
   * Find similar public searches
   */
  async findSimilarSearches(searchId: string, limit: number = 10): Promise<SimilarSearch[]> {
    const { data: similarSearches, error } = await supabase.rpc('find_similar_searches', {
      p_search_id: searchId,
      p_limit: limit,
    });

    if (error) throw error;
    return similarSearches || [];
  }

  /**
   * Share a saved search with users
   */
  async shareSavedSearch(searchId: string, userIds: string[]): Promise<SavedSearch> {
    const search = await this.getSavedSearchById(searchId);
    
    const updatedSharedUsers = Array.from(
      new Set([...search.shared_with_users, ...userIds])
    );

    return this.updateSavedSearch(searchId, {
      // @ts-ignore - shared_with_users is not in UpdateSavedSearchData but exists in DB
      shared_with_users: updatedSharedUsers,
    });
  }

  /**
   * Unshare a saved search with a user
   */
  async unshareSavedSearch(searchId: string, userId: string): Promise<SavedSearch> {
    const search = await this.getSavedSearchById(searchId);
    
    const updatedSharedUsers = search.shared_with_users.filter(id => id !== userId);

    return this.updateSavedSearch(searchId, {
      // @ts-ignore
      shared_with_users: updatedSharedUsers,
    });
  }

  /**
   * Get public saved searches (for discovery)
   */
  async getPublicSearches(options?: {
    tags?: string[];
    limit?: number;
  }): Promise<SavedSearch[]> {
    let query = supabase
      .from('saved_searches')
      .select('*')
      .eq('is_public', true);

    if (options?.tags && options.tags.length > 0) {
      query = query.contains('tags', options.tags);
    }

    query = query
      .order('use_count', { ascending: false })
      .limit(options?.limit || 50);

    const { data: searches, error } = await query;

    if (error) throw error;
    return searches || [];
  }
}

// Export singleton instance
export const savedSearchesService = new SavedSearchesService();

