/**
 * Centralized Environment Configuration
 * 
 * This module provides a single source of truth for all environment variables
 * across the application. All environment variable access should go through this module.
 * 
 * Usage:
 * import { env } from '@/config/environment';
 * const apiUrl = env.supabase.url;
 */

interface EnvironmentConfig {
  // Environment
  nodeEnv: 'development' | 'production' | 'test' | 'staging';
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;

  // Supabase
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
  };

  // MIVAA Integration
  mivaa: {
    apiUrl: string;
    gatewayUrl: string;
    apiKey?: string;
  };

  // AI API Keys
  ai: {
    openaiApiKey?: string;
    huggingfaceApiToken?: string;
    replicateApiToken?: string;
  };

  // Stripe (if configured)
  stripe: {
    publicKey?: string;
    credits100PriceId?: string;
    credits500PriceId?: string;
    credits1000PriceId?: string;
    credits5000PriceId?: string;
    proPriceId?: string;
    enterprisePriceId?: string;
  };

  // WebSocket
  websocket: {
    url?: string;
    enabled: boolean;
  };

  // Feature Flags
  features: {
    enableAnalytics: boolean;
    enableCaching: boolean;
    enableLogging: boolean;
  };
}

/**
 * Get environment variable with type safety
 */
function getEnvVar(key: string, defaultValue?: string): string {
  // Check Vite environment variables (import.meta.env)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const value = import.meta.env[key];
    if (value !== undefined) return String(value);
  }

  // Fallback to process.env for Node.js environments
  if (typeof process !== 'undefined' && process.env) {
    const value = process.env[key];
    if (value !== undefined) return String(value);
  }

  // Return default or throw error
  if (defaultValue !== undefined) return defaultValue;
  
  // Only throw in production for critical variables
  const isBuildTime = typeof window === 'undefined';
  if (!isBuildTime) {
    console.warn(`Environment variable ${key} is not defined`);
  }
  
  return '';
}

/**
 * Get boolean environment variable
 */
function getBoolEnvVar(key: string, defaultValue = false): boolean {
  const value = getEnvVar(key, String(defaultValue));
  return value === 'true' || value === '1';
}

/**
 * Detect current environment
 */
function detectEnvironment(): 'development' | 'production' | 'test' | 'staging' {
  const nodeEnv = getEnvVar('NODE_ENV', 'development').toLowerCase();
  const mode = getEnvVar('MODE', 'development').toLowerCase();

  // Check both NODE_ENV and MODE (Vite uses MODE)
  if (nodeEnv === 'test' || mode === 'test') return 'test';
  if (nodeEnv === 'production' || mode === 'production') return 'production';
  if (nodeEnv === 'staging' || mode === 'staging') return 'staging';
  return 'development';
}

/**
 * Build environment configuration object
 */
function buildEnvironmentConfig(): EnvironmentConfig {
  const nodeEnv = detectEnvironment();

  return {
    // Environment
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',

    // Supabase Configuration
    supabase: {
      url: getEnvVar('SUPABASE_URL') || getEnvVar('NEXT_PUBLIC_SUPABASE_URL', ''),
      anonKey: getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', ''),
      serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    },

    // MIVAA Integration
    mivaa: {
      apiUrl: getEnvVar('MIVAA_API_URL', 'https://v1api.materialshub.gr'),
      gatewayUrl: getEnvVar('MIVAA_GATEWAY_URL', 'https://v1api.materialshub.gr'),
      apiKey: getEnvVar('MIVAA_API_KEY'),
    },

    // AI API Keys (using your existing Vercel environment variable names)
    ai: {
      openaiApiKey: getEnvVar('VITE_OPENAI_API_KEY') || getEnvVar('OPENAI_API_KEY'),
      huggingfaceApiToken: getEnvVar('VITE_HUGGINGFACE_API_KEY') || getEnvVar('HUGGINGFACE_API_TOKEN'),
      replicateApiToken: getEnvVar('VITE_REPLICATE_API_KEY') || getEnvVar('REPLICATE_API_TOKEN'),
    },

    // Stripe Configuration
    stripe: {
      publicKey: getEnvVar('VITE_STRIPE_PUBLIC_KEY') || getEnvVar('STRIPE_PUBLIC_KEY'),
      credits100PriceId: getEnvVar('VITE_STRIPE_CREDITS_100_PRICE_ID') || getEnvVar('STRIPE_CREDITS_100_PRICE_ID'),
      credits500PriceId: getEnvVar('VITE_STRIPE_CREDITS_500_PRICE_ID') || getEnvVar('STRIPE_CREDITS_500_PRICE_ID'),
      credits1000PriceId: getEnvVar('VITE_STRIPE_CREDITS_1000_PRICE_ID') || getEnvVar('STRIPE_CREDITS_1000_PRICE_ID'),
      credits5000PriceId: getEnvVar('VITE_STRIPE_CREDITS_5000_PRICE_ID') || getEnvVar('STRIPE_CREDITS_5000_PRICE_ID'),
      proPriceId: getEnvVar('VITE_STRIPE_PRO_PRICE_ID') || getEnvVar('STRIPE_PRO_PRICE_ID'),
      enterprisePriceId: getEnvVar('VITE_STRIPE_ENTERPRISE_PRICE_ID') || getEnvVar('STRIPE_ENTERPRISE_PRICE_ID'),
    },

    // WebSocket Configuration
    websocket: {
      url: getEnvVar('WS_URL') || getEnvVar('NEXT_PUBLIC_WS_URL'),
      enabled: getBoolEnvVar('ENABLE_WEBSOCKET', nodeEnv === 'development'),
    },

    // Feature Flags
    features: {
      enableAnalytics: getBoolEnvVar('ENABLE_ANALYTICS', nodeEnv === 'production'),
      enableCaching: getBoolEnvVar('ENABLE_CACHING', true),
      enableLogging: getBoolEnvVar('ENABLE_LOGGING', true),
    },
  };
}

/**
 * Validate critical environment variables
 */
function validateEnvironment(config: EnvironmentConfig): void {
  const errors: string[] = [];

  // Validate critical Supabase config (only in non-build environments)
  const isBuildTime = typeof window === 'undefined' && !config.isProduction;
  
  if (!isBuildTime) {
    if (!config.supabase.url) {
      errors.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required');
    }
    if (!config.supabase.anonKey) {
      errors.push('SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
    }
  }

  if (errors.length > 0 && config.isProduction) {
    throw new Error(
      `Environment configuration validation failed:\n${errors.join('\n')}`
    );
  } else if (errors.length > 0) {
    console.warn('Environment configuration warnings:', errors);
  }
}

// Build and validate configuration
const config = buildEnvironmentConfig();
validateEnvironment(config);

/**
 * Frozen environment configuration object
 * This prevents accidental modifications at runtime
 */
export const env = Object.freeze(config);

/**
 * Export type for use in other modules
 */
export type { EnvironmentConfig };

/**
 * Helper to check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof EnvironmentConfig['features']): boolean {
  return env.features[feature];
}

/**
 * Get API base URL for a service
 */
export function getApiBaseUrl(service: 'supabase' | 'mivaa'): string {
  switch (service) {
    case 'supabase':
      return `${env.supabase.url}/functions/v1`;
    case 'mivaa':
      return env.mivaa.apiUrl;
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}
