/**
 * Main API Configuration Index
 * 
 * This file initializes and registers all API configurations with the central registry.
 * It provides a unified interface for accessing all API configurations across the platform.
 */

import {
  apiRegistry,
  ApiRegistry,
  ApiConfig,
  BaseApiConfig,
  ReplicateApiConfig,
  SupabaseApiConfig,
  OpenAIApiConfig,
  HuggingFaceApiConfig,
  EnvironmentConfig,
} from './apiConfig';
import replicateConfig from './apis/replicateConfig';
import supabaseConfig from './apis/supabaseConfig';
import { huggingfaceConfig } from './apis/huggingfaceConfig';

// Initialize and register all API configurations
export function initializeApiConfigurations(): void {
  // Register Replicate API configuration
  apiRegistry.registerApi(replicateConfig);
  
  // Register Supabase API configuration
  apiRegistry.registerApi(supabaseConfig);
  
  // Register Hugging Face API configuration
  apiRegistry.registerApi(huggingfaceConfig);
}

// Export the singleton registry instance
export { apiRegistry };

// Export specific configurations for direct access
export { replicateConfig } from './apis/replicateConfig';
export { supabaseConfig } from './apis/supabaseConfig';
export { huggingfaceConfig } from './apis/huggingfaceConfig';

// Export utility classes
export { ReplicateConfigUtils } from './apis/replicateConfig';
export { SupabaseConfigUtils } from './apis/supabaseConfig';

// Export types for TypeScript support
export type {
  ApiConfig,
  BaseApiConfig,
  ReplicateApiConfig,
  SupabaseApiConfig,
  OpenAIApiConfig,
  HuggingFaceApiConfig,
  EnvironmentConfig,
} from './apiConfig';

// Custom error class for configuration issues
export class ConfigurationError extends Error {
  public readonly configType: string;
  public readonly missingFields: string[];

  constructor(configType: string, missingFields: string[], message?: string) {
    super(message || `Configuration error for ${configType}: missing fields ${missingFields.join(', ')}`);
    this.name = 'ConfigurationError';
    this.configType = configType;
    this.missingFields = missingFields;
  }
}

// Convenience functions for common operations
export class ApiConfigManager {
  /**
   * Get a specific API configuration by name
   */
  public static getApiConfig<T extends ApiConfig>(name: string): T | null {
    return apiRegistry.getApiConfig<T>(name);
  }

  /**
   * Get a specific API configuration by type
   */
  public static getApiConfigByType<T extends ApiConfig>(type: string): T | null {
    const config = apiRegistry.getApiConfigByType<T>(type);
    
    if (!config) {
      return null;
    }

    // Validate configuration has required fields
    const validation = this.validateConfigurationFields(config);
    if (!validation.isValid) {
      throw new ConfigurationError(type, validation.missingFields,
        `Configuration for ${type} is missing required fields: ${validation.missingFields.join(', ')}`);
    }

    return config;
  }

  /**
   * Get all API configurations of a specific type
   */
  public static getApisByType<T extends ApiConfig>(type: string): T[] {
    return apiRegistry.getConfigsByType<T>(type);
  }

  /**
   * Validate that all required environment variables are set
   */
  public static validateEnvironment(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const configs = apiRegistry.getAllConfigs();
    const isServerSide = typeof window === 'undefined';

    configs.forEach(config => {
      // Only validate private API keys on server-side
      if (config.type === 'replicate' && isServerSide && !config.apiKey) {
        missing.push('REPLICATE_API_TOKEN');
      }
      
      if (config.type === 'supabase') {
        const supabaseConfig = config as any;
        // Public environment variables should always be available
        if (!supabaseConfig.projectUrl) {
          missing.push('NEXT_PUBLIC_SUPABASE_URL');
        }
        if (!supabaseConfig.anonKey) {
          missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
        }
      }
      
      // Only validate private API keys on server-side
      if (config.type === 'huggingface' && isServerSide && !config.apiKey) {
        missing.push('HUGGINGFACE_API_TOKEN');
      }
    });

    return {
      valid: missing.length === 0,
      missing: [...new Set(missing)] // Remove duplicates
    };
  }

  /**
   * Get configuration summary for debugging
   */
  public static getConfigSummary(): {
    totalConfigs: number;
    configsByType: Record<string, number>;
    environment: string;
    validation: { valid: boolean; missing: string[] };
  } {
    const configs = apiRegistry.getAllConfigs();
    const configsByType: Record<string, number> = {};
    
    configs.forEach(config => {
      configsByType[config.type] = (configsByType[config.type] || 0) + 1;
    });

    return {
      totalConfigs: configs.length,
      configsByType,
      environment: apiRegistry.getEnvironment(),
      validation: this.validateEnvironment(),
    };
  }

  /**
   * Validate that a configuration has all required fields
   */
  private static validateConfigurationFields(config: ApiConfig): {
    isValid: boolean;
    errors: string[];
    missingFields: string[];
  } {
    const errors: string[] = [];
    const missingFields: string[] = [];

    // Basic validation - all configs should have these
    if (!config.name) {
      errors.push('Missing configuration name');
      missingFields.push('name');
    }
    if (!config.type) {
      errors.push('Missing configuration type');
      missingFields.push('type');
    }

    // Type-specific validation
    switch (config.type) {
      case 'replicate':
        // Replicate configs need API key (server-side only)
        if (typeof window === 'undefined' && !config.apiKey) {
          errors.push('Missing Replicate API key (server-side)');
          missingFields.push('apiKey');
        }
        break;
      
      case 'supabase':
        const supabaseConfig = config as any;
        if (!supabaseConfig.projectUrl) {
          errors.push('Missing Supabase project URL');
          missingFields.push('projectUrl');
        }
        if (!supabaseConfig.anonKey) {
          errors.push('Missing Supabase anonymous key');
          missingFields.push('anonKey');
        }
        break;
      
      case 'huggingface':
        // HuggingFace configs need API key (server-side only)
        if (typeof window === 'undefined' && !config.apiKey) {
          errors.push('Missing HuggingFace API key (server-side)');
          missingFields.push('apiKey');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      missingFields
    };
  }

  /**
   * Get a safe configuration that won't throw errors
   */
  public static getSafeApiConfigByType<T extends ApiConfig>(type: string): T | null {
    try {
      return this.getApiConfigByType<T>(type);
    } catch (error) {
      return null;
    }
  }

  /**
   * Initialize configurations and validate environment
   */
  public static initialize(): void {
    initializeApiConfigurations();
    
    const validation = this.validateEnvironment();
    // Silently handle missing environment variables in production
    // Configuration summary and validation details are available via getConfigSummary() and validateEnvironment()
  }
}

// Auto-initialize when module is imported (can be disabled if needed)
// Initialize in all environments except during testing
if (process.env.NODE_ENV !== 'test') {
  ApiConfigManager.initialize();
}

export default ApiConfigManager;