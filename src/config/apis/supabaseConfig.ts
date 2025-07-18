/**
 * Supabase API Configuration
 * 
 * Centralized configuration for all Supabase functions and their parameter schemas.
 * Each function maintains its own specific input/output requirements.
 */

import { z } from 'zod';
import { SupabaseApiConfig } from '../apiConfig';

// Common schemas for Supabase functions
const commonErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
  hint: z.string().optional(),
  code: z.string().optional(),
});

const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// CrewAI 3D Generation function schema
const crewai3DGenerationInputSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  model: z.enum([
    // Replicate Interior Design Models (10 total)
    'lucataco/interior-design',
    'adirik/flux-cinestill',
    'black-forest-labs/flux-schnell',
    'stability-ai/stable-diffusion-3-medium',
    'bytedance/sdxl-lightning-4step',
    'playgroundai/playground-v2.5-1024px-aesthetic',
    'threestudio-project/threestudio',
    'adirik/interior-design',
    'davisbrown/designer-architecture',
    'rocketdigitalai/interior-design-sdxl',
    
    // Hugging Face Models (3 total)
    'stabilityai/stable-diffusion-xl-base-1.0',
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-2-1',
  ]),
  image_url: z.string().url("Valid image URL is required").optional(),
  room_type: z.string().optional(),
  style: z.string().optional(),
  num_inference_steps: z.number().int().min(10).max(50).default(20),
  guidance_scale: z.number().min(1).max(20).default(7.5),
  strength: z.number().min(0).max(1).default(0.8),
  seed: z.number().int().optional(),
  // Additional parameters for text-to-image models
  negative_prompt: z.string().optional(),
  width: z.number().int().min(64).max(2048).optional(),
  height: z.number().int().min(64).max(2048).optional(),
});

const crewai3DGenerationOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    images: z.array(z.string().url()),
    metadata: z.object({
      model: z.string(),
      prompt: z.string(),
      parameters: z.record(z.any()),
      generation_time: z.number().optional(),
    }),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),
]);

// Enhanced RAG Search function schema
const enhancedRAGSearchInputSchema = z.object({
  query: z.string().min(1, "Query is required"),
  collection_name: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  include_metadata: z.boolean().default(true),
  filters: z.record(z.any()).optional(),
});

const enhancedRAGSearchOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    results: z.array(z.object({
      content: z.string(),
      metadata: z.record(z.any()),
      score: z.number(),
      id: z.string(),
    })),
    total_results: z.number(),
    query_metadata: z.object({
      query: z.string(),
      collection: z.string(),
      processing_time: z.number(),
    }),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),
]);

// Material Scraper function schema
const materialScraperInputSchema = z.object({
  url: z.string().url("Valid URL is required"),
  extract_images: z.boolean().default(true),
  extract_text: z.boolean().default(true),
  max_images: z.number().int().min(1).max(50).default(10),
  image_min_size: z.number().int().min(100).default(200),
  timeout: z.number().int().min(5000).max(60000).default(30000),
});

const materialScraperOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      url: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      images: z.array(z.object({
        url: z.string(),
        alt: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      })),
      text_content: z.string().optional(),
      metadata: z.record(z.any()),
    }),
    processing_time: z.number(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),
]);

// OCR Processing function schema
const ocrProcessingInputSchema = z.object({
  image_url: z.string().url("Valid image URL is required"),
  language: z.string().default("eng"),
  output_format: z.enum(["text", "json", "hocr"]).default("text"),
  preprocessing: z.object({
    enhance_contrast: z.boolean().default(true),
    denoise: z.boolean().default(true),
    deskew: z.boolean().default(true),
  }).optional(),
});

const ocrProcessingOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    text: z.string(),
    confidence: z.number().min(0).max(100),
    language: z.string(),
    processing_time: z.number(),
    metadata: z.object({
      image_dimensions: z.object({
        width: z.number(),
        height: z.number(),
      }),
      preprocessing_applied: z.array(z.string()),
    }),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),
]);

// SVBRDF Extractor function schema
const svbrdfExtractorInputSchema = z.object({
  image_url: z.string().url("Valid image URL is required"),
  output_format: z.enum(["pbr", "blender", "unity"]).default("pbr"),
  resolution: z.number().int().refine(val => [256, 512, 1024].includes(val), {
    message: "Resolution must be 256, 512, or 1024"
  }).default(512),
  enhance_quality: z.boolean().default(true),
});

const svbrdfExtractorOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    maps: z.object({
      diffuse: z.string().url(),
      normal: z.string().url(),
      roughness: z.string().url(),
      metallic: z.string().url(),
      height: z.string().url().optional(),
      ambient_occlusion: z.string().url().optional(),
    }),
    metadata: z.object({
      resolution: z.number(),
      format: z.string(),
      processing_time: z.number(),
    }),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    details: z.string().optional(),
  }),
]);

// Create the Supabase API configuration
export const supabaseConfig: SupabaseApiConfig = {
  name: 'supabase',
  type: 'supabase',
  baseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  timeout: 60000, // 1 minute default
  retryAttempts: 3,
  rateLimit: {
    requestsPerMinute: 100,
    burstLimit: 20,
  },
  environment: 'development', // Will be overridden by registry
  functions: {
    'crewai-3d-generation': {
      inputSchema: crewai3DGenerationInputSchema,
      outputSchema: crewai3DGenerationOutputSchema,
      timeout: 300000, // 5 minutes for AI generation
    },
    
    'enhanced-rag-search': {
      inputSchema: enhancedRAGSearchInputSchema,
      outputSchema: enhancedRAGSearchOutputSchema,
      timeout: 30000, // 30 seconds for search
    },
    
    'material-scraper': {
      inputSchema: materialScraperInputSchema,
      outputSchema: materialScraperOutputSchema,
      timeout: 60000, // 1 minute for scraping
    },
    
    'ocr-processing': {
      inputSchema: ocrProcessingInputSchema,
      outputSchema: ocrProcessingOutputSchema,
      timeout: 45000, // 45 seconds for OCR
    },
    
    'svbrdf-extractor': {
      inputSchema: svbrdfExtractorInputSchema,
      outputSchema: svbrdfExtractorOutputSchema,
      timeout: 120000, // 2 minutes for SVBRDF extraction
    },
    
    'nerf-processor': {
      inputSchema: z.object({
        images: z.array(z.string().url()).min(3, "At least 3 images required"),
        output_format: z.enum(["ply", "obj", "gltf"]).default("ply"),
        quality: z.enum(["low", "medium", "high"]).default("medium"),
      }),
      outputSchema: z.union([
        z.object({
          success: z.literal(true),
          model_url: z.string().url(),
          preview_images: z.array(z.string().url()),
          metadata: z.object({
            vertex_count: z.number(),
            face_count: z.number(),
            processing_time: z.number(),
          }),
        }),
        commonErrorSchema,
      ]),
      timeout: 600000, // 10 minutes for NeRF processing
    },
    
    'spaceformer-analysis': {
      inputSchema: z.object({
        image_url: z.string().url("Valid image URL is required"),
        analysis_type: z.enum(["layout", "furniture", "style", "complete"]).default("complete"),
        include_suggestions: z.boolean().default(true),
      }),
      outputSchema: z.union([
        z.object({
          success: z.literal(true),
          analysis: z.object({
            layout: z.object({
              room_type: z.string(),
              dimensions: z.object({
                width: z.number(),
                height: z.number(),
                depth: z.number(),
              }).optional(),
              features: z.array(z.string()),
            }),
            furniture: z.array(z.object({
              type: z.string(),
              position: z.object({ x: z.number(), y: z.number() }),
              confidence: z.number(),
            })),
            style: z.object({
              primary_style: z.string(),
              color_palette: z.array(z.string()),
              materials: z.array(z.string()),
            }),
            suggestions: z.array(z.string()).optional(),
          }),
        }),
        commonErrorSchema,
      ]),
      timeout: 90000, // 1.5 minutes for analysis
    },
  },
};

// Utility functions for Supabase API
export class SupabaseConfigUtils {
  /**
   * Get function configuration by name
   */
  public static getFunctionConfig(functionName: string) {
    return supabaseConfig.functions[functionName] || null;
  }

  /**
   * Validate input parameters for a specific function
   */
  public static validateFunctionInput(functionName: string, input: any): { success: boolean; error?: string; data?: any } {
    const functionConfig = this.getFunctionConfig(functionName);
    if (!functionConfig) {
      return { success: false, error: `Function ${functionName} not found` };
    }

    try {
      const validatedData = functionConfig.inputSchema.parse(input);
      return { success: true, data: validatedData };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { 
          success: false, 
          error: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}` 
        };
      }
      return { success: false, error: 'Unknown validation error' };
    }
  }

  /**
   * Get function timeout
   */
  public static getFunctionTimeout(functionName: string): number {
    const functionConfig = this.getFunctionConfig(functionName);
    return functionConfig?.timeout || supabaseConfig.timeout;
  }

  /**
   * Get all available functions
   */
  public static getAvailableFunctions(): string[] {
    return Object.keys(supabaseConfig.functions);
  }

  /**
   * Build function URL
   */
  public static buildFunctionUrl(functionName: string): string {
    const baseUrl = supabaseConfig.projectUrl.replace(/\/$/, '');
    return `${baseUrl}/functions/v1/${functionName}`;
  }

  /**
   * Get authorization headers
   */
  public static getAuthHeaders(useServiceRole: boolean = false): Record<string, string> {
    const key = useServiceRole ? supabaseConfig.serviceRoleKey : supabaseConfig.anonKey;
    return {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
  }
}

export default supabaseConfig;