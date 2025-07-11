import { MLResult, MaterialAnalysisResult, ImageClassificationResult } from './types';
import { ImageClassifierService } from './imageClassifier';
import { TextEmbedderService } from './textEmbedder';

export class MaterialAnalyzerService {
  private imageClassifier = new ImageClassifierService();
  private textEmbedder = new TextEmbedderService();

  async analyzeMaterial(imageSource: string | File | Blob, description?: string): Promise<MLResult> {
    const startTime = performance.now();
    
    try {
      const imageAnalysis = await this.imageClassifier.classify(imageSource);
      let textAnalysis = null;

      if (description) {
        textAnalysis = await this.textEmbedder.generateEmbedding(description);
      }

      const processingTime = performance.now() - startTime;

      const result: MaterialAnalysisResult = {
        image: imageAnalysis.data,
        text: textAnalysis?.data,
        combined: {
          materialType: this.extractMaterialType(imageAnalysis.data),
          confidence: imageAnalysis.confidence || 0,
          features: imageAnalysis.data?.slice(0, 3) || []
        }
      };

      return {
        success: imageAnalysis.success && (!description || textAnalysis?.success),
        data: result,
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

  async preloadModels(): Promise<void> {
    try {
      await Promise.all([
        this.imageClassifier.initialize(),
        this.textEmbedder.initialize()
      ]);
      console.log('Material analyzer models preloaded successfully');
    } catch (error) {
      console.error('Failed to preload material analyzer models:', error);
      throw error;
    }
  }

  getStatus(): { 
    initialized: boolean; 
    models: Array<{ name: string; initialized: boolean }>;
  } {
    return {
      initialized: this.imageClassifier.isInitialized() && this.textEmbedder.isInitialized(),
      models: [
        this.imageClassifier.getModelInfo(),
        this.textEmbedder.getModelInfo()
      ]
    };
  }
}