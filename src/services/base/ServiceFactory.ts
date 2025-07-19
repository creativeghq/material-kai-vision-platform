import { BaseService, ServiceConfig } from './BaseService';

/**
 * Service Registry Entry
 */
interface ServiceRegistryEntry<T extends BaseService = BaseService> {
  instance: T | null;
  config: ServiceConfig;
  factory: () => Promise<T>;
  dependencies?: string[];
}

/**
 * Service Factory
 * 
 * Centralized factory for creating and managing service instances
 * Provides dependency injection, lifecycle management, and service discovery
 */
export class ServiceFactory {
  private static instance: ServiceFactory;
  private registry: Map<string, ServiceRegistryEntry> = new Map();
  private initializationOrder: string[] = [];
  private isShuttingDown: boolean = false;

  private constructor() {}

  public static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  /**
   * Register a service with the factory
   */
  public registerService<T extends BaseService>(
    name: string,
    config: ServiceConfig,
    factory: () => Promise<T>,
    dependencies: string[] = []
  ): void {
    if (this.registry.has(name)) {
      throw new Error(`Service ${name} is already registered`);
    }

    this.registry.set(name, {
      instance: null,
      config,
      factory,
      dependencies
    });

    console.log(`Service ${name} registered with factory`);
  }

  /**
   * Get a service instance (lazy initialization)
   */
  public async getService<T extends BaseService>(name: string): Promise<T> {
    const entry = this.registry.get(name);
    if (!entry) {
      throw new Error(`Service ${name} is not registered`);
    }

    if (!entry.instance) {
      // Initialize dependencies first
      if (entry.dependencies && entry.dependencies.length > 0) {
        for (const dependency of entry.dependencies) {
          await this.getService(dependency);
        }
      }

      // Create and initialize the service
      console.log(`Initializing service: ${name}`);
      entry.instance = await entry.factory();
      await entry.instance.initialize();
      
      this.initializationOrder.push(name);
    }

    return entry.instance as T;
  }

  /**
   * Check if a service is registered
   */
  public hasService(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Get all registered service names
   */
  public getRegisteredServices(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get service configuration
   */
  public getServiceConfig(name: string): ServiceConfig | null {
    const entry = this.registry.get(name);
    return entry ? entry.config : null;
  }

  /**
   * Update service configuration
   */
  public updateServiceConfig(name: string, updates: Partial<ServiceConfig>): void {
    const entry = this.registry.get(name);
    if (!entry) {
      throw new Error(`Service ${name} is not registered`);
    }

    entry.config = { ...entry.config, ...updates };
    
    // If service is already initialized, update its config
    if (entry.instance) {
      entry.instance.updateConfig(entry.config);
    }
  }

  /**
   * Get health status of all services
   */
  public async getServicesHealth(): Promise<Record<string, any>> {
    const health: Record<string, any> = {};

    for (const [name, entry] of this.registry.entries()) {
      if (entry.instance) {
        try {
          health[name] = await entry.instance.getHealth();
        } catch (error) {
          health[name] = {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      } else {
        health[name] = {
          status: 'not_initialized',
          error: 'Service not yet initialized'
        };
      }
    }

    return health;
  }

  /**
   * Get metrics for all services
   */
  public getServicesMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};

    for (const [name, entry] of this.registry.entries()) {
      if (entry.instance) {
        metrics[name] = entry.instance.getMetrics();
      } else {
        metrics[name] = {
          serviceName: name,
          status: 'not_initialized'
        };
      }
    }

    return metrics;
  }

  /**
   * Initialize all registered services
   */
  public async initializeAllServices(): Promise<void> {
    console.log('Initializing all services...');
    
    const serviceNames = Array.from(this.registry.keys());
    
    // Sort services by dependencies
    const sortedServices = this.topologicalSort(serviceNames);
    
    for (const serviceName of sortedServices) {
      try {
        await this.getService(serviceName);
      } catch (error) {
        console.error(`Failed to initialize service ${serviceName}:`, error);
        throw error;
      }
    }

    console.log('All services initialized successfully');
  }

  /**
   * Shutdown all services in reverse order
   */
  public async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('Shutting down all services...');

    // Shutdown in reverse initialization order
    const shutdownOrder = [...this.initializationOrder].reverse();

    for (const serviceName of shutdownOrder) {
      const entry = this.registry.get(serviceName);
      if (entry?.instance) {
        try {
          await entry.instance.cleanup();
          entry.instance = null;
        } catch (error) {
          console.error(`Error shutting down service ${serviceName}:`, error);
        }
      }
    }

    this.initializationOrder = [];
    this.isShuttingDown = false;
    console.log('All services shut down');
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(serviceNames: string[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (serviceName: string) => {
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving service: ${serviceName}`);
      }
      
      if (visited.has(serviceName)) {
        return;
      }

      visiting.add(serviceName);
      
      const entry = this.registry.get(serviceName);
      if (entry?.dependencies) {
        for (const dependency of entry.dependencies) {
          visit(dependency);
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      result.push(serviceName);
    };

    for (const serviceName of serviceNames) {
      visit(serviceName);
    }

    return result;
  }

  /**
   * Clear all registrations (for testing)
   */
  public clear(): void {
    this.registry.clear();
    this.initializationOrder = [];
    this.isShuttingDown = false;
  }
}

export default ServiceFactory;