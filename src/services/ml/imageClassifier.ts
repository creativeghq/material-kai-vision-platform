import { pipeline } from '@huggingface/transformers';

import { BaseService, ServiceConfig } from '../base/BaseService';

import { MLResult, ImageClassificationResult } from './types';
import { DeviceDetector } from './deviceDetector';

// Configuration interface for ImageClassifierService
interface ImageClassifierServiceConfig extends ServiceConfig {
  modelName?: string;
  device?: string;
  enableProgressCallback?: boolean;
}

export class ImageClassifierService extends BaseService<ImageClassifierServiceConfig> {
  private classifier: any = null;

  protected async doInitialize(): Promise<void> {
    try {
      console.log('Initializing image classification model...');

      const modelName = this.config.modelName || 'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k';
      const device = this.config.device || DeviceDetector.getOptimalDevice();

      this.classifier = await pipeline(
        'image-classification',
        modelName,
        {
          device: device as any, // Type assertion to handle device type mismatch
          progress_callback: this.config.enableProgressCallback ? (progress: any) => {
            console.log(`Image classifier loading: ${Math.round(progress.progress * 100)}%`);
          } : undefined,
        },
      );

      console.log('Image classification model initialized successfully');
    } catch (error) {
      const errorMessage = `Image classifier initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }

  protected async doHealthCheck(): Promise<void> {
    try {
      if (!this.classifier) {
        throw new Error('Image classifier not available');
      }

      // Perform a simple health check by checking if the classifier is available
      // We don't run an actual classification to avoid unnecessary computation
      if (!(typeof this.classifier === 'function' || (this.classifier && typeof this.classifier.call === 'function'))) {
        throw new Error('Image classifier is not callable');
      }
    } catch (error) {
      console.warn('Image classifier health check failed', error);
      throw error;
    }
  }

  async classify(imageSource: string | File | Blob): Promise<MLResult> {
    return this.executeOperation(async () => {
      await this.initialize();

      if (!this.classifier) {
        throw new Error('Image classifier not available');
      }

      const results = await this.classifier(imageSource) as ImageClassificationResult[];

      return {
        success: true,
        data: results,
        confidence: results[0]?.score || 0,
        processingTime: 0, // Will be set by executeOperation
      };
    }, 'classify');
  }

  getModelInfo(): { name: string; initialized: boolean } {
    const modelName = this.config.modelName || 'mobilenetv4_conv_small.e2400_r224_in1k';
    return {
      name: modelName,
      initialized: this.isInitialized,
    };
  }

  async getClassificationStatus(): Promise<{
    modelName: string;
    initialized: boolean;
    health: string;
    totalClassifications: number;
    averageProcessingTime: number;
  }> {
    const metrics = this.getMetrics();
    const health = await this.getHealth();
    const modelName = this.config.modelName || 'mobilenetv4_conv_small.e2400_r224_in1k';

    return {
      modelName,
      initialized: this.isInitialized,
      health: health.status,
      totalClassifications: metrics.requestCount,
      averageProcessingTime: metrics.averageLatency,
    };
  }

  // Static factory method for standardized instantiation
  static createInstance(config: Partial<ImageClassifierServiceConfig> = {}): ImageClassifierService {
    const defaultConfig: ImageClassifierServiceConfig = {
      name: 'ImageClassifierService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      modelName: 'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
      enableProgressCallback: true,
      timeout: 30000,
      retries: 3,
      rateLimit: {
        requestsPerMinute: 60,
      },
      healthCheck: {
        enabled: true,
        interval: 300000, // 5 minutes
      },
      ...config,
    };

    return new ImageClassifierService(defaultConfig);
  }
}

// Export singleton instance for backward compatibility
export const imageClassifierService = ImageClassifierService.getInstance<ImageClassifierService>();
