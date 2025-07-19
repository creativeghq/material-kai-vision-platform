/**
 * Abstract Singleton Base Class
 * 
 * Provides a standardized implementation of the Singleton pattern
 * as defined in ADR-002: Singleton Pattern Standardization
 */

export abstract class Singleton {
  private static instances: Map<string, Singleton> = new Map();

  /**
   * Protected constructor to prevent direct instantiation
   */
  protected constructor() {
    // Prevent instantiation outside of getInstance
  }

  /**
   * Get the singleton instance for the specific class
   * @returns The singleton instance
   */
  public static getInstance<T extends Singleton>(this: new (...args: any[]) => T): T {
    const className = this.name;
    
    if (!Singleton.instances.has(className)) {
      // Use Reflect.construct to bypass constructor visibility restrictions
      const instance = Reflect.construct(this, []);
      Singleton.instances.set(className, instance);
    }
    
    return Singleton.instances.get(className) as T;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * @param className Optional class name to reset specific instance
   */
  public static resetInstance(className?: string): void {
    if (className) {
      Singleton.instances.delete(className);
    } else {
      Singleton.instances.clear();
    }
  }

  /**
   * Check if an instance exists for the given class
   * @param className The class name to check
   * @returns True if instance exists
   */
  public static hasInstance(className: string): boolean {
    return Singleton.instances.has(className);
  }

  /**
   * Get all active singleton instances (for debugging/monitoring)
   * @returns Array of active singleton class names
   */
  public static getActiveInstances(): string[] {
    return Array.from(Singleton.instances.keys());
  }

  /**
   * Abstract method that subclasses can override for initialization logic
   */
  protected abstract initialize(): void;

  /**
   * Abstract method that subclasses can override for cleanup logic
   */
  protected abstract cleanup(): void;

  /**
   * Destroy the singleton instance and perform cleanup
   */
  public destroy(): void {
    this.cleanup();
    const className = this.constructor.name;
    Singleton.instances.delete(className);
  }
}