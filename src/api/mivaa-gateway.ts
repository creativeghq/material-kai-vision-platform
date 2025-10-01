/**
 * MIVAA Gateway Controller
 * Routes and proxies requests to the MIVAA Python microservice
 */

// Express types (would be imported from @types/express in real implementation)
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

export interface GatewayRequest {
  action: string;
  payload?: unknown;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
}

export interface GatewayResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: string;
    stack?: string;
  };
  metadata: {
    timestamp: string;
    processingTime: number;
    version: string;
    mivaaEndpoint?: string;
  };
}

export class MivaaGatewayController {
  private readonly mivaaServiceUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor() {
    this.mivaaServiceUrl = process.env.MIVAA_GATEWAY_URL || 'http://localhost:8000';
    this.apiKey = process.env.MIVAA_API_KEY || '';
    this.timeout = parseInt(process.env.MIVAA_TIMEOUT || '30000', 10);
  }

  /**
   * Main gateway endpoint that processes all MIVAA requests
   */
  public processRequest = async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Validate request structure
      if (!req.body || typeof req.body !== 'object') {
        this.sendErrorResponse(res, 'INVALID_REQUEST_BODY', 'Request body must be a valid JSON object', startTime);
        return;
      }

      const gatewayRequest = req.body as GatewayRequest;

      // Validate required action field
      if (!gatewayRequest.action || typeof gatewayRequest.action !== 'string') {
        this.sendErrorResponse(res, 'MISSING_ACTION', 'Request must include a valid action field', startTime);
        return;
      }

      // Route request based on action
      const response = await this.routeToMivaaService(gatewayRequest, startTime);
      res.status(200).json(response);

    } catch (error) {
      console.error('Error processing MIVAA gateway request:', error);
      this.sendErrorResponse(
        res,
        'GATEWAY_ERROR',
        'An error occurred while processing the request',
        startTime,
        error
      );
    }
  };

  /**
   * Health check endpoint for the MIVAA gateway
   */
  public healthCheck = async (_req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Check MIVAA service health
      const isHealthy = await this.checkMivaaServiceHealth();
      
      const response: GatewayResponse = {
        success: isHealthy,
        data: {
          status: isHealthy ? 'healthy' : 'unhealthy',
          gateway: 'operational',
          mivaaService: isHealthy ? 'reachable' : 'unreachable',
          timestamp: new Date().toISOString(),
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          version: '1.0.0',
          mivaaEndpoint: this.mivaaServiceUrl,
        },
      };

      res.status(isHealthy ? 200 : 503).json(response);

    } catch (error) {
      console.error('Error in MIVAA health check:', error);
      this.sendErrorResponse(
        res,
        'HEALTH_CHECK_ERROR',
        'Unable to perform health check',
        startTime,
        error
      );
    }
  };

  /**
   * Route requests to the appropriate MIVAA service endpoint
   */
  private async routeToMivaaService(gatewayRequest: GatewayRequest, startTime: number): Promise<GatewayResponse> {
    const { action, payload } = gatewayRequest;

    // Map gateway actions to MIVAA service endpoints
    const endpointMap: Record<string, { path: string; method: string }> = {
      // Embedding actions
      'generate_embedding': { path: '/api/embeddings/generate', method: 'POST' },
      'generate_batch_embeddings': { path: '/api/embeddings/batch', method: 'POST' },
      
      // Search actions
      'semantic_search': { path: '/api/search/semantic', method: 'POST' },
      'vector_search': { path: '/api/search/vector', method: 'POST' },
      'hybrid_search': { path: '/api/search/hybrid', method: 'POST' },
      'get_recommendations': { path: '/api/search/recommendations', method: 'POST' },
      'get_analytics': { path: '/api/analytics', method: 'GET' },
      
      // AI Analysis actions (TogetherAI/LLaMA Vision)
      'semantic_analysis': { path: '/api/semantic-analysis', method: 'POST' },
      'llama_vision_analysis': { path: '/api/vision/llama-analyze', method: 'POST' },
      
      // CLIP Embedding actions (HuggingFace)
      'clip_embedding_generation': { path: '/api/embeddings/clip-generate', method: 'POST' },
      
      // Chat completion and conversational AI
      'chat_completion': { path: '/api/chat/completions', method: 'POST' },
      'contextual_response': { path: '/api/chat/contextual', method: 'POST' },
      
      // Audio processing
      'audio_transcription': { path: '/api/audio/transcribe', method: 'POST' },
      
      // Batch processing
      'batch_embedding': { path: '/api/embeddings/batch', method: 'POST' },
      
      // Document processing actions
      'extract_text': { path: '/api/documents/extract', method: 'POST' },
      'process_document': { path: '/api/documents/process', method: 'POST' },
      'analyze_material': { path: '/api/materials/analyze', method: 'POST' },
      
      // Legacy support
      '/extract': { path: '/api/documents/extract', method: 'POST' },
      '/process': { path: '/api/documents/process', method: 'POST' },
      '/status': { path: '/api/status', method: 'GET' },
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
      throw new Error(`Unknown action: ${action}. Available actions: ${Object.keys(endpointMap).join(', ')}`);
    }

    // Prepare request to MIVAA service
    const mivaaUrl = `${this.mivaaServiceUrl}${endpoint.path}`;
    const requestOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'MIVAA-Gateway/1.0.0',
      },
      signal: AbortSignal.timeout(this.timeout),
    };

    // Add payload for POST requests
    if (endpoint.method === 'POST' && payload) {
      requestOptions.body = JSON.stringify(payload);
    }

    // Make request to MIVAA service
    const response = await fetch(mivaaUrl, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MIVAA service error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        version: '1.0.0',
        mivaaEndpoint: mivaaUrl,
      },
    };
  }

  /**
   * Check if the MIVAA service is healthy and reachable
   */
  private async checkMivaaServiceHealth(): Promise<boolean> {
    try {
      const healthUrl = `${this.mivaaServiceUrl}/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout for health checks
      });

      return response.ok;
    } catch (error) {
      console.error('MIVAA service health check failed:', error);
      return false;
    }
  }

  /**
   * Send standardized error responses
   */
  private sendErrorResponse(
    res: Response,
    errorCode: string,
    message: string,
    startTime: number,
    error?: unknown
  ): void {
    const response: GatewayResponse = {
      success: false,
      error: {
        code: errorCode,
        message,
        details: error instanceof Error ? error.message : String(error),
        ...(process.env.NODE_ENV === 'development' && error instanceof Error && { stack: error.stack }),
      },
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        version: '1.0.0',
      },
    };

    // Determine appropriate HTTP status code
    const statusCode = this.getErrorStatusCode(errorCode);
    res.status(statusCode).json(response);
  }

  /**
   * Map error codes to appropriate HTTP status codes
   */
  private getErrorStatusCode(errorCode: string): number {
    const statusMap: Record<string, number> = {
      'INVALID_REQUEST_BODY': 400,
      'MISSING_ACTION': 400,
      'VALIDATION_ERROR': 400,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'NOT_FOUND': 404,
      'METHOD_NOT_ALLOWED': 405,
      'RATE_LIMIT_EXCEEDED': 429,
      'GATEWAY_ERROR': 500,
      'MIVAA_SERVICE_ERROR': 502,
      'SERVICE_UNAVAILABLE': 503,
      'TIMEOUT': 504,
      'HEALTH_CHECK_ERROR': 503,
    };

    return statusMap[errorCode] || 500;
  }

  /**
   * Get gateway statistics and configuration info
   */
  public getGatewayInfo(): {
    version: string;
    mivaaServiceUrl: string;
    timeout: number;
    endpoints: string[];
  } {
    return {
      version: '1.0.0',
      mivaaServiceUrl: this.mivaaServiceUrl,
      timeout: this.timeout,
      endpoints: [
        '/api/mivaa/gateway',
        '/api/mivaa/health',
      ],
    };
  }
}