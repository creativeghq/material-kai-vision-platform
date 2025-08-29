/**
 * Dependency Injection Container Implementation
 *
 * Core implementation of the DI container with service registration, resolution,
 * lifecycle management, and circular dependency detection.
 */

import {
  IServiceContainer,
  IServiceDescriptor,
  IServiceScope,
  IServiceHealth,
  IContainerOptions,
  IServiceRegistrationBuilder,
  ServiceIdentifier,
  ServiceFactory,
  ServiceConstructor,
  ServiceLifetime,
  CircularDependencyError,
  ServiceNotFoundError,
  ServiceResolutionError,
  Logger,
} from './types';

/**
 * Service registration builder implementation
 */
export class ServiceRegistrationBuilder<T> implements IServiceRegistrationBuilder<T> {
  private descriptor: IServiceDescriptor<T>;

  constructor(
    private container: ServiceContainer,
    identifier: ServiceIdentifier<T>,
    implementation?: ServiceConstructor<T>,
    factory?: ServiceFactory<T>,
    instance?: T,
  ) {
    this.descriptor = {
      identifier,
      lifetime: ServiceLifetime.Transient,
      dependencies: [],
      required: false,
      tags: [],
    };

    if (implementation) {
      this.descriptor.implementation = implementation;
    }
    if (factory) {
      this.descriptor.factory = factory;
    }
    if (instance) {
      this.descriptor.instance = instance;
    }
  }

  withLifetime(lifetime: ServiceLifetime): IServiceRegistrationBuilder<T> {
    this.descriptor.lifetime = lifetime;
    return this;
  }

  withDependencies(...dependencies: ServiceIdentifier[]): IServiceRegistrationBuilder<T> {
    this.descriptor.dependencies = dependencies;
    return this;
  }

  withConfig(configKey: string): IServiceRegistrationBuilder<T> {
    this.descriptor.configKey = configKey;
    return this;
  }

  asRequired(): IServiceRegistrationBuilder<T> {
    this.descriptor.required = true;
    return this;
  }

  withTags(...tags: string[]): IServiceRegistrationBuilder<T> {
    this.descriptor.tags = [...(this.descriptor.tags || []), ...tags];
    return this;
  }

  withHealthCheck(healthCheck: (instance: T) => boolean | Promise<boolean>): IServiceRegistrationBuilder<T> {
    this.descriptor.healthCheck = healthCheck;
    return this;
  }

  register(): void {
    this.container.register(this.descriptor);
  }
}

/**
 * Service scope implementation
 */
export class ServiceScope implements IServiceScope {
  public readonly id: string;
  public readonly instances: Map<ServiceIdentifier, unknown>;
  public readonly createdAt: Date;

  constructor(id: string) {
    this.id = id;
    this.instances = new Map();
    this.createdAt = new Date();
  }

  async dispose(): Promise<void> {
    // Dispose instances in reverse order of creation
    const instances = Array.from(this.instances.values()).reverse();

    for (const instance of instances) {
      if (instance && typeof instance === 'object' && instance !== null && 'dispose' in instance && typeof (instance as { dispose: unknown }).dispose === 'function') {
        try {
          await (instance as { dispose: () => Promise<void> }).dispose();
        } catch (error) {
          // Log disposal errors but continue with other instances
          console.warn('Error disposing service instance:', error);
        }
      }
    }

    this.instances.clear();
  }
}

/**
 * Main service container implementation
 */
export class ServiceContainer implements IServiceContainer {
  private readonly services: Map<ServiceIdentifier, IServiceDescriptor> = new Map();
  private readonly singletonInstances: Map<ServiceIdentifier, unknown> = new Map();
  private readonly options: Required<IContainerOptions>;
  private readonly logger?: Logger;
  private healthCheckInterval?: NodeJS.Timeout;
  private disposed = false;

  constructor(options: IContainerOptions = {}) {
    this.options = {
      detectCircularDependencies: options.detectCircularDependencies ?? true,
      maxResolutionDepth: options.maxResolutionDepth ?? 50,
      enableHealthChecks: options.enableHealthChecks ?? false,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
      logger: options.logger,
      developmentMode: options.developmentMode ?? false,
    };

    this.logger = this.options.logger;

    if (this.options.enableHealthChecks) {
      this.startHealthChecking();
    }
  }

  register<T>(descriptor: IServiceDescriptor<T>): void {
    if (this.disposed) {
      throw new Error('Cannot register services on a disposed container');
    }

    this.validateDescriptor(descriptor);
    this.services.set(descriptor.identifier, descriptor);

    this.log('debug', `Registered service: ${this.getServiceName(descriptor.identifier)} (${descriptor.lifetime})`);
  }

  registerType<T>(
    identifier: ServiceIdentifier<T>,
    implementation: ServiceConstructor<T>,
  ): IServiceRegistrationBuilder<T> {
    return new ServiceRegistrationBuilder(this, identifier, implementation);
  }

  registerFactory<T>(
    identifier: ServiceIdentifier<T>,
    factory: ServiceFactory<T>,
  ): IServiceRegistrationBuilder<T> {
    return new ServiceRegistrationBuilder(this, identifier, undefined, factory);
  }

  registerInstance<T>(
    identifier: ServiceIdentifier<T>,
    instance: T,
  ): IServiceRegistrationBuilder<T> {
    return new ServiceRegistrationBuilder(this, identifier, undefined, undefined, instance);
  }

  resolve<T>(identifier: ServiceIdentifier<T>): T {
    if (this.disposed) {
      throw new Error('Cannot resolve services from a disposed container');
    }

    return this.resolveInternal(identifier, new Set(), 0);
  }

  async resolveAsync<T>(identifier: ServiceIdentifier<T>): Promise<T> {
    if (this.disposed) {
      throw new Error('Cannot resolve services from a disposed container');
    }

    return this.resolveInternalAsync(identifier, new Set(), 0);
  }

  tryResolve<T>(identifier: ServiceIdentifier<T>): T | undefined {
    try {
      return this.resolve(identifier);
    } catch (error) {
      if (error instanceof ServiceNotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  isRegistered<T>(identifier: ServiceIdentifier<T>): boolean {
    return this.services.has(identifier);
  }

  getRegisteredServices(): ServiceIdentifier[] {
    return Array.from(this.services.keys());
  }

  getServicesByTag(tag: string): ServiceIdentifier[] {
    const result: ServiceIdentifier[] = [];

    for (const [identifier, descriptor] of Array.from(this.services.entries())) {
      if (descriptor.tags?.includes(tag)) {
        result.push(identifier);
      }
    }

    return result;
  }

  createScope(): IServiceScope {
    return new ServiceScope(`scope-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  resolveScoped<T>(identifier: ServiceIdentifier<T>, scope: IServiceScope): T {
    if (this.disposed) {
      throw new Error('Cannot resolve services from a disposed container');
    }

    const descriptor = this.services.get(identifier);
    if (!descriptor) {
      throw new ServiceNotFoundError(identifier);
    }

    if (descriptor.lifetime === ServiceLifetime.Scoped) {
      // Check if already resolved in this scope
      if (scope.instances.has(identifier)) {
        return scope.instances.get(identifier);
      }

      // Resolve and cache in scope
      const instance = this.createInstance(descriptor, new Set(), 0, scope);
      scope.instances.set(identifier, instance);
      return instance;
    }

    // For non-scoped services, use regular resolution
    return this.resolve(identifier);
  }

  async getHealthStatus(): Promise<IServiceHealth[]> {
    const healthStatuses: IServiceHealth[] = [];

    for (const [identifier, descriptor] of Array.from(this.services.entries())) {
      if (!descriptor.healthCheck) {
        continue;
      }

      let healthy = false;
      let error: string | undefined;

      try {
        // Get instance for health check
        let instance: unknown;

        if (descriptor.lifetime === ServiceLifetime.Singleton && this.singletonInstances.has(identifier)) {
          instance = this.singletonInstances.get(identifier);
        } else if (descriptor.instance) {
          instance = descriptor.instance;
        } else {
          // Skip health check for non-instantiated transient services
          continue;
        }

        const result = descriptor.healthCheck(instance);
        healthy = result instanceof Promise ? await result : result;
      } catch (err) {
        healthy = false;
        error = err instanceof Error ? err.message : String(err);
      }

      healthStatuses.push({
        identifier,
        healthy,
        lastChecked: new Date(),
        ...(error && { error }),
      });
    }

    return healthStatuses;
  }

  async validate(): Promise<string[]> {
    const errors: string[] = [];

    // Check for circular dependencies
    if (this.options.detectCircularDependencies) {
      for (const identifier of Array.from(this.services.keys())) {
        try {
          this.checkCircularDependencies(identifier, new Set());
        } catch (error) {
          if (error instanceof CircularDependencyError) {
            errors.push(error.message);
          }
        }
      }
    }

    // Check for missing dependencies
    for (const [identifier, descriptor] of Array.from(this.services.entries())) {
      if (descriptor.dependencies) {
        for (const dependency of descriptor.dependencies) {
          if (!this.services.has(dependency)) {
            errors.push(`Service ${this.getServiceName(identifier)} depends on unregistered service ${this.getServiceName(dependency)}`);
          }
        }
      }
    }

    // Validate required services can be instantiated
    for (const [identifier, descriptor] of Array.from(this.services.entries())) {
      if (descriptor.required) {
        try {
          // Try to resolve without actually creating the instance
          this.validateCanResolve(identifier, new Set(), 0);
        } catch (error) {
          errors.push(`Required service ${this.getServiceName(identifier)} cannot be resolved: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return errors;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Stop health checking
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Dispose singleton instances in reverse order of creation
    const instances = Array.from(this.singletonInstances.values()).reverse();

    for (const instance of instances) {
      if (instance && typeof instance === 'object' && instance !== null && 'dispose' in instance && typeof (instance as { dispose: unknown }).dispose === 'function') {
        try {
          await (instance as { dispose: () => Promise<void> }).dispose();
        } catch (error) {
          this.log('warn', `Error disposing singleton instance: ${error}`);
        }
      }
    }

    this.singletonInstances.clear();
    this.services.clear();

    this.log('info', 'Container disposed');
  }

  // Private methods

  private resolveInternal<T>(
    identifier: ServiceIdentifier<T>,
    resolutionChain: Set<ServiceIdentifier>,
    depth: number,
  ): T {
    if (depth > this.options.maxResolutionDepth) {
      throw new ServiceResolutionError(
        identifier,
        new Error(`Maximum resolution depth (${this.options.maxResolutionDepth}) exceeded`),
      );
    }

    if (this.options.detectCircularDependencies && resolutionChain.has(identifier)) {
      throw new CircularDependencyError(Array.from(resolutionChain));
    }

    const descriptor = this.services.get(identifier);
    if (!descriptor) {
      throw new ServiceNotFoundError(identifier);
    }

    // Handle singleton lifetime
    if (descriptor.lifetime === ServiceLifetime.Singleton) {
      if (this.singletonInstances.has(identifier)) {
        return this.singletonInstances.get(identifier) as T;
      }

      const instance = this.createInstance(descriptor, resolutionChain, depth);
      this.singletonInstances.set(identifier, instance);
      return instance;
    }

    // Handle transient and scoped (scoped handled in resolveScoped)
    return this.createInstance(descriptor, resolutionChain, depth);
  }

  private async resolveInternalAsync<T>(
    identifier: ServiceIdentifier<T>,
    resolutionChain: Set<ServiceIdentifier>,
    depth: number,
  ): Promise<T> {
    // For now, delegate to sync resolution
    // In the future, this could handle async factories
    return this.resolveInternal(identifier, resolutionChain, depth);
  }

  private createInstance<T>(
    descriptor: IServiceDescriptor<T>,
    resolutionChain: Set<ServiceIdentifier>,
    depth: number,
    scope?: IServiceScope,
  ): T {
    try {
      resolutionChain.add(descriptor.identifier);

      // Use pre-created instance
      if (descriptor.instance) {
        return descriptor.instance;
      }

      // Use factory function
      if (descriptor.factory) {
        const result = descriptor.factory(this);
        // Handle both sync and async factory results
        if (result instanceof Promise) {
          throw new ServiceResolutionError(
            descriptor.identifier,
            new Error('Async factories are not supported in synchronous resolution. Use resolveAsync instead.'),
          );
        }
        return result;
      }

      // Use constructor
      if (descriptor.implementation) {
        const dependencies = this.resolveDependencies(descriptor, resolutionChain, depth, scope);
        return new descriptor.implementation(...dependencies);
      }

      throw new ServiceResolutionError(
        descriptor.identifier,
        new Error('No implementation, factory, or instance provided'),
      );
    } catch (error) {
      if (error instanceof CircularDependencyError || error instanceof ServiceNotFoundError) {
        throw error;
      }
      throw new ServiceResolutionError(descriptor.identifier, error as Error);
    } finally {
      resolutionChain.delete(descriptor.identifier);
    }
  }

  private resolveDependencies(
    descriptor: IServiceDescriptor,
    resolutionChain: Set<ServiceIdentifier>,
    depth: number,
    scope?: IServiceScope,
  ): unknown[] {
    if (!descriptor.dependencies || descriptor.dependencies.length === 0) {
      return [];
    }

    return descriptor.dependencies.map(dependency => {
      if (scope) {
        return this.resolveScoped(dependency, scope);
      }
      return this.resolveInternal(dependency, resolutionChain, depth + 1);
    });
  }

  private validateDescriptor<T>(descriptor: IServiceDescriptor<T>): void {
    if (!descriptor.identifier) {
      throw new Error('Service descriptor must have an identifier');
    }

    const hasImplementation = !!descriptor.implementation;
    const hasFactory = !!descriptor.factory;
    const hasInstance = descriptor.instance !== undefined;

    const implementationCount = [hasImplementation, hasFactory, hasInstance].filter(Boolean).length;

    if (implementationCount === 0) {
      throw new Error('Service descriptor must have either implementation, factory, or instance');
    }

    if (implementationCount > 1) {
      throw new Error('Service descriptor cannot have multiple implementation types');
    }

    if (hasInstance && descriptor.lifetime !== ServiceLifetime.Singleton) {
      throw new Error('Pre-created instances can only be registered as singletons');
    }
  }

  private checkCircularDependencies(
    identifier: ServiceIdentifier,
    visited: Set<ServiceIdentifier>,
  ): void {
    if (visited.has(identifier)) {
      throw new CircularDependencyError(Array.from(visited));
    }

    const descriptor = this.services.get(identifier);
    if (!descriptor || !descriptor.dependencies) {
      return;
    }

    visited.add(identifier);

    for (const dependency of descriptor.dependencies) {
      this.checkCircularDependencies(dependency, new Set(visited));
    }

    visited.delete(identifier);
  }

  private validateCanResolve(
    identifier: ServiceIdentifier,
    visited: Set<ServiceIdentifier>,
    depth: number,
  ): void {
    if (depth > this.options.maxResolutionDepth) {
      throw new Error('Maximum resolution depth exceeded');
    }

    if (visited.has(identifier)) {
      throw new CircularDependencyError(Array.from(visited));
    }

    const descriptor = this.services.get(identifier);
    if (!descriptor) {
      throw new ServiceNotFoundError(identifier);
    }

    visited.add(identifier);

    if (descriptor.dependencies) {
      for (const dependency of descriptor.dependencies) {
        this.validateCanResolve(dependency, new Set(visited), depth + 1);
      }
    }

    visited.delete(identifier);
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthStatuses = await this.getHealthStatus();
        const unhealthyServices = healthStatuses.filter(status => !status.healthy);

        if (unhealthyServices.length > 0) {
          this.log('warn', `Unhealthy services detected: ${unhealthyServices.map(s => this.getServiceName(s.identifier)).join(', ')}`);
        }
      } catch (error) {
        this.log('error', `Health check failed: ${error}`);
      }
    }, this.options.healthCheckInterval);
  }

  private getServiceName(identifier: ServiceIdentifier): string {
    if (typeof identifier === 'string') {
      return identifier;
    }
    if (typeof identifier === 'symbol') {
      return identifier.toString();
    }
    if (typeof identifier === 'function') {
      return identifier.name || 'Anonymous';
    }
    return String(identifier);
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    if (this.logger) {
      this.logger[level](`[DI Container] ${message}`);
    } else if (this.options.developmentMode) {
      console.log(`[DI Container] ${level.toUpperCase()}: ${message}`);
    }
  }
}
