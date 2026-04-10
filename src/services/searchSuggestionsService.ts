/**
 * Search Suggestions Service
 *
 * Provides intelligent search suggestions, auto-complete, trending searches,
 * typo correction, and query expansion functionality via MIVAA API.
 */

import { mivaaApi } from './mivaaApiClient';

// Types
export interface SearchSuggestion {
  id: string;
  suggestion_text: string;
  suggestion_type: 'trending' | 'recent' | 'popular' | 'product' | 'material';
  category?: string;
  /** Optional confidence score from semantic / typo-correction backends */
  confidence?: number;
  popularity_score: number;
  click_count: number;
  impression_count: number;
  ctr: number;
  metadata?: Record<string, any>;
}

export interface TrendingSearch {
  id: string;
  query_text: string;
  search_count: number;
  unique_users_count: number;
  trend_score: number;
  growth_rate: number;
  time_window: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface QueryCorrection {
  original_query: string;
  corrected_query: string;
  correction_type: 'spelling' | 'synonym' | 'expansion' | 'abbreviation';
  confidence_score: number;
  auto_applied: boolean;
  acceptance_rate: number;
}

export interface AutoCompleteResponse {
  success: boolean;
  query: string;
  suggestions: SearchSuggestion[];
  total_suggestions: number;
  processing_time_ms: number;
  metadata: Record<string, any>;
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

export interface TypoCorrectionResponse {
  success: boolean;
  original_query: string;
  has_corrections: boolean;
  corrections: QueryCorrection[];
  recommended_correction?: QueryCorrection;
  metadata: Record<string, any>;
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

export interface TypoCorrectionRequest {
  query: string;
  auto_apply_threshold?: number;
  max_suggestions?: number;
}

/**
 * Search Suggestions Service
 */
export class SearchSuggestionsService {
  private mivaaClient = mivaaApi;

  /**
   * Get auto-complete suggestions
   */
  async getAutoCompleteSuggestions(
    request: AutoCompleteRequest,
  ): Promise<AutoCompleteResponse> {
    try {
      const response = await this.mivaaClient.request('/api/search/autocomplete', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to get autocomplete suggestions');
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
    category?: string,
    minSearchCount: number = 2,
  ): Promise<TrendingSearchesResponse> {
    try {
      const params = new URLSearchParams({
        time_window: timeWindow,
        limit: String(limit),
        min_search_count: String(minSearchCount),
      });

      if (category) {
        params.append('category', category);
      }

      const response = await this.mivaaClient.request(
        `/api/search/trending?${params.toString()}`,
        { method: 'GET' },
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
    autoApplyThreshold: number = 0.85,
    maxSuggestions: number = 3,
  ): Promise<TypoCorrectionResponse> {
    try {
      const request: TypoCorrectionRequest = {
        query,
        auto_apply_threshold: autoApplyThreshold,
        max_suggestions: maxSuggestions,
      };

      const response = await this.mivaaClient.request('/api/search/typo-correction', {
        method: 'POST',
        body: JSON.stringify(request),
      });

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
   * Track suggestion click for analytics
   */
  async trackSuggestionClick(
    suggestionId: string,
    suggestionText: string,
    userId?: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      await this.mivaaClient.request('/api/search/track-click', {
        method: 'POST',
        body: JSON.stringify({
          suggestion_id: suggestionId,
          suggestion_text: suggestionText,
          user_id: userId,
          session_id: sessionId,
        }),
      });
    } catch (error) {
      console.error('Error tracking suggestion click:', error);
      // Don't throw - tracking failures shouldn't break user experience
    }
  }
}

// Singleton instance
let instance: SearchSuggestionsService | null = null;

/**
 * Get search suggestions service instance
 */
export function getSearchSuggestionsService(): SearchSuggestionsService {
  if (!instance) {
    instance = new SearchSuggestionsService();
  }
  return instance;
}

