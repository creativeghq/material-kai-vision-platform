/**
 * Monitoring Configuration
 * 
 * Configuration for error tracking, performance monitoring, and analytics
 */

import { MonitoringConfig } from '@/services/monitoring/monitoringService';

export const monitoringConfig: MonitoringConfig = {
  enabled: process.env.NODE_ENV === 'production' || process.env.VITE_ENABLE_MONITORING === 'true',
  environment: process.env.NODE_ENV || 'development',
  version: '1.0.0', // Should come from package.json
  providers: {
    // Sentry configuration
    sentry: {
      dsn: process.env.VITE_SENTRY_DSN || '',
      enabled: Boolean(process.env.VITE_SENTRY_DSN),
    },
    
    // LogRocket configuration
    logRocket: {
      appId: process.env.VITE_LOGROCKET_APP_ID || '',
      enabled: Boolean(process.env.VITE_LOGROCKET_APP_ID),
    },
    
    // Custom monitoring endpoint
    customEndpoint: {
      url: process.env.VITE_MONITORING_ENDPOINT || '',
      apiKey: process.env.VITE_MONITORING_API_KEY || '',
      enabled: Boolean(process.env.VITE_MONITORING_ENDPOINT && process.env.VITE_MONITORING_API_KEY),
    },
  },
};

/**
 * Get monitoring configuration based on environment
 */
export function getMonitoringConfig(): MonitoringConfig {
  const config = { ...monitoringConfig };
  
  // Development overrides
  if (process.env.NODE_ENV === 'development') {
    config.enabled = process.env.VITE_ENABLE_MONITORING === 'true';
  }
  
  // Generate session ID
  config.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return config;
}

/**
 * Environment variables needed for monitoring
 */
export const monitoringEnvironmentVariables = {
  // Optional - Sentry DSN for error tracking
  VITE_SENTRY_DSN: {
    required: false,
    description: 'Sentry DSN for error tracking',
    example: 'https://your-dsn@sentry.io/project-id',
  },
  
  // Optional - LogRocket App ID for session recording
  VITE_LOGROCKET_APP_ID: {
    required: false,
    description: 'LogRocket App ID for session recording',
    example: 'your-app-id',
  },
  
  // Optional - Custom monitoring endpoint
  VITE_MONITORING_ENDPOINT: {
    required: false,
    description: 'Custom monitoring endpoint URL',
    example: 'https://your-monitoring-service.com/api/events',
  },
  
  // Optional - Custom monitoring API key
  VITE_MONITORING_API_KEY: {
    required: false,
    description: 'API key for custom monitoring endpoint',
    example: 'your-api-key',
  },
  
  // Optional - Enable monitoring in development
  VITE_ENABLE_MONITORING: {
    required: false,
    description: 'Enable monitoring in development mode',
    example: 'true',
  },
};

export default monitoringConfig;
