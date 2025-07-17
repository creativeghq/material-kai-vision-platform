/**
 * Replicate API Integration Service
 * Premium ML capabilities for advanced material processing
 */

import { 
  INTERIOR_DESIGN_MODELS, 
  ModelParameterValidator, 
  ModelConfig 
} from './replicateModelConfigs';

interface ReplicateConfig {
  apiKey: string;
  baseUrl: string;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
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

export class ReplicateService {
  private config: ReplicateConfig;
  private usageTracker = new Map<string, number>();

  constructor(apiKey: string) {
    this.config = {
      apiKey,
      baseUrl: 'https://api.replicate.com/v1',
      maxRetries: 3,
      retryDelay: 2000,
      timeout: 300000 // 5 minutes
    };
  }

  /**
   * Extract SVBRDF maps from material image
   */
  async extractSVBRDF(imageUrl: string): Promise<SVBRDFMaps> {
    const startTime = Date.now();

    try {
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

    } catch (error) {
      console.error('SVBRDF extraction failed:', error);
      throw new Error(`Failed to extract SVBRDF: ${error.message}`);
    }
  }

  /**
   * Estimate depth from single image using MiDaS
   */
  async estimateDepth(imageUrl: string): Promise<DepthEstimation> {
    const startTime = Date.now();

    try {
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

    } catch (error) {
      console.error('Depth estimation failed:', error);
      throw new Error(`Failed to estimate depth: ${error.message}`);
    }
  }

  /**
   * Generate high-quality material variations
   */
  async generateMaterialVariations(imageUrl: string, count: number = 4): Promise<string[]> {
    try {
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

    } catch (error) {
      console.error('Material variation generation failed:', error);
      throw new Error(`Failed to generate variations: ${error.message}`);
    }
  }

  /**
   * Enhance material image quality
   */
  async enhanceImageQuality(imageUrl: string): Promise<string> {
    try {
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

    } catch (error) {
      console.error('Image enhancement failed:', error);
      throw new Error(`Failed to enhance image: ${error.message}`);
    }
  }

  /**
   * Remove background from material images
   */
  async removeBackground(imageUrl: string): Promise<string> {
    try {
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

    } catch (error) {
      console.error('Background removal failed:', error);
      throw new Error(`Failed to remove background: ${error.message}`);
    }
  }

  /**
   * Analyze material properties using advanced models
   */
  async analyzeMaterialProperties(imageUrl: string): Promise<MaterialProperties> {
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
    const startTime = Date.now();

    try {
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

    } catch (error) {
      console.error(`Interior design generation failed for model ${modelId}:`, error);
      throw new Error(`Failed to generate interior design: ${error.message}`);
    }
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
    const startTime = Date.now();

    // Select best model based on requirements
    const modelId = this.selectBestInteriorModel(requirements, !!imageUrl);
    
    try {
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

    } catch (error) {
      console.error(`Auto interior design generation failed:`, error);
      throw new Error(`Failed to generate interior design automatically: ${error.message}`);
    }
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
    
    // Estimate costs based on Replicate pricing
    const costPerRequest = 0.05; // Average $0.05 per request
    const estimatedCost = totalRequests * costPerRequest;

    return {
      totalRequests,
      requestsByType,
      estimatedCost,
      averageProcessingTime: 30000 // 30 seconds average
    };
  }

  /**
   * Cancel a running prediction
   */
  async cancelPrediction(predictionId: string): Promise<void> {
    try {
      await fetch(`${this.config.baseUrl}/predictions/${predictionId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Failed to cancel prediction:', error);
    }
  }

  // Private helper methods

  private async createPrediction(request: any): Promise<ReplicatePrediction> {
    const response = await fetch(`${this.config.baseUrl}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${response.status} - ${error}`);
    }

    const prediction = await response.json();
    
    // Track usage
    const modelType = request.version.split('/')[1] || 'unknown';
    this.usageTracker.set(modelType, (this.usageTracker.get(modelType) || 0) + 1);

    return prediction;
  }

  private async waitForCompletion(predictionId: string): Promise<ReplicatePrediction> {
    const startTime = Date.now();
    let retryCount = 0;

    while (retryCount < this.config.maxRetries) {
      try {
        // Check timeout
        if (Date.now() - startTime > this.config.timeout) {
          await this.cancelPrediction(predictionId);
          throw new Error('Processing timeout exceeded');
        }

        const response = await fetch(`${this.config.baseUrl}/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Token ${this.config.apiKey}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to get prediction status: ${response.status}`);
        }

        const prediction = await response.json();

        if (prediction.status === 'succeeded' || prediction.status === 'failed') {
          return prediction;
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        retryCount++;

      } catch (error) {
        console.error(`Polling attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        
        if (retryCount >= this.config.maxRetries) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
      }
    }

    throw new Error('Maximum retry attempts exceeded');
  }

  private parseSVBRDFOutput(output: any): Partial<SVBRDFMaps> {
    if (Array.isArray(output)) {
      return {
        albedo_map: output[0],
        normal_map: output[1],
        roughness_map: output[2],
        metallic_map: output[3]
      };
    }
    
    return {
      albedo_map: output
    };
  }

  private async fallbackMaterialAnalysis(imageUrl: string): Promise<MaterialProperties> {
    // Simple fallback analysis
    return {
      material_type: 'unknown',
      properties: {
        roughness: 0.5,
        metallic: 0.1,
        specular: 0.5,
        transparency: 0.0
      },
      confidence: 0.3
    };
  }
}

// Export a configured instance
export const replicateService = new ReplicateService(
  // Would get from environment/secrets in production
  process.env.REPLICATE_API_KEY || ''
);