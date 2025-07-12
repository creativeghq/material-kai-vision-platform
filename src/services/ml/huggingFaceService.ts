import { supabase } from '@/integrations/supabase/client';

interface HuggingFaceConfig {
  model: string;
  apiKey?: string;
  endpoint?: string;
}

interface ModelResult {
  outputs: any[];
  error?: string;
}

interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface ClassificationResult {
  label: string;
  score: number;
}

interface FeatureExtractionResult {
  features: number[];
  model: string;
}

export class HuggingFaceService {
  private static instance: HuggingFaceService;
  private apiKey: string | null = null;
  
  // Recommended models for different tasks
  private static readonly MODELS = {
    MATERIAL_CLASSIFICATION: 'microsoft/DialoGPT-medium',
    TEXT_EMBEDDING: 'sentence-transformers/all-MiniLM-L6-v2',
    IMAGE_CLASSIFICATION: 'google/vit-base-patch16-224',
    FEATURE_EXTRACTION: 'facebook/bart-large',
    MATERIAL_DETECTION: 'microsoft/resnet-50',
    STYLE_ANALYSIS: 'openai/clip-vit-base-patch32',
    OCR_PROCESSING: 'microsoft/trocr-base-printed',
    SENTIMENT_ANALYSIS: 'cardiffnlp/twitter-roberta-base-sentiment-latest'
  };

  private constructor() {}

  static getInstance(): HuggingFaceService {
    if (!HuggingFaceService.instance) {
      HuggingFaceService.instance = new HuggingFaceService();
    }
    return HuggingFaceService.instance;
  }

  async initialize(apiKey?: string): Promise<void> {
    this.apiKey = apiKey || await this.getApiKeyFromEdgeFunction();
    if (!this.apiKey) {
      throw new Error('HuggingFace API key not configured');
    }
  }

  private async getApiKeyFromEdgeFunction(): Promise<string | null> {
    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: { action: 'get_api_key' }
      });
      
      if (error) {
        console.error('Error getting HF API key:', error);
        return null;
      }
      
      return data?.apiKey || null;
    } catch (error) {
      console.error('Failed to get HF API key:', error);
      return null;
    }
  }

  async classifyMaterial(imageData: string | File, options: Partial<HuggingFaceConfig> = {}): Promise<ClassificationResult[]> {
    const config = {
      model: options.model || HuggingFaceService.MODELS.MATERIAL_CLASSIFICATION,
      ...options
    };

    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'classify_material',
          imageData,
          config
        }
      });

      if (error) throw error;
      return data.results || [];
    } catch (error) {
      console.error('Material classification error:', error);
      throw new Error(`Material classification failed: ${error.message}`);
    }
  }

  async generateTextEmbedding(text: string, options: Partial<HuggingFaceConfig> = {}): Promise<number[]> {
    const config = {
      model: options.model || HuggingFaceService.MODELS.TEXT_EMBEDDING,
      ...options
    };

    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'generate_embedding',
          text,
          config
        }
      });

      if (error) throw error;
      return data.embedding || [];
    } catch (error) {
      console.error('Text embedding error:', error);
      throw new Error(`Text embedding failed: ${error.message}`);
    }
  }

  async extractImageFeatures(imageData: string | File, options: Partial<HuggingFaceConfig> = {}): Promise<FeatureExtractionResult> {
    const config = {
      model: options.model || HuggingFaceService.MODELS.FEATURE_EXTRACTION,
      ...options
    };

    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'extract_features',
          imageData,
          config
        }
      });

      if (error) throw error;
      return data.result;
    } catch (error) {
      console.error('Feature extraction error:', error);
      throw new Error(`Feature extraction failed: ${error.message}`);
    }
  }

  async analyzeImageStyle(imageData: string | File, options: Partial<HuggingFaceConfig> = {}): Promise<ClassificationResult[]> {
    const config = {
      model: options.model || HuggingFaceService.MODELS.STYLE_ANALYSIS,
      ...options
    };

    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'analyze_style',
          imageData,
          config
        }
      });

      if (error) throw error;
      return data.results || [];
    } catch (error) {
      console.error('Style analysis error:', error);
      throw new Error(`Style analysis failed: ${error.message}`);
    }
  }

  async processOCR(imageData: string | File, options: Partial<HuggingFaceConfig> = {}): Promise<string> {
    const config = {
      model: options.model || HuggingFaceService.MODELS.OCR_PROCESSING,
      ...options
    };

    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'process_ocr',
          imageData,
          config
        }
      });

      if (error) throw error;
      return data.text || '';
    } catch (error) {
      console.error('OCR processing error:', error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  async detectMaterials(imageData: string | File, options: Partial<HuggingFaceConfig> = {}): Promise<ClassificationResult[]> {
    const config = {
      model: options.model || HuggingFaceService.MODELS.MATERIAL_DETECTION,
      ...options
    };

    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'detect_materials',
          imageData,
          config
        }
      });

      if (error) throw error;
      return data.results || [];
    } catch (error) {
      console.error('Material detection error:', error);
      throw new Error(`Material detection failed: ${error.message}`);
    }
  }

  async batchProcess(requests: Array<{
    action: string;
    data: any;
    config?: Partial<HuggingFaceConfig>;
  }>): Promise<any[]> {
    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'batch_process',
          requests
        }
      });

      if (error) throw error;
      return data.results || [];
    } catch (error) {
      console.error('Batch processing error:', error);
      throw new Error(`Batch processing failed: ${error.message}`);
    }
  }

  async getModelInfo(modelName: string): Promise<any> {
    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: {
          action: 'get_model_info',
          modelName
        }
      });

      if (error) throw error;
      return data.modelInfo;
    } catch (error) {
      console.error('Model info error:', error);
      throw new Error(`Failed to get model info: ${error.message}`);
    }
  }

  // Utility method to check service availability
  async healthCheck(): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: { action: 'health_check' }
      });

      return !error && data?.status === 'healthy';
    } catch (error) {
      console.error('HuggingFace service health check failed:', error);
      return false;
    }
  }

  // Get available models
  getAvailableModels(): typeof HuggingFaceService.MODELS {
    return HuggingFaceService.MODELS;
  }
}

export const huggingFaceService = HuggingFaceService.getInstance();