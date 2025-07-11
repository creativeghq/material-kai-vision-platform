import { MLResult, FeatureExtractionOptions } from './types';
import { ImageClassifierService } from './imageClassifier';
import { TextEmbedderService } from './textEmbedder';
import { MaterialAnalyzerService } from './materialAnalyzer';
import { DeviceDetector } from './deviceDetector';

/**
 * Main orchestrator for client-side ML operations
 * Provides a unified interface for all ML capabilities
 */
class ClientMLService {
  private imageClassifier = new ImageClassifierService();
  private textEmbedder = new TextEmbedderService();
  private materialAnalyzer = new MaterialAnalyzerService();

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