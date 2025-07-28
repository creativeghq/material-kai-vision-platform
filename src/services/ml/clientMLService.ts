import { MLResult, FeatureExtractionOptions } from './types';
import { ImageClassifierService } from './imageClassifier';
import { TextEmbedderService } from './textEmbedder';
import { MaterialAnalyzerService } from './materialAnalyzer';
import { DeviceDetector } from './deviceDetector';
import { BaseService, ServiceConfig } from '../base/BaseService';

/**
 * Configuration interface for ClientMLService
 */
interface ClientMLServiceConfig extends ServiceConfig {
  enableImageClassification?: boolean;
  enableTextEmbedding?: boolean;
  enableMaterialAnalysis?: boolean;
  preloadModelsOnInit?: boolean;
  deviceOptimization?: boolean;
  maxConcurrentOperations?: number;
  enableCaching?: boolean;
  cacheExpirationMs?: number;
}

/**
 * Main orchestrator for client-side ML operations
 * Provides a unified interface for all ML capabilities
 */
class ClientMLService extends BaseService<ClientMLServiceConfig> {
  private imageClassifier?: ImageClassifierService;
  private textEmbedder?: TextEmbedderService;
  private materialAnalyzer?: MaterialAnalyzerService;

  protected constructor(config: ClientMLServiceConfig) {
    super(config);
  }

  /**
   * Factory method to create ClientMLService instance
   */
  static createInstance(config: Partial<ClientMLServiceConfig> = {}): ClientMLService {
const defaultConfig: ClientMLServiceConfig = {
      name: 'ClientMLService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      enableImageClassification: true,
      enableTextEmbedding: true,
      enableMaterialAnalysis: true,
      preloadModelsOnInit: false,
      deviceOptimization: true,
      maxConcurrentOperations: 3,
      enableCaching: true,
      cacheExpirationMs: 300000, // 5 minutes
      timeout: 30000,
      retries: 3,
      rateLimit: {
        requestsPerMinute: 60
      },
      healthCheck: {
        enabled: true,
        interval: 300000
      },
      ...config
    };
    return new ClientMLService(defaultConfig);
  }

  /**
   * Initialize the service and its dependencies
   */
  protected async doInitialize(): Promise<void> {
    // Initialize sub-services based on configuration
    if (this.config.enableImageClassification) {
      this.imageClassifier = new ImageClassifierService({
        name: 'ImageClassifierService',
        version: '1.0.0',
        environment: 'development',
        enabled: true
      });
    }
    
    if (this.config.enableTextEmbedding) {
      this.textEmbedder = new TextEmbedderService({
        name: 'TextEmbedderService',
        version: '1.0.0',
        environment: 'development',
        enabled: true
      });
    }
    
    if (this.config.enableMaterialAnalysis) {
      this.materialAnalyzer = new MaterialAnalyzerService({
        name: 'MaterialAnalyzerService',
        version: '1.0.0',
        environment: 'development',
        enabled: true
      });
    }

    // Preload models if configured
    if (this.config.preloadModelsOnInit) {
      await this.preloadModels();
    }
  }

  /**
   * Perform health check on the service
   */
  protected async doHealthCheck(): Promise<void> {
    // Check device capabilities
    const deviceInfo = await DeviceDetector.getDeviceInfo();
    if (!deviceInfo.supportsWebGPU) {
      console.warn('WebGPU not available, falling back to CPU processing');
    }

    // Check sub-services if they exist
    if (this.imageClassifier && !this.imageClassifier.isReady) {
      throw new Error('Image classifier service not properly initialized');
    }
    
    if (this.textEmbedder && !this.textEmbedder.isReady) {
      throw new Error('Text embedder service not properly initialized');
    }
  }

  /**
   * Classify an image using the image classification model
   */
  async classifyImage(imageSource: string | File | Blob): Promise<MLResult> {
    if (!this.imageClassifier) {
      throw new Error('Image classifier not initialized');
    }
    return this.imageClassifier.classify(imageSource);
  }

  /**
   * Generate text embeddings for semantic analysis
   */
  async generateTextEmbedding(
    text: string | string[], 
    options: FeatureExtractionOptions = { pooling: 'mean', normalize: true }
  ): Promise<MLResult> {
    if (!this.textEmbedder) {
      throw new Error('Text embedder not initialized');
    }
    return this.textEmbedder.generateEmbedding(text, options);
  }

  /**
   * Perform comprehensive material analysis combining image and text
   */
  async analyzeMaterial(imageSource: string | File | Blob, description?: string): Promise<MLResult> {
    if (!this.materialAnalyzer) {
      throw new Error('Material analyzer not initialized');
    }
    return this.materialAnalyzer.analyzeMaterial(imageSource, description);
  }

  /**
   * Preload all ML models for faster subsequent operations
   */
  async preloadModels(): Promise<void> {
    try {
      if (this.imageClassifier) {
        await this.imageClassifier.initialize();
      }
      if (this.textEmbedder) {
        await this.textEmbedder.initialize();
      }
      if (this.materialAnalyzer) {
        await this.materialAnalyzer.initialize();
      }
      console.log('All ML models preloaded successfully');
    } catch (error) {
      console.error('Failed to preload ML models:', error);
      throw error;
    }
  }

  /**
   * Get the current status of all ML services
   */
  async getStatus(): Promise<{ 
    initialized: boolean; 
    models: string[];
    device: string;
  }> {
    const deviceInfo = await DeviceDetector.getDeviceInfo();
    const imageStatus = this.imageClassifier ? true : false;
    const textStatus = this.textEmbedder ? true : false;
    
    return {
      initialized: imageStatus && textStatus,
      models: [
        imageStatus ? 'image-classifier' : '',
        textStatus ? 'text-embedder' : ''
      ].filter(Boolean),
      device: deviceInfo.optimalDevice
    };
  }

  /**
   * Get detailed status for debugging
   */
  async getDetailedStatus() {
    const deviceInfo = await DeviceDetector.getDeviceInfo();
    return {
      services: {
        imageClassifier: this.imageClassifier ? 'initialized' : 'not initialized',
        textEmbedder: this.textEmbedder ? 'initialized' : 'not initialized',
        materialAnalyzer: this.materialAnalyzer ? 'initialized' : 'not initialized'
      },
      device: deviceInfo
    };
  }
}

// Export singleton instance using factory method  
export const clientMLService = ClientMLService.createInstance();
export { ClientMLService };

// Re-export types for convenience
export * from './types';