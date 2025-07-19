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
      enableImageClassification: true,
      enableTextEmbedding: true,
      enableMaterialAnalysis: true,
      preloadModelsOnInit: false,
      deviceOptimization: true,
      maxConcurrentOperations: 3,
      enableCaching: true,
      cacheExpirationMs: 300000, // 5 minutes
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
      this.imageClassifier = new ImageClassifierService();
    }
    
    if (this.config.enableTextEmbedding) {
      this.textEmbedder = new TextEmbedderService();
    }
    
    if (this.config.enableMaterialAnalysis) {
      this.materialAnalyzer = new MaterialAnalyzerService();
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
    const deviceInfo = DeviceDetector.getDeviceInfo();
    if (!deviceInfo.webgl && !deviceInfo.webgpu) {
      throw new Error('No suitable ML acceleration available (WebGL/WebGPU)');
    }

    // Check sub-services if they exist
    if (this.imageClassifier && !this.imageClassifier.isInitialized()) {
      throw new Error('Image classifier service not properly initialized');
    }
    
    if (this.textEmbedder && !this.textEmbedder.isInitialized()) {
      throw new Error('Text embedder service not properly initialized');
    }
  }

  /**
   * Classify an image using the image classification model
   */
  async classifyImage(imageSource: string | File | Blob): Promise<MLResult> {
    return this.imageClassifier.classify(imageSource);
  }

  /**
   * Generate text embeddings for semantic analysis
   */
  async generateTextEmbedding(
    text: string | string[], 
    options: FeatureExtractionOptions = { pooling: 'mean', normalize: true }
  ): Promise<MLResult> {
    return this.textEmbedder.generateEmbedding(text, options);
  }

  /**
   * Perform comprehensive material analysis combining image and text
   */
  async analyzeMaterial(imageSource: string | File | Blob, description?: string): Promise<MLResult> {
    return this.materialAnalyzer.analyzeMaterial(imageSource, description);
  }

  /**
   * Preload all ML models for faster subsequent operations
   */
  async preloadModels(): Promise<void> {
    try {
      await this.materialAnalyzer.preloadModels();
      console.log('All ML models preloaded successfully');
    } catch (error) {
      console.error('Failed to preload ML models:', error);
      throw error;
    }
  }

  /**
   * Get the current status of all ML services
   */
  getStatus(): { 
    initialized: boolean; 
    models: string[];
    device: string;
    deviceInfo: ReturnType<typeof DeviceDetector.getDeviceInfo>;
  } {
    const imageStatus = this.imageClassifier.isInitialized();
    const textStatus = this.textEmbedder.isInitialized();
    
    return {
      initialized: imageStatus && textStatus,
      models: [
        imageStatus ? 'image-classifier' : '',
        textStatus ? 'text-embedder' : ''
      ].filter(Boolean),
      device: DeviceDetector.getOptimalDevice(),
      deviceInfo: DeviceDetector.getDeviceInfo()
    };
  }

  /**
   * Get detailed status for debugging
   */
  getDetailedStatus() {
    return {
      services: {
        imageClassifier: this.imageClassifier.getModelInfo(),
        textEmbedder: this.textEmbedder.getModelInfo(),
        materialAnalyzer: this.materialAnalyzer.getStatus()
      },
      device: DeviceDetector.getDeviceInfo()
    };
  }
}

export const clientMLService = new ClientMLService();
export { ClientMLService };

// Re-export types for convenience
export * from './types';