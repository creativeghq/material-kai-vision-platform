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
  
  console.log('✅ API configurations initialized successfully');
  console.log(`📊 Registered ${apiRegistry.getAllConfigs().length} API configurations`);
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

// Convenience functions for common operations
export class ApiConfigManager {
  /**
   * Get a specific API configuration by name
   */
  public static getApiConfig<T extends ApiConfig>(name: string): T | null {
    return apiRegistry.getApiConfig<T>(name);
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
   * Initialize configurations and validate environment
   */
  public static initialize(): void {
    initializeApiConfigurations();
    
    const validation = this.validateEnvironment();
    if (!validation.valid) {
      console.warn('⚠️ Missing environment variables:', validation.missing);
      console.warn('Some API integrations may not work properly');
    }

    const summary = this.getConfigSummary();
    console.log('📋 Configuration Summary:', summary);
  }
}

// Auto-initialize when module is imported (can be disabled if needed)
// Initialize in all environments except during testing
if (process.env.NODE_ENV !== 'test') {
  console.log('🔧 CONFIG DEBUG: Initializing API configurations...');
  console.log('🔧 CONFIG DEBUG: process.env.NODE_ENV:', process.env.NODE_ENV);
  ApiConfigManager.initialize();
} else {
  console.log('🔧 CONFIG DEBUG: ❌ Initialization skipped - test environment detected');
}

export default ApiConfigManager;