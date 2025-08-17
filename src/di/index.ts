/**
 * Dependency Injection Container System
 *
 * This module provides a comprehensive dependency injection container for the microservice PDF2MD system.
 * It includes service registration, resolution, lifecycle management, and integration with the existing
 * configuration system.
 *
 * @example
 * ```typescript
 * import { getDefaultContainer, ServiceLifetime } from './di';
 *
 * // Get the default container with pre-configured services
 * const container = getDefaultContainer();
 *
 * // Register a service
 * container.register({
 *   identifier: 'MyService',
 *   implementation: MyServiceClass,
 *   lifetime: ServiceLifetime.Singleton,
 *   dependencies: ['Logger', 'DocumentChunkingConfig']
 * });
 *
 * // Resolve a service
 * const myService = container.resolve<MyServiceClass>('MyService');
 * ```
 */

// Core types and interfaces
export type {
  ServiceIdentifier,
  ServiceConstructor,
  ServiceFactory,
  ServiceResolver,
  Logger,
  IServiceDescriptor,
  IServiceScope,
  IServiceHealth,
  IContainerOptions,
  IServiceRegistrationBuilder,
  IServiceContainer,
} from './types.js';

// Service interface contracts
export * from './interfaces.js';

export {
  ServiceLifetime,
  CircularDependencyError,
  ServiceNotFoundError,
  ServiceResolutionError,
} from './types.js';

// Core container implementation
export {
  ServiceContainer,
  ServiceRegistrationBuilder,
  ServiceScope,
} from './container.js';

// Container factory and convenience functions
export {
  ContainerFactory,
  getDefaultContainer,
  createContainer,
  createTestContainer,
} from './containerFactory.js';

/**
 * Re-export commonly used types for convenience
 */
export type {
  // Configuration types from the config system
  AppConfig,
  DocumentChunkingConfig,
  EmbeddingGenerationConfig,
  MivaaToRagTransformerConfig,
  BatchProcessingConfig,
  ValidationIntegrationConfig,
  PerformanceConfig,
  ExternalDependenciesConfig,
} from '../config/types.js';


/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Feature flags for the DI system
 */
export const FEATURES = {
  CIRCULAR_DEPENDENCY_DETECTION: true,
  HEALTH_CHECKS: true,
  SCOPED_SERVICES: true,
  CONFIG_INTEGRATION: true,
  ASYNC_RESOLUTION: true,
} as const;
