/**
 * Visual Search API Controller
 * 
 * Provides API endpoints for visual search functionality, orchestrating calls
 * to the Supabase visual search edge function while maintaining consistent
 * API patterns with the rest of the application.
 */

interface Request {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  params: Record<string, string>;
  query: Record<string, unknown>;
  url: string;
  method: string;
}

interface Response {
  status(code: number): Response;
  json(data: unknown): void;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
}

// Supabase client interfaces
interface SupabaseResponse<T = unknown> {
  data: T | null;
  error: Error | null;
}

interface SupabaseClient {
  functions: {
    invoke(functionName: string, options?: {
      body?: unknown;
      headers?: Record<string, string>;
    }): Promise<SupabaseResponse>;
  };
}

// Visual Search Request Types
interface SearchByImageRequest {
  image: string; // Base64 encoded image or image URL
  searchType?: 'visual' | 'semantic' | 'hybrid' | 'properties';
  filters?: {
    materialTypes?: string[];
    properties?: Record<string, unknown>;
    minConfidence?: number;
  };
  limit?: number;
  fusion?: {
    visual?: number;
    semantic?: number;
    properties?: number;
    confidence?: number;
  };
}

interface SearchByDescriptionRequest {
  description: string;
  searchType?: 'semantic' | 'hybrid' | 'properties';
  filters?: {
    materialTypes?: string[];
    properties?: Record<string, unknown>;
    minConfidence?: number;
  };
  limit?: number;
  fusion?: {
    semantic?: number;
    properties?: number;
    confidence?: number;
  };
}

interface HybridSearchRequest {
  image?: string; // Base64 encoded image or image URL
  description?: string;
  searchType: 'hybrid';
  filters?: {
    materialTypes?: string[];
    properties?: Record<string, unknown>;
    minConfidence?: number;
  };
  limit?: number;
  fusion?: {
    visual?: number;
    semantic?: number;
    properties?: number;
    confidence?: number;
  };
}

interface MaterialPropertySearchRequest {
  properties: Record<string, unknown>;
  searchType: 'properties';
  filters?: {
    materialTypes?: string[];
    minConfidence?: number;
  };
  limit?: number;
}

interface SearchAnalyticsRequest {
  searchId?: string;
  timeRange?: {
    start: string;
    end: string;
  };
  metrics?: string[];
}

export class VisualSearchController {
  private supabaseClient: SupabaseClient | null = null;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabaseClient = supabaseClient || null;
  }

  /**
   * Initialize the controller with a Supabase client
   */
  public initialize(supabaseClient: SupabaseClient): void {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Search by image endpoint
   * POST /api/visual-search/by-image
   */
  public searchByImage = async (req: Request, res: Response): Promise<void> => {
    try {
      const requestData = req.body as SearchByImageRequest;

      // Validate required fields
      if (!requestData.image) {
        res.status(400).json({
          error: 'Image is required',
          code: 'MISSING_IMAGE'
        });
        return;
      }

      // Validate Supabase client
      if (!this.supabaseClient) {
        res.status(500).json({
          error: 'Visual search service not initialized',
          code: 'SERVICE_NOT_INITIALIZED'
        });
        return;
      }

      // Prepare request for visual search function
      const searchRequest = {
        searchType: requestData.searchType || 'visual',
        image: requestData.image,
        filters: requestData.filters || {},
        limit: requestData.limit || 20,
        fusion: requestData.fusion || {
          visual: 0.4,
          semantic: 0.3,
          properties: 0.2,
          confidence: 0.1
        }
      };

      // Call the Supabase unified material search function
      const { data, error } = await this.supabaseClient.functions.invoke(
        'unified-material-search',
        {
          body: searchRequest,
          headers: {
            'Content-Type': 'application/json',
            ...this.extractAuthHeaders(req)
          }
        }
      );

      if (error) {
        console.error('Visual search function error:', error);
        res.status(500).json({
          error: 'Visual search failed',
          code: 'SEARCH_FUNCTION_ERROR',
          details: error.message
        });
        return;
      }

      // Return successful response
      res.status(200).json({
        success: true,
        data: data,
        searchType: searchRequest.searchType,
        timestamp: new Date().toISOString()
      });

    } catch (error: unknown) {
      console.error('Search by image error:', error);
      res.status(500).json({
        error: 'Internal server error during image search',
        code: 'INTERNAL_ERROR',
        details: (error as Error).message
      });
    }
  };

  /**
   * Search by description endpoint
   * POST /api/visual-search/by-description
   */
  public searchByDescription = async (req: Request, res: Response): Promise<void> => {
    try {
      const requestData = req.body as SearchByDescriptionRequest;

      // Validate required fields
      if (!requestData.description) {
        res.status(400).json({
          error: 'Description is required',
          code: 'MISSING_DESCRIPTION'
        });
        return;
      }

      // Validate Supabase client
      if (!this.supabaseClient) {
        res.status(500).json({
          error: 'Visual search service not initialized',
          code: 'SERVICE_NOT_INITIALIZED'
        });
        return;
      }

      // Prepare request for visual search function
      const searchRequest = {
        searchType: requestData.searchType || 'semantic',
        description: requestData.description,
        filters: requestData.filters || {},
        limit: requestData.limit || 20,
        fusion: requestData.fusion || {
          semantic: 0.6,
          properties: 0.3,
          confidence: 0.1
        }
      };

      // Call the Supabase unified material search function
      const { data, error } = await this.supabaseClient.functions.invoke(
        'unified-material-search',
        {
          body: searchRequest,
          headers: {
            'Content-Type': 'application/json',
            ...this.extractAuthHeaders(req)
          }
        }
      );

      if (error) {
        console.error('Visual search function error:', error);
        res.status(500).json({
          error: 'Visual search failed',
          code: 'SEARCH_FUNCTION_ERROR',
          details: error.message
        });
        return;
      }

      // Return successful response
      res.status(200).json({
        success: true,
        data: data,
        searchType: searchRequest.searchType,
        timestamp: new Date().toISOString()
      });

    } catch (error: unknown) {
      console.error('Search by description error:', error);
      res.status(500).json({
        error: 'Internal server error during description search',
        code: 'INTERNAL_ERROR',
        details: (error as Error).message
      });
    }
  };

  /**
   * Hybrid search endpoint (image + text)
   * POST /api/visual-search/hybrid
   */
  public hybridSearch = async (req: Request, res: Response): Promise<void> => {
    try {
      const requestData = req.body as HybridSearchRequest;

      // Validate required fields
      if (!requestData.image && !requestData.description) {
        res.status(400).json({
          error: 'Either image or description is required',
          code: 'MISSING_INPUT'
        });
        return;
      }

      // Validate Supabase client
      if (!this.supabaseClient) {
        res.status(500).json({
          error: 'Visual search service not initialized',
          code: 'SERVICE_NOT_INITIALIZED'
        });
        return;
      }

      // Prepare request for visual search function
      const searchRequest = {
        searchType: 'hybrid',
        ...(requestData.image && { image: requestData.image }),
        ...(requestData.description && { description: requestData.description }),
        filters: requestData.filters || {},
        limit: requestData.limit || 20,
        fusion: requestData.fusion || {
          visual: 0.4,
          semantic: 0.3,
          properties: 0.2,
          confidence: 0.1
        }
      };

      // Call the Supabase unified material search function
      const { data, error } = await this.supabaseClient.functions.invoke(
        'unified-material-search',
        {
          body: searchRequest,
          headers: {
            'Content-Type': 'application/json',
            ...this.extractAuthHeaders(req)
          }
        }
      );

      if (error) {
        console.error('Visual search function error:', error);
        res.status(500).json({
          error: 'Visual search failed',
          code: 'SEARCH_FUNCTION_ERROR',
          details: error.message
        });
        return;
      }

      // Return successful response
      res.status(200).json({
        success: true,
        data: data,
        searchType: 'hybrid',
        timestamp: new Date().toISOString()
      });

    } catch (error: unknown) {
      console.error('Hybrid search error:', error);
      res.status(500).json({
        error: 'Internal server error during hybrid search',
        code: 'INTERNAL_ERROR',
        details: (error as Error).message
      });
    }
  };

  /**
   * Material property search endpoint
   * POST /api/visual-search/by-properties
   */
  public searchByProperties = async (req: Request, res: Response): Promise<void> => {
    try {
      const requestData = req.body as MaterialPropertySearchRequest;

      // Validate required fields
      if (!requestData.properties || Object.keys(requestData.properties).length === 0) {
        res.status(400).json({
          error: 'Material properties are required',
          code: 'MISSING_PROPERTIES'
        });
        return;
      }

      // Validate Supabase client
      if (!this.supabaseClient) {
        res.status(500).json({
          error: 'Visual search service not initialized',
          code: 'SERVICE_NOT_INITIALIZED'
        });
        return;
      }

      // Prepare request for visual search function
      const searchRequest = {
        searchType: 'properties',
        properties: requestData.properties,
        filters: requestData.filters || {},
        limit: requestData.limit || 20
      };

      // Call the Supabase unified material search function
      const { data, error } = await this.supabaseClient.functions.invoke(
        'unified-material-search',
        {
          body: searchRequest,
          headers: {
            'Content-Type': 'application/json',
            ...this.extractAuthHeaders(req)
          }
        }
      );

      if (error) {
        console.error('Visual search function error:', error);
        res.status(500).json({
          error: 'Visual search failed',
          code: 'SEARCH_FUNCTION_ERROR',
          details: error.message
        });
        return;
      }

      // Return successful response
      res.status(200).json({
        success: true,
        data: data,
        searchType: 'properties',
        timestamp: new Date().toISOString()
      });

    } catch (error: unknown) {
      console.error('Search by properties error:', error);
      res.status(500).json({
        error: 'Internal server error during property search',
        code: 'INTERNAL_ERROR',
        details: (error as Error).message
      });
    }
  };

  /**
   * Search analytics endpoint
   * GET /api/visual-search/analytics
   */
  public getSearchAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const requestData: SearchAnalyticsRequest = req.query as unknown as SearchAnalyticsRequest;

      // Validate Supabase client
      if (!this.supabaseClient) {
        res.status(500).json({
          error: 'Visual search service not initialized',
          code: 'SERVICE_NOT_INITIALIZED'
        });
        return;
      }

      // Prepare request for visual search function
      const analyticsRequest = {
        action: 'analytics',
        searchId: requestData.searchId,
        timeRange: requestData.timeRange,
        metrics: requestData.metrics || ['search_count', 'response_time', 'success_rate']
      };

      // Call the Supabase unified material search function
      const { data, error } = await this.supabaseClient.functions.invoke(
        'unified-material-search',
        {
          body: analyticsRequest,
          headers: {
            'Content-Type': 'application/json',
            ...this.extractAuthHeaders(req)
          }
        }
      );

      if (error) {
        console.error('Visual search analytics error:', error);
        res.status(500).json({
          error: 'Analytics retrieval failed',
          code: 'ANALYTICS_ERROR',
          details: error.message
        });
        return;
      }

      // Return successful response
      res.status(200).json({
        success: true,
        data: data,
        timestamp: new Date().toISOString()
      });

    } catch (error: unknown) {
      console.error('Search analytics error:', error);
      res.status(500).json({
        error: 'Internal server error during analytics retrieval',
        code: 'INTERNAL_ERROR',
        details: (error as Error).message
      });
    }
  };

  /**
   * Health check endpoint
   * GET /api/visual-search/health
   */
  public healthCheck = async (req: Request, res: Response): Promise<void> => {
    try {
      // Basic health check
      const health = {
        service: 'visual-search-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        supabaseClient: this.supabaseClient ? 'connected' : 'disconnected'
      };

      res.status(200).json(health);
    } catch (error: unknown) {
      res.status(500).json({
        service: 'visual-search-api',
        status: 'unhealthy',
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  };

  /**
   * Extract authentication headers from request
   */
  private extractAuthHeaders(req: Request): Record<string, string> {
    const authHeaders: Record<string, string> = {};
    
    // Extract Authorization header
    if (req.headers.authorization) {
      const authHeader = Array.isArray(req.headers.authorization)
        ? req.headers.authorization[0]
        : req.headers.authorization;
      if (authHeader) {
        authHeaders.Authorization = authHeader;
      }
    }

    // Extract API key if present
    if (req.headers['x-api-key']) {
      const apiKey = Array.isArray(req.headers['x-api-key'])
        ? req.headers['x-api-key'][0]
        : req.headers['x-api-key'];
      if (apiKey) {
        authHeaders['x-api-key'] = apiKey;
      }
    }

    return authHeaders;
  }
}