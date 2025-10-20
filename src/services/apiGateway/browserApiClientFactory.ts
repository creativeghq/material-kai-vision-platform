/**
 * Browser-Compatible API Client Factory
 *
 * This factory provides API clients that work in the browser environment
 * without requiring Node.js modules.
 */

import {
  getBrowserApiConfig,
  type ReplicateConfig,
  type HuggingFaceConfig,
  type SupabaseConfig,
} from '../../config/browserApiConfig';

import { StandardizedApiResponse } from './standardizedApiClient';

// Simple browser-compatible API clients
class BrowserReplicateApiClient {
  private config: ReplicateConfig;

  constructor(config: ReplicateConfig) {
    this.config = config;
  }

  async generateImage(params: {
    model: string;
    prompt: string;
    width?: number;
    height?: number;
    num_inference_steps?: number;
    guidance_scale?: number;
  }): Promise<StandardizedApiResponse> {
    try {
      const apiKey = (import.meta as any).env?.VITE_REPLICATE_API_TOKEN;
      if (!apiKey) {
        throw new Error('Replicate API key not configured');
      }

      const modelConfig = this.config.models[params.model];
      if (!modelConfig) {
        throw new Error(`Model ${params.model} not found in configuration`);
      }

      const response = await fetch(`${this.config.baseUrl}/predictions`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: modelConfig.version,
          input: {
            prompt: params.prompt,
            width: params.width || 512,
            height: params.height || 512,
            num_inference_steps: params.num_inference_steps || modelConfig.defaultParams?.num_inference_steps || 20,
            guidance_scale: params.guidance_scale || modelConfig.defaultParams?.guidance_scale || 7,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
        metadata: {
          apiType: 'replicate',
          modelId: params.model,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'REPLICATE_API_ERROR',
          details: error instanceof Error ? { stack: error.stack } : undefined,
          retryable: true,
        },
        metadata: {
          apiType: 'replicate',
          modelId: params.model,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(this.config.models);
  }

  getModelConfig(modelId: string) {
    return this.config.models[modelId];
  }
}

class BrowserHuggingFaceApiClient {
  private config: HuggingFaceConfig;

  constructor(config: HuggingFaceConfig) {
    this.config = config;
  }

  async generateImage(params: {
    model: string;
    prompt: string;
  }): Promise<StandardizedApiResponse> {
    try {
      const apiKey = (import.meta as any).env?.VITE_HUGGINGFACE_API_TOKEN;
      if (!apiKey) {
        throw new Error('Hugging Face API key not configured');
      }

      const response = await fetch(`${this.config.baseUrl}/models/${params.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: params.prompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      return {
        success: true,
        data: { image_url: imageUrl },
        metadata: {
          apiType: 'huggingface',
          modelId: params.model,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'HUGGINGFACE_API_ERROR',
          details: error instanceof Error ? { stack: error.stack } : undefined,
          retryable: true,
        },
        metadata: {
          apiType: 'huggingface',
          modelId: params.model,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  }

  getAvailableModels(): string[] {
    return Object.keys(this.config.models);
  }

  getModelConfig(modelId: string) {
    return this.config.models[modelId];
  }
}

class BrowserSupabaseApiClient {
  private config: SupabaseConfig;

  constructor(config: SupabaseConfig) {
    this.config = config;
  }

  async callFunction(params: {
    functionName: string;
    payload: Record<string, unknown>;
  }): Promise<StandardizedApiResponse> {
    try {
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
      const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration not found');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/${params.functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params.payload),
      });

      if (!response.ok) {
        throw new Error(`Supabase function error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data,
        metadata: {
          apiType: 'supabase',
          modelId: params.functionName,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'SUPABASE_FUNCTION_ERROR',
          details: error instanceof Error ? { stack: error.stack } : undefined,
          retryable: true,
        },
        metadata: {
          apiType: 'supabase',
          modelId: params.functionName,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  }

  getAvailableFunctions(): string[] {
    return Object.keys(this.config.functions);
  }

  getFunctionConfig(functionName: string) {
    return this.config.functions[functionName];
  }
}

// Browser API Client Factory
class BrowserApiClientFactory {
  private clients = new Map<string, any>();

  constructor() {
    this.initializeClients();
  }

  private initializeClients(): void {
    const replicateConfig = getBrowserApiConfig('replicate') as ReplicateConfig;
    const huggingfaceConfig = getBrowserApiConfig('huggingface') as HuggingFaceConfig;
    const supabaseConfig = getBrowserApiConfig('supabase') as SupabaseConfig;

    if (replicateConfig) {
      this.clients.set('replicate', new BrowserReplicateApiClient(replicateConfig));
    }

    if (huggingfaceConfig) {
      this.clients.set('huggingface', new BrowserHuggingFaceApiClient(huggingfaceConfig));
    }

    if (supabaseConfig) {
      this.clients.set('supabase', new BrowserSupabaseApiClient(supabaseConfig));
    }
  }

  getClient(type: string): any {
    return this.clients.get(type);
  }

  getAvailableModels(apiType: string): string[] {
    const client = this.clients.get(apiType);
    if (!client) return [];

    if (client.getAvailableModels) {
      return client.getAvailableModels();
    }
    if (client.getAvailableFunctions) {
      return client.getAvailableFunctions();
    }
    return [];
  }

  getModelConfig(apiType: string, modelId: string) {
    const client = this.clients.get(apiType);
    if (!client) return null;

    if (client.getModelConfig) {
      return client.getModelConfig(modelId);
    }
    if (client.getFunctionConfig) {
      return client.getFunctionConfig(modelId);
    }
    return null;
  }
}

// Export singleton instance
export const browserApiClientFactory = new BrowserApiClientFactory();
export { BrowserApiClientFactory };
