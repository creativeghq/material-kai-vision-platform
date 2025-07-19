/**
 * Centralized API Configuration Management
 *
 * This system manages all API configurations in a centralized way while
 * preserving each API's unique requirements and parameter schemas.
 */

import { z } from 'zod';
import { Singleton } from '../core/patterns/Singleton';
import type { HuggingFaceApiConfig } from './apis/huggingfaceConfig';
import { replicateConfig } from './apis/replicateConfig';
import { supabaseConfig } from './apis/supabaseConfig';
import { huggingfaceConfig } from './apis/huggingfaceConfig';

// Environment configuration
export interface EnvironmentConfig {
  development: boolean;
  production: boolean;
  staging: boolean;
}

// Base API configuration interface
export interface BaseApiConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit?: number;
  };
  environment: keyof EnvironmentConfig;
}

// Replicate API specific configuration
export interface ReplicateApiConfig extends BaseApiConfig {
  type: 'replicate';
  models: {
    [modelId: string]: {
      version: string;
      inputSchema: z.ZodSchema;
      outputSchema: z.ZodSchema;
      defaultParams?: Record<string, any>;
      description?: string;
      category?: string;
      status?: 'working' | 'failing' | 'unknown';
    };
  };
}

// Supabase API specific configuration
export interface SupabaseApiConfig extends BaseApiConfig {
  type: 'supabase';
  projectUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  functions: {
    [functionName: string]: {
      inputSchema: z.ZodSchema;
      outputSchema: z.ZodSchema;
      timeout?: number;
    };
  };
}

// OpenAI API specific configuration
export interface OpenAIApiConfig extends BaseApiConfig {
  type: 'openai';
  models: {
    [modelId: string]: {
      maxTokens: number;
      inputSchema: z.ZodSchema;
      outputSchema: z.ZodSchema;
      costPerToken?: number;
    };
  };
}


// Union type for all API configurations
export type ApiConfig = 
  | ReplicateApiConfig 
  | SupabaseApiConfig 
  | OpenAIApiConfig 
  | HuggingFaceApiConfig;

// API Registry - centralized store for all API configurations
export class ApiRegistry extends Singleton {
  private configs: Map<string, ApiConfig> = new Map();
  private environment: keyof EnvironmentConfig;

  protected constructor() {
    super();
    this.environment = this.detectEnvironment();
    this.initialize();
  }

  protected initialize(): void {
    // Register all API configurations
    this.registerApi(replicateConfig);
    this.registerApi(supabaseConfig);
    this.registerApi(huggingfaceConfig);

    console.log(`✅ API Registry initialized with ${this.configs.size} configurations for environment: ${this.environment}`);
  }

  protected cleanup(): void {
    // Clear all configurations and reset state
    this.configs.clear();
    console.log('🧹 API Registry cleaned up');
  }

  private detectEnvironment(): keyof EnvironmentConfig {
    if (typeof window !== 'undefined') {
      // Browser environment
      return window.location.hostname === 'localhost' ? 'development' : 'production';
    } else {
      // Node.js environment
      return (process.env.NODE_ENV as keyof EnvironmentConfig) || 'development';
    }
  }

  public registerApi(config: ApiConfig): void {
    this.configs.set(config.name, config);
  }

  public getApiConfig<T extends ApiConfig>(name: string): T | null {
    return (this.configs.get(name) as T) || null;
  }

  /**
   * Get a specific API configuration by type
   */
  public getApiConfigByType<T extends ApiConfig>(type: string): T | null {
    for (const config of this.configs.values()) {
      if (config.type === type) {
        return config as T;
      }
    }
    return null;
  }

  public getAllConfigs(): ApiConfig[] {
    return Array.from(this.configs.values());
  }

  public getConfigsByType<T extends ApiConfig>(type: string): T[] {
    return Array.from(this.configs.values())
      .filter(config => config.type === type) as T[];
  }

  public validateConfig(config: ApiConfig): boolean {
    try {
      // Basic validation
      if (!config.name || !config.baseUrl) {
        return false;
      }

      // Environment-specific validation
      if (config.environment !== this.environment) {
        console.warn(`Config ${config.name} is for ${config.environment} but current environment is ${this.environment}`);
      }

      return true;
    } catch (error) {
      console.error(`Validation failed for config ${config.name}:`, error);
      return false;
    }
  }

  public getEnvironment(): keyof EnvironmentConfig {
    return this.environment;
  }
}

// Utility functions for working with API configurations
export class ApiConfigUtils {
  public static createReplicateModelSchema(requiredParams: string[], optionalParams: string[] = []): z.ZodSchema {
    const schemaObject: Record<string, z.ZodTypeAny> = {};
    
    requiredParams.forEach(param => {
      schemaObject[param] = z.any(); // Will be refined per model
    });
    
    optionalParams.forEach(param => {
      schemaObject[param] = z.any().optional();
    });
    
    return z.object(schemaObject);
  }

  public static createSupabaseFunctionSchema(params: Record<string, z.ZodTypeAny>): z.ZodSchema {
    return z.object(params);
  }

  public static mergeConfigs<T extends ApiConfig>(base: Partial<T>, override: Partial<T>): Partial<T> {
    return {
      ...base,
      ...override,
      rateLimit: {
        ...base.rateLimit,
        ...override.rateLimit
      }
    };
  }
}

// Export singleton instance
export const apiRegistry = ApiRegistry.getInstance<ApiRegistry>();