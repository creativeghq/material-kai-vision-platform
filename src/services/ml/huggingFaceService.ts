import { supabase } from '@/integrations/supabase/client';

import { BaseService, ServiceConfig } from '../base/BaseService';
import { apiRegistry } from '../../config/apiConfig';

interface HuggingFaceServiceConfig extends ServiceConfig {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}

interface ModelResult {
  outputs: ClassificationOutput[] | EmbeddingOutput[] | TextOutput[] | number[] | number[][];
  error?: string;
}

// Specific output types for different model responses
interface ClassificationOutput {
  label: string;
  score: number;
}

interface EmbeddingOutput {
  embedding?: number[];
  embeddings?: number[][];
}

interface TextOutput {
  generated_text: string;
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

export class HuggingFaceService extends BaseService<HuggingFaceServiceConfig> {
  private apiKey: string | null = null;

  // Recommended models for different tasks - corrected mappings
  private static readonly MODELS = {
    MATERIAL_CLASSIFICATION: 'google/vit-base-patch16-224', // Vision model for image classification
    TEXT_EMBEDDING: 'sentence-transformers/all-MiniLM-L6-v2', // Correct for embeddings
    IMAGE_CLASSIFICATION: 'google/vit-base-patch16-224', // Vision Transformer for images
    FEATURE_EXTRACTION: 'sentence-transformers/all-MiniLM-L6-v2', // Text feature extraction
    MATERIAL_DETECTION: 'facebook/detr-resnet-50', // Object detection model
    STYLE_ANALYSIS: 'openai/clip-vit-base-patch32', // CLIP for image-text understanding
    OCR_PROCESSING: 'microsoft/trocr-base-printed', // Correct for OCR
    SENTIMENT_ANALYSIS: 'cardiffnlp/twitter-roberta-base-sentiment-latest', // Correct for sentiment
  };

  constructor(config: HuggingFaceServiceConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Try to get API key from config first, then from centralized config, then from edge function
    this.apiKey = this.config.apiKey ||
                  await this.getApiKeyFromCentralizedConfig() ||
                  await this.getApiKeyFromEdgeFunction();

    if (!this.apiKey) {
      throw new Error('HuggingFace API key not configured');
    }
  }

  protected async doHealthCheck(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Service not properly initialized - missing API key');
    }

    // Simple health check by testing a lightweight model endpoint
    const response = await fetch('https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: 'health check' }),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API health check failed: ${response.status}`);
    }
  }

  private async getApiKeyFromCentralizedConfig(): Promise<string | null> {
    try {
      const apiRegistryInstance = apiRegistry;
      const hfConfig = apiRegistryInstance.getApiConfigByType('huggingface');

      if (hfConfig) {
        const envConfig = hfConfig.environment[this.config.environment];
        return envConfig?.apiKey || null;
      }

      return null;
    } catch (error) {
      console.warn('Could not get HuggingFace API key from centralized config:', error);
      return null;
    }
  }

  private async getApiKeyFromEdgeFunction(): Promise<string | null> {
    try {
      const { data, error } = await supabase.functions.invoke('huggingface-model-trainer', {
        body: { action: 'get_api_key' },
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

  // Public API methods with standardized error handling and metrics

  /**
   * Classify material from image data
   */
  async classifyMaterial(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<ClassificationResult[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.MATERIAL_CLASSIFICATION;
      const processedInput = await this.processImageInput(imageData);
      const result = await this.callHuggingFaceAPI(model, { inputs: processedInput });
      return this.parseClassificationResult(result);
    }, 'classifyMaterial');
  }

  /**
   * Generate text embedding
   */
  async generateTextEmbedding(text: string, options: Partial<HuggingFaceServiceConfig> = {}): Promise<number[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.TEXT_EMBEDDING;
      const result = await this.callHuggingFaceAPI(model, { inputs: text });
      return result.embeddings || result;
    }, 'generateTextEmbedding');
  }

  /**
   * Extract image features
   */
  async extractImageFeatures(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<FeatureExtractionResult> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.FEATURE_EXTRACTION;
      const processedInput = await this.processImageInput(imageData);
      const result = await this.callHuggingFaceAPI(model, { inputs: processedInput });
      return {
        features: result.features || result,
        model,
      };
    }, 'extractImageFeatures');
  }

  /**
   * Analyze image style
   */
  async analyzeImageStyle(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<ClassificationResult[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.STYLE_ANALYSIS;
      const processedInput = await this.processImageInput(imageData);
      const result = await this.callHuggingFaceAPI(model, { inputs: processedInput });
      return this.parseClassificationResult(result);
    }, 'analyzeImageStyle');
  }

  /**
   * Process OCR on image
   */
  async processOCR(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<string> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.OCR_PROCESSING;
      const processedInput = await this.processImageInput(imageData);
      const result = await this.callHuggingFaceAPI(model, { inputs: processedInput });
      return result.generated_text || result.text || '';
    }, 'processOCR');
  }

  /**
   * Detect materials in image
   */
  async detectMaterials(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<ClassificationResult[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.MATERIAL_DETECTION;
      const processedInput = await this.processImageInput(imageData);
      const result = await this.callHuggingFaceAPI(model, { inputs: processedInput });
      return this.parseClassificationResult(result);
    }, 'detectMaterials');
  }

  // Private helper methods

  private async processImageInput(imageData: string | File): Promise<string> {
    if (typeof imageData === 'string') {
      // Validate base64 string format
      if (!imageData.startsWith('data:image/') && !this.isValidBase64(imageData)) {
        throw new Error('Invalid image data format. Expected base64 string or data URL.');
      }
      return imageData;
    }

    if (imageData instanceof File) {
      // Validate file type
      if (!imageData.type.startsWith('image/')) {
        throw new Error(`Invalid file type: ${imageData.type}. Expected image file.`);
      }

      // Convert File to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(imageData);
      });
    }

    throw new Error('Invalid image input type. Expected string or File.');
  }

  private isValidBase64(str: string): boolean {
    try {
      return btoa(atob(str)) === str;
    } catch {
      return false;
    }
  }

  private async callHuggingFaceAPI(model: string, payload: any): Promise<any> {
    if (!this.apiKey) {
      throw new Error('HuggingFace API key not available');
    }

    const baseUrl = this.config.baseUrl || 'https://api-inference.huggingface.co';
    const url = `${baseUrl}/models/${model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private parseClassificationResult(result: any): ClassificationResult[] {
    if (Array.isArray(result)) {
      return result.map(item => ({
        label: item.label || item.class || 'unknown',
        score: item.score || item.confidence || 0,
      }));
    }

    if (result.label && typeof result.score === 'number') {
      return [{ label: result.label, score: result.score }];
    }

    return [];
  }

  /**
   * Get available models for different tasks
   */
  static getAvailableModels(): Record<string, string> {
    return { ...HuggingFaceService.MODELS };
  }

  /**
   * Create a standardized service instance
   */
  static createInstance(config: Partial<HuggingFaceServiceConfig> = {}): HuggingFaceService {
    const defaultConfig: HuggingFaceServiceConfig = {
      name: 'huggingface-service',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      timeout: 30000,
      retries: 3,
      rateLimit: {
        requestsPerMinute: 60,
      },
      healthCheck: {
        enabled: true,
        interval: 300000, // 5 minutes
        timeout: 10000,
      },
      ...config,
    };

    return new HuggingFaceService(defaultConfig);
  }
}

// Create a default instance for convenience
export const huggingFaceService = HuggingFaceService.createInstance();

export default HuggingFaceService;
