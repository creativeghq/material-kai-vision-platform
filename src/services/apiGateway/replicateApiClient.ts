/**
 * Replicate API Client Implementation
 *
 * This client implements the standardized API interface while preserving
 * all Replicate-specific schemas, authentication, and response formats.
 *
 * Key Features:
 * - Uses exact Replicate parameter schemas from configuration
 * - Preserves Replicate authentication and headers
 * - Maintains original response data structures
 * - Provides Replicate-specific error handling
 */

import { z } from 'zod';

import { ApiConfigManager, ReplicateApiConfig } from '../../config';

import { BaseApiClient, StandardizedApiResponse, StandardizedError, withRetry } from './standardizedApiClient';

// Replicate-specific types (preserving original structures)
export interface ReplicateResponse {
  id: string;
  version: string;
  urls: {
    get: string;
    cancel: string;
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  input: Record<string, any>;
  output?: any;
  error?: string;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
}

export interface ReplicateErrorResponse {
  detail: string;
  status?: number;
  title?: string;
  type?: string;
}

// Replicate API Client
export class ReplicateApiClient extends BaseApiClient<any, ReplicateResponse> {
  private readonly replicateConfig: ReplicateApiConfig;
  private readonly baseUrl = 'https://api.replicate.com/v1';

  constructor(modelId?: string) {
    super('replicate', modelId);

    const config = ApiConfigManager.getApiConfig<ReplicateApiConfig>('replicate');
    if (!config) {
      throw new Error('Replicate configuration not found');
    }
    this.replicateConfig = config;
  }

  async execute(params: any): Promise<StandardizedApiResponse<ReplicateResponse>> {
    const requestId = this.requestIdGenerator();
    const startTime = Date.now();

    try {
      // Validate parameters using model-specific schema
      const validatedParams = this.validateParams(params);

      // Get model configuration
      const modelConfig = this.getModelConfig();
      if (!modelConfig) {
        throw new Error(`Model configuration not found: ${this.modelId}`);
      }

      // Execute with retry logic
      const response = await withRetry(
        () => this.makeReplicateRequest(modelConfig.version, validatedParams),
        {
          maxAttempts: this.replicateConfig.retryAttempts || 3,
          retryableErrors: ['RATE_LIMIT', 'NETWORK_ERROR', 'SERVER_ERROR'],
        },
      );

      return this.createResponse(response, startTime, requestId);
    } catch (error) {
      const standardizedError = this.handleError(error);
      return this.createErrorResponse(standardizedError, startTime, requestId);
    }
  }

  validateParams(params: unknown): any {
    if (!this.modelId) {
      throw new Error('Model ID is required for parameter validation');
    }

    const modelConfig = this.getModelConfig();
    if (!modelConfig) {
      throw new Error(`Model configuration not found: ${this.modelId}`);
    }

    try {
      // Use the exact schema from configuration - NO CHANGES to validation logic
      return modelConfig.inputSchema.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        throw new Error(`Parameter validation failed: ${errorMessage}`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Replicate-specific error handling
  protected enhanceError(baseError: StandardizedError, originalError: unknown): StandardizedError {
    if (originalError instanceof Response) {
      const response = originalError as Response;

      baseError.apiSpecific = {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
      };

      // Map Replicate-specific status codes
      switch (response.status) {
        case 401:
          baseError.code = 'AUTHENTICATION_ERROR';
          baseError.message = 'Invalid Replicate API token';
          baseError.retryable = false;
          break;
        case 402:
          baseError.code = 'BILLING_ERROR';
          baseError.message = 'Insufficient credits or billing issue';
          baseError.retryable = false;
          break;
        case 429:
          baseError.code = 'RATE_LIMIT';
          baseError.message = 'Rate limit exceeded';
          baseError.retryable = true;
          break;
        case 422:
          baseError.code = 'VALIDATION_ERROR';
          baseError.message = 'Invalid input parameters';
          baseError.retryable = false;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          baseError.code = 'SERVER_ERROR';
          baseError.message = 'Replicate server error';
          baseError.retryable = true;
          break;
      }
    }

    // Handle network errors
    if (originalError instanceof TypeError && originalError.message.includes('fetch')) {
      baseError.code = 'NETWORK_ERROR';
      baseError.message = 'Network connection failed';
      baseError.retryable = true;
    }

    return baseError;
  }

  // Private helper methods
  private getModelConfig() {
    if (!this.modelId) return null;
    return this.replicateConfig.models[this.modelId];
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.replicateConfig.apiKey) {
      headers['Authorization'] = `Token ${this.replicateConfig.apiKey}`;
    }

    return headers;
  }

  private async makeReplicateRequest(endpoint: string, params: any): Promise<ReplicateResponse> {
    const url = `${this.baseUrl}/predictions`;

    const requestBody = {
      version: endpoint,
      input: params,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Try to parse error response
      let errorData: ReplicateErrorResponse | null = null;
      try {
        errorData = await response.json();
      } catch {
        // If JSON parsing fails, use status text
      }

      const error = new Error(errorData?.detail || response.statusText);
      (error as any).response = response;
      (error as any).data = errorData;
      throw error;
    }

    const data: ReplicateResponse = await response.json();

    // If the prediction is still processing, poll for completion
    if (data.status === 'starting' || data.status === 'processing') {
      return this.pollForCompletion(data);
    }

    return data;
  }

  private async pollForCompletion(prediction: ReplicateResponse): Promise<ReplicateResponse> {
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const response = await fetch(prediction.urls.get, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to poll prediction status: ${response.statusText}`);
      }

      const updatedPrediction: ReplicateResponse = await response.json();

      if (updatedPrediction.status === 'succeeded' ||
          updatedPrediction.status === 'failed' ||
          updatedPrediction.status === 'canceled') {
        return updatedPrediction;
      }
    }

    throw new Error('Prediction timed out');
  }
}

// Factory function for creating Replicate clients
export function createReplicateClient(modelId: string): ReplicateApiClient {
  return new ReplicateApiClient(modelId);
}

// Utility function for direct Replicate API calls (backward compatibility)
export async function callReplicateModel(
  modelId: string,
  params: any,
): Promise<StandardizedApiResponse<ReplicateResponse>> {
  const client = createReplicateClient(modelId);
  return client.execute(params);
}
