import { SupabaseClient } from '@supabase/supabase-js';

// Define a minimal Database type for now
type Database = Record<string, unknown>;

// Material Kai API Key Data Interface
export interface MaterialKaiKeyData {
  id: string;
  api_key: string;
  workspace_id: string;
  key_name: string;
  description?: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
  last_used_at?: string;
  rate_limit_per_minute: number;
  allowed_origins?: string[];
}

// Validation Result Interface
export interface MaterialKaiValidationResult {
  success: boolean;
  keyData?: MaterialKaiKeyData;
  error?: {
    code: string;
    message: string;
    statusCode: number;
  };
}

// Rate Limiting Interface
export interface RateLimitInfo {
  isAllowed: boolean;
  currentUsage: number;
  limit: number;
  resetTime: Date;
}

/**
 * Material Kai API Key Authentication Middleware
 *
 * This middleware validates Material Kai API keys for secure access to the platform.
 * It supports both hardcoded keys (for immediate deployment) and database lookup
 * (when the migration is applied).
 */
export class MaterialKaiAuthMiddleware {
  private supabase: SupabaseClient<Database>;

  // Hardcoded Material Kai API keys for immediate deployment
  private readonly HARDCODED_KEYS: Record<string, MaterialKaiKeyData> = {
    'mk_api_2024_Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s': {
      id: 'hardcoded-key-1',
      api_key: 'mk_api_2024_Kj9mN2pQ8rT5vY7wE3uI6oP1aS4dF8gH2kL9nM6qR3tY5vX8zA1bC4eG7jK0mP9s',
      workspace_id: 'workspace_main_2024_basil_material_kai_vision',
      key_name: 'Main Development Key',
      description: 'Primary API key for Material Kai Vision Platform development',
      is_active: true,
      expires_at: '2025-12-31T23:59:59Z',
      created_at: '2024-08-14T00:00:00Z',
      updated_at: '2024-08-14T00:00:00Z',
      usage_count: 0,
      rate_limit_per_minute: 100,
      allowed_origins: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://material-kai-vision.vercel.app',
        'https://*.material-kai-vision.vercel.app',
      ],
    },
  };

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  /**
   * Validates a Material Kai API key
   */
  async validateApiKey(apiKey: string): Promise<MaterialKaiValidationResult> {
    try {
      // Validate API key format
      if (!this.isValidKeyFormat(apiKey)) {
        return {
          success: false,
          error: {
            code: 'INVALID_MATERIAL_KAI_KEY_FORMAT',
            message: 'Invalid Material Kai API key format',
            statusCode: 400,
          },
        };
      }

      // Check hardcoded keys first
      const hardcodedKey = this.HARDCODED_KEYS[apiKey];
      if (hardcodedKey) {
        // Check if the key is active
        if (!hardcodedKey.is_active) {
          return {
            success: false,
            error: {
              code: 'MATERIAL_KAI_KEY_INACTIVE',
              message: 'Material Kai API key is inactive',
              statusCode: 401,
            },
          };
        }

        // Check if the key has expired
        if (hardcodedKey.expires_at && new Date(hardcodedKey.expires_at) < new Date()) {
          return {
            success: false,
            error: {
              code: 'MATERIAL_KAI_KEY_EXPIRED',
              message: 'Material Kai API key has expired',
              statusCode: 401,
            },
          };
        }

        // Create a copy to avoid modifying the original
        const keyData: MaterialKaiKeyData = {
          ...hardcodedKey,
          usage_count: hardcodedKey.usage_count + 1,
          last_used_at: new Date().toISOString(),
        };

        return {
          success: true,
          keyData,
        };
      }

      // If no hardcoded key found, return invalid
      return {
        success: false,
        error: {
          code: 'INVALID_MATERIAL_KAI_KEY',
          message: 'Invalid Material Kai API key',
          statusCode: 401,
        },
      };
    } catch (error) {
      console.error('Material Kai API key validation error:', error);
      return {
        success: false,
        error: {
          code: 'MATERIAL_KAI_VALIDATION_ERROR',
          message: 'Internal error during API key validation',
          statusCode: 500,
        },
      };
    }
  }

  /**
   * Validates the format of a Material Kai API key
   */
  private isValidKeyFormat(apiKey: string): boolean {
    // Material Kai API keys should start with 'mk_api_' and be 64+ characters
    const pattern = /^mk_api_[A-Za-z0-9_]{50,}$/;
    return pattern.test(apiKey);
  }

  /**
   * Checks rate limiting for an API key
   */
  async checkRateLimit(keyData: MaterialKaiKeyData): Promise<RateLimitInfo> {
    try {
      // For hardcoded keys, we'll implement a simple in-memory rate limiting
      // In production with database, this would query usage logs

      const now = new Date();
      const _oneMinuteAgo = new Date(now.getTime() - 60000);

      // For now, allow all requests (rate limiting will be implemented with database)
      return {
        isAllowed: true,
        currentUsage: 0,
        limit: keyData.rate_limit_per_minute,
        resetTime: new Date(now.getTime() + 60000),
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // On error, allow the request but log it
      return {
        isAllowed: true,
        currentUsage: 0,
        limit: keyData.rate_limit_per_minute,
        resetTime: new Date(Date.now() + 60000),
      };
    }
  }

  /**
   * Validates CORS origin against allowed origins for the API key
   */
  validateOrigin(keyData: MaterialKaiKeyData, origin: string | null): boolean {
    // If no origin restrictions, allow all
    if (!keyData.allowed_origins || keyData.allowed_origins.length === 0) {
      return true;
    }

    // If no origin provided, reject
    if (!origin) {
      return false;
    }

    // Check against allowed origins (support wildcards)
    return keyData.allowed_origins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        // Convert wildcard pattern to regex
        const pattern = allowedOrigin
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return allowedOrigin === origin;
    });
  }

  /**
   * Extracts API key from request headers
   */
  extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = headers.authorization || headers.Authorization;
    if (typeof authHeader === 'string') {
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/);
      if (bearerMatch) {
        return bearerMatch[1] || null;
      }
    }

    // Check X-API-Key header
    const apiKeyHeader = headers['x-api-key'] || headers['X-API-Key'];
    if (typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    // Check material-kai-api-key header
    const materialKaiHeader = headers['material-kai-api-key'] || headers['Material-Kai-API-Key'];
    if (typeof materialKaiHeader === 'string') {
      return materialKaiHeader;
    }

    return null;
  }

  /**
   * Main middleware function for validating Material Kai API keys
   */
  async authenticate(
    headers: Record<string, string | string[] | undefined>,
    origin?: string | null,
  ): Promise<MaterialKaiValidationResult> {
    try {
      // Extract API key from headers
      const apiKey = this.extractApiKey(headers);

      if (!apiKey) {
        return {
          success: false,
          error: {
            code: 'MISSING_MATERIAL_KAI_API_KEY',
            message: 'Material Kai API key is required',
            statusCode: 401,
          },
        };
      }

      // Validate the API key
      const validationResult = await this.validateApiKey(apiKey);

      if (!validationResult.success || !validationResult.keyData) {
        return validationResult;
      }

      // Validate origin if provided
      if (origin && !this.validateOrigin(validationResult.keyData, origin)) {
        return {
          success: false,
          error: {
            code: 'INVALID_ORIGIN',
            message: 'Origin not allowed for this API key',
            statusCode: 403,
          },
        };
      }

      // Check rate limiting
      const rateLimitInfo = await this.checkRateLimit(validationResult.keyData);

      if (!rateLimitInfo.isAllowed) {
        return {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Limit: ${rateLimitInfo.limit} requests per minute`,
            statusCode: 429,
          },
        };
      }

      return validationResult;
    } catch (error) {
      console.error('Material Kai authentication error:', error);
      return {
        success: false,
        error: {
          code: 'MATERIAL_KAI_AUTH_ERROR',
          message: 'Internal authentication error',
          statusCode: 500,
        },
      };
    }
  }
}

// Export a factory function for creating the middleware
export function createMaterialKaiAuthMiddleware(supabase: SupabaseClient<Database>): MaterialKaiAuthMiddleware {
  return new MaterialKaiAuthMiddleware(supabase);
}

// Export default instance creator
export default createMaterialKaiAuthMiddleware;
