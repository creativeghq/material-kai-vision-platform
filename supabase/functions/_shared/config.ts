// Shared configuration for PDF Integration Edge Functions
// This file contains common configuration, types, and utilities used across all Edge Functions

export interface EdgeFunctionConfig {
  // Service Configuration
  mivaaBaseUrl: string;
  mivaaApiKey?: string;
  pdfProcessingTimeout: number;

  // Rate Limiting
  rateLimits: {
    healthCheck: number;    // requests per minute
    pdfExtract: number;     // requests per minute per user
    batchProcess: number;   // requests per minute per user
  };

  // Processing Limits
  processingLimits: {
    maxBatchSize: number;
    maxConcurrentProcessing: number;
    maxChunkSize: number;
    maxOverlapSize: number;
    maxFileSize: number; // in bytes
  };

  // Database Configuration
  database: {
    connectionTimeout: number;
    queryTimeout: number;
  };
}

export const getConfig = (): EdgeFunctionConfig => {
  return {
    mivaaBaseUrl: Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr',
    mivaaApiKey: Deno.env.get('MIVAA_API_KEY'),
    pdfProcessingTimeout: parseInt(Deno.env.get('PDF_PROCESSING_TIMEOUT') || '300000'), // 5 minutes

    rateLimits: {
      healthCheck: parseInt(Deno.env.get('RATE_LIMIT_HEALTH_CHECK') || '60'),
      pdfExtract: parseInt(Deno.env.get('RATE_LIMIT_PDF_EXTRACT') || '10'),
      batchProcess: parseInt(Deno.env.get('RATE_LIMIT_BATCH_PROCESS') || '5'),
    },

    processingLimits: {
      maxBatchSize: parseInt(Deno.env.get('MAX_BATCH_SIZE') || '100'),
      maxConcurrentProcessing: parseInt(Deno.env.get('MAX_CONCURRENT_PROCESSING') || '10'),
      maxChunkSize: parseInt(Deno.env.get('MAX_CHUNK_SIZE') || '10000'),
      maxOverlapSize: parseInt(Deno.env.get('MAX_OVERLAP_SIZE') || '1000'),
      maxFileSize: parseInt(Deno.env.get('MAX_FILE_SIZE') || '104857600'), // 100MB
    },

    database: {
      connectionTimeout: parseInt(Deno.env.get('DB_CONNECTION_TIMEOUT') || '10000'),
      queryTimeout: parseInt(Deno.env.get('DB_QUERY_TIMEOUT') || '30000'),
    },
  };
};

// Common CORS headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

// Common response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, {
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    lastChecked: string;
    error?: string;
  }>;
  metrics: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    activeConnections: number;
  };
}

// Common validation schemas
export const ValidationSchemas = {
  documentId: (value: string): boolean => {
    return typeof value === 'string' && value.length > 0 && value.length <= 255;
  },

  extractionType: (value: string): boolean => {
    return ['markdown', 'tables', 'images', 'all'].includes(value);
  },

  priority: (value: string): boolean => {
    return ['low', 'normal', 'high'].includes(value);
  },

  chunkSize: (value: number): boolean => {
    return Number.isInteger(value) && value >= 100 && value <= 10000;
  },

  overlapSize: (value: number): boolean => {
    return Number.isInteger(value) && value >= 0 && value <= 1000;
  },

  maxConcurrent: (value: number): boolean => {
    return Number.isInteger(value) && value >= 1 && value <= 10;
  },
};

// Common utility functions
export const Utils = {
  // Generate unique IDs
  generateId: (prefix: string): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  },

  // Sanitize strings for file names
  sanitizeFileName: (input: string, maxLength: number = 50): string => {
    return input
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .substr(0, maxLength)
      .replace(/^_|_$/g, '');
  },

  // Get client IP address
  getClientIP: (req: Request): string => {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIP = req.headers.get('x-real-ip');
    if (realIP) {
      return realIP;
    }

    const cfConnectingIP = req.headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
      return cfConnectingIP;
    }

    return '127.0.0.1';
  },

  // Create standardized error responses
  createErrorResponse: (
    message: string,
    status: number,
    startTime: number,
    details?: any,
  ): Response => {
    const responseTime = Date.now() - startTime;

    const response: ApiResponse = {
      success: false,
      error: message,
      statusCode: status,
      ...(details && { details }),
    };

    return new Response(
      JSON.stringify(response),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  },

  // Create standardized success responses
  createSuccessResponse: <T>(
    data: T,
    status: number = 200,
    startTime?: number,
  ): Response => {
    const response: ApiResponse<T> = {
      success: true,
      data,
    };

    const headers: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': 'application/json',
    };

    if (startTime) {
      const responseTime = Date.now() - startTime;
      headers['X-Response-Time'] = `${responseTime}ms`;
    }

    return new Response(
      JSON.stringify(response),
      {
        status,
        headers,
      },
    );
  },

  // Validate request body
  validateRequestBody: (body: any, requiredFields: string[]): string | null => {
    if (!body || typeof body !== 'object') {
      return 'Request body must be a valid JSON object';
    }

    for (const field of requiredFields) {
      if (!(field in body) || body[field] === null || body[field] === undefined) {
        return `Missing required field: ${field}`;
      }
    }

    return null;
  },

  // Calculate estimated completion time
  calculateEstimatedCompletion: (documentCount: number, avgProcessingTime: number = 30000): string => {
    const estimatedMs = documentCount * avgProcessingTime;
    const estimatedDate = new Date(Date.now() + estimatedMs);
    return estimatedDate.toISOString();
  },

  // Retry with exponential backoff
  retryWithBackoff: async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  },
};

// Rate limiting utilities
export class RateLimiter {
  private static requests = new Map<string, { count: number; resetTime: number }>();

  static isRateLimited(key: string, limit: number, windowMs: number = 60000): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;

    const record = this.requests.get(key);

    if (!record || record.resetTime <= windowStart) {
      this.requests.set(key, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (record.count >= limit) {
      return true;
    }

    record.count++;
    return false;
  }

  static getRateLimitHeaders(key: string, limit: number, windowMs: number = 60000): Record<string, string> {
    const record = this.requests.get(key);
    const remaining = record ? Math.max(0, limit - record.count) : limit;
    const resetTime = record ? Math.ceil(record.resetTime / 1000) : Math.ceil((Date.now() + windowMs) / 1000);

    return {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toString(),
    };
  }
}

// Authentication utilities
export class AuthUtils {
  static async checkAuthentication(req: Request, supabase: any): Promise<{
    success: boolean;
    userId?: string;
    workspaceId?: string;
    error?: string;
  }> {
    const authHeader = req.headers.get('authorization');
    const apiKey = req.headers.get('x-api-key');

    // Check API key authentication
    if (apiKey && apiKey.startsWith('kai_')) {
      try {
        // Validate API key against database
        const { data: apiKeyData, error: apiKeyError } = await supabase
          .from('api_keys')
          .select(`
            id,
            user_id,
            workspace_id,
            is_active,
            expires_at,
            rate_limit_per_minute,
            last_used_at
          `)
          .eq('key_hash', apiKey)
          .eq('is_active', true)
          .single();

        if (apiKeyError || !apiKeyData) {
          return { success: false, error: 'Invalid API key' };
        }

        // Check if API key has expired
        if (apiKeyData.expires_at && new Date(apiKeyData.expires_at) < new Date()) {
          return { success: false, error: 'API key has expired' };
        }

        // Update last used timestamp
        await supabase
          .from('api_keys')
          .update({
            last_used_at: new Date().toISOString(),
            usage_count: supabase.raw('usage_count + 1'),
          })
          .eq('id', apiKeyData.id);

        return {
          success: true,
          userId: apiKeyData.user_id,
          workspaceId: apiKeyData.workspace_id,
        };
      } catch (error) {
        return { success: false, error: 'API key validation failed' };
      }
    }

    // Check JWT authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
          return { success: false, error: 'Invalid authentication token' };
        }

        // Get user's default workspace
        const { data: workspaceData } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .single();

        return {
          success: true,
          userId: user.id,
          workspaceId: workspaceData?.workspace_id,
        };
      } catch (error) {
        return { success: false, error: 'Authentication verification failed' };
      }
    }

    return { success: false, error: 'Authentication required' };
  }

  // New method to check workspace membership
  static async checkWorkspaceMembership(
    supabase: any,
    userId: string,
    workspaceId: string,
  ): Promise<{
    success: boolean;
    role?: string;
    permissions?: string[];
    error?: string;
  }> {
    try {
      const { data: memberData, error } = await supabase
        .from('workspace_members')
        .select(`
          role,
          permissions,
          status
        `)
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .single();

      if (error || !memberData) {
        return { success: false, error: 'User is not a member of this workspace' };
      }

      return {
        success: true,
        role: memberData.role,
        permissions: memberData.permissions || [],
      };
    } catch (error) {
      return { success: false, error: 'Workspace membership check failed' };
    }
  }

  // New method to check specific permissions
  static hasPermission(permissions: string[], requiredPermission: string): boolean {
    return permissions.includes(requiredPermission) || permissions.includes('admin');
  }
}

// Logging utilities
export class Logger {
  static async logApiUsage(supabase: any, logData: {
    endpoint_id?: string;
    user_id?: string;
    ip_address: string;
    user_agent?: string;
    request_method: string;
    request_path: string;
    response_status: number;
    response_time_ms: number;
    is_internal_request?: boolean;
    rate_limit_exceeded?: boolean;
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_usage_logs')
        .insert({
          ...logData,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error logging API usage:', error);
      }
    } catch (error) {
      console.error('Error logging API usage:', error);
    }
  }

  static logError(context: string, error: any, additionalData?: any): void {
    console.error(`[${context}] Error:`, {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      ...additionalData,
      timestamp: new Date().toISOString(),
    });
  }

  static logInfo(context: string, message: string, data?: any): void {
    console.log(`[${context}] ${message}`, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  static logWarning(context: string, message: string, data?: any): void {
    console.warn(`[${context}] Warning: ${message}`, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

// Health check utilities
export class HealthChecker {
  static async checkMivaaService(baseUrl: string, timeout: number = 5000): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeout),
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { status: 'healthy', responseTime };
      } else {
        return {
          status: 'unhealthy',
          responseTime,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async checkSupabaseConnection(supabase: any, timeout: number = 5000): Promise<{
    status: 'healthy' | 'unhealthy';
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Simple query to test connection
      const { error } = await supabase
        .from('api_usage_logs')
        .select('id')
        .limit(1);

      const responseTime = Date.now() - startTime;

      if (error) {
        return {
          status: 'unhealthy',
          responseTime,
          error: error.message,
        };
      }

      return { status: 'healthy', responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export version information
export const VERSION = '1.0.0';
export const BUILD_DATE = new Date().toISOString();
