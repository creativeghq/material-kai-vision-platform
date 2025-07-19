import { supabase } from '@/integrations/supabase/client';
import { BaseService, ServiceConfig } from '../base/BaseService';
import { ApiRegistry } from '../../config/apiConfig';

interface HuggingFaceServiceConfig extends ServiceConfig {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
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

export class HuggingFaceService extends BaseService<HuggingFaceServiceConfig> {
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: 'health check' })
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API health check failed: ${response.status}`);
    }
  }

  private async getApiKeyFromCentralizedConfig(): Promise<string | null> {
    try {
      const apiRegistry = ApiRegistry.getInstance();
      const hfConfig = apiRegistry.getApiConfigByType('huggingface');
      
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

  // Public API methods with standardized error handling and metrics

  /**
   * Classify material from image data
   */
  async classifyMaterial(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<ClassificationResult[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.MATERIAL_CLASSIFICATION;
      const result = await this.callHuggingFaceAPI(model, { inputs: imageData });
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
      const result = await this.callHuggingFaceAPI(model, { inputs: imageData });
      return {
        features: result.features || result,
        model
      };
    }, 'extractImageFeatures');
  }

  /**
   * Analyze image style
   */
  async analyzeImageStyle(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<ClassificationResult[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.STYLE_ANALYSIS;
      const result = await this.callHuggingFaceAPI(model, { inputs: imageData });
      return this.parseClassificationResult(result);
    }, 'analyzeImageStyle');
  }

  /**
   * Process OCR on image
   */
  async processOCR(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<string> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.OCR_PROCESSING;
      const result = await this.callHuggingFaceAPI(model, { inputs: imageData });
      return result.generated_text || result.text || '';
    }, 'processOCR');
  }

  /**
   * Detect materials in image
   */
  async detectMaterials(imageData: string | File, options: Partial<HuggingFaceServiceConfig> = {}): Promise<ClassificationResult[]> {
    return this.executeOperation(async () => {
      const model = options.defaultModel || HuggingFaceService.MODELS.MATERIAL_DETECTION;
      const result = await this.callHuggingFaceAPI(model, { inputs: imageData });
      return this.parseClassificationResult(result);
    }, 'detectMaterials');
  }

  // Private helper methods

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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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
        score: item.score || item.confidence || 0
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
        requestsPerMinute: 60
      },
      healthCheck: {
        enabled: true,
        interval: 300000, // 5 minutes
        timeout: 10000
      },
      ...config
    };

    return new HuggingFaceService(defaultConfig);
  }
}

export default HuggingFaceService;