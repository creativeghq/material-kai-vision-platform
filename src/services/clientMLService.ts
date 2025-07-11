import { pipeline } from '@huggingface/transformers';

export interface MLResult {
  success: boolean;
  data?: any;
  error?: string;
  confidence?: number;
  processingTime?: number;
}

export interface ImageClassificationResult {
  label: string;
  score: number;
}

export interface TextEmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export interface FeatureExtractionOptions {
  pooling?: 'mean' | 'cls';
  normalize?: boolean;
}

class ClientMLService {
  private imageClassifier: any = null;
  private textEmbedder: any = null;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;

  private async initializeModels(): Promise<void> {
    if (this.isInitializing || this.initializationPromise) {
      return this.initializationPromise!;
    }

    this.isInitializing = true;
    this.initializationPromise = this._initialize();
    
    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('Initializing ML models...');
      
      // Initialize image classification model (lightweight for web)
      this.imageClassifier = await pipeline(
        'image-classification',
        'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
        { 
          device: this.getOptimalDevice(),
          progress_callback: (progress: any) => {
            console.log('Image classifier loading:', Math.round(progress.progress * 100) + '%');
          }
        }
      );

      // Initialize text embedding model (small but effective)
      this.textEmbedder = await pipeline(
        'feature-extraction',
        'mixedbread-ai/mxbai-embed-xsmall-v1',
        { 
          device: this.getOptimalDevice(),
          progress_callback: (progress: any) => {
            console.log('Text embedder loading:', Math.round(progress.progress * 100) + '%');
          }
        }
      );

      console.log('ML models initialized successfully');
    } catch (error) {
      console.error('Failed to initialize ML models:', error);
      throw new Error(`ML initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getOptimalDevice(): 'webgpu' | 'cpu' {
    // Check for WebGPU availability, fallback to CPU
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      return 'webgpu';
    }
    return 'cpu';
  }

  async classifyImage(imageSource: string | File | Blob): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      await this.initializeModels();
      
      if (!this.imageClassifier) {
        throw new Error('Image classifier not available');
      }

      const results = await this.imageClassifier(imageSource) as ImageClassificationResult[];
      const processingTime = performance.now() - startTime;

      return {
        success: true,
        data: results,
        confidence: results[0]?.score || 0,
        processingTime: Math.round(processingTime)
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      console.error('Image classification failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Classification failed',
        processingTime: Math.round(processingTime)
      };
    }
  }

  async generateTextEmbedding(
    text: string | string[], 
    options: FeatureExtractionOptions = { pooling: 'mean', normalize: true }
  ): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      await this.initializeModels();
      
      if (!this.textEmbedder) {
        throw new Error('Text embedder not available');
      }

      const embeddings = await this.textEmbedder(text, options);
      const processingTime = performance.now() - startTime;

      // Handle single text vs array
      const embeddingData = Array.isArray(text) 
        ? embeddings.tolist()
        : embeddings.tolist()[0];

      const result: TextEmbeddingResult = Array.isArray(text)
        ? {
            embedding: embeddingData,
            dimensions: embeddingData[0]?.length || 0
          }
        : {
            embedding: embeddingData,
            dimensions: embeddingData?.length || 0
          };

      return {
        success: true,
        data: result,
        processingTime: Math.round(processingTime)
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      console.error('Text embedding generation failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Embedding generation failed',
        processingTime: Math.round(processingTime)
      };
    }
  }

  async analyzeMaterial(imageSource: string | File | Blob, description?: string): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      const imageAnalysis = await this.classifyImage(imageSource);
      let textAnalysis = null;

      if (description) {
        textAnalysis = await this.generateTextEmbedding(description);
      }

      const processingTime = performance.now() - startTime;

      return {
        success: imageAnalysis.success && (!description || textAnalysis?.success),
        data: {
          image: imageAnalysis.data,
          text: textAnalysis?.data,
          combined: {
            materialType: this.extractMaterialType(imageAnalysis.data),
            confidence: imageAnalysis.confidence,
            features: imageAnalysis.data?.slice(0, 3) || []
          }
        },
        confidence: imageAnalysis.confidence,
        processingTime: Math.round(processingTime)
      };
    } catch (error) {
      const processingTime = performance.now() - startTime;
      console.error('Material analysis failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Material analysis failed',
        processingTime: Math.round(processingTime)
      };
    }
  }

  private extractMaterialType(classificationResults: ImageClassificationResult[]): string {
    if (!classificationResults || classificationResults.length === 0) {
      return 'unknown';
    }

    const topResult = classificationResults[0];
    const label = topResult.label.toLowerCase();

    // Map common labels to material categories
    const materialMappings: Record<string, string> = {
      'wood': 'wood',
      'metal': 'metals',
      'plastic': 'plastics',
      'fabric': 'textiles',
      'ceramic': 'ceramics',
      'glass': 'glass',
      'concrete': 'concrete',
      'rubber': 'rubber',
      'stone': 'ceramics',
      'leather': 'textiles'
    };

    for (const [key, category] of Object.entries(materialMappings)) {
      if (label.includes(key)) {
        return category;
      }
    }

    return 'other';
  }

  getStatus(): { initialized: boolean; models: string[]; device: string } {
    return {
      initialized: !!(this.imageClassifier && this.textEmbedder),
      models: [
        this.imageClassifier ? 'image-classifier' : '',
        this.textEmbedder ? 'text-embedder' : ''
      ].filter(Boolean),
      device: this.getOptimalDevice()
    };
  }

  async preloadModels(): Promise<void> {
    try {
      await this.initializeModels();
      console.log('ML models preloaded successfully');
    } catch (error) {
      console.error('Failed to preload ML models:', error);
      throw error;
    }
  }
}

export const clientMLService = new ClientMLService();