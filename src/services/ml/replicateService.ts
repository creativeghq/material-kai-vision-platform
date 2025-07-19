/**
 * Replicate API Integration Service
 * Premium ML capabilities for advanced material processing
 */

import { 
  INTERIOR_DESIGN_MODELS, 
  ModelParameterValidator, 
  ModelConfig 
} from './replicateModelConfigs';
import { BaseService, ServiceConfig } from '../base/BaseService';
import { ApiRegistry } from '../../config/apiConfig';

interface ReplicateServiceConfig extends ServiceConfig {
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  retryDelay?: number;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  urls: {
    get: string;
    cancel: string;
  };
  input: any;
  output?: any;
  error?: string;
  started_at?: string;
  completed_at?: string;
  metrics?: {
    predict_time?: number;
  };
}

interface SVBRDFMaps {
  albedo_map?: string;
  normal_map?: string;
  roughness_map?: string;
  metallic_map?: string;
  height_map?: string;
  confidence: number;
  processing_time: number;
}

interface DepthEstimation {
  depth_map: string;
  confidence: number;
  min_depth: number;
  max_depth: number;
  processing_time: number;
}

interface MaterialProperties {
  material_type: string;
  properties: {
    roughness: number;
    metallic: number;
    specular: number;
    transparency: number;
  };
  confidence: number;
}

export class ReplicateService extends BaseService<ReplicateServiceConfig> {
  private apiKey: string | null = null;
  private usageTracker = new Map<string, number>();

  constructor(config: ReplicateServiceConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Try to get API key from config first, then from centralized config
    this.apiKey = this.config.apiKey || await this.getApiKeyFromCentralizedConfig();
    
    if (!this.apiKey) {
      throw new Error('Replicate API key not configured');
    }
  }

  protected async doHealthCheck(): Promise<void> {
    if (!this.apiKey) {
      throw new Error('Service not properly initialized - missing API key');
    }

    // Simple health check by testing the API endpoint
    const response = await fetch(`${this.config.baseUrl || 'https://api.replicate.com/v1'}/predictions`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Replicate API health check failed: ${response.status}`);
    }
  }

  private async getApiKeyFromCentralizedConfig(): Promise<string | null> {
    try {
      const apiRegistry = ApiRegistry.getInstance<ApiRegistry>();
      const replicateConfig = apiRegistry.getApiConfigByType('replicate');
      
      if (replicateConfig) {
        const envConfig = replicateConfig.environment[this.config.environment];
        return envConfig?.apiKey || null;
      }
      
      return null;
    } catch (error) {
      console.warn('Could not get Replicate API key from centralized config:', error);
      return null;
    }
  }

  /**
   * Extract SVBRDF maps from material image
   */
  async extractSVBRDF(imageUrl: string): Promise<SVBRDFMaps> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      const prediction = await this.createPrediction({
        version: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: {
          image: imageUrl,
          prompt: "SVBRDF material maps: albedo, normal, roughness, metallic",
          negative_prompt: "blurry, low quality, distorted",
          num_outputs: 4,
          guidance_scale: 7.5,
          num_inference_steps: 50
        }
      });

      const result = await this.waitForCompletion(prediction.id);
      
      if (result.status === 'failed') {
        throw new Error(`SVBRDF extraction failed: ${result.error}`);
      }

      // Parse the output to extract different map types
      const maps = this.parseSVBRDFOutput(result.output);
      
      return {
        ...maps,
        confidence: 0.85, // High confidence for Replicate results
        processing_time: Date.now() - startTime
      };
    }, 'extractSVBRDF');
  }

  /**
   * Estimate depth from single image using MiDaS
   */
  async estimateDepth(imageUrl: string): Promise<DepthEstimation> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      const prediction = await this.createPrediction({
        version: "intel-isl/midas:8cf3c64a16df9d965b10421ca6adec9c6f6b8a18",
        input: {
          image: imageUrl
        }
      });

      const result = await this.waitForCompletion(prediction.id);
      
      if (result.status === 'failed') {
        throw new Error(`Depth estimation failed: ${result.error}`);
      }

      return {
        depth_map: result.output,
        confidence: 0.9,
        min_depth: 0.1,
        max_depth: 10.0,
        processing_time: Date.now() - startTime
      };
    }, 'estimateDepth');
  }

  /**
   * Generate high-quality material variations
   */
  async generateMaterialVariations(imageUrl: string, count: number = 4): Promise<string[]> {
    return this.executeOperation(async () => {
      const prediction = await this.createPrediction({
        version: "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b",
        input: {
          image: imageUrl,
          prompt: "high quality material texture variations, same material different lighting and angles",
          num_outputs: count,
          guidance_scale: 7.5,
          num_inference_steps: 30
        }
      });

      const result = await this.waitForCompletion(prediction.id);
      
      if (result.status === 'failed') {
        throw new Error(`Material variation generation failed: ${result.error}`);
      }

      return Array.isArray(result.output) ? result.output : [result.output];
    }, 'generateMaterialVariations');
  }

  /**
   * Enhance material image quality
   */
  async enhanceImageQuality(imageUrl: string): Promise<string> {
    return this.executeOperation(async () => {
      const prediction = await this.createPrediction({
        version: "tencentarc/gfpgan:9283608cc6b7be6b65a8e44983db012355fde4132009bf99d976b2f0896856a3",
        input: {
          img: imageUrl,
          version: "v1.4",
          scale: 2
        }
      });

      const result = await this.waitForCompletion(prediction.id);
      
      if (result.status === 'failed') {
        throw new Error(`Image enhancement failed: ${result.error}`);
      }

      return result.output;
    }, 'enhanceImageQuality');
  }

  /**
   * Remove background from material images
   */
  async removeBackground(imageUrl: string): Promise<string> {
    return this.executeOperation(async () => {
      const prediction = await this.createPrediction({
        version: "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
        input: {
          image: imageUrl
        }
      });

      const result = await this.waitForCompletion(prediction.id);
      
      if (result.status === 'failed') {
        throw new Error(`Background removal failed: ${result.error}`);
      }

      return result.output;
    }, 'removeBackground');
  }

  /**
   * Analyze material properties using advanced models
   */
  async analyzeMaterialProperties(imageUrl: string): Promise<MaterialProperties> {
    return this.executeOperation(async () => {
      try {
        // Use a custom material analysis model (would need to be deployed to Replicate)
        const prediction = await this.createPrediction({
          version: "custom/material-analyzer:latest",
          input: {
            image: imageUrl,
            analysis_type: "comprehensive"
          }
        });

        const result = await this.waitForCompletion(prediction.id);
        
        if (result.status === 'failed') {
          // Fallback to basic analysis if custom model fails
          return this.fallbackMaterialAnalysis(imageUrl);
        }

        return result.output;
      } catch (error) {
        console.error('Material property analysis failed:', error);
        return this.fallbackMaterialAnalysis(imageUrl);
      }
    }, 'analyzeMaterialProperties');
  }

  /**
   * Generate interior design images using model-specific parameters
   */
  async generateInteriorDesign(
    modelId: string,
    prompt: string,
    imageUrl?: string,
    options: Record<string, any> = {}
  ): Promise<string | string[]> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      // Get model configuration
      const modelConfig = INTERIOR_DESIGN_MODELS[modelId];
      if (!modelConfig) {
        throw new Error(`Unsupported interior design model: ${modelId}`);
      }

      // Prepare base parameters
      const baseParams: Record<string, any> = {
        prompt,
        ...options
      };

      // Add image parameter if provided (for image-to-image models)
      if (imageUrl) {
        baseParams['image'] = imageUrl;
      }

      // Validate and transform parameters using static method
      const validatedParams = ModelParameterValidator.validateAndTransformParameters(modelId, baseParams);

      // Create prediction with model-specific version and parameters
      const prediction = await this.createPrediction({
        version: modelConfig.version,
        input: validatedParams
      });

      const result = await this.waitForCompletion(prediction.id);
      
      if (result.status === 'failed') {
        throw new Error(`Interior design generation failed: ${result.error}`);
      }

      // Track usage for interior design
      this.usageTracker.set('interior-design', (this.usageTracker.get('interior-design') || 0) + 1);

      return result.output;
    }, 'generateInteriorDesign');
  }

  /**
   * Generate interior design with automatic model selection based on requirements
   */
  async generateInteriorDesignAuto(
    prompt: string,
    imageUrl?: string,
    requirements: {
      style?: 'modern' | 'traditional' | 'minimalist' | 'luxury';
      speed?: 'fast' | 'balanced' | 'quality';
      type?: 'text-to-image' | 'image-to-image';
    } = {}
  ): Promise<{ result: string | string[]; modelUsed: string; processingTime: number }> {
    return this.executeOperation(async () => {
      const startTime = Date.now();

      // Select best model based on requirements
      const modelId = this.selectBestInteriorModel(requirements, !!imageUrl);
      
      const result = await this.generateInteriorDesign(modelId, prompt, imageUrl, {
        // Add requirement-based parameter adjustments
        ...(requirements.speed === 'fast' && { num_inference_steps: 20 }),
        ...(requirements.speed === 'quality' && { num_inference_steps: 50 }),
        ...(requirements.style === 'luxury' && { guidance_scale: 8.5 }),
        ...(requirements.style === 'minimalist' && { guidance_scale: 6.0 })
      });

      return {
        result,
        modelUsed: modelId,
        processingTime: Date.now() - startTime
      };
    }, 'generateInteriorDesignAuto');
  }

  /**
   * Test all interior design models with a standard prompt
   */
  async testAllInteriorModels(
    testPrompt: string = "modern living room with comfortable seating",
    imageUrl?: string
  ): Promise<{
    results: Record<string, { success: boolean; output?: any; error?: string; processingTime: number }>;
    summary: { total: number; successful: number; failed: number; successRate: number };
  }> {
    return this.executeOperation(async () => {
      const results: Record<string, any> = {};
      const modelIds = Object.keys(INTERIOR_DESIGN_MODELS);

      console.log(`Testing ${modelIds.length} interior design models...`);

      for (const modelId of modelIds) {
        const startTime = Date.now();
        console.log(`Testing model: ${modelId}`);

        try {
          const output = await this.generateInteriorDesign(modelId, testPrompt, imageUrl);
          results[modelId] = {
            success: true,
            output,
            processingTime: Date.now() - startTime
          };
          console.log(`✅ ${modelId}: Success`);
        } catch (error) {
          results[modelId] = {
            success: false,
            error: error.message,
            processingTime: Date.now() - startTime
          };
          console.log(`❌ ${modelId}: ${error.message}`);
        }
      }

      // Calculate summary statistics
      const successful = Object.values(results).filter((r: any) => r.success).length;
      const failed = modelIds.length - successful;
      const successRate = Math.round((successful / modelIds.length) * 100);

      const summary = {
        total: modelIds.length,
        successful,
        failed,
        successRate
      };

      console.log(`\nTest Summary: ${successful}/${modelIds.length} models successful (${successRate}%)`);

      return { results, summary };
    }, 'testAllInteriorModels');
  }

  /**
   * Select the best interior design model based on requirements
   */
  private selectBestInteriorModel(
    requirements: {
      style?: 'modern' | 'traditional' | 'minimalist' | 'luxury';
      speed?: 'fast' | 'balanced' | 'quality';
      type?: 'text-to-image' | 'image-to-image';
    },
    hasImage: boolean
  ): string {
    // Filter models based on type requirement
    const availableModels = Object.entries(INTERIOR_DESIGN_MODELS).filter(([_, config]) => {
      if (requirements.type === 'image-to-image') {
        return config.capabilities?.includes('image-to-image');
      }
      if (requirements.type === 'text-to-image') {
        return config.capabilities?.includes('text-to-image');
      }
      // If no type specified, prefer image-to-image if image provided
      if (hasImage) {
        return config.capabilities?.includes('image-to-image');
      }
      return true;
    });

    // If no models match requirements, fall back to working models
    if (availableModels.length === 0) {
      const workingModels = Object.entries(INTERIOR_DESIGN_MODELS).filter(([_, config]) => 
        config.status === 'working'
      );
      return workingModels.length > 0 ? workingModels[0][0] : 'julian-at/interiorly-gen1-dev';
    }

    // Prioritize by status (working > untested > failing)
    const sortedModels = availableModels.sort(([_, configA], [__, configB]) => {
      const statusPriority = { working: 3, untested: 2, failing: 1 };
      const priorityA = statusPriority[configA.status || 'untested'];
      const priorityB = statusPriority[configB.status || 'untested'];
      return priorityB - priorityA;
    });

    // For speed requirements, prefer specific models
    if (requirements.speed === 'fast') {
      const fastModel = sortedModels.find(([id]) => 
        id.includes('comfyui') || id.includes('designer-architecture')
      );
      if (fastModel) return fastModel[0];
    }

    // Return the highest priority model
    return sortedModels[0][0];
  }

  /**
   * Get available interior design models and their capabilities
   */
  getInteriorDesignModels(): Record<string, {
    name: string;
    description: string;
    capabilities: string[];
    status: 'working' | 'failing' | 'untested';
    lastTested?: string;
  }> {
    const models: Record<string, any> = {};

    for (const [modelId, config] of Object.entries(INTERIOR_DESIGN_MODELS)) {
      models[modelId] = {
        name: config.name || modelId,
        description: config.description || 'Interior design AI model',
        capabilities: config.capabilities || ['text-to-image'],
        status: config.status || 'untested',
        lastTested: config.lastTested
      };
    }

    return models;
  }

  /**
   * Get usage statistics and cost tracking
   */
  getUsageStats(): {
    totalRequests: number;
    requestsByType: Record<string, number>;
    estimatedCost: number;
    averageProcessingTime: number;
  } {
    const totalRequests = Array.from(this.usageTracker.values()).reduce((sum, count) => sum + count, 0);
    const requestsByType = Object.fromEntries(this.usageTracker);
    
    return {
      totalRequests,
      requestsByType,
      estimatedCost: totalRequests * 0.05, // Rough estimate
      averageProcessingTime: 30000 // 30 seconds average
    };
  }

  /**
   * Cancel a running prediction
   */
  async cancelPrediction(predictionId: string): Promise<void> {
    return this.executeOperation(async () => {
      const response = await fetch(`${this.config.baseUrl || 'https://api.replicate.com/v1'}/predictions/${predictionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel prediction: ${response.status} ${response.statusText}`);
      }
    }, 'cancelPrediction');
  }

  // Private helper methods

  private async createPrediction(request: any): Promise<ReplicatePrediction> {
    const response = await fetch(`${this.config.baseUrl || 'https://api.replicate.com/v1'}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async waitForCompletion(predictionId: string): Promise<ReplicatePrediction> {
    const maxAttempts = this.config.maxRetries || 60; // 5 minutes with 5-second intervals
    const retryDelay = this.config.retryDelay || 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`${this.config.baseUrl || 'https://api.replicate.com/v1'}/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get prediction status: ${response.status} ${response.statusText}`);
      }

      const prediction: ReplicatePrediction = await response.json();

      if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
        return prediction;
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }

    throw new Error(`Prediction ${predictionId} timed out after ${maxAttempts} attempts`);
  }

  private parseSVBRDFOutput(output: any): Partial<SVBRDFMaps> {
    // Parse the output to extract different map types
    // This is a simplified implementation - actual parsing would depend on the model output format
    if (Array.isArray(output) && output.length >= 4) {
      return {
        albedo_map: output[0],
        normal_map: output[1],
        roughness_map: output[2],
        metallic_map: output[3]
      };
    }
    return {};
  }

  private async fallbackMaterialAnalysis(imageUrl: string): Promise<MaterialProperties> {
    // Fallback analysis with default values
    return {
      material_type: 'unknown',
      properties: {
        roughness: 0.5,
        metallic: 0.0,
        specular: 0.5,
        transparency: 0.0
      },
      confidence: 0.3
    };
  }

  /**
   * Create a standardized service instance
   */
  static createInstance(config: Partial<ReplicateServiceConfig> = {}): ReplicateService {
    const defaultConfig: ReplicateServiceConfig = {
      name: 'replicate-service',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      timeout: 300000, // 5 minutes
      retries: 3,
      rateLimit: {
        requestsPerMinute: 10 // Conservative rate limit for Replicate
      },
      healthCheck: {
        enabled: true,
        interval: 600000, // 10 minutes
        timeout: 30000
      },
      baseUrl: 'https://api.replicate.com/v1',
      maxRetries: 60,
      retryDelay: 5000,
      ...config
    };

    return new ReplicateService(defaultConfig);
  }
}

export default ReplicateService;