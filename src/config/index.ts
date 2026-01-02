/**
 * Main Configuration Index
 *
 * This file provides a unified interface for both the legacy API configuration system
 * and the new centralized configuration management system for microservice integration.
 */

// Legacy API Configuration System
import { apiRegistry, ApiConfig, SupabaseApiConfig } from './apiConfig';
import replicateConfig from './apis/replicateConfig';
import supabaseConfig from './apis/supabaseConfig';
import { huggingfaceConfig } from './apis/huggingfaceConfig';

// New Centralized Configuration System
import { configFactory } from './configFactory';
import { AppConfig } from './types';

// Re-export logger service
export {
  logger,
  createLogger,
  LogLevel,
  type LoggerConfig,
  type LogMetadata,
  type LogEntry,
} from '../services/logger.service';

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
    console.log(
      '📊 Centralized config summary:',
      configFactory.getConfigSummary(),
    );
    console.log('🔌 API config summary:', ApiConfigManager.getConfigSummary());

    return globalConfig;
  } catch (error) {
    console.error('❌ Failed to initialize configuration system:', error);
    throw error;
  }
};

/**
 * Get current configuration
 */
export const getConfig = (): AppConfig => {
  if (!globalConfig) {
    throw new Error(
      'Configuration not initialized. Call initializeConfiguration() first.',
    );
  }
  return globalConfig;
};

/**
 * Get configuration factory for advanced usage
 */
export const getConfigFactory = () => configFactory;

/**
 * Validate current configuration
 */
export const validateConfiguration = () => {
  if (!globalConfig) {
    throw new Error('Configuration not initialized');
  }
  return configFactory.validate(globalConfig);
};

/**
 * Get configuration summary for debugging
 */
export const getConfigSummary = () => {
  return configFactory.getConfigSummary();
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

export type {
  AppConfig,
  Environment,
  BaseConfig,
  DocumentChunkingConfig,
  EmbeddingGenerationConfig,
  MivaaToRagTransformerConfig,
  ValidationIntegrationConfig,
  BatchProcessingConfig,
  MivaaIntegrationConfig,
  PerformanceConfig,
  ExternalDependenciesConfig,
  ConfigValidationResult,
  ConfigFactory,
} from './types';

// Export configuration factory
export { configFactory } from './configFactory';

// Export environment-specific configurations
export { developmentConfig } from './environments/development';
export { productionConfig } from './environments/production';

// Export validation schemas
export {
  AppConfigSchema,
  EnvVarsSchema,
  DocumentChunkingConfigSchema,
  EmbeddingGenerationConfigSchema,
} from './schemas/configSchemas';

/**
 * API Configuration Manager
 * Provides centralized access to all API configurations
 */
export class ApiConfigManager {
  /**
   * Get configuration for a specific API
   */
  static getApiConfig<T extends ApiConfig>(apiName: string): T {
    const config = apiRegistry.getApi(apiName);
    if (!config) {
      throw new Error(`API configuration not found: ${apiName}`);
    }
    return config as T;
  }

  /**
   * Get all registered API configurations
   */
  static getAllApiConfigs(): Map<string, ApiConfig> {
    return apiRegistry.getAllApis();
  }

  /**
   * Check if an API is configured
   */
  static hasApiConfig(apiName: string): boolean {
    return apiRegistry.hasApi(apiName);
  }

  /**
   * Get configuration summary for debugging (sanitized - no API keys exposed)
   */
  static getConfigSummary(): Record<string, unknown> {
    const apis = apiRegistry.getAllApis();
    const summary: Record<string, unknown> = {};

    apis.forEach((config, name) => {
      summary[name] = {
        environment: config.environment,
        hasApiKey: !!config.apiKey, // Only boolean, not the actual key
        baseUrl: config.baseUrl,
        // SECURITY: Never log actual API keys or sensitive configuration
      };
    });

    return summary;
  }

  /**
   * Initialize configurations and validate environment
   */
  static initialize(): void {
    initializeApiConfigurations();

    this.validateEnvironment();
    // Silently handle missing environment variables in production
    // Configuration summary and validation details are available via getConfigSummary() and validateEnvironment()
  }

  /**
   * Validate environment variables for all APIs
   */
  static validateEnvironment(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const apis = apiRegistry.getAllApis();

    apis.forEach((config, name) => {
      // Check for API key if required
      if (config.requiresAuth && !config.apiKey) {
        warnings.push(`${name}: Missing API key`);
      }

      // Check for base URL
      if (!config.baseUrl) {
        errors.push(`${name}: Missing base URL`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
