/**
 * API Integration Service
 * 
 * High-level service that provides convenient methods for common API operations
 * using the centralized API client factory. This service abstracts the complexity
 * of the factory and provides domain-specific methods for the application.
 */

import { apiClientFactory } from './apiClientFactory';
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
  negative_prompt?: string;
  seed?: number;
  [key: string]: any; // Allow additional API-specific parameters
}

export interface ImageToImageParams {
  prompt: string;
  image: string; // Base64 or URL
  strength?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  negative_prompt?: string;
  seed?: number;
  [key: string]: any;
}

export interface TextGenerationParams {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  [key: string]: any;
}

/**
 * API Integration Service Class
 * 
 * Provides high-level methods for common API operations across all providers
 */
export class ApiIntegrationService {
  private static instance: ApiIntegrationService;

  private constructor() {}

  public static getInstance(): ApiIntegrationService {
    if (!ApiIntegrationService.instance) {
      ApiIntegrationService.instance = new ApiIntegrationService();
    }
    return ApiIntegrationService.instance;
  }

  /**
   * Generate image from text using any available text-to-image model
   */
  public async generateImage(
    modelId: string,
    params: TextToImageParams
  ): Promise<StandardizedApiResponse<any>> {
    // Determine API type from model ID or use a mapping
    const apiType = this.getApiTypeFromModelId(modelId);
    
    return await apiClientFactory.executeApiCall(apiType, modelId, params);
  }

  /**
   * Transform image using image-to-image models
   */
  public async transformImage(
    modelId: string,
    params: ImageToImageParams
  ): Promise<StandardizedApiResponse<any>> {
    const apiType = this.getApiTypeFromModelId(modelId);
    
    return await apiClientFactory.executeApiCall(apiType, modelId, params);
  }

  /**
   * Generate text using language models
   */
  public async generateText(
    modelId: string,
    params: TextGenerationParams
  ): Promise<StandardizedApiResponse<any>> {
    const apiType = this.getApiTypeFromModelId(modelId);
    
    return await apiClientFactory.executeApiCall(apiType, modelId, params);
  }

  /**
   * Execute a Supabase Edge Function
   */
  public async executeSupabaseFunction(
    functionName: string,
    params: any
  ): Promise<StandardizedApiResponse<any>> {
    return await apiClientFactory.executeApiCall('supabase', functionName, params);
  }

  /**
   * Get all available models for a specific API type
   */
  public getAvailableModels(apiType: string): string[] {
    return apiClientFactory.getAvailableModels(apiType);
  }

  /**
   * Get all available models across all API types
   */
  public getAllAvailableModels(): Record<string, string[]> {
    return {
      replicate: this.getAvailableModels('replicate'),
      huggingface: this.getAvailableModels('huggingface'),
      supabase: this.getAvailableModels('supabase')
    };
  }

  /**
   * Get model configuration for validation and UI purposes
   */
  public getModelConfig(apiType: string, modelId: string) {
    return apiClientFactory.getModelConfig(apiType, modelId);
  }

  /**
   * Validate parameters against model schema
   */
  public validateParameters(apiType: string, modelId: string, params: unknown): boolean {
    return apiClientFactory.validateParameters(apiType, modelId, params);
  }

  /**
   * Get all registered clients (for debugging/monitoring)
   */
  public getRegisteredClients(): string[] {
    return apiClientFactory.getRegisteredClients();
  }

  /**
   * Refresh all clients (useful after configuration updates)
   */
  public refreshClients(): void {
    apiClientFactory.refreshClients();
  }

  /**
   * Determine API type from model ID
   * This method maps model IDs to their corresponding API providers
   */
  private getApiTypeFromModelId(modelId: string): string {
    // Check if model exists in each API type
    const allModels = this.getAllAvailableModels();
    
    for (const [apiType, models] of Object.entries(allModels)) {
      if (models.includes(modelId)) {
        return apiType;
      }
    }
    
    // Fallback: try to infer from model ID patterns
    if (modelId.includes('/')) {
      // Replicate models typically have owner/model format
      return 'replicate';
    } else if (modelId.startsWith('hf-')) {
      // Hugging Face models might have hf- prefix
      return 'huggingface';
    } else {
      // Default to supabase for function names
      return 'supabase';
    }
  }
}

// Export singleton instance
export const apiIntegrationService = ApiIntegrationService.getInstance();

// Export types for external use
export type { StandardizedApiResponse } from './standardizedApiClient';