/**
 * Main Configuration Index
 *
 * This file provides a unified interface for both the legacy API configuration system
 * and the new centralized configuration management system for microservice integration.
 */

// Legacy API Configuration System
import {
  apiRegistry,
  ApiConfig,
  SupabaseApiConfig,
} from './apiConfig';
import replicateConfig from './apis/replicateConfig';
import supabaseConfig from './apis/supabaseConfig';
import { huggingfaceConfig } from './apis/huggingfaceConfig';

// New Centralized Configuration System
import { configFactory } from './configFactory';
import { AppConfig } from './types';

// Global configuration instance
let globalConfig: AppConfig | null = null;

/**
 * Initialize the complete configuration system
 * This includes both legacy API configs and the new centralized system
 */
export const initializeConfiguration = async (): Promise<AppConfig> => {
  try {
    // Initialize the centralized configuration first
    globalConfig = await configFactory.create();

    // Initialize legacy API configuration system
    initializeApiConfigurations();

    console.log('✅ Complete configuration system initialized successfully');
    console.log('📊 Centralized config summary:', configFactory.getConfigSummary());
    console.log('🔌 API config summary:', ApiConfigManager.getConfigSummary());

    return globalConfig;
  } catch (error) {
    console.error('❌ Failed to initialize configuration system:', error);
    throw error;
  }
};

/**
 * Get the current global configuration
 */
export const getConfig = (): AppConfig => {
  if (!globalConfig) {
    throw new Error('Configuration not initialized. Call initializeConfiguration() first.');
  }
  return globalConfig;
};

/**
 * Get configuration for a specific service
 */
export const getServiceConfig = <T extends keyof AppConfig['services']>(
  serviceName: T,
): AppConfig['services'][T] => {
  const config = getConfig();
  return config.services[serviceName];
};

/**
 * Check if a feature is enabled
 */
export const isFeatureEnabled = (feature: string): boolean => {
  const config = getConfig();

  switch (feature) {
    case 'debug':
      return config.debug;
    case 'hotReload':
      return config.hotReload.enabled;
    case 'caching':
      return config.performance.caching.enabled;
    case 'rateLimit':
      return config.performance.rateLimit.enabled;
    case 'monitoring':
      return config.performance.monitoring.enabled;
    default:
      return false;
  }
};

/**
 * Reload configuration (useful for hot reload scenarios)
 */
export const reloadConfiguration = async (): Promise<AppConfig> => {
  await configFactory.reload();
  globalConfig = configFactory.getCurrentConfig();

  if (!globalConfig) {
    throw new Error('Failed to reload configuration');
  }

  console.log('🔄 Configuration reloaded successfully');
  return globalConfig;
};

// Initialize and register all API configurations (Legacy System)
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

// Export new centralized configuration types and factory
export {
  configFactory,
};
export type { AppConfig };

// Export types for external use
export * from './types';
export * from './schemas/configSchemas';

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

// Convenience functions for common operations (Legacy API System)
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

    // During build time, skip validation and return config with placeholders
    // Environment variables will be provided at runtime via GitHub/Vercel/Supabase
    const isBuildTime = typeof window === 'undefined' && process.env.NODE_ENV !== 'production';

    if (!isBuildTime) {
      // Validate configuration has required fields only at runtime
      const validation = this.validateConfigurationFields(config);
      if (!validation.isValid) {
        console.warn(`Configuration for ${type} is missing required fields: ${validation.missingFields.join(', ')} - will be provided at runtime`);
        // Don't throw error, just warn - allow the app to start
      }
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
        const supabaseConfig = config as SupabaseApiConfig;
        // Public environment variables should always be available
        if (!supabaseConfig.projectUrl) {
          missing.push('SUPABASE_URL');
        }
        if (!supabaseConfig.anonKey) {
          missing.push('SUPABASE_ANON_KEY');
        }
      }

      // Only validate private API keys on server-side
      if (config.type === 'huggingface' && isServerSide && !config.apiKey) {
        missing.push('HUGGINGFACE_API_TOKEN');
      }
    });

    return {
      valid: missing.length === 0,
      missing: Array.from(new Set(missing)), // Remove duplicates
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
    // During build time (when process.env.NODE_ENV is not 'production' and window is undefined),
    // we allow missing API keys as they'll be provided at runtime via GitHub/Vercel/Supabase
    const isBuildTime = typeof window === 'undefined' && process.env.NODE_ENV !== 'production';

    switch (config.type) {
      case 'replicate':
        // Replicate configs need API key (server-side only, but not during build)
        if (typeof window === 'undefined' && !config.apiKey && !isBuildTime) {
          errors.push('Missing Replicate API key (server-side) - will be provided at runtime');
          missingFields.push('apiKey');
        }
        break;

      case 'supabase':
        const supabaseConfig = config as SupabaseApiConfig;
        if (!supabaseConfig.projectUrl && !isBuildTime) {
          errors.push('Missing Supabase project URL - will be provided at runtime');
          missingFields.push('projectUrl');
        }
        if (!supabaseConfig.anonKey && !isBuildTime) {
          errors.push('Missing Supabase anonymous key - will be provided at runtime');
          missingFields.push('anonKey');
        }
        break;

      case 'huggingface':
        // HuggingFace configs need API key (server-side only, but not during build)
        if (typeof window === 'undefined' && !config.apiKey && !isBuildTime) {
          errors.push('Missing HuggingFace API key (server-side) - will be provided at runtime');
          missingFields.push('apiKey');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      missingFields,
    };
  }

  /**
   * Get a safe configuration that won't throw errors
   */
  public static getSafeApiConfigByType<T extends ApiConfig>(type: string): T | null {
    try {
      return this.getApiConfigByType<T>(type);
    } catch {
      return null;
    }
  }

  /**
   * Initialize configurations and validate environment
   */
  public static initialize(): void {
    initializeApiConfigurations();

    this.validateEnvironment();
    // Silently handle missing environment variables in production
    // Configuration summary and validation details are available via getConfigSummary() and validateEnvironment()
  }
}

// Export configuration summary for debugging (Combined System)
export const getConfigSummary = () => {
  const baseInfo = {
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  };

  if (globalConfig) {
    return {
      ...baseInfo,
      centralizedConfig: configFactory.getConfigSummary(),
      apiConfigurations: ApiConfigManager.getConfigSummary(),
    };
  }

  return {
    ...baseInfo,
    status: 'Centralized configuration not initialized',
    apiConfigurations: ApiConfigManager.getConfigSummary(),
  };
};

// Cleanup function for graceful shutdown
export const cleanupConfiguration = () => {
  configFactory.cleanup();
  console.log('🧹 Configuration system cleaned up');
};

// Auto-initialize when module is imported (can be disabled by setting DISABLE_AUTO_INIT=true)
// Initialize in all environments except during testing
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_AUTO_INIT !== 'true') {
  // Initialize legacy API system immediately
  ApiConfigManager.initialize();

  // Initialize centralized system asynchronously
  initializeConfiguration().catch(error => {
    console.error('Failed to auto-initialize centralized configuration:', error);
    console.log('Legacy API configuration system is still available');
  });
}

export default ApiConfigManager;
