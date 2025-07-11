import { pipeline } from '@huggingface/transformers';
import { MLResult, ImageClassificationResult } from './types';
import { DeviceDetector } from './deviceDetector';

export class ImageClassifierService {
  private classifier: any = null;
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
      console.log('Initializing image classification model...');
      
      this.classifier = await pipeline(
        'image-classification',
        'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
        { 
          device: DeviceDetector.getOptimalDevice(),
          progress_callback: (progress: any) => {
            console.log('Image classifier loading:', Math.round(progress.progress * 100) + '%');
          }
        }
      );

      console.log('Image classification model initialized');
    } catch (error) {
      console.error('Failed to initialize image classifier:', error);
      throw new Error(`Image classifier initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async classify(imageSource: string | File | Blob): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      await this.initialize();
      
      if (!this.classifier) {
        throw new Error('Image classifier not available');
      }

      const results = await this.classifier(imageSource) as ImageClassificationResult[];
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

  isInitialized(): boolean {
    return !!this.classifier;
  }

  getModelInfo(): { name: string; initialized: boolean } {
    return {
      name: 'mobilenetv4_conv_small.e2400_r224_in1k',
      initialized: this.isInitialized()
    };
  }
}