import { supabase } from '../integrations/supabase/client';
import { AuthContext } from '../api/controllers/consolidatedPDFController';

/**
 * JWT Authentication Middleware
 *
 * Provides JWT token validation and authentication context for API endpoints.
 * Supports both Supabase JWT tokens, API key authentication, and internal connection tokens.
 */

// Internal connection token for frontend-backend communication
const INTERNAL_CONNECTION_TOKEN = 'Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s';

export interface JWTAuthOptions {
  allowApiKey?: boolean;
  requiredScopes?: string[];
  workspaceRequired?: boolean;
  allowInternalToken?: boolean;
}

export interface AuthenticatedRequest {
  headers: Record<string, string>;
  body: any;
  user?: { id: string; email?: string };
  apiKey?: string;
  workspaceId?: string;
  scopes?: string[];
}

export interface AuthenticationResult {
  success: boolean;
  authContext: AuthContext;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

/**
 * JWT Authentication Middleware Class
 */
export class JWTAuthMiddleware {
  /**
   * Authenticate request using JWT token or API key
   */
  static async authenticate(
    request: AuthenticatedRequest,
    options: JWTAuthOptions = {}
  ): Promise<AuthenticationResult> {
    const {
      allowApiKey = true,
      requiredScopes = [],
      workspaceRequired = false,
      allowInternalToken = false
    } = options;

    try {
      // Extract authorization header and internal token
      const authHeader = request.headers.authorization || request.headers.Authorization;
      const apiKeyHeader = request.headers['x-api-key'] || request.headers['X-API-Key'];
      const internalTokenHeader = request.headers['x-internal-token'] || request.headers['X-Internal-Token'];

      // Check for internal connection token first (if allowed)
      if (allowInternalToken && internalTokenHeader === INTERNAL_CONNECTION_TOKEN) {
        return {
          success: true,
          authContext: {
            isAuthenticated: true,
            user: { id: 'internal-system' }
          }
        };
      }

      // Strict authentication - always require authentication
      if (!authHeader && !apiKeyHeader) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'MISSING_AUTHORIZATION',
            message: 'Authorization header or API key required',
            statusCode: 401
          }
        };
      }

      // Try JWT token authentication first
      if (authHeader) {
        const jwtResult = await this.authenticateJWT(authHeader, requiredScopes);
        if (jwtResult.success) {
          // Check workspace requirement
          if (workspaceRequired && !request.workspaceId) {
            return {
              success: false,
              authContext: { isAuthenticated: false },
              error: {
                code: 'WORKSPACE_REQUIRED',
                message: 'Workspace ID required for this operation',
                statusCode: 400
              }
            };
          }
          return jwtResult;
        }
        
        // If JWT failed and API key not allowed, return JWT error
        if (!allowApiKey) {
          return jwtResult;
        }
      }

      // Try API key authentication
      if (apiKeyHeader && allowApiKey) {
        const apiKeyResult = await this.authenticateApiKey(apiKeyHeader, requiredScopes);
        if (apiKeyResult.success) {
          // Check workspace requirement
          if (workspaceRequired && !request.workspaceId) {
            return {
              success: false,
              authContext: { isAuthenticated: false },
              error: {
                code: 'WORKSPACE_REQUIRED',
                message: 'Workspace ID required for this operation',
                statusCode: 400
              }
            };
          }
          return apiKeyResult;
        }
        return apiKeyResult;
      }

      // No valid authentication found
      return {
        success: false,
        authContext: { isAuthenticated: false },
        error: {
          code: 'INVALID_AUTHENTICATION',
          message: 'Invalid or expired authentication credentials',
          statusCode: 401
        }
      };
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return {
        success: false,
        authContext: { isAuthenticated: false },
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Internal authentication error',
          statusCode: 500
        }
      };
    }
  }

  /**
   * Authenticate using JWT token
   */
  private static async authenticateJWT(
    authHeader: string,
    requiredScopes: string[] = []
  ): Promise<AuthenticationResult> {
    try {
      // Extract token from Bearer header
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INVALID_TOKEN_FORMAT',
            message: 'Invalid authorization header format. Expected: Bearer <token>',
            statusCode: 401
          }
        };
      }

      // Verify JWT token with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INVALID_JWT_TOKEN',
            message: 'Invalid or expired JWT token',
            statusCode: 401
          }
        };
      }

      // Note: user_profiles table doesn't exist in current schema
      // JWT validation is sufficient for user authentication
      // Additional user validation can be added when user_profiles table is created

      // For now, assume all authenticated users are active
      // Check required scopes - since no user_profiles table, skip scope validation
      const userScopes: string[] = [];
      const hasRequiredScopes = requiredScopes.every(scope => 
        userScopes.includes(scope) || userScopes.includes('*')
      );

      if (requiredScopes.length > 0 && !hasRequiredScopes) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INSUFFICIENT_SCOPES',
            message: `Missing required scopes: ${requiredScopes.join(', ')}`,
            statusCode: 403
          }
        };
      }

      return {
        success: true,
        authContext: {
          user: {
            id: user.id
          },
          isAuthenticated: true
        }
      };
    } catch (error) {
      console.error('JWT authentication error:', error);
      return {
        success: false,
        authContext: { isAuthenticated: false },
        error: {
          code: 'JWT_VERIFICATION_ERROR',
          message: 'Failed to verify JWT token',
          statusCode: 500
        }
      };
    }
  }

  /**
   * Authenticate using API key
   */
  private static async authenticateApiKey(
    apiKey: string,
    requiredScopes: string[] = []
  ): Promise<AuthenticationResult> {
    try {
      // Validate API key format
      if (!apiKey || apiKey.length < 32) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INVALID_API_KEY_FORMAT',
            message: 'Invalid API key format',
            statusCode: 401
          }
        };
      }

      // Verify API key in database
      const { data: apiKeyData, error } = await supabase
        .from('api_keys')
        .select('user_id, is_active, allowed_endpoints, expires_at')
        .eq('api_key', apiKey)
        .single();

      if (error || !apiKeyData || !apiKeyData.is_active) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid or inactive API key',
            statusCode: 401
          }
        };
      }

      // Check if API key has expired
      if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'API_KEY_EXPIRED',
            message: 'API key has expired',
            statusCode: 401
          }
        };
      }

      // Check required scopes
      const apiKeyScopes = apiKeyData.allowed_endpoints || [];
      const hasRequiredScopes = requiredScopes.every(scope => 
        apiKeyScopes.includes(scope) || apiKeyScopes.includes('*')
      );

      if (requiredScopes.length > 0 && !hasRequiredScopes) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INSUFFICIENT_API_KEY_SCOPES',
            message: `API key missing required scopes: ${requiredScopes.join(', ')}`,
            statusCode: 403
          }
        };
      }

      // Update last_used_at for API key
      await supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('api_key', apiKey);

      // Check if user_id exists (null safety)
      if (!apiKeyData.user_id) {
        return {
          success: false,
          authContext: { isAuthenticated: false },
          error: {
            code: 'INVALID_API_KEY',
            message: 'API key is not associated with a valid user',
            statusCode: 403
          }
        };
      }

      return {
        success: true,
        authContext: {
          user: {
            id: apiKeyData.user_id
          },
          isAuthenticated: true
        }
      };
    } catch (error) {
      console.error('API key authentication error:', error);
      return {
        success: false,
        authContext: { isAuthenticated: false },
        error: {
          code: 'API_KEY_VERIFICATION_ERROR',
          message: 'Failed to verify API key',
          statusCode: 500
        }
      };
    }
  }

  /**
   * Check endpoint access for API key
   */
  static async checkEndpointAccess(apiKey: string, endpoint: string): Promise<boolean> {
    try {
      const { data: apiKeyData, error } = await supabase
        .from('api_keys')
        .select('allowed_endpoints')
        .eq('api_key', apiKey)
        .single();

      if (error || !apiKeyData) {
        return false;
      }

      // If no restrictions, allow all endpoints
      if (!apiKeyData.allowed_endpoints || apiKeyData.allowed_endpoints.length === 0) {
        return true;
      }

      // Check if endpoint is in allowed list
      return apiKeyData.allowed_endpoints.some((allowedEndpoint: string) =>
        endpoint.startsWith(allowedEndpoint)
      );
    } catch (error) {
      console.error('Endpoint access check error:', error);
      return false;
    }
  }

  /**
   * Check workspace access for user
   * Note: workspace_members table doesn't exist in current schema
   * For now, return true to allow access (implement proper workspace logic later)
   */
  static async checkWorkspaceAccess(userId: string, _workspaceId: string): Promise<boolean> {
    try {
      // TODO: Implement proper workspace access control when workspace_members table is created
      // For now, allow access if user ID is provided
      // workspaceId parameter prefixed with underscore to indicate intentional non-use
      return !!userId;
    } catch (error) {
      console.error('Workspace access check error:', error);
      return false;
    }
  }

  /**
   * Extract workspace ID from request
   */
  static extractWorkspaceId(request: AuthenticatedRequest): string | undefined {
    // Try to get workspace ID from various sources
    return request.body?.workspaceId || 
           request.headers['x-workspace-id'] || 
           request.headers['X-Workspace-Id'];
  }

  /**
   * Create authentication error response
   */
  static createAuthErrorResponse(error: { code: string; message: string; statusCode: number }) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Convenience function for quick authentication
 */
export async function authenticateRequest(
  request: AuthenticatedRequest,
  options?: JWTAuthOptions
) {
  return JWTAuthMiddleware.authenticate(request, options);
}

/**
 * Convenience function for workspace-aware authentication
 */
export async function authenticateWorkspaceRequest(
  request: AuthenticatedRequest,
  workspaceId: string,
  options?: Omit<JWTAuthOptions, 'workspaceRequired'>
) {
  const authResult = await JWTAuthMiddleware.authenticate(request, {
    ...options,
    workspaceRequired: true
  });

  if (!authResult.success || !authResult.authContext.user) {
    return authResult;
  }

  // Check workspace access
  const hasAccess = await JWTAuthMiddleware.checkWorkspaceAccess(
    authResult.authContext.user.id,
    workspaceId
  );

  if (!hasAccess) {
    return {
      success: false,
      authContext: { isAuthenticated: false },
      error: {
        code: 'WORKSPACE_ACCESS_DENIED',
        message: 'Access denied to workspace',
        statusCode: 403
      }
    };
  }

  return authResult;
}