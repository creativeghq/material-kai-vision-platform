import { DeviceType } from './types';

export class DeviceDetector {
  static getOptimalDevice(): DeviceType {
    // Check for WebGPU availability, fallback to CPU
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      return 'webgpu';
    }
    return 'cpu';
  }

  static async checkWebGPUSupport(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return false;
    }

    try {
      const gpu = (navigator as any).gpu;
      if (gpu && typeof gpu.requestAdapter === 'function') {
        const adapter = await gpu.requestAdapter();
        return !!adapter;
      }
      return false;
    } catch (error) {
      console.warn('WebGPU adapter request failed:', error);
      return false;
    }
  }

  static getDeviceInfo(): { 
    supportsWebGPU: boolean; 
    optimalDevice: DeviceType;
    userAgent: string;
  } {
    return {
      supportsWebGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
      optimalDevice: this.getOptimalDevice(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };
  }
}