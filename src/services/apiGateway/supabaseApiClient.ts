import { BaseApiClient, StandardizedApiResponse, withRetry } from './standardizedApiClient';
import { supabaseConfig, SupabaseConfigUtils } from '../../config/apis/supabaseConfig';
import { z } from 'zod';

// Define types for Supabase Edge Functions
export type SupabaseParams = {
  functionName: string;
  data?: any;
};

export type SupabaseResponse = {
  success: boolean;
  [key: string]: any;
};

/**
 * Standardized Supabase Edge Functions API client that extends the base client
 * while preserving all Supabase-specific functionality and schemas
 */
export class SupabaseApiClient extends BaseApiClient<SupabaseParams, SupabaseResponse> {
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(apiKey: string, functionName?: string) {
    super('supabase', functionName);
    
    // Extract Supabase URL and key from the API key
    // Expected format: "url|key" or just the key if URL is in env
    const parts = apiKey.split('|');
    if (parts.length === 2) {
      this.supabaseUrl = parts[0];
      this.supabaseKey = parts[1];
    } else {
      // Fallback to environment variable for URL
      this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseConfig.projectUrl;
      this.supabaseKey = apiKey;
    }

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL and key are required');
    }
  }

  public validateParams(params: unknown): SupabaseParams {
    // Basic type checking only - rely on server-side validation for comprehensive validation
    if (!params || typeof params !== 'object') {
      throw new Error('Parameters must be an object');
    }

    const typedParams = params as any;
    
    if (!typedParams.functionName || typeof typedParams.functionName !== 'string') {
      throw new Error('Function name is required and must be a string');
    }

    // Check if function exists in configuration (for basic routing)
    const functionConfig = SupabaseConfigUtils.getFunctionConfig(typedParams.functionName);
    if (!functionConfig) {
      throw new Error(`Function ${typedParams.functionName} not found in Supabase configuration`);
    }

    // Only perform basic UX validation using simplified schemas
    // Server-side validation will handle comprehensive data validation
    if (typedParams.data) {
      try {
        // Use simplified schema for basic UX feedback only
        functionConfig.inputSchema.parse(typedParams.data);
      } catch (error) {
        if (error instanceof z.ZodError) {
          // Only show user-friendly validation errors for UX
          const userFriendlyErrors = error.errors
            .filter(e => e.message.includes('required') || e.message.includes('valid'))
            .map(e => e.message);
          
          if (userFriendlyErrors.length > 0) {
            throw new Error(`Please check: ${userFriendlyErrors.join(', ')}`);
          }
        }
        // For other validation errors, let server handle them
      }
    }

    return {
      functionName: typedParams.functionName,
      data: typedParams.data
    };
  }

  public async execute(params: SupabaseParams): Promise<StandardizedApiResponse<SupabaseResponse>> {
    return this.makeRequest(params);
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  protected async makeRequest(params: SupabaseParams): Promise<StandardizedApiResponse<SupabaseResponse>> {
    console.log('=== CLIENT-SIDE DEBUG START ===');
    console.log('Original params received:', JSON.stringify(params, null, 2));
    console.log('Function name:', params.functionName);
    console.log('Data field exists:', 'data' in params);
    console.log('Data value:', params.data);
    console.log('Data type:', typeof params.data);
    if (params.data) {
      console.log('Data keys:', Object.keys(params.data));
      console.log('Prompt in data:', 'prompt' in params.data);
      console.log('Prompt value from data:', params.data.prompt);
    }
    console.log('=== CLIENT-SIDE DEBUG END ===');

    this.validateParams(params);

    const functionConfig = SupabaseConfigUtils.getFunctionConfig(params.functionName);
    const retryAttempts = supabaseConfig.retryAttempts || 3;
    const timeout = functionConfig?.timeout || supabaseConfig.timeout;

    return withRetry(async () => {
      const url = SupabaseConfigUtils.buildFunctionUrl(params.functionName);
      const requestOptions = this.buildRequestOptions(params, timeout);

      console.log('=== REQUEST OPTIONS DEBUG ===');
      console.log('URL:', url);
      console.log('Request body being sent:', requestOptions.body);
      console.log('Request headers:', requestOptions.headers);
      console.log('=== REQUEST OPTIONS DEBUG END ===');

      try {
        const response = await fetch(url, requestOptions);

        // Clear timeout on successful response
        const timeoutId = (requestOptions.signal as any)?._timeoutId;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          await this.handleErrorResponse(response);
        }

        const data = await response.json();

        return {
          success: true,
          data: data as SupabaseResponse,
          metadata: {
            apiType: 'supabase',
            modelId: params.functionName,
            timestamp: new Date().toISOString(),
            requestId: `supabase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            statusCode: response.status
          }
        };
      } catch (error) {
        // Clear timeout on error as well
        const timeoutId = (requestOptions.signal as any)?._timeoutId;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        throw error;
      }
    }, { maxAttempts: retryAttempts });
  }

  private buildRequestOptions(params: SupabaseParams, timeout: number): RequestInit {
    const headers = SupabaseConfigUtils.getAuthHeaders(false); // Use anon key by default

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Store timeout ID on the signal for cleanup
    (controller.signal as any)._timeoutId = timeoutId;

    // FIXED: Send the data fields directly at the top level, not nested under 'data'
    // This ensures the server receives the prompt field at the expected location
    const requestBody = params.data || {};
    
    return {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    };
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorMessage = `Supabase Edge Function error: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = JSON.parse(errorText);
      if (errorData.error) {
        errorMessage += ` - ${errorData.error}`;
      }
      if (errorData.details) {
        errorMessage += ` (${errorData.details})`;
      }
    } catch {
      // If error response is not JSON, use the raw text
      if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
    }

    // Enhanced error handling for common Supabase Edge Function errors
    if (response.status === 401) {
      errorMessage += ' - Check your Supabase API key and permissions';
    } else if (response.status === 403) {
      errorMessage += ' - Insufficient permissions for this Edge Function';
    } else if (response.status === 404) {
      errorMessage += ' - Edge Function not found or not deployed';
    } else if (response.status === 422) {
      errorMessage += ' - Invalid request data or function validation failed';
    } else if (response.status === 429) {
      errorMessage += ' - Rate limit exceeded, please try again later';
    } else if (response.status >= 500) {
      errorMessage += ' - Supabase server error, please try again later';
    }

    throw new Error(errorMessage);
  }
}