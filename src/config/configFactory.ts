/**
 * Configuration Factory
 * Handles environment detection, configuration loading, validation, and hot reload
 */

import * as fs from 'fs';
import * as path from 'path';

import { z } from 'zod';

import { AppConfig, Environment, ConfigValidationResult, ConfigFactory } from './types';
import { AppConfigSchema, EnvVarsSchema } from './schemas/configSchemas';
import { developmentConfig } from './environments/development';
import { productionConfig } from './environments/production';

class ConfigurationFactory implements ConfigFactory {
  private static instance: ConfigurationFactory;
  private currentConfig: AppConfig | null = null;
  private watchers: fs.FSWatcher[] = [];

  private constructor() {}

  public static getInstance(): ConfigurationFactory {
    if (!ConfigurationFactory.instance) {
      ConfigurationFactory.instance = new ConfigurationFactory();
    }
    return ConfigurationFactory.instance;
  }

  /**
   * Detect the current environment from NODE_ENV or default to development
   */
  private detectEnvironment(): Environment {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();

    switch (nodeEnv) {
      case 'production':
        return 'production';
      case 'staging':
        return 'staging';
      case 'development':
      default:
        return 'development';
    }
  }

  /**
   * Load environment variables and validate them
   */
  private loadEnvironmentVariables(): Record<string, string> {
    try {
      // Load .env file if it exists
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envLines = envContent.split('\n');

        envLines.forEach(line => {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=').replace(/^["']|["']$/g, '');
              process.env[key.trim()] = value;
            }
          }
        });
      }

      // Validate environment variables
      const validatedEnv = EnvVarsSchema.parse(process.env);
      return validatedEnv as Record<string, string>;
    } catch (error) {
      console.warn('Environment variable validation failed:', error);
      return process.env as Record<string, string>;
    }
  }

  /**
   * Apply environment variable overrides to configuration
   */
  private applyEnvironmentOverrides(config: AppConfig, envVars: Record<string, string>): AppConfig {
    const overriddenConfig = { ...config };

    // Apply environment-specific overrides
    if (envVars.LOG_LEVEL) {
      overriddenConfig.logLevel = envVars.LOG_LEVEL as any;
    }

    if (envVars.DEBUG) {
      overriddenConfig.debug = envVars.DEBUG.toLowerCase() === 'true';
    }

    // Service-specific overrides
    if (envVars.CHUNK_SIZE) {
      overriddenConfig.services.documentChunking.chunkSize = parseInt(envVars.CHUNK_SIZE, 10);
    }

    if (envVars.EMBEDDING_BATCH_SIZE) {
      overriddenConfig.services.embeddingGeneration.batchSize = parseInt(envVars.EMBEDDING_BATCH_SIZE, 10);
    }

    if (envVars.MAX_CONCURRENCY) {
      overriddenConfig.services.batchProcessing.maxConcurrency = parseInt(envVars.MAX_CONCURRENCY, 10);
    }

    // Performance overrides
    if (envVars.CACHE_TTL) {
      overriddenConfig.performance.caching.ttl = parseInt(envVars.CACHE_TTL, 10);
    }

    if (envVars.RATE_LIMIT_RPM) {
      overriddenConfig.performance.rateLimit.requestsPerMinute = parseInt(envVars.RATE_LIMIT_RPM, 10);
    }

    // Storage overrides
    if (envVars.STORAGE_PROVIDER) {
      overriddenConfig.externalDependencies.storage.provider = envVars.STORAGE_PROVIDER as any;
    }

    if (envVars.AWS_S3_BUCKET) {
      overriddenConfig.externalDependencies.storage.bucket = envVars.AWS_S3_BUCKET;
    }

    if (envVars.AWS_REGION) {
      overriddenConfig.externalDependencies.storage.region = envVars.AWS_REGION;
    }

    return overriddenConfig;
  }

  /**
   * Load base configuration for the specified environment
   */
  private loadBaseConfiguration(environment: Environment): AppConfig {
    switch (environment) {
      case 'production':
        return { ...productionConfig };
      case 'staging':
        // For staging, use production config with some development-like settings
        return {
          ...productionConfig,
          environment: 'staging',
          debug: true,
          logLevel: 'info',
          performance: {
            ...productionConfig.performance,
            rateLimit: {
              ...productionConfig.performance.rateLimit,
              requestsPerMinute: 1000, // Higher limit for staging
            },
          },
        };
      case 'development':
      default:
        return { ...developmentConfig };
    }
  }

  /**
   * Validate configuration against schema
   */
  public validate(config: Partial<AppConfig>): ConfigValidationResult {
    try {
      AppConfigSchema.parse(config);
      return {
        isValid: true,
        errors: [],
        warnings: [],
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.issues.map(err =>
          `${err.path.join('.')}: ${err.message}`,
        );
        return {
          isValid: false,
          errors,
          warnings: [],
        };
      }

      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: [],
      };
    }
  }

  /**
   * Create and validate configuration for the specified environment
   */
  public async create(environment?: Environment): Promise<AppConfig> {
    try {
      // Detect environment if not provided
      const targetEnvironment = environment || this.detectEnvironment();

      // Load environment variables
      const envVars = this.loadEnvironmentVariables();

      // Load base configuration
      let config = this.loadBaseConfiguration(targetEnvironment);

      // Apply environment variable overrides
      config = this.applyEnvironmentOverrides(config, envVars);

      // Validate the final configuration
      const validation = this.validate(config);
      if (!validation.isValid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn('Configuration warnings:', validation.warnings);
      }

      // Store current configuration
      this.currentConfig = config;

      // Setup hot reload if enabled
      if (config.hotReload.enabled) {
        this.setupHotReload(config);
      }

      console.log(`Configuration loaded successfully for environment: ${targetEnvironment}`);
      return config;

    } catch (error) {
      console.error('Failed to create configuration:', error);
      throw error;
    }
  }

  /**
   * Setup hot reload watchers for configuration files
   */
  private setupHotReload(config: AppConfig): void {
    // Clear existing watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];

    if (!config.hotReload.enabled || config.hotReload.watchPaths.length === 0) {
      return;
    }

    let reloadTimeout: NodeJS.Timeout | null = null;

    const scheduleReload = () => {
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }

      reloadTimeout = setTimeout(async () => {
        try {
          console.log('Configuration files changed, reloading...');
          await this.reload();
          console.log('Configuration reloaded successfully');
        } catch (error) {
          console.error('Failed to reload configuration:', error);
        }
      }, config.hotReload.debounceMs);
    };

    // Watch specified paths
    config.hotReload.watchPaths.forEach(watchPath => {
      try {
        const fullPath = path.resolve(watchPath);
        if (fs.existsSync(fullPath)) {
          const watcher = fs.watch(fullPath, { recursive: true }, (_, filename) => {
            if (filename && (filename.endsWith('.ts') || filename.endsWith('.json') || filename.endsWith('.env'))) {
              console.log(`Configuration file changed: ${filename}`);
              scheduleReload();
            }
          });

          this.watchers.push(watcher);
          console.log(`Watching for configuration changes: ${watchPath}`);
        }
      } catch (error) {
        console.warn(`Failed to watch path ${watchPath}:`, error);
      }
    });
  }

  /**
   * Reload configuration
   */
  public async reload(): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('No configuration to reload');
    }

    const environment = this.currentConfig.environment;
    await this.create(environment);
  }

  /**
   * Get current configuration
   */
  public getCurrentConfig(): AppConfig | null {
    return this.currentConfig;
  }

  /**
   * Get configuration summary for logging/debugging
   */
  public getConfigSummary(): Record<string, any> {
    if (!this.currentConfig) {
      return { status: 'No configuration loaded' };
    }

    return {
      environment: this.currentConfig.environment,
      version: this.currentConfig.version,
      debug: this.currentConfig.debug,
      logLevel: this.currentConfig.logLevel,
      services: Object.keys(this.currentConfig.services),
      hotReloadEnabled: this.currentConfig.hotReload.enabled,
      cachingEnabled: this.currentConfig.performance.caching.enabled,
      rateLimitEnabled: this.currentConfig.performance.rateLimit.enabled,
      monitoringEnabled: this.currentConfig.performance.monitoring.enabled,
    };
  }

  /**
   * Cleanup watchers on shutdown
   */
  public cleanup(): void {
    this.watchers.forEach(watcher => watcher.close());
    this.watchers = [];
  }
}

// Export singleton instance
export const configFactory = ConfigurationFactory.getInstance();

// Export class for testing
export { ConfigurationFactory };
