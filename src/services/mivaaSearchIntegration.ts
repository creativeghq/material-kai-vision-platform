/**
 * MIVAA Search Integration Service
 * Provides search capabilities through the MIVAA gateway
 */

export interface SearchRequest {
  query: string;
  filters?: {
    documentType?: string;
    dateRange?: {
      start: string;
      end: string;
    };
    tags?: string[];
  };
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  metadata: {
    documentType: string;
    createdAt: string;
    tags: string[];
    source?: string;
  };
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
  executionTime: number;
}

export class MivaaSearchIntegration {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.gatewayUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    this.apiKey = process.env.MIVAA_API_KEY || '';
  }

  /**
   * Perform a search using MIVAA service
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'search',
          payload: request,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA search request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as SearchResponse;
    } catch (error) {
      console.error('Error performing search via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Perform a semantic search using MIVAA service
   */
  async semanticSearch(request: SearchRequest): Promise<SearchResponse> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'semantic_search',
          payload: request,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA semantic search request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as SearchResponse;
    } catch (error) {
      console.error('Error performing semantic search via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Get search suggestions based on partial query
   */
  async getSuggestions(partialQuery: string, limit: number = 5): Promise<string[]> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'get_suggestions',
          payload: { query: partialQuery, limit },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA suggestions request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as string[];
    } catch (error) {
      console.error('Error getting suggestions via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Check if the MIVAA search service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('MIVAA search service health check failed:', error);
      return false;
    }
  }
}