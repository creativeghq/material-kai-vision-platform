/**
 * Search Suggestions Service
 * 
 * Provides intelligent search suggestions, auto-complete, trending searches,
 * typo correction, and query expansion functionality.
 */

import { BrowserApiIntegrationService } from './browserApiIntegrationService';

// ============================================================================
// Types
// ============================================================================

export interface SearchSuggestion {
  id: string;
  suggestion_text: string;
  suggestion_type: 'product' | 'material' | 'category' | 'property' | 'trending' | 'recent' | 'popular';
  category?: string;
  popularity_score: number;
  click_count: number;
  impression_count: number;
  ctr: number;
  metadata?: Record<string, any>;
  confidence?: number;
}

export interface AutoCompleteRequest {
  query: string;
  limit?: number;
  user_id?: string;
  session_id?: string;
  include_trending?: boolean;
  include_recent?: boolean;
  include_popular?: boolean;
  categories?: string[];
}

export interface AutoCompleteResponse {
  success: boolean;
  query: string;
  suggestions: SearchSuggestion[];
  total_suggestions: number;
  processing_time_ms: number;
  metadata: Record<string, any>;
}

export interface TrendingSearch {
  query_text: string;
  search_count: number;
  unique_users_count: number;
  trend_score: number;
  growth_rate: number;
  time_window: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface TrendingSearchesResponse {
  success: boolean;
  trending_searches: TrendingSearch[];
  total_results: number;
  time_window: string;
  window_start: string;
  window_end: string;
  metadata: Record<string, any>;
}

export interface QueryCorrection {
  original_query: string;
  corrected_query: string;
  correction_type: 'spelling' | 'synonym' | 'expansion' | 'abbreviation';
  confidence_score: number;
  auto_applied: boolean;
  acceptance_rate: number;
}

export interface TypoCorrectionResponse {
  success: boolean;
  original_query: string;
  has_corrections: boolean;
  corrections: QueryCorrection[];
  recommended_correction?: QueryCorrection;
  metadata: Record<string, any>;
}

export interface ExpandedQuery {
  original_query: string;
  expanded_terms: string[];
  synonyms: Record<string, string[]>;
  related_concepts: string[];
  confidence_score: number;
}

export interface QueryExpansionResponse {
  success: boolean;
  expanded_query: ExpandedQuery;
  suggested_searches: string[];
  processing_time_ms: number;
  metadata: Record<string, any>;
}

// ============================================================================
// Service Class
// ============================================================================

export class SearchSuggestionsService {
  private apiService: BrowserApiIntegrationService;
  private sessionId: string;

  constructor() {
    this.apiService = BrowserApiIntegrationService.getInstance();
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get auto-complete suggestions for a partial query
   */
  async getAutoCompleteSuggestions(
    request: AutoCompleteRequest
  ): Promise<AutoCompleteResponse> {
    try {
      const response = await this.apiService.callSupabaseFunction(
        'mivaa-gateway',
        {
          action: 'autocomplete',
          payload: {
            ...request,
            session_id: request.session_id || this.sessionId,
          },
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to get suggestions');
      }

      return response.data as AutoCompleteResponse;
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      return {
        success: false,
        query: request.query,
        suggestions: [],
        total_suggestions: 0,
        processing_time_ms: 0,
        metadata: { error: String(error) },
      };
    }
  }

  /**
   * Get trending searches
   */
  async getTrendingSearches(
    timeWindow: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily',
    limit: number = 20,
    category?: string
  ): Promise<TrendingSearchesResponse> {
    try {
      const response = await this.apiService.callSupabaseFunction(
        'mivaa-gateway',
        {
          action: 'trending_searches',
          payload: {
            time_window: timeWindow,
            limit,
            category,
            min_search_count: 2,
          },
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to get trending searches');
      }

      return response.data as TrendingSearchesResponse;
    } catch (error) {
      console.error('Error getting trending searches:', error);
      return {
        success: false,
        trending_searches: [],
        total_results: 0,
        time_window: timeWindow,
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        metadata: { error: String(error) },
      };
    }
  }

  /**
   * Check for typos and get corrections
   */
  async checkTypoCorrection(
    query: string,
    autoApplyThreshold: number = 0.9,
    maxSuggestions: number = 3
  ): Promise<TypoCorrectionResponse> {
    try {
      const response = await this.apiService.callSupabaseFunction(
        'mivaa-gateway',
        {
          action: 'typo_correction',
          payload: {
            query,
            auto_apply_threshold: autoApplyThreshold,
            max_suggestions: maxSuggestions,
          },
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to check typo correction');
      }

      return response.data as TypoCorrectionResponse;
    } catch (error) {
      console.error('Error checking typo correction:', error);
      return {
        success: false,
        original_query: query,
        has_corrections: false,
        corrections: [],
        metadata: { error: String(error) },
      };
    }
  }

  /**
   * Expand query with synonyms and related terms
   */
  async expandQuery(
    query: string,
    maxSynonymsPerTerm: number = 3,
    maxRelatedConcepts: number = 5,
    useAI: boolean = true
  ): Promise<QueryExpansionResponse> {
    try {
      const response = await this.apiService.callSupabaseFunction(
        'mivaa-gateway',
        {
          action: 'query_expansion',
          payload: {
            query,
            max_synonyms_per_term: maxSynonymsPerTerm,
            max_related_concepts: maxRelatedConcepts,
            use_ai: useAI,
          },
        }
      );

      if (!response.success) {
        throw new Error(response.error || 'Failed to expand query');
      }

      return response.data as QueryExpansionResponse;
    } catch (error) {
      console.error('Error expanding query:', error);
      return {
        success: false,
        expanded_query: {
          original_query: query,
          expanded_terms: [],
          synonyms: {},
          related_concepts: [],
          confidence_score: 0,
        },
        suggested_searches: [],
        processing_time_ms: 0,
        metadata: { error: String(error) },
      };
    }
  }

  /**
   * Track when user clicks on a suggestion
   */
  async trackSuggestionClick(
    suggestionId: string,
    originalQuery: string,
    suggestionPosition: number,
    actionType: 'clicked' | 'dismissed' | 'ignored' | 'accepted',
    userId?: string,
    resultCount?: number,
    userSatisfied?: boolean
  ): Promise<boolean> {
    try {
      const response = await this.apiService.callSupabaseFunction(
        'mivaa-gateway',
        {
          action: 'track_suggestion_click',
          payload: {
            suggestion_id: suggestionId,
            user_id: userId,
            session_id: this.sessionId,
            original_query: originalQuery,
            suggestion_position: suggestionPosition,
            action_type: actionType,
            result_count: resultCount,
            user_satisfied: userSatisfied,
          },
        }
      );

      return response.success;
    } catch (error) {
      console.error('Error tracking suggestion click:', error);
      return false;
    }
  }

  /**
   * Get session ID for tracking
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Reset session ID (e.g., on page reload or user logout)
   */
  resetSession(): void {
    this.sessionId = this.generateSessionId();
  }
}

// Export singleton instance
let instance: SearchSuggestionsService | null = null;

export function getSearchSuggestionsService(): SearchSuggestionsService {
  if (!instance) {
    instance = new SearchSuggestionsService();
  }
  return instance;
}

