/**
 * Browser-Compatible API Integration Service
 *
 * High-level service that provides convenient methods for common API operations
 * using the browser-compatible API client factory. This service works entirely
 * in the browser without requiring Node.js modules.
 */

import { browserApiClientFactory } from './browserApiClientFactory';
import type { StandardizedApiResponse } from './standardizedApiClient';
import { supabase } from '@/integrations/supabase/client';

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
      BrowserApiIntegrationService.instance =
        new BrowserApiIntegrationService();
    }
    return BrowserApiIntegrationService.instance;
  }

  /**
   * Generate image using Replicate API
   */
  public async generateImageWithReplicate(
    model: string,
    params: TextToImageParams,
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
    prompt: string,
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
    payload: Record<string, unknown>,
  ): Promise<StandardizedApiResponse> {
    try {
      // Import supabase client dynamically to avoid circular dependencies
      const { supabase } = await import('@/integrations/supabase/client');

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: payload,
      });

      if (error) {
        // Detect insufficient credits (402) from mivaa-gateway or other edge functions
        const errorMsg = error.message || '';
        const isInsufficientCredits =
          errorMsg.includes('Insufficient credits') ||
          (error as any)?.context?.status === 402;

        return {
          success: false,
          error: {
            message: isInsufficientCredits
              ? 'Insufficient credits. Please purchase more credits to continue.'
              : errorMsg || 'Supabase function call failed',
            code: isInsufficientCredits ? 'INSUFFICIENT_CREDITS' : 'SUPABASE_ERROR',
            retryable: !isInsufficientCredits,
          },
          metadata: {
            apiType: 'supabase',
            timestamp: new Date().toISOString(),
            requestId: crypto.randomUUID(),
          },
        };
      }

      return {
        success: true,
        data,
        metadata: {
          apiType: 'supabase',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'EXCEPTION',
          retryable: false,
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
   * Material recognition using MIVAA service via Supabase Edge Function
   */
  public async recognizeMaterial(
    imageFile: File,
  ): Promise<StandardizedApiResponse> {
    try {
      // Convert file to base64 for transmission
      const base64Image = await this.fileToBase64(imageFile);

      return this.callSupabaseFunction('mivaa-gateway', {
        action: 'material_recognition',
        payload: {
          image_data: base64Image,
          analysis_type: 'material_analysis',
          include_properties: true,
          include_composition: true,
          confidence_threshold: 0.8,
        },
      });
    } catch (error) {
      return {
        success: false,
        error: {
          message:
            error instanceof Error ? error.message : 'Failed to process image',
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
   * Enhanced RAG search using MIVAA service via Supabase Edge Function
   */
  public async performEnhancedSearch(
    query: string,
    options: {
      includeImages?: boolean;
      includeMaterials?: boolean;
      limit?: number;
    } = {},
  ): Promise<StandardizedApiResponse> {
    return this.callSupabaseFunction('mivaa-gateway', {
      action: 'rag_search',
      payload: {
        query,
        top_k: options.limit ?? 10,
        strategy: 'semantic',
        include_metadata: true,
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
   * Interior design generation using Supabase Edge Function
   * Calls multiple AI models in parallel (Replicate + Hugging Face)
   * Returns images from all successful models
   */
  public async generateInteriorDesign(params: {
    prompt: string;
    roomType?: string;
    style?: string;
    width?: number;
    height?: number;
    imageUrl?: string; // Optional reference image for image-to-image models
  }): Promise<StandardizedApiResponse> {
    try {
      console.log('🎨 Starting multi-model interior design generation...');
      console.log('📝 Prompt:', params.prompt);
      console.log('🖼️ Has reference image:', !!params.imageUrl);

      // Call Supabase Edge Function (runs multiple models in parallel)
      const { data, error } = await supabase.functions.invoke('generate-interior-design', {
        body: {
          prompt: params.prompt,
          room_type: params.roomType,
          style: params.style,
          width: params.width || 768,
          height: params.height || 768,
          image_url: params.imageUrl, // Pass reference image if provided
        },
      });

      if (error) {
        throw new Error(`Supabase function error: ${error.message}`);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Image generation failed');
      }

      console.log(`✅ Multi-model generation completed: ${data.successful_models}/${data.total_models} models succeeded`);
      console.log('📊 Model results:', data.model_results);

      return {
        success: true,
        data: {
          image_urls: data.image_urls, // All images from all successful models
          image_url: data.image_urls[0], // First image for backward compatibility
          model_results: data.model_results, // Detailed results per model
          total_models: data.total_models,
          successful_models: data.successful_models,
        },
        metadata: {
          apiType: 'multi-model',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    } catch (error) {
      console.error('❌ Interior design generation failed:', error);
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Failed to generate interior design',
          code: 'GENERATION_FAILED',
          details: error instanceof Error ? { stack: error.stack } : undefined,
          retryable: true,
        },
        metadata: {
          apiType: 'multi-model',
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  }

  /**
   * Private helper methods
   */
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
export const browserApiIntegrationService =
  BrowserApiIntegrationService.getInstance();
