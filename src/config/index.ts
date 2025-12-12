/**
 * Central Configuration Exports
 *
 * This barrel file provides easy access to all configuration-related modules.
 * Import from here to get type-safe configuration and logging.
 *
 * @example
 * import { env, logger, createLogger } from '@/config';
 */

// Re-export environment configuration
export {
  env,
  isFeatureEnabled,
  getApiBaseUrl,
  type EnvironmentConfig
} from './environment';

// Re-export logger service
export {
  logger,
  createLogger,
  LogLevel,
  type LoggerConfig,
  type LogMetadata,
  type LogEntry
} from '../services/logger.service';

// Re-export API configurations (existing)
export {
  apiRegistry,
  ApiConfigUtils,
  type ApiConfig,
  type BaseApiConfig,
  type ReplicateApiConfig,
  type SupabaseApiConfig,
  type OpenAIApiConfig
} from './apiConfig';

// Import env for use in function
import { env as environment } from './environment';

// Helper to get all config at once for debugging
export function getConfigSnapshot() {
  return {
    environment: environment.nodeEnv,
    isDevelopment: environment.isDevelopment,
    isProduction: environment.isProduction,
    features: environment.features,
    supabase: {
      hasUrl: !!environment.supabase.url,
      hasKey: !!environment.supabase.anonKey,
    },
    mivaa: {
      hasUrl: !!environment.mivaa.apiUrl,
      hasKey: !!environment.mivaa.apiKey,
    },
  };
}
