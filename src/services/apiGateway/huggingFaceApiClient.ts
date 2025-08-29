/**
 * Hugging Face API Client
 *
 * Standardized client for Hugging Face Inference API that preserves all
 * Hugging Face-specific functionality while providing consistent interface.
 */

import { huggingfaceConfig, type HuggingFaceApiConfig } from '../../config/apis/huggingfaceConfig';

import { BaseApiClient, StandardizedApiResponse, withRetry } from './standardizedApiClient';

// Hugging Face specific types
export interface HuggingFaceParams {
  inputs: string;
  parameters?: Record<string, unknown>;
}

export interface HuggingFaceResponse {
  output?: string[];
  error?: string;
  // Hugging Face may return binary data for images
  blob?: Blob;
}

export class HuggingFaceApiClient extends BaseApiClient<HuggingFaceParams, HuggingFaceResponse> {
  private huggingFaceConfig: HuggingFaceApiConfig;
  private currentModelId?: string;

  constructor(modelId?: string) {
    super('huggingface', modelId);
    this.huggingFaceConfig = huggingfaceConfig;
    this.currentModelId = modelId || undefined;
  }

  public async execute(params: HuggingFaceParams): Promise<StandardizedApiResponse<HuggingFaceResponse>> {
    const validatedParams = this.validateParams(params);
    return this.makeApiCall(validatedParams);
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Simple health check - try to access the API base URL
      const response = await fetch(this.huggingFaceConfig.baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public validateParams(params: unknown): HuggingFaceParams {
    // For Hugging Face, we need to validate against a specific model's schema
    if (!this.currentModelId) {
      throw new Error('Model ID is required for Hugging Face API validation');
    }

    const modelConfig = this.huggingFaceConfig.models[this.currentModelId];
    if (!modelConfig) {
      throw new Error(`Model ${this.currentModelId} not found in Hugging Face configuration`);
    }

    // Use the exact schema from configuration
    return modelConfig.inputSchema.parse(params) as HuggingFaceParams;
  }

  protected async makeApiCall(
    validatedParams: HuggingFaceParams,
  ): Promise<StandardizedApiResponse<HuggingFaceResponse>> {
    if (!this.currentModelId) {
      throw new Error('Model ID is required for Hugging Face API calls');
    }
    const modelConfig = this.huggingFaceConfig.models[this.currentModelId];
    if (!modelConfig) {
      throw new Error(`Model ${this.currentModelId} not found in configuration`);
    }

    // Validate against the specific model's input schema
    const finalParams = modelConfig.inputSchema.parse(validatedParams);

    // Hugging Face API endpoint construction
    const endpoint = `/models/${this.currentModelId}`;
    const url = `${this.huggingFaceConfig.baseUrl}${endpoint}`;

    // Hugging Face authentication - preserve exact format
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.huggingFaceConfig.apiKey) {
      headers['Authorization'] = `Bearer ${this.huggingFaceConfig.apiKey}`;
    }

    // Execute with retry logic using configuration values
    const response = await withRetry(
      async () => {
        const fetchResponse = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(finalParams),
          signal: AbortSignal.timeout(this.huggingFaceConfig.timeout || 60000),
        });

        if (!fetchResponse.ok) {
          // Hugging Face specific error handling
          let errorMessage = `HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`;

          try {
            const errorData = await fetchResponse.json();
            if (errorData.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // If error response is not JSON, use status text
          }

          // Handle specific Hugging Face error codes
          switch (fetchResponse.status) {
            case 401:
              throw new Error(`Hugging Face API authentication failed: ${errorMessage}`);
            case 429:
              throw new Error(`Hugging Face API rate limit exceeded: ${errorMessage}`);
            case 503:
              throw new Error(`Hugging Face model is loading, please retry: ${errorMessage}`);
            default:
              throw new Error(`Hugging Face API error: ${errorMessage}`);
          }
        }

        // Handle different response types
        const contentType = fetchResponse.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          // JSON response (error or structured data)
          const jsonData = await fetchResponse.json();
          return jsonData;
        } else if (contentType?.includes('image/')) {
          // Binary image response - convert to base64 URL
          const blob = await fetchResponse.blob();
          const base64 = await this.blobToBase64(blob);
          return {
            output: [base64],
          };
        } else {
          // Fallback for other content types
          const text = await fetchResponse.text();
          return {
            output: [text],
          };
        }
      },
      {
        maxAttempts: this.huggingFaceConfig.retryAttempts || 2,
        baseDelay: 1000,
        maxDelay: 5000,
      },
    );

    // Validate response using exact schema from configuration
    const validatedResponse = modelConfig.outputSchema.parse(response) as HuggingFaceResponse;

    return {
      success: true,
      data: validatedResponse,
      metadata: {
        apiType: 'huggingface',
        modelId: this.currentModelId,
        timestamp: new Date().toISOString(),
        requestId: `hf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
    };
  }

  /**
   * Convert blob to base64 data URL
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Get available models from configuration
   */
  public getAvailableModels(): string[] {
    return Object.keys(this.huggingFaceConfig.models);
  }

  /**
   * Get model configuration
   */
  public getModelConfig(modelId: string) {
    return this.huggingFaceConfig.models[modelId];
  }

  /**
   * Check if model is available and working
   */
  public isModelAvailable(modelId: string): boolean {
    const config = this.huggingFaceConfig.models[modelId];
    return config?.status === 'working';
  }
}
