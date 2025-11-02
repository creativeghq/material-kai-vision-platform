import { BaseService, ServiceConfig } from '../base/BaseService';

import { DeviceType } from './types';

interface DeviceDetectorServiceConfig extends ServiceConfig {
  enableWebGPUDetection: boolean;
  enableDeviceCapabilityCache: boolean;
  cacheExpirationMs: number;
  enablePerformanceProfiling: boolean;
  fallbackDevice: DeviceType;
}

export class DeviceDetectorService extends BaseService<DeviceDetectorServiceConfig> {
  private deviceCapabilityCache: Map<string, unknown> = new Map();
  private lastCacheUpdate: number = 0;

  protected constructor(config: DeviceDetectorServiceConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Initialize device detection capabilities
    if (this.config.enableWebGPUDetection) {
      await this.executeOperation(
        () => this.initializeWebGPUDetection(),
        'initialize-webgpu-detection',
      );
    }

    // Pre-populate device capability cache if enabled
    if (this.config.enableDeviceCapabilityCache) {
      await this.executeOperation(
        () => this.populateDeviceCache(),
        'populate-device-cache',
      );
    }
  }

  protected async doHealthCheck(): Promise<void> {
    // Verify device detection capabilities are working
    const deviceInfo = await this.getDeviceInfo();

    if (!deviceInfo || !deviceInfo.optimalDevice) {
      throw new Error(
        'Device detection capabilities are not functioning properly',
      );
    }

    // Verify WebGPU detection if enabled
    if (this.config.enableWebGPUDetection && typeof navigator !== 'undefined') {
      await this.checkWebGPUSupport();
      // WebGPU support check should complete without throwing
    }
  }

  private async initializeWebGPUDetection(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      try {
        const gpu = (navigator as Record<string, unknown>).gpu;
        if (
          gpu &&
          typeof (gpu as Record<string, unknown>).requestAdapter === 'function'
        ) {
          // Test adapter availability during initialization
          const adapter = await (gpu as any).requestAdapter();
          if (adapter && this.config.enableDeviceCapabilityCache) {
            this.deviceCapabilityCache.set('webgpu-adapter', adapter);
            this.lastCacheUpdate = Date.now();
          }
        }
      } catch (error) {
        console.warn('WebGPU initialization failed:', error);
      }
    }
  }

  private async populateDeviceCache(): Promise<void> {
    const deviceInfo = this.getDeviceInfoSync();
    this.deviceCapabilityCache.set('device-info', deviceInfo);
    this.lastCacheUpdate = Date.now();
  }

  private isCacheValid(): boolean {
    if (!this.config.enableDeviceCapabilityCache) return false;
    return Date.now() - this.lastCacheUpdate < this.config.cacheExpirationMs;
  }

  public getOptimalDevice(): DeviceType {
    // Check cache first if enabled
    if (
      this.isCacheValid() &&
      this.deviceCapabilityCache.has('optimal-device')
    ) {
      return this.deviceCapabilityCache.get('optimal-device') as DeviceType;
    }

    // Check for WebGPU availability, fallback to configured fallback device
    let optimalDevice: DeviceType;
    if (
      this.config.enableWebGPUDetection &&
      typeof navigator !== 'undefined' &&
      'gpu' in navigator
    ) {
      optimalDevice = 'webgpu';
    } else {
      optimalDevice = this.config.fallbackDevice;
    }

    // Cache the result if caching is enabled
    if (this.config.enableDeviceCapabilityCache) {
      this.deviceCapabilityCache.set('optimal-device', optimalDevice);
    }

    return optimalDevice;
  }

  public async checkWebGPUSupport(): Promise<boolean> {
    return this.executeOperation(async () => {
      // Check cache first if enabled
      if (
        this.isCacheValid() &&
        this.deviceCapabilityCache.has('webgpu-support')
      ) {
        return this.deviceCapabilityCache.get('webgpu-support') as boolean;
      }

      if (!this.config.enableWebGPUDetection) {
        return false;
      }

      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        const result = false;
        if (this.config.enableDeviceCapabilityCache) {
          this.deviceCapabilityCache.set('webgpu-support', result);
        }
        return result;
      }

      try {
        const gpu = (navigator as Record<string, unknown>).gpu;
        if (
          gpu &&
          typeof (gpu as Record<string, unknown>).requestAdapter === 'function'
        ) {
          const adapter = await (gpu as any).requestAdapter();
          const result = !!adapter;

          // Cache the result if caching is enabled
          if (this.config.enableDeviceCapabilityCache) {
            this.deviceCapabilityCache.set('webgpu-support', result);
            if (adapter) {
              this.deviceCapabilityCache.set('webgpu-adapter', adapter);
            }
          }

          return result;
        }

        const result = false;
        if (this.config.enableDeviceCapabilityCache) {
          this.deviceCapabilityCache.set('webgpu-support', result);
        }
        return result;
      } catch (error) {
        console.warn('WebGPU adapter request failed:', error);
        const result = false;
        if (this.config.enableDeviceCapabilityCache) {
          this.deviceCapabilityCache.set('webgpu-support', result);
        }
        return result;
      }
    }, 'check-webgpu-support');
  }

  public async getDeviceInfo(): Promise<{
    supportsWebGPU: boolean;
    optimalDevice: DeviceType;
    userAgent: string;
  }> {
    return this.executeOperation(async () => {
      // Check cache first if enabled
      if (
        this.isCacheValid() &&
        this.deviceCapabilityCache.has('device-info-full')
      ) {
        return this.deviceCapabilityCache.get('device-info-full') as {
          supportsWebGPU: boolean;
          optimalDevice: DeviceType;
          userAgent: string;
        };
      }

      const supportsWebGPU = await this.checkWebGPUSupport();
      const optimalDevice = this.getOptimalDevice();
      const userAgent =
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';

      const deviceInfo = {
        supportsWebGPU,
        optimalDevice,
        userAgent,
      };

      // Cache the result if caching is enabled
      if (this.config.enableDeviceCapabilityCache) {
        this.deviceCapabilityCache.set('device-info-full', deviceInfo);
      }

      return deviceInfo;
    }, 'get-device-info');
  }

  private getDeviceInfoSync(): {
    supportsWebGPU: boolean;
    optimalDevice: DeviceType;
    userAgent: string;
  } {
    return {
      supportsWebGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
      optimalDevice: this.getOptimalDevice(),
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
  }

  public clearCache(): void {
    this.deviceCapabilityCache.clear();
    this.lastCacheUpdate = 0;
  }

  public getCacheStats(): {
    size: number;
    lastUpdate: number;
    isValid: boolean;
  } {
    return {
      size: this.deviceCapabilityCache.size,
      lastUpdate: this.lastCacheUpdate,
      isValid: this.isCacheValid(),
    };
  }

  // Static factory method for standardized instantiation
  public static createInstance(
    config?: Partial<DeviceDetectorServiceConfig>,
  ): DeviceDetectorService {
    const defaultConfig: DeviceDetectorServiceConfig = {
      name: 'DeviceDetectorService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      enableWebGPUDetection: true,
      enableDeviceCapabilityCache: true,
      cacheExpirationMs: 5 * 60 * 1000, // 5 minutes
      enablePerformanceProfiling: false,
      fallbackDevice: 'cpu',
    };

    const finalConfig = { ...defaultConfig, ...config };
    return new DeviceDetectorService(finalConfig);
  }
}

// Export singleton instance using factory method
export const deviceDetectorService = DeviceDetectorService.createInstance();

// Maintain backward compatibility with static methods
export class DeviceDetector {
  static getOptimalDevice(): DeviceType {
    return deviceDetectorService.getOptimalDevice();
  }

  static async checkWebGPUSupport(): Promise<boolean> {
    return deviceDetectorService.checkWebGPUSupport();
  }

  static getDeviceInfo(): Promise<{
    supportsWebGPU: boolean;
    optimalDevice: DeviceType;
    userAgent: string;
  }> {
    return deviceDetectorService.getDeviceInfo();
  }
}
