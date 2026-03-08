/**
 * Replicate API Configuration
 *
 * Centralized configuration for all Replicate models used in the platform.
 * Each model maintains its own specific parameter schema and requirements.
 */

import { z } from 'zod';

import { ReplicateApiConfig } from '../apiConfig';

// Common Replicate parameter schemas
const commonImageParams = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  negative_prompt: z.string().optional(),
  width: z.number().int().min(64).max(2048).optional(),
  height: z.number().int().min(64).max(2048).optional(),
  num_inference_steps: z.number().int().min(1).max(100).optional(),
  guidance_scale: z.number().min(0).max(20).optional(),
  seed: z.number().int().optional(),
});


// ComfyUI Interior Remodel schema (jschoormans/comfyui-interior-remodel)
const comfyUIInteriorSchema = z.object({
  image: z.string().url('Image URL is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  negative_prompt: z.string().optional(),
  strength: z.number().min(0).max(1).default(0.8),
  num_inference_steps: z.number().int().min(10).max(50).default(20),
  guidance_scale: z.number().min(1).max(20).default(7.5),
  seed: z.number().int().optional(),
});


// Interiorly Gen1 Dev schema (julian-at/interiorly-gen1-dev)
const interiorlyGen1Schema = z.object({
  image: z.string().url('Image URL is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  negative_prompt: z.string().optional(),
  room_type: z
    .enum([
      'living_room',
      'bedroom',
      'kitchen',
      'bathroom',
      'dining_room',
      'office',
      'outdoor',
    ])
    .optional(),
  design_style: z
    .enum([
      'modern',
      'traditional',
      'minimalist',
      'rustic',
      'industrial',
      'scandinavian',
      'bohemian',
    ])
    .optional(),
  num_inference_steps: z.number().int().min(10).max(50).default(25),
  guidance_scale: z.number().min(1).max(20).default(7.5),
  strength: z.number().min(0).max(1).default(0.75),
  seed: z.number().int().optional(),
});

// Standard output schema for image generation
const imageOutputSchema = z.object({
  output: z.array(z.string().url()).optional(),
  error: z.string().optional(),
});

// Create the Replicate API configuration
export const replicateConfig: ReplicateApiConfig = {
  name: 'replicate',
  type: 'replicate',
  baseUrl: 'https://api.replicate.com/v1',
  apiKey: '', // API key will be provided by the API registry at runtime
  timeout: 300000, // 5 minutes for image generation
  retryAttempts: 3,
  rateLimit: {
    requestsPerMinute: 60,
    burstLimit: 10,
  },
  environment: 'development', // Will be overridden by registry
  models: {
    // Interior Design Models
    'jschoormans/comfyui-interior-remodel': {
      version: 'latest',
      inputSchema: comfyUIInteriorSchema,
      outputSchema: imageOutputSchema,
      defaultParams: {
        strength: 0.8,
        num_inference_steps: 20,
        guidance_scale: 7.5,
      },
      description: 'ComfyUI-based interior remodeling',
      category: 'interior-design',
    },

    'julian-at/interiorly-gen1-dev': {
      version: 'latest',
      inputSchema: interiorlyGen1Schema,
      outputSchema: imageOutputSchema,
      defaultParams: {
        num_inference_steps: 25,
        guidance_scale: 7.5,
        strength: 0.75,
      },
      description: 'Interiorly generation model v1 development',
      category: 'interior-design',
    },

    'adirik/interior-design': {
      version: 'latest',
      inputSchema: z.object({
        image: z.string().url('Image URL is required'),
        prompt: z.string().min(1, 'Prompt is required'),
        negative_prompt: z.string().optional(),
        num_inference_steps: z.number().int().min(1).max(100).default(25),
        guidance_scale: z.number().min(1).max(20).default(7.5),
        prompt_strength: z.number().min(0).max(1).default(0.8),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {
        num_inference_steps: 25,
        guidance_scale: 7.5,
        prompt_strength: 0.8,
      },
      description: 'Interior design transformation with ControlNet depth',
      category: 'interior-design',
    },

    'erayyavuz/interior-ai': {
      version: 'e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        input: z.string().url('Image URL is required'), // NOTE: 'input', not 'image'
        negative_prompt: z.string().optional(),
        num_inference_steps: z.number().int().min(1).max(500).default(50).optional(),
        guidance_scale: z.number().min(1).max(50).default(7.5).optional(),
        strength: z.number().min(0).max(1).default(0.8).optional(),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: { num_inference_steps: 50, guidance_scale: 7.5, strength: 0.8 },
      description: 'Lifelike interior designs from text and image references',
      category: 'interior-design',
    },

    'jschoormans/interior-v2': {
      version: 'latest',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        image: z.string().url('Image URL is required'),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {},
      description: 'Interior design v2 — fast generation',
      category: 'interior-design',
    },

    'doobls-ai/interor-2': {
      version: '91f2ef63c76a73d2ec4c67cf7b2a9672e074046cf4fde1d98e46a5829f7ea68b',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        image: z.string().url().optional(),
        prompt_strength: z.number().min(0).max(1).default(0.8).optional(),
        aspect_ratio: z.enum(['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21']).default('1:1').optional(),
        num_inference_steps: z.number().int().min(1).max(50).default(28).optional(),
        guidance_scale: z.number().min(0).max(10).default(3).optional(),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: { num_inference_steps: 28, guidance_scale: 3, prompt_strength: 0.8 },
      description: 'Flux LoRA interior design — fast generation with img2img support',
      category: 'interior-design',
    },

    'rihan-a/colourful_interiors': {
      version: 'ba0425bc2e4bebafa8bd918519fdf3b5a022969a6a7c8ba0746b807bb5b541a3',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        image: z.string().url().optional(),
        prompt_strength: z.number().min(0).max(1).default(0.8).optional(),
        aspect_ratio: z.enum(['1:1', '16:9', '21:9', '3:2', '2:3', '4:5', '5:4', '3:4', '4:3', '9:16', '9:21']).default('1:1').optional(),
        num_inference_steps: z.number().int().min(1).max(50).default(28).optional(),
        guidance_scale: z.number().min(0).max(10).default(3).optional(),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: { num_inference_steps: 28, guidance_scale: 3, prompt_strength: 0.8 },
      description: 'Flux LoRA for vibrant colourful interiors (trigger word: INTR)',
      category: 'interior-design',
    },

    'pointblack/stable-interiors-v2': {
      version: '569b1bd6e4df6c9c900ad932d4a3a9f05585fac957dc6bc627aa1654853a97b5',
      inputSchema: z.object({
        image: z.string().url('Image URL is required'),
        prompt: z.string().min(1, 'Prompt is required'),
        negative_prompt: z.string().optional(),
        num_inference_steps: z.number().int().default(50).optional(),
        guidance_scale: z.number().default(15).optional(),
        prompt_strength: z.number().min(0).max(1).default(0.8).optional(),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: { num_inference_steps: 50, guidance_scale: 15, prompt_strength: 0.8 },
      description: 'SD-based img2img interior transformation',
      category: 'interior-design',
    },

    'youzu/stable-interiors-v2': {
      version: '4836eb257a4fb8b87bac9eacbef9292ee8e1a497398ab96207067403a4be2daf',
      inputSchema: z.object({
        image: z.string().url('Image URL is required'),
        prompt: z.string().min(1, 'Prompt is required'),
        negative_prompt: z.string().optional(),
        num_inference_steps: z.number().int().default(50).optional(),
        guidance_scale: z.number().default(15).optional(),
        prompt_strength: z.number().min(0).max(1).default(0.8).optional(),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: { num_inference_steps: 50, guidance_scale: 15, prompt_strength: 0.8 },
      description: 'Fast SD-based img2img interior transformation (~12s)',
      category: 'interior-design',
    },

    'rocketdigitalai/interior-design-sdxl': {
      version: 'latest',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        negative_prompt: z.string().optional(),
        scheduler: z.enum(['DPM++ 2M Karras', 'K_EULER']).default('DPM++ 2M Karras'),
        inference_steps: z.number().int().min(10).max(150).default(60),
        guidance_scale: z.number().min(1).max(20).default(7),
        depth_strength: z.number().min(0).max(2).default(0.8),
        promax_strength: z.number().min(0).max(2).default(0.8),
        refiner_strength: z.number().min(0).max(1).default(0.5),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {
        inference_steps: 60,
        guidance_scale: 7,
        depth_strength: 0.8,
        promax_strength: 0.8,
        refiner_strength: 0.5,
        scheduler: 'DPM++ 2M Karras',
      },
      description: 'SDXL + ControlNet depth/ProMax for photorealistic interior renders',
      category: 'interior-design',
    },

    // Text-to-Image Models
    'stability-ai/stable-diffusion': {
      version: 'latest',
      inputSchema: commonImageParams,
      outputSchema: imageOutputSchema,
      defaultParams: {
        width: 512,
        height: 512,
        num_inference_steps: 20,
        guidance_scale: 7.5,
      },
      description: 'Stable Diffusion text-to-image generation',
      category: 'text-to-image',
    },

    'runwayml/stable-diffusion-v1-5': {
      version: 'latest',
      inputSchema: commonImageParams,
      outputSchema: imageOutputSchema,
      defaultParams: {
        width: 512,
        height: 512,
        num_inference_steps: 20,
        guidance_scale: 7.5,
      },
      description: 'Stable Diffusion v1.5 text-to-image generation',
      category: 'text-to-image',
    },

    // 3D Generation Models
    'threestudio-project/threestudio': {
      version: 'latest',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        negative_prompt: z.string().optional(),
        guidance_scale: z.number().min(1).max(20).default(7.5),
        num_inference_steps: z.number().int().min(10).max(100).default(50),
        seed: z.number().int().optional(),
      }),
      outputSchema: z.object({
        output: z
          .object({
            mesh: z.string().url().optional(),
            video: z.string().url().optional(),
            images: z.array(z.string().url()).optional(),
          })
          .optional(),
        error: z.string().optional(),
      }),
      defaultParams: {
        guidance_scale: 7.5,
        num_inference_steps: 50,
      },
      description: '3D object generation from text',
      category: '3d-generation',
    },

    'davisbrown/designer-architecture': {
      version: 'latest',
      inputSchema: z.object({
        prompt: z.string().min(1, 'Prompt is required'),
        negative_prompt: z.string().optional(),
        width: z.number().int().min(64).max(2048).default(512),
        height: z.number().int().min(64).max(2048).default(512),
        num_inference_steps: z.number().int().min(10).max(50).default(20),
        guidance_scale: z.number().min(1).max(20).default(7.5),
        seed: z.number().int().optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {
        width: 512,
        height: 512,
        num_inference_steps: 20,
        guidance_scale: 7.5,
      },
      description: 'Designer architecture generation',
      category: 'architecture',
      status: 'working',
    },

  },
};

// Utility functions for Replicate API
export class ReplicateConfigUtils {
  /**
   * Get model configuration by ID
   */
  public static getModelConfig(modelId: string) {
    return replicateConfig.models[modelId] || null;
  }

  /**
   * Validate input parameters for a specific model
   */
  public static validateModelInput(
    modelId: string,
    input: unknown,
  ): { success: boolean; error?: string; data?: unknown } {
    const modelConfig = this.getModelConfig(modelId);
    if (!modelConfig) {
      return { success: false, error: `Model ${modelId} not found` };
    }

    try {
      const validatedData = modelConfig.inputSchema.parse(input);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: `Validation error: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
        };
      }
      return { success: false, error: 'Unknown validation error' };
    }
  }

  /**
   * Get default parameters for a model
   */
  public static getModelDefaults(modelId: string) {
    const modelConfig = this.getModelConfig(modelId);
    return modelConfig?.defaultParams || {};
  }

  /**
   * Merge user input with default parameters
   */
  public static mergeWithDefaults(
    modelId: string,
    userInput: Record<string, unknown>,
  ) {
    const defaults = this.getModelDefaults(modelId);
    return {
      ...defaults,
      ...userInput,
    };
  }

  /**
   * Get models by category
   */
  public static getModelsByCategory(category: string) {
    return Object.entries(replicateConfig.models)
      .filter(([, config]) => config.category === category)
      .map(([id, config]) => ({ id, ...config }));
  }

  /**
   * Get all available categories
   */
  public static getCategories(): string[] {
    const categories = new Set(
      Object.values(replicateConfig.models)
        .map((model) => model.category)
        .filter(Boolean),
    );
    return Array.from(categories).filter(
      (cat): cat is string => cat !== undefined,
    );
  }
}

export default replicateConfig;
