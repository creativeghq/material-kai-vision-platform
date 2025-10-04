/**
 * Browser-Compatible API Integration Service
 *
 * High-level service that provides convenient methods for common API operations
 * using the browser-compatible API client factory. This service works entirely
 * in the browser without requiring Node.js modules.
 */

import { browserApiClientFactory } from './browserApiClientFactory';
import type { StandardizedApiResponse } from './standardizedApiClient';

/**
 * Common parameter types for different API operations
 */
export interface TextToImageParams {
  prompt: string;
  width?: number;
  height?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
}

export interface ImageToImageParams {
  prompt: string;
  image: string | File;
  strength?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
}

export interface SupabaseFunctionParams {
  functionName: string;
  payload: Record<string, unknown>;
}

/**
 * Browser-compatible API Integration Service
 */
export class BrowserApiIntegrationService {
  private static instance: BrowserApiIntegrationService;

  private constructor() {
    // Private constructor for singleton pattern
  }

  public static getInstance(): BrowserApiIntegrationService {
    if (!BrowserApiIntegrationService.instance) {
      BrowserApiIntegrationService.instance = new BrowserApiIntegrationService();
    }
    return BrowserApiIntegrationService.instance;
  }

  /**
   * Generate image using Replicate API
   */
  public async generateImageWithReplicate(
    model: string,
    params: TextToImageParams
  ): Promise<StandardizedApiResponse> {
    const client = browserApiClientFactory.getClient('replicate');
    if (!client) {
      return {
        success: false,
        error: {
          message: 'Replicate client not available',
          code: 'CLIENT_NOT_AVAILABLE',
          retryable: false,
        },
        metadata: {
          apiType: 'replicate',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }

    return client.generateImage({
      model,
      ...params,
    });
  }

  /**
   * Generate image using Hugging Face API
   */
  public async generateImageWithHuggingFace(
    model: string,
    prompt: string
  ): Promise<StandardizedApiResponse> {
    const client = browserApiClientFactory.getClient('huggingface');
    if (!client) {
      return {
        success: false,
        error: {
          message: 'Hugging Face client not available',
          code: 'CLIENT_NOT_AVAILABLE',
          retryable: false,
        },
        metadata: {
          apiType: 'huggingface',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }

    return client.generateImage({
      model,
      prompt,
    });
  }

  /**
   * Call Supabase Edge Function
   */
  public async callSupabaseFunction(
    functionName: string,
    payload: Record<string, unknown>
  ): Promise<StandardizedApiResponse> {
    const client = browserApiClientFactory.getClient('supabase');
    if (!client) {
      return {
        success: false,
        error: {
          message: 'Supabase client not available',
          code: 'CLIENT_NOT_AVAILABLE',
          retryable: false,
        },
        metadata: {
          apiType: 'supabase',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }

    return client.callFunction({
      functionName,
      payload,
    });
  }

  /**
   * Interior design generation using the best available model
   */
  public async generateInteriorDesign(params: {
    prompt: string;
    roomType?: string;
    style?: string;
    width?: number;
    height?: number;
  }): Promise<StandardizedApiResponse> {
    // Try Replicate first (usually better quality)
    const replicateModels = browserApiClientFactory.getAvailableModels('replicate');
    const interiorModel = replicateModels.find(model => 
      model.includes('interior') || model.includes('design')
    );

    if (interiorModel) {
      const enhancedPrompt = this.enhanceInteriorPrompt(params);
      return this.generateImageWithReplicate(interiorModel, {
        prompt: enhancedPrompt,
        width: params.width || 768,
        height: params.height || 768,
        num_inference_steps: 25,
        guidance_scale: 7.5,
      });
    }

    // Fallback to Hugging Face
    const huggingfaceModels = browserApiClientFactory.getAvailableModels('huggingface');
    const fallbackModel = huggingfaceModels[0]; // Use first available model

    if (fallbackModel) {
      const enhancedPrompt = this.enhanceInteriorPrompt(params);
      return this.generateImageWithHuggingFace(fallbackModel, enhancedPrompt);
    }

    return {
      success: false,
      error: {
        message: 'No suitable models available for interior design generation',
        code: 'NO_MODELS_AVAILABLE',
        retryable: false,
      },
      metadata: {
        apiType: 'interior-design',
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
      },
    };
  }

  /**
   * Material recognition using Supabase Edge Function
   */
  public async recognizeMaterial(imageFile: File): Promise<StandardizedApiResponse> {
    try {
      // Convert file to base64 for transmission
      const base64Image = await this.fileToBase64(imageFile);
      
      return this.callSupabaseFunction('material-recognition', {
        image: base64Image,
        options: {
          includeProperties: true,
          includeComposition: true,
          includeSustainability: true,
        },
      });
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to process image',
          code: 'IMAGE_PROCESSING_ERROR',
          details: error instanceof Error ? { stack: error.stack } : undefined,
          retryable: true,
        },
        metadata: {
          apiType: 'supabase',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  }

  /**
   * Enhanced RAG search using Supabase Edge Function
   */
  public async performEnhancedSearch(query: string, options: {
    includeImages?: boolean;
    includeMaterials?: boolean;
    limit?: number;
  } = {}): Promise<StandardizedApiResponse> {
    return this.callSupabaseFunction('enhanced-rag-search', {
      query,
      options: {
        includeImages: options.includeImages ?? true,
        includeMaterials: options.includeMaterials ?? true,
        limit: options.limit ?? 10,
      },
    });
  }

  /**
   * Get all available models for a specific API type
   */
  public getAvailableModels(apiType: string): string[] {
    return browserApiClientFactory.getAvailableModels(apiType);
  }

  /**
   * Get all available models across all API types
   */
  public getAllAvailableModels(): Record<string, string[]> {
    return {
      replicate: this.getAvailableModels('replicate'),
      huggingface: this.getAvailableModels('huggingface'),
      supabase: this.getAvailableModels('supabase'),
    };
  }

  /**
   * Get model configuration for validation and UI purposes
   */
  public getModelConfig(apiType: string, modelId: string) {
    return browserApiClientFactory.getModelConfig(apiType, modelId);
  }

  /**
   * Private helper methods
   */
  private enhanceInteriorPrompt(params: {
    prompt: string;
    roomType?: string;
    style?: string;
  }): string {
    let enhancedPrompt = params.prompt;

    if (params.roomType) {
      enhancedPrompt = `${params.roomType} interior: ${enhancedPrompt}`;
    }

    if (params.style) {
      enhancedPrompt += `, ${params.style} style`;
    }

    // Add quality enhancers
    enhancedPrompt += ', high quality, professional interior design, well-lit, detailed';

    return enhancedPrompt;
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get just the base64 data
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// Export singleton instance
export const browserApiIntegrationService = BrowserApiIntegrationService.getInstance();
