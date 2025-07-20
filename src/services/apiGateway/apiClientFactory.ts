import { StandardizedApiClient, StandardizedApiResponse } from './standardizedApiClient';
import { ReplicateApiClient } from './replicateApiClient';
import { HuggingFaceApiClient } from './huggingFaceApiClient';
import { SupabaseApiClient } from './supabaseApiClient';
import { ApiRegistry, ReplicateApiConfig, HuggingFaceApiConfig, SupabaseApiConfig } from '../../config/apiConfig';

/**
 * Centralized API Client Factory Implementation
 * 
 * This factory provides a single point of access to all standardized API clients,
 * ensuring consistent configuration and error handling across the platform.
 */
class CentralizedApiClientFactory {
  private static instance: CentralizedApiClientFactory;
  private clients: Map<string, StandardizedApiClient<any, any>> = new Map();

  private constructor() {
    this.initializeClients();
  }

  public static getInstance(): CentralizedApiClientFactory {
    if (!CentralizedApiClientFactory.instance) {
      CentralizedApiClientFactory.instance = new CentralizedApiClientFactory();
    }
    return CentralizedApiClientFactory.instance;
  }

  private initializeClients(): void {
    const apiRegistry = ApiRegistry.getInstance();

    // Register Replicate clients for all configured models
    const replicateConfig = apiRegistry.getApiConfigByType<ReplicateApiConfig>('replicate');
    if (replicateConfig && replicateConfig.models) {
      const replicateModels = Object.keys(replicateConfig.models);
      replicateModels.forEach(modelId => {
        const modelConfig = replicateConfig.models[modelId];
        if (modelConfig) {
          this.registerClient(
            'replicate',
            modelId,
            new ReplicateApiClient(modelId)
          );
        }
      });
    }

    // Register Hugging Face clients for all configured models
    const huggingfaceConfig = apiRegistry.getApiConfigByType<HuggingFaceApiConfig>('huggingface');
    if (huggingfaceConfig && huggingfaceConfig.models) {
      const huggingFaceModels = Object.keys(huggingfaceConfig.models);
      huggingFaceModels.forEach(modelId => {
        const modelConfig = huggingfaceConfig.models[modelId];
        if (modelConfig) {
          this.registerClient(
            'huggingface',
            modelId,
            new HuggingFaceApiClient(modelId)
          );
        }
      });
    }

    // Register Supabase clients for all configured functions
    const supabaseConfig = apiRegistry.getApiConfigByType<SupabaseApiConfig>('supabase');
    if (supabaseConfig && supabaseConfig.functions) {
      const supabaseFunctions = Object.keys(supabaseConfig.functions);
      supabaseFunctions.forEach(functionName => {
        const functionConfig = supabaseConfig.functions[functionName];
        if (functionConfig) {
          // Use the service role key for server-side operations, fallback to anon key
          const apiKey = supabaseConfig.serviceRoleKey || supabaseConfig.anonKey;
          this.registerClient(
            'supabase',
            functionName,
            new SupabaseApiClient(apiKey, functionName)
          );
        }
      });
    }
  }

  /**
   * Register a client for a specific API and model/function
   */
  public registerClient(apiType: string, modelId: string, client: StandardizedApiClient<any, any>): void {
    const key = `${apiType}:${modelId}`;
    this.clients.set(key, client);
  }

  /**
   * Get a client for a specific API and model/function
   */
  public getClient(apiType: string, modelId: string): StandardizedApiClient<any, any> | null {
    const key = `${apiType}:${modelId}`;
    const client = this.clients.get(key);
    if (!client) {
      console.warn(`No client registered for ${apiType}:${modelId}`);
      return null;
    }
    return client;
  }

  /**
   * Get all available models for a specific API type
   */
  public getAvailableModels(apiType: string): string[] {
    const apiRegistry = ApiRegistry.getInstance();
    
    switch (apiType) {
      case 'replicate':
        const replicateConfig = apiRegistry.getApiConfigByType<ReplicateApiConfig>('replicate');
        return replicateConfig ? Object.keys(replicateConfig.models) : [];
      case 'huggingface':
        const huggingfaceConfig = apiRegistry.getApiConfigByType<HuggingFaceApiConfig>('huggingface');
        return huggingfaceConfig ? Object.keys(huggingfaceConfig.models) : [];
      case 'supabase':
        const supabaseConfig = apiRegistry.getApiConfigByType<SupabaseApiConfig>('supabase');
        return supabaseConfig ? Object.keys(supabaseConfig.functions) : [];
      default:
        return [];
    }
  }

  /**
   * Get model configuration for validation and parameter building
   */
  public getModelConfig(apiType: string, modelId: string) {
    const apiRegistry = ApiRegistry.getInstance();
    
    switch (apiType) {
      case 'replicate':
        const replicateConfig = apiRegistry.getApiConfigByType<ReplicateApiConfig>('replicate');
        return replicateConfig?.models[modelId] || null;
      case 'huggingface':
        const huggingfaceConfig = apiRegistry.getApiConfigByType<HuggingFaceApiConfig>('huggingface');
        return huggingfaceConfig?.models[modelId] || null;
      case 'supabase':
        const supabaseConfig = apiRegistry.getApiConfigByType<SupabaseApiConfig>('supabase');
        return supabaseConfig?.functions[modelId] || null;
      default:
        return null;
    }
  }

  /**
   * Validate parameters against model schema
   */
  public validateParameters(apiType: string, modelId: string, params: unknown): boolean {
    const config = this.getModelConfig(apiType, modelId);
    if (!config) {
      return false;
    }

    try {
      // Use the inputSchema for validation if available
      if (config.inputSchema) {
        config.inputSchema.parse(params);
        return true;
      }
      
      // Fallback to basic validation
      return params !== null && params !== undefined;
    } catch (error) {
      console.warn(`Parameter validation failed for ${apiType}:${modelId}:`, error);
      return false;
    }
  }

  /**
   * Execute API call with standardized error handling and response format
   */
  public async executeApiCall<TParams, TResponse>(
    apiType: string,
    modelId: string,
    params: TParams
  ): Promise<StandardizedApiResponse<TResponse>> {
    // === API CLIENT FACTORY DEBUG START ===
    console.log('🏭 ApiClientFactory.executeApiCall called');
    console.log('🎯 API Type:', apiType);
    console.log('🆔 Model ID:', modelId);
    console.log('📦 Params:', JSON.stringify(params, null, 2));
    
    const client = this.getClient(apiType, modelId);
    if (!client) {
      console.log('❌ No client found for', `${apiType}:${modelId}`);
      console.log('=== API CLIENT FACTORY DEBUG END ===');
      return {
        success: false,
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: `No client registered for ${apiType}:${modelId}`,
          details: { apiType, modelId },
          retryable: false
        },
        metadata: {
          apiType,
          modelId,
          timestamp: new Date().toISOString(),
          requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
    }

    console.log('✅ Client found, proceeding with execution');

    try {
      // Validate parameters if validation is available
      const isValid = this.validateParameters(apiType, modelId, params);
      console.log('🔍 Parameter validation result:', isValid);
      
      if (!isValid) {
        console.log('❌ Parameter validation failed');
        console.log('=== API CLIENT FACTORY DEBUG END ===');
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMETERS',
            message: 'Parameter validation failed',
            details: { apiType, modelId, params },
            retryable: false
          },
          metadata: {
            apiType,
            modelId,
            timestamp: new Date().toISOString(),
            requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }
        };
      }

      // Execute the API call
      console.log('🚀 Calling client.validateParams()');
      const validatedParams = client.validateParams(params);
      console.log('✅ Validated params:', JSON.stringify(validatedParams, null, 2));
      
      console.log('🚀 Calling client.execute()');
      console.log('=== API CLIENT FACTORY DEBUG END ===');
      
      return await client.execute(validatedParams);
    } catch (error) {
      console.log('💥 Error in executeApiCall:', error);
      console.log('=== API CLIENT FACTORY DEBUG END ===');
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { apiType, modelId, originalError: error },
          retryable: true
        },
        metadata: {
          apiType,
          modelId,
          timestamp: new Date().toISOString(),
          requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
    }
  }

  /**
   * Clear all registered clients
   */
  public clearClients(): void {
    this.clients.clear();
  }

  /**
   * Refresh all clients (useful for configuration updates)
   */
  public refreshClients(): void {
    this.clearClients();
    this.initializeClients();
  }

  /**
   * Get all registered client keys
   */
  public getRegisteredClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Export singleton instance
export const apiClientFactory = CentralizedApiClientFactory.getInstance();

// Export types for external use
export type { StandardizedApiClient, StandardizedApiResponse } from './standardizedApiClient';