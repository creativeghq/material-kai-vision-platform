/**
 * Hugging Face API Configuration
 *
 * Manages Hugging Face Inference API models and their specific requirements.
 */

import { z } from 'zod';

import type { BaseApiConfig } from '../apiConfig';

// Common schemas for Hugging Face models
const imageOutputSchema = z.object({
  output: z.array(z.string().url()).optional(),
  error: z.string().optional(),
});

// Hugging Face API specific configuration
export interface HuggingFaceApiConfig extends BaseApiConfig {
  type: 'huggingface';
  models: {
    [modelId: string]: {
      inputSchema: z.ZodSchema;
      outputSchema: z.ZodSchema;
      defaultParams?: Record<string, unknown>;
      description?: string;
      category?: string;
      status?: 'working' | 'failing' | 'unknown';
    };
  };
}

export const huggingfaceConfig: HuggingFaceApiConfig = {
  name: 'Hugging Face Inference API',
  type: 'huggingface',
  baseUrl: 'https://api-inference.huggingface.co',
  apiKey: undefined, // API key will be provided by the API registry at runtime
  timeout: 60000, // 60 seconds for model inference
  retryAttempts: 2,
  rateLimit: {
    requestsPerMinute: 100,
    burstLimit: 10,
  },
  environment: 'production',

  models: {
    // Stable Diffusion XL Base
    'stabilityai/stable-diffusion-xl-base-1.0': {
      inputSchema: z.object({
        inputs: z.string().min(1, 'Prompt is required'),
        parameters: z.object({
          negative_prompt: z.string().optional(),
          num_inference_steps: z.number().int().min(1).max(50).default(20),
          guidance_scale: z.number().min(1).max(20).default(7.5),
          width: z.number().int().min(64).max(1024).default(1024),
          height: z.number().int().min(64).max(1024).default(1024),
          seed: z.number().int().optional(),
        }).optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {
        parameters: {
          num_inference_steps: 20,
          guidance_scale: 7.5,
          width: 1024,
          height: 1024,
        },
      },
      description: 'Stable Diffusion XL base model for high-quality image generation',
      category: 'text-to-image',
      status: 'working',
    },

    // FLUX.1 Schnell
    'black-forest-labs/FLUX.1-schnell': {
      inputSchema: z.object({
        inputs: z.string().min(1, 'Prompt is required'),
        parameters: z.object({
          num_inference_steps: z.number().int().min(1).max(4).default(4),
          guidance_scale: z.number().min(0).max(10).default(0),
          width: z.number().int().min(256).max(1440).default(1024),
          height: z.number().int().min(256).max(1440).default(1024),
          seed: z.number().int().optional(),
        }).optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {
        parameters: {
          num_inference_steps: 4,
          guidance_scale: 0,
          width: 1024,
          height: 1024,
        },
      },
      description: 'FLUX.1 Schnell - Fast high-quality image generation',
      category: 'text-to-image',
      status: 'working',
    },

    // Stable Diffusion 2.1
    'stabilityai/stable-diffusion-2-1': {
      inputSchema: z.object({
        inputs: z.string().min(1, 'Prompt is required'),
        parameters: z.object({
          negative_prompt: z.string().optional(),
          num_inference_steps: z.number().int().min(1).max(50).default(50),
          guidance_scale: z.number().min(1).max(20).default(7.5),
          width: z.number().int().min(64).max(768).default(768),
          height: z.number().int().min(64).max(768).default(768),
          seed: z.number().int().optional(),
        }).optional(),
      }),
      outputSchema: imageOutputSchema,
      defaultParams: {
        parameters: {
          num_inference_steps: 50,
          guidance_scale: 7.5,
          width: 768,
          height: 768,
        },
      },
      description: 'Stable Diffusion 2.1 for versatile image generation',
      category: 'text-to-image',
      status: 'working',
    },
  },
};
