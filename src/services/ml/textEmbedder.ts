import { pipeline } from '@huggingface/transformers';
import { MLResult, TextEmbeddingResult, FeatureExtractionOptions } from './types';
import { DeviceDetector } from './deviceDetector';

export class TextEmbedderService {
  private embedder: any = null;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
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
      console.log('Initializing text embedding model...');
      
      this.embedder = await pipeline(
        'feature-extraction',
        'mixedbread-ai/mxbai-embed-xsmall-v1',
        { 
          device: DeviceDetector.getOptimalDevice(),
          progress_callback: (progress: any) => {
            console.log('Text embedder loading:', Math.round(progress.progress * 100) + '%');
          }
        }
      );

      console.log('Text embedding model initialized');
    } catch (error) {
      console.error('Failed to initialize text embedder:', error);
      throw new Error(`Text embedder initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateEmbedding(
    text: string | string[], 
    options: FeatureExtractionOptions = { pooling: 'mean', normalize: true }
  ): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      await this.initialize();
      
      if (!this.embedder) {
        throw new Error('Text embedder not available');
      }

      const embeddings = await this.embedder(text, options);
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

  isInitialized(): boolean {
    return !!this.embedder;
  }

  getModelInfo(): { name: string; initialized: boolean } {
    return {
      name: 'mxbai-embed-xsmall-v1',
      initialized: this.isInitialized()
    };
  }
}