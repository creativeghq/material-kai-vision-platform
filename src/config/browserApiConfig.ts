/**
 * Browser-Compatible API Configuration
 *
 * This file provides API configurations that work in the browser environment
 * without requiring Node.js modules like 'fs' or 'path'.
 */

// import { z } from 'zod'; // Currently unused

// Basic API configuration types
export interface BrowserApiConfig {
  type: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  environment: 'development' | 'production' | 'staging';
  timeout: number;
  retries: number;
}

export interface ReplicateConfig extends BrowserApiConfig {
  type: 'replicate';
  models: Record<
    string,
    {
      version: string;
      description: string;
      category: string;
      defaultParams?: Record<string, unknown>;
    }
  >;
}

export interface HuggingFaceConfig extends BrowserApiConfig {
  type: 'huggingface';
  models: Record<
    string,
    {
      description: string;
      category: string;
      defaultParams?: Record<string, unknown>;
    }
  >;
}

export interface SupabaseConfig extends BrowserApiConfig {
  type: 'supabase';
  functions: Record<
    string,
    {
      description: string;
      category: string;
    }
  >;
}

// Browser-compatible API registry
class BrowserApiRegistry {
  private configs = new Map<string, BrowserApiConfig>();

  registerApi(config: BrowserApiConfig): void {
    this.configs.set(config.type, config);
  }

  getConfig(type: string): BrowserApiConfig | undefined {
    return this.configs.get(type);
  }

  getAllConfigs(): BrowserApiConfig[] {
    return Array.from(this.configs.values());
  }

  getConfigSummary(): Record<string, unknown> {
    return {
      totalConfigs: this.configs.size,
      types: Array.from(this.configs.keys()),
      environment: 'browser',
    };
  }
}

// Create browser-compatible configurations
export const browserReplicateConfig: ReplicateConfig = {
  type: 'replicate',
  name: 'Replicate API',
  baseUrl: 'https://api.replicate.com/v1',
  environment: 'development',
  timeout: 60000,
  retries: 3,
  models: {
    'erayyavuz/interior-ai': {
      version: 'latest',
      description: 'AI-powered interior design transformation',
      category: 'interior-design',
      defaultParams: {
        num_inference_steps: 20,
        guidance_scale: 7,
      },
    },
    'jschoormans/comfyui-interior-remodel': {
      version: 'latest',
      description: 'ComfyUI-based interior remodeling',
      category: 'interior-design',
      defaultParams: {
        strength: 0.8,
        num_inference_steps: 20,
        guidance_scale: 7.5,
      },
    },
    'adirik/interior-design': {
      version: 'latest',
      description: 'Interior design generation',
      category: 'interior-design',
    },
    'davisbrown/designer-architecture': {
      version: 'latest',
      description: 'Architectural design generation',
      category: 'architecture',
    },
  },
};

export const browserHuggingFaceConfig: HuggingFaceConfig = {
  type: 'huggingface',
  name: 'Hugging Face API',
  baseUrl: 'https://api-inference.huggingface.co',
  environment: 'development',
  timeout: 30000,
  retries: 3,
  models: {
    'stabilityai/stable-diffusion-2-1': {
      description: 'Stable Diffusion 2.1 for image generation',
      category: 'text-to-image',
    },
    'runwayml/stable-diffusion-v1-5': {
      description: 'Stable Diffusion 1.5 for image generation',
      category: 'text-to-image',
    },
  },
};

export const browserSupabaseConfig: SupabaseConfig = {
  type: 'supabase',
  name: 'Supabase Edge Functions',
  baseUrl: process.env.SUPABASE_URL || '',
  environment: 'development',
  timeout: 30000,
  retries: 3,
  functions: {
    'mastra-3d-generation': {
      description: 'Mastra 3D generation coordination',
      category: '3d-generation',
    },
    'material-recognition': {
      description: 'Material recognition and analysis',
      category: 'material-analysis',
    },
  },
};

// Create and configure the browser API registry
export const browserApiRegistry = new BrowserApiRegistry();

// Register all configurations
browserApiRegistry.registerApi(browserReplicateConfig);
browserApiRegistry.registerApi(browserHuggingFaceConfig);
browserApiRegistry.registerApi(browserSupabaseConfig);

// Export utility functions
export function getBrowserApiConfig(
  type: string,
): BrowserApiConfig | undefined {
  return browserApiRegistry.getConfig(type);
}

export function getAllBrowserApiConfigs(): BrowserApiConfig[] {
  return browserApiRegistry.getAllConfigs();
}

export function getBrowserApiConfigSummary(): Record<string, unknown> {
  return browserApiRegistry.getConfigSummary();
}

// Export types - commented out to avoid conflicts
// export type { BrowserApiConfig, ReplicateConfig, HuggingFaceConfig, SupabaseConfig };
