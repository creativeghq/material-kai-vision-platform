import { z } from 'zod';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { JWTAuthMiddleware, AuthenticatedRequest, AuthenticationResult } from '../middleware/jwtAuthMiddleware';
import { MaterialKaiAuthMiddleware } from '../middleware/materialKaiAuthMiddleware';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Auth context interface
interface AuthContext {
  userId: string;
  workspaceId: string;
}

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

interface NextFunction {
  (): void;
}

// MIVAA Request/Response Types
interface MivaaRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  timeout?: number;
}

interface MivaaResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    timestamp: string;
    processingTime: number;
    version: string;
  };
}

// Validation Schemas
const MivaaRequestSchema = z.object({
  endpoint: z.string().min(1, 'Endpoint is required'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.any().optional(),
  params: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.any()).optional(),
  timeout: z.number().min(1000).max(300000).optional(), // 1s to 5min
});

// Rate limiting helper
class MivaaRateLimitHelper {
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  static async checkRateLimit(identifier: string, limit: number = 200, windowMs: number = 60000): Promise<boolean> {
    const now = Date.now();
    const key = `mivaa:${identifier}`;

    const current = this.rateLimitStore.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count++;
    return true;
  }

  static async logMivaaUsage(userId: string, workspaceId: string, endpoint: string, metadata?: unknown): Promise<void> {
    console.log(`MIVAA Gateway Usage: ${userId} in ${workspaceId} accessed ${endpoint}`, metadata);
  }
}

/**
 * MIVAA API Gateway Controller
 *
 * Provides a centralized gateway for all MIVAA microservice requests.
 * Implements authentication, rate limiting, request validation, and response formatting.
 * Routes all MIVAA requests through the main app API for consistent access control.
 */
export class MivaaGatewayController {
  private readonly MIVAA_BASE_URL: string;
  private readonly API_VERSION = '1.0.0';
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  constructor() {
    this.MIVAA_BASE_URL = process.env.MIVAA_BASE_URL || 'http://localhost:8000';

    // Ensure MIVAA base URL doesn't end with slash
    if (this.MIVAA_BASE_URL.endsWith('/')) {
      this.MIVAA_BASE_URL = this.MIVAA_BASE_URL.slice(0, -1);
    }
  }

  /**
   * Authentication Middleware for MIVAA requests
   * Supports both JWT authentication and Material Kai API key authentication
   */
  private async authenticateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Create Material Kai middleware instance with Supabase client
      // Create Material Kai middleware instance with Supabase client
      const materialKaiMiddleware = new MaterialKaiAuthMiddleware(supabase);

      // Extract origin from request headers
      const origin = req.headers.origin || req.headers.Origin || null;

      // First, try Material Kai API key authentication
      const materialKaiResult = await materialKaiMiddleware.authenticate(
        req.headers as Record<string, string | string[] | undefined>,
        typeof origin === 'string' ? origin : null,
      );

      if (materialKaiResult.success && materialKaiResult.keyData) {
        // Material Kai authentication successful
        (req as unknown as { authContext: { userId: string; workspaceId: string; authType: string; apiKey: string; scopes: string[] } }).authContext = {
          userId: 'material-kai-user',
          workspaceId: materialKaiResult.keyData.workspace_id,
          authType: 'material-kai',
          apiKey: materialKaiResult.keyData.api_key,
          scopes: ['mivaa:access', 'material-kai:access'],
        };
        next();
        return;
      }

      // If Material Kai auth failed, try JWT authentication as fallback
      const authRequest: AuthenticatedRequest = {
        headers: req.headers as Record<string, string>,
        body: req.body,
      };

      // Extract workspace ID if provided
      const extractedWorkspaceId = JWTAuthMiddleware.extractWorkspaceId(authRequest);
      if (extractedWorkspaceId) {
        authRequest.workspaceId = extractedWorkspaceId;
      }

      // Authenticate with MIVAA-specific scopes
      const jwtAuthResult: AuthenticationResult = await JWTAuthMiddleware.authenticate(authRequest, {
        allowApiKey: true,
        requiredScopes: ['mivaa:access'],
        workspaceRequired: true,
      });

      if (!jwtAuthResult.success) {
        // Both authentication methods failed
        const errorResponse: MivaaResponse = {
          success: false,
          error: {
            code: 'MIVAA_AUTH_FAILED',
            message: 'Authentication failed. Please provide a valid JWT token or Material Kai API key.',
            details: {
              materialKaiError: materialKaiResult.error,
              jwtError: jwtAuthResult.error?.message,
            },
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime: 0,
            version: this.API_VERSION,
          },
        };

        res.status(401).json(errorResponse);
        return;
      }

      // JWT authentication successful
      (req as unknown as { authContext: unknown }).authContext = {
        ...jwtAuthResult.authContext,
        authType: 'jwt',
      };
      next();
    } catch (error) {
      const errorResponse: MivaaResponse = {
        success: false,
        error: {
          code: 'MIVAA_AUTH_ERROR',
          message: 'MIVAA authentication failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 0,
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Rate Limiting Middleware for MIVAA requests
   */
  private async rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authContext = (req as unknown as { authContext?: { userId: string; workspaceId: string } }).authContext;
      if (!authContext) {
        next();
        return;
      }

      const identifier = `${authContext.userId}:${authContext.workspaceId}`;
      const isAllowed = await MivaaRateLimitHelper.checkRateLimit(identifier, 200, 60000); // 200 requests per minute for MIVAA

      if (!isAllowed) {
        const errorResponse: MivaaResponse = {
          success: false,
          error: {
            code: 'MIVAA_RATE_LIMIT_EXCEEDED',
            message: 'MIVAA rate limit exceeded. Please try again later.',
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime: 0,
            version: this.API_VERSION,
          },
        };

        res.status(429).json(errorResponse);
        return;
      }

      next();
    } catch (error: unknown) {
      console.error('Validation error:', error);
      next(); // Continue on rate limit errors
    }
  }

  /**
   * Request Validation Middleware
   */
  private async validateRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate the MIVAA request structure
      const validationResult = MivaaRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errorResponse: MivaaResponse = {
          success: false,
          error: {
            code: 'MIVAA_VALIDATION_ERROR',
            message: 'MIVAA request validation failed',
            details: validationResult.error.issues.map((err) => ({
              field: err.path.map(String).join('.'),
              message: err.message,
            })),
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime: 0,
            version: this.API_VERSION,
          },
        };

        res.status(400).json(errorResponse);
        return;
      }

      // Attach validated request to context
      (req as unknown as { validatedMivaaRequest: unknown }).validatedMivaaRequest = validationResult.data;
      next();
    } catch (error) {
      const errorResponse: MivaaResponse = {
        success: false,
        error: {
          code: 'MIVAA_VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 0,
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  }

  /**
   * Forward request to MIVAA microservice
   */
  private async forwardToMivaa(mivaaRequest: MivaaRequest, authContext: AuthContext): Promise<MivaaResponse> {
    const startTime = Date.now();

    try {
      // Construct full MIVAA URL
      const mivaaUrl = `${this.MIVAA_BASE_URL}${mivaaRequest.endpoint}`;

      // Prepare headers with authentication
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'MIVAA-Gateway/1.0.0',
        'X-Workspace-ID': authContext.workspaceId,
        'X-User-ID': authContext.userId,
        ...mivaaRequest.headers,
      };

      // Add MIVAA API key if available
      const mivaaApiKey = process.env.MIVAA_API_KEY;
      if (mivaaApiKey) {
        headers['Authorization'] = `Bearer ${mivaaApiKey}`;
      }

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method: mivaaRequest.method,
        headers,
        signal: AbortSignal.timeout(mivaaRequest.timeout || this.DEFAULT_TIMEOUT),
      };

      // Add body for non-GET requests
      if (mivaaRequest.method !== 'GET' && mivaaRequest.body) {
        fetchOptions.body = JSON.stringify(mivaaRequest.body);
      }

      // Add query parameters to URL
      const url = new URL(mivaaUrl);
      if (mivaaRequest.query) {
        Object.entries(mivaaRequest.query).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }

      // Make request to MIVAA
      const response = await fetch(url.toString(), fetchOptions);
      const responseData = await response.json();

      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: `MIVAA_ERROR_${response.status}`,
            message: responseData.message || `MIVAA request failed with status ${response.status}`,
            details: responseData,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime,
            version: this.API_VERSION,
          },
        };
      }

      return {
        success: true,
        data: responseData,
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime,
          version: this.API_VERSION,
        },
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: {
            code: 'MIVAA_TIMEOUT',
            message: 'MIVAA request timed out',
            details: { timeout: mivaaRequest.timeout || this.DEFAULT_TIMEOUT },
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime,
            version: this.API_VERSION,
          },
        };
      }

      return {
        success: false,
        error: {
          code: 'MIVAA_CONNECTION_ERROR',
          message: 'Failed to connect to MIVAA service',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime,
          version: this.API_VERSION,
        },
      };
    }
  }

  /**
   * POST /api/mivaa/gateway
   * Main gateway endpoint for MIVAA requests
   */
  public processRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      // Apply middleware
      await this.authenticateRequest(req, res, () => {});
      if (res.headersSent) return;

      await this.rateLimitMiddleware(req, res, () => {});
      if (res.headersSent) return;

      await this.validateRequest(req, res, () => {});
      if (res.headersSent) return;

      const authContext = (req as unknown as { authContext: AuthContext }).authContext;
      const mivaaRequest = (req as unknown as { validatedMivaaRequest: MivaaRequest }).validatedMivaaRequest;

      // Forward request to MIVAA
      const mivaaResponse = await this.forwardToMivaa(mivaaRequest, authContext);

      // Log usage
      await MivaaRateLimitHelper.logMivaaUsage(
        authContext.userId,
        authContext.workspaceId,
        mivaaRequest.endpoint,
        { method: mivaaRequest.method, success: mivaaResponse.success },
      );

      // Return response with appropriate status code
      const statusCode = mivaaResponse.success ? 200 :
                        mivaaResponse.error?.code.includes('TIMEOUT') ? 408 :
                        mivaaResponse.error?.code.includes('RATE_LIMIT') ? 429 :
                        mivaaResponse.error?.code.includes('AUTH') ? 401 : 500;

      res.status(statusCode).json(mivaaResponse);

    } catch (error) {
      const errorResponse: MivaaResponse = {
        success: false,
        error: {
          code: 'MIVAA_GATEWAY_ERROR',
          message: 'MIVAA gateway processing failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 0,
          version: this.API_VERSION,
        },
      };

      res.status(500).json(errorResponse);
    }
  };

  /**
   * GET /api/mivaa/health
   * Health check endpoint for MIVAA gateway
   */
  public healthCheck = async (_req: Request, res: Response): Promise<void> => {
    try {
      // Check MIVAA service health
      const healthRequest: MivaaRequest = {
        endpoint: '/health',
        method: 'GET',
        headers: {},
        timeout: 5000, // 5 second timeout for health check
      };

      const authContext = { userId: 'system', workspaceId: 'system' };
      const healthResponse = await this.forwardToMivaa(healthRequest, authContext);

      const response: MivaaResponse = {
        success: true,
        data: {
          gateway: 'healthy',
          mivaa: healthResponse.success ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          version: this.API_VERSION,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: healthResponse.metadata?.processingTime || 0,
          version: this.API_VERSION,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      const errorResponse: MivaaResponse = {
        success: false,
        error: {
          code: 'MIVAA_HEALTH_CHECK_FAILED',
          message: 'Health check failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 0,
          version: this.API_VERSION,
        },
      };

      res.status(503).json(errorResponse);
    }
  };
}

// Export singleton instance
export const mivaaGateway = new MivaaGatewayController();

// Export types for use in other modules
export type { MivaaRequest, MivaaResponse };
