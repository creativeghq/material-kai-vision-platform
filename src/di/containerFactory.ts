import { ConfigurationFactory } from '../config/configFactory.js';
import { DocumentIntegrationService } from '../services/documentIntegrationService.js';
import type {
    AppConfig,
} from '../config/types.js';

import { IServiceContainer, ServiceLifetime } from './types.js';
import { ServiceContainer } from './container.js';

// Simple logger interface for DI container
interface ILogger {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
}

// Basic logger implementation
class SimpleLogger implements ILogger {
    constructor(private config: { level: string; enableConsole: boolean }) {}

    debug(message: string, meta?: unknown): void {
        if (this.config.level === 'debug' && this.config.enableConsole) {
            console.debug(`[DEBUG] ${message}`, meta || '');
        }
    }

    info(message: string, meta?: unknown): void {
        if (['debug', 'info'].includes(this.config.level) && this.config.enableConsole) {
            console.info(`[INFO] ${message}`, meta || '');
        }
    }

    warn(message: string, meta?: unknown): void {
        if (['debug', 'info', 'warn'].includes(this.config.level) && this.config.enableConsole) {
            console.warn(`[WARN] ${message}`, meta || '');
        }
    }

    error(message: string, meta?: unknown): void {
        if (this.config.enableConsole) {
            console.error(`[ERROR] ${message}`, meta || '');
        }
    }
}

/**
 * Factory for creating and configuring service containers with standard integrations
 */
export class ContainerFactory {
    private static _instance: ContainerFactory | null = null;
    private _defaultContainer: IServiceContainer | null = null;

    private constructor() {}

    /**
     * Get the singleton instance of ContainerFactory
     */
    public static getInstance(): ContainerFactory {
        if (!ContainerFactory._instance) {
            ContainerFactory._instance = new ContainerFactory();
        }
        return ContainerFactory._instance;
    }

    /**
     * Create a new service container with standard configuration
     */
    public createContainer(): IServiceContainer {
        const container = new ServiceContainer();
        this.registerCoreServices(container);
        return container;
    }

    /**
     * Get or create the default application container
     */
    public getDefaultContainer(): IServiceContainer {
        if (!this._defaultContainer) {
            this._defaultContainer = this.createContainer();
        }
        return this._defaultContainer;
    }

    /**
     * Register business services with their interface contracts and proper configuration injection
     */
    private registerBusinessServices(container: IServiceContainer): void {
        // Register DocumentChunkingService with health check
        container.register({
            identifier: 'IDocumentChunkingService',
            factory: () => {
                // Import and instantiate the actual service
                // Note: This would need to be updated when the actual service classes are available
                // For now, we're setting up the registration structure
                throw new Error('DocumentChunkingService implementation not yet available');
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['DocumentChunkingConfig', 'Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    // Basic health check - verify service is available and responsive
                    if (!service) {
                        return false;
                    }

                    // If service implements healthCheck method, use it
                    if (service && typeof service === 'object' && 'healthCheck' in service && typeof (service as { healthCheck: unknown }).healthCheck === 'function') {
                        const result = await (service as { healthCheck: () => Promise<{ status: string }> }).healthCheck();
                        return result.status === 'healthy';
                    }

                    return true; // Service is available
                } catch {
                    return false;
                }
            },
        });

        // Register MivaaEmbeddingIntegration service with health check
        container.register({
            identifier: 'IEmbeddingGenerationService',
            factory: () => {
                // Dynamic import would require async factory, using require for now
                // TODO: Consider refactoring to async factory pattern if needed
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { MivaaEmbeddingIntegration } = require('../services/mivaaEmbeddingIntegration');
                return new MivaaEmbeddingIntegration();
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    if (!service) {
                        return false;
                    }

                    if (service && typeof service === 'object' && 'healthCheck' in service && typeof (service as { healthCheck: unknown }).healthCheck === 'function') {
                        const result = await (service as { healthCheck: () => Promise<{ status: string }> }).healthCheck();
                        return result.status === 'healthy';
                    }

                    return true;
                } catch {
                    return false;
                }
            },
        });

        // Register MivaaSearchIntegration service with health check
        container.register({
            identifier: 'IMivaaSearchIntegration',
            factory: () => {
                // Dynamic import would require async factory, using require for now
                // TODO: Consider refactoring to async factory pattern if needed
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { MivaaSearchIntegration } = require('../services/mivaaSearchIntegration');
                return new MivaaSearchIntegration();
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    if (!service) {
                        return false;
                    }

                    if (service && typeof service === 'object' && 'healthCheck' in service && typeof (service as { healthCheck: unknown }).healthCheck === 'function') {
                        const result = await (service as { healthCheck: () => Promise<{ status: string }> }).healthCheck();
                        return result.status === 'healthy';
                    }

                    return true;
                } catch {
                    return false;
                }
            },
        });

        // Register MivaaToRagTransformerService with health check
        container.register({
            identifier: 'IMivaaToRagTransformerService',
            factory: () => {
                throw new Error('MivaaToRagTransformerService implementation not yet available');
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['MivaaToRagTransformerConfig', 'Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    if (!service) {
                        return false;
                    }

                    if (service && typeof service === 'object' && 'healthCheck' in service && typeof (service as { healthCheck: unknown }).healthCheck === 'function') {
                        const result = await (service as { healthCheck: () => Promise<{ status: string }> }).healthCheck();
                        return result.status === 'healthy';
                    }

                    return true;
                } catch {
                    return false;
                }
            },
        });

        // Register BatchProcessingService with health check
        container.register({
            identifier: 'IBatchProcessingService',
            factory: () => {
                // Dynamic import would require async factory, using require for now
                // TODO: Consider refactoring to async factory pattern if needed
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { BatchProcessingService } = require('../services/batch/batchProcessingService');
                const config = container.resolve('BatchProcessingConfig');
                const logger = container.resolve('Logger');
                return new BatchProcessingService(config, logger);
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['BatchProcessingConfig', 'Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    if (!service) {
                        return false;
                    }

                    if (service && typeof service === 'object' && 'healthCheck' in service && typeof (service as { healthCheck: unknown }).healthCheck === 'function') {
                        const result = await (service as { healthCheck: () => Promise<{ status: string }> }).healthCheck();
                        return result.status === 'healthy';
                    }

                    return true;
                } catch {
                    return false;
                }
            },
        });

        // Register ValidationIntegrationService with health check
        container.register({
            identifier: 'IValidationIntegrationService',
            factory: () => {
                throw new Error('ValidationIntegrationService implementation not yet available');
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ValidationIntegrationConfig', 'Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    if (!service) {
                        return false;
                    }

                    if (service && typeof service === 'object' && 'healthCheck' in service && typeof (service as { healthCheck: unknown }).healthCheck === 'function') {
                        const result = await (service as { healthCheck: () => Promise<{ status: string }> }).healthCheck();
                        return result.status === 'healthy';
                    }

                    return true;
                } catch {
                    return false;
                }
            },
        });

        // Register DocumentIntegrationService with health check
        container.register({
            identifier: 'IDocumentIntegrationService',
            factory: (resolver) => {
                const config = resolver.resolve<AppConfig>('AppConfig');
                const ragService = resolver.resolve('IBaseService'); // Will be replaced with actual RAG service interface

                // TODO: Replace with proper RAG service interface when available
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return new DocumentIntegrationService(ragService as any, config);
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['AppConfig', 'IBaseService', 'Logger'],
            healthCheck: async (service: unknown) => {
                try {
                    if (!service) {
                        return false;
                    }

                    if (service && typeof service === 'object' && 'getHealthStatus' in service && typeof (service as { getHealthStatus: unknown }).getHealthStatus === 'function') {
                        const result = await (service as { getHealthStatus: () => Promise<{ status: string }> }).getHealthStatus();
                        return result.status === 'healthy';
                    }

                    return true;
                } catch {
                    return false;
                }
            },
        });
    }

    /**
     * Create a container for testing with minimal dependencies
     */
    public createTestContainer(): IServiceContainer {
        const container = new ServiceContainer();

        // Register only essential services for testing
        container.register({
            identifier: 'Logger',
            factory: () => new SimpleLogger({ level: 'error', enableConsole: false }),
            lifetime: ServiceLifetime.Singleton,
            dependencies: [],
        });

        container.register({
            identifier: 'ConfigurationFactory',
            factory: () => ConfigurationFactory.getInstance(),
            lifetime: ServiceLifetime.Singleton,
            dependencies: [],
        });

        return container;
    }

    /**
     * Register core services that are always needed
     */
    private registerCoreServices(container: IServiceContainer): void {
        // Register ConfigurationFactory as singleton
        container.register({
            identifier: 'ConfigurationFactory',
            factory: () => ConfigurationFactory.getInstance(),
            lifetime: ServiceLifetime.Singleton,
            dependencies: [],
        });

        // Register Logger with configuration from ConfigFactory
        container.register({
            identifier: 'Logger',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return new SimpleLogger({
                    level: config.logLevel,
                    enableConsole: config.debug,
                });
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        // Register configuration objects as singletons for easy injection
        this.registerConfigurationObjects(container);

        // Register business services with their interface contracts
        this.registerBusinessServices(container);
    }

    /**
     * Register all configuration objects as individual services
     */
    private registerConfigurationObjects(container: IServiceContainer): void {
        container.register({
            identifier: 'AppConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                return configFactory.getCurrentConfig();
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'DocumentChunkingConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.services.documentChunking;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'EmbeddingGenerationConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.services.embeddingGeneration;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'MivaaToRagTransformerConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.services.mivaaToRagTransformer;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'BatchProcessingConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.services.batchProcessing;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'ValidationIntegrationConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.services.validationIntegration;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'PerformanceConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.performance;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });

        container.register({
            identifier: 'ExternalDependenciesConfig',
            factory: (resolver) => {
                const configFactory = resolver.resolve<ConfigurationFactory>('ConfigurationFactory');
                const config = configFactory.getCurrentConfig();
                if (!config) {
                    throw new Error('Configuration not available');
                }
                return config.externalDependencies;
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });
    }

    /**
     * Reset the factory (useful for testing)
     */
    public static reset(): void {
        ContainerFactory._instance = null;
    }

    /**
     * Configure container with environment-specific settings
     */
    public configureForEnvironment(container: IServiceContainer, environment: string): void {
        // Environment-specific configuration can be added here
        // For example, different logging levels, database connections, etc.

        switch (environment.toLowerCase()) {
            case 'development':
                this.configureDevelopmentServices(container);
                break;
            case 'production':
                this.configureProductionServices(container);
                break;
            case 'test':
                this.configureTestServices(container);
                break;
            default:
                // Use default configuration
                break;
        }
    }

    /**
     * Configure services for development environment
     */
    private configureDevelopmentServices(container: IServiceContainer): void {
        // Override Logger for development with more verbose logging
        container.register({
            identifier: 'Logger',
            factory: () => {
                return new SimpleLogger({
                    level: 'debug',
                    enableConsole: true,
                });
            },
            lifetime: ServiceLifetime.Singleton,
            dependencies: ['ConfigurationFactory'],
        });
    }

    /**
     * Configure services for production environment
     */
    private configureProductionServices(container: IServiceContainer): void {
        // Production-specific optimizations
        // Could include connection pooling, caching, etc.
    }

    /**
     * Configure services for test environment
     */
    private configureTestServices(container: IServiceContainer): void {
        // Test-specific configurations
        // Mock services, in-memory databases, etc.
    }

    /**
     * Validate container configuration
     */
    public async validateContainer(container: IServiceContainer): Promise<{ isValid: boolean; errors: string[] }> {
        try {
            const healthStatus = await container.getHealthStatus();
            const errors: string[] = [];

            // Check if core services are registered
            const coreServices = ['ConfigurationFactory', 'Logger'];
            for (const service of coreServices) {
                const serviceHealth = healthStatus.find(h => h.identifier === service);
                if (!serviceHealth) {
                    errors.push(`Core service '${service}' is not registered`);
                }
            }

            // Validate container integrity
            const validationErrors = await container.validate();
            if (validationErrors.length > 0) {
                errors.push(...validationErrors);
            }

            return {
                isValid: errors.length === 0,
                errors,
            };
        } catch (error) {
            return {
                isValid: false,
                errors: [`Container validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
            };
        }
    }
}

/**
 * Convenience function to get the default container
 */
export function getDefaultContainer(): IServiceContainer {
    return ContainerFactory.getInstance().getDefaultContainer();
}

/**
 * Convenience function to create a new container
 */
export function createContainer(): IServiceContainer {
    return ContainerFactory.getInstance().createContainer();
}

/**
 * Convenience function to create a test container
 */
export function createTestContainer(): IServiceContainer {
    return ContainerFactory.getInstance().createTestContainer();
}
