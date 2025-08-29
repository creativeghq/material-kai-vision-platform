/**
 * Dependency Injection Container Types
 *
 * Core type definitions for the DI container system, including service lifetimes,
 * descriptors, and container interfaces.
 */

// Optional winston logger type - will be resolved at runtime
export type Logger = {
  error: (message: string, ...meta: unknown[]) => void;
  warn: (message: string, ...meta: unknown[]) => void;
  info: (message: string, ...meta: unknown[]) => void;
  debug: (message: string, ...meta: unknown[]) => void;
  verbose: (message: string, ...meta: unknown[]) => void;
  silly: (message: string, ...meta: unknown[]) => void;
} | undefined;

/**
 * Service lifetime management options
 */
export enum ServiceLifetime {
  /** Single instance shared across the application */
  Singleton = 'singleton',
  /** New instance created for each resolution */
  Transient = 'transient',
  /** Single instance per scope (e.g., per request) */
  Scoped = 'scoped'
}

/**
 * Service identifier - can be string, symbol, or constructor function
 */
export type ServiceIdentifier<T = unknown> = string | symbol | (new (...args: unknown[]) => T);

/**
 * Factory function for creating service instances
 */
export type ServiceFactory<T = unknown> = (container: IServiceContainer) => T | Promise<T>;

/**
 * Constructor type for services
 */
export type ServiceConstructor<T = unknown> = new (...args: unknown[]) => T;

/**
 * Service resolver function type
 */
export type ServiceResolver<T = unknown> = (container: IServiceContainer) => T;

/**
 * Service descriptor defining how a service should be registered and resolved
 */
export interface IServiceDescriptor<T = unknown> {
  /** Unique identifier for the service */
  identifier: ServiceIdentifier<T>;
  /** Service lifetime management */
  lifetime: ServiceLifetime;
  /** Implementation type (constructor function) */
  implementation?: ServiceConstructor<T>;
  /** Factory function for custom instantiation */
  factory?: ServiceFactory<T>;
  /** Pre-created instance (for singleton registration) */
  instance?: T;
  /** Dependencies required by this service */
  dependencies?: ServiceIdentifier[];
  /** Configuration key for this service (integrates with ConfigFactory) */
  configKey?: string;
  /** Whether this service is required for application startup */
  required?: boolean;
  /** Tags for service categorization and filtering */
  tags?: string[];
  /** Health check function */
  healthCheck?: (instance: T) => boolean | Promise<boolean>;
}

/**
 * Service resolution context for scoped services
 */
export interface IServiceScope {
  /** Unique scope identifier */
  id: string;
  /** Scoped service instances */
  instances: Map<ServiceIdentifier, unknown>;
  /** Scope creation timestamp */
  createdAt: Date;
  /** Dispose all scoped instances */
  dispose(): Promise<void>;
}

/**
 * Service health status
 */
export interface IServiceHealth {
  /** Service identifier */
  identifier: ServiceIdentifier;
  /** Health status */
  healthy: boolean;
  /** Last health check timestamp */
  lastChecked: Date;
  /** Error message if unhealthy */
  error?: string;
}

/**
 * Container configuration options
 */
export interface IContainerOptions {
  /** Enable automatic circular dependency detection */
  detectCircularDependencies?: boolean;
  /** Maximum dependency resolution depth */
  maxResolutionDepth?: number;
  /** Enable service health monitoring */
  enableHealthChecks?: boolean;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Logger instance for container operations */
  logger?: Logger;
  /** Enable development mode features */
  developmentMode?: boolean;
}

/**
 * Service registration builder interface
 */
export interface IServiceRegistrationBuilder<T> {
  /** Set service lifetime */
  withLifetime(lifetime: ServiceLifetime): IServiceRegistrationBuilder<T>;
  /** Add dependencies */
  withDependencies(...dependencies: ServiceIdentifier[]): IServiceRegistrationBuilder<T>;
  /** Set configuration key */
  withConfig(configKey: string): IServiceRegistrationBuilder<T>;
  /** Mark as required service */
  asRequired(): IServiceRegistrationBuilder<T>;
  /** Add tags */
  withTags(...tags: string[]): IServiceRegistrationBuilder<T>;
  /** Add health check */
  withHealthCheck(healthCheck: (instance: T) => boolean | Promise<boolean>): IServiceRegistrationBuilder<T>;
  /** Complete registration */
  register(): void;
}

/**
 * Main service container interface
 */
export interface IServiceContainer {
  /**
   * Register a service with the container
   */
  register<T>(descriptor: IServiceDescriptor<T>): void;

  /**
   * Register a service using a fluent builder API
   */
  registerType<T>(
    identifier: ServiceIdentifier<T>,
    implementation: ServiceConstructor<T>
  ): IServiceRegistrationBuilder<T>;

  /**
   * Register a service using a factory function
   */
  registerFactory<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>
  ): IServiceRegistrationBuilder<T>;

  /**
   * Register a singleton instance
   */
  registerInstance<T>(
    identifier: ServiceIdentifier<T>,
    instance: T
  ): IServiceRegistrationBuilder<T>;

  /**
   * Resolve a service instance
   */
  resolve<T>(identifier: ServiceIdentifier<T>): T;

  /**
   * Resolve a service instance asynchronously
   */
  resolveAsync<T>(identifier: ServiceIdentifier<T>): Promise<T>;

  /**
   * Try to resolve a service, returning undefined if not found
   */
  tryResolve<T>(identifier: ServiceIdentifier<T>): T | undefined;

  /**
   * Check if a service is registered
   */
  isRegistered<T>(identifier: ServiceIdentifier<T>): boolean;

  /**
   * Get all registered service identifiers
   */
  getRegisteredServices(): ServiceIdentifier[];

  /**
   * Get services by tag
   */
  getServicesByTag(tag: string): ServiceIdentifier[];

  /**
   * Create a new service scope
   */
  createScope(): IServiceScope;

  /**
   * Resolve services within a specific scope
   */
  resolveScoped<T>(identifier: ServiceIdentifier<T>, scope: IServiceScope): T;

  /**
   * Get health status of all services
   */
  getHealthStatus(): Promise<IServiceHealth[]>;

  /**
   * Validate container configuration and dependencies
   */
  validate(): Promise<string[]>;

  /**
   * Dispose the container and all managed instances
   */
  dispose(): Promise<void>;
}

/**
 * Service container factory interface
 */
export interface IServiceContainerFactory {
  /**
   * Create a new service container instance
   */
  create(options?: IContainerOptions): IServiceContainer;

  /**
   * Create a child container that inherits from a parent
   */
  createChild(parent: IServiceContainer, options?: IContainerOptions): IServiceContainer;
}

/**
 * Circular dependency error
 */
export class CircularDependencyError extends Error {
  constructor(
    public readonly dependencyChain: ServiceIdentifier[],
    message?: string,
  ) {
    super(message || `Circular dependency detected: ${dependencyChain.map(d => d.toString()).join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Service not found error
 */
export class ServiceNotFoundError extends Error {
  constructor(
    public readonly identifier: ServiceIdentifier,
    message?: string,
  ) {
    super(message || `Service not found: ${identifier.toString()}`);
    this.name = 'ServiceNotFoundError';
  }
}

/**
 * Service resolution error
 */
export class ServiceResolutionError extends Error {
  constructor(
    public readonly identifier: ServiceIdentifier,
    public readonly cause: Error,
    message?: string,
  ) {
    super(message || `Failed to resolve service: ${identifier.toString()}`);
    this.name = 'ServiceResolutionError';
  }
}
