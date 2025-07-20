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

// CrewAI 3D Generation function schema - UX validation only
// Schema matches the actual data structure sent by ApiIntegrationService
const crewai3DGenerationInputSchema = z.object({
  functionName: z.string(),
  data: z.object({
    prompt: z.string().min(1, "Prompt is required"),
    models: z.array(z.string()).min(1, "At least one model is required"), // Updated to accept array of models
    user_id: z.string().optional(), // Added user_id field
    image_url: z.string().url("Please enter a valid URL").optional(),
    room_type: z.string().optional(),
    style: z.string().optional(),
    num_inference_steps: z.number().optional(),
    guidance_scale: z.number().optional(),
    strength: z.number().optional(),
    seed: z.number().optional(),
    negative_prompt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
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

// Enhanced RAG Search function schema - UX validation only
const enhancedRAGSearchInputSchema = z.object({
  query: z.string().min(1, "Query is required"),
  collection_name: z.string().optional(),
  limit: z.number().optional(),
  threshold: z.number().optional(),
  include_metadata: z.boolean().optional(),
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

// Material Scraper function schema - UX validation only
const materialScraperInputSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
  extract_images: z.boolean().optional(),
  extract_text: z.boolean().optional(),
  max_images: z.number().optional(),
  image_min_size: z.number().optional(),
  timeout: z.number().optional(),
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

// OCR Processing function schema - UX validation only
const ocrProcessingInputSchema = z.object({
  image_url: z.string().url("Please enter a valid image URL"),
  language: z.string().optional(),
  output_format: z.string().optional(),
  preprocessing: z.object({
    enhance_contrast: z.boolean().optional(),
    denoise: z.boolean().optional(),
    deskew: z.boolean().optional(),
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

// SVBRDF Extractor function schema - UX validation only
const svbrdfExtractorInputSchema = z.object({
  image_url: z.string().url("Please enter a valid image URL"),
  output_format: z.string().optional(),
  resolution: z.number().optional(),
  enhance_quality: z.boolean().optional(),
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
        images: z.array(z.string().url()).min(1, "At least 1 image required"),
        output_format: z.string().optional(),
        quality: z.string().optional(),
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
        image_url: z.string().url("Please enter a valid image URL"),
        analysis_type: z.string().optional(),
        include_suggestions: z.boolean().optional(),
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