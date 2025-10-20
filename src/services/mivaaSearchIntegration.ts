/**
 * MIVAA Search Integration Service
 * Provides search and vector similarity capabilities through the MIVAA gateway
 */

export interface SearchRequest {
  query: string;
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
  searchType?: 'semantic' | 'vector' | 'hybrid';
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
  embedding?: number[];
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  searchType: string;
  processingTime: number;
  metadata?: {
    queryEmbedding?: number[];
    searchParameters?: Record<string, unknown>;
  };
}

export interface VectorSearchRequest {
  embedding: number[];
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

export interface HybridSearchRequest {
  textQuery: string;
  vectorEmbedding?: number[];
  weights?: {
    semantic: number;
    vector: number;
  };
  limit?: number;
  threshold?: number;
  filters?: Record<string, unknown>;
}

/**
 * Call MIVAA Gateway directly using fetch to avoid CORS issues
 */
async function callMivaaGatewayDirect(action: string, payload: any): Promise<any> {
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
  const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration not found');
  }

  const url = `${supabaseUrl}/functions/v1/mivaa-gateway`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        payload,
      }),
    });

    if (!response.ok) {
      throw new Error(`MIVAA gateway request failed: HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for application-level errors
    if (!data.success && data.error) {
      throw new Error(`MIVAA gateway request failed: ${data.error.message || 'Unknown error'}`);
    }

    return data;
  } catch (error) {
    console.error('Direct MIVAA gateway call failed:', error);
    throw error;
  }
}

export class MivaaSearchIntegration {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.gatewayUrl = process.env.MIVAA_GATEWAY_URL || 'http://localhost:3000';
    this.apiKey = process.env.MIVAA_API_KEY || '';
  }

  /**
   * Perform semantic search using MIVAA service
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
          payload: {
            ...request,
            searchType: 'semantic',
          },
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
   * Perform vector similarity search using MIVAA service
   */
  async vectorSearch(request: VectorSearchRequest): Promise<SearchResponse> {
    try {
      // Use direct MIVAA gateway call
      const response = await callMivaaGatewayDirect('vector_search', request);

      if (!response.success) {
        throw new Error(`MIVAA vector search request failed: ${response.error?.message || 'Unknown error'}`);
      }

      const result = response.data;
      return result.data as SearchResponse;
    } catch (error) {
      console.error('Error performing vector search via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Perform hybrid search combining semantic and vector search
   */
  async hybridSearch(request: HybridSearchRequest): Promise<SearchResponse> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'hybrid_search',
          payload: {
            ...request,
            weights: request.weights || { semantic: 0.7, vector: 0.3 },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA hybrid search request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as SearchResponse;
    } catch (error) {
      console.error('Error performing hybrid search via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Search for similar documents by content
   */
  async searchSimilarDocuments(content: string, options?: Partial<SearchRequest>): Promise<SearchResponse> {
    const searchRequest: SearchRequest = {
      query: content,
      limit: options?.limit || 10,
      threshold: options?.threshold || 0.7,
      searchType: 'semantic',
    };

    if (options?.filters) {
      searchRequest.filters = options.filters;
    }

    return this.semanticSearch(searchRequest);
  }

  /**
   * Get search recommendations based on user query
   */
  async getSearchRecommendations(query: string, limit: number = 5): Promise<SearchResponse> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'get_recommendations',
          payload: {
            query,
            limit,
            type: 'search_suggestions',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA recommendations request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data as SearchResponse;
    } catch (error) {
      console.error('Error getting search recommendations via MIVAA gateway:', error);
      throw error;
    }
  }

  /**
   * Check if the MIVAA search service is available
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      return {
        status: response.ok ? 'healthy' : 'unhealthy',
      };
    } catch (error) {
      console.error('MIVAA search service health check failed:', error);
      return { status: 'unhealthy' };
    }
  }

  /**
   * Get search analytics and statistics
   */
  async getSearchAnalytics(): Promise<{
    totalSearches: number;
    avgResponseTime: number;
    popularQueries: string[];
    searchTypes: Record<string, number>;
  }> {
    try {
      const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          action: 'get_analytics',
          payload: {
            type: 'search_analytics',
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MIVAA analytics request failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Error getting search analytics via MIVAA gateway:', error);
      throw error;
    }
  }
}
