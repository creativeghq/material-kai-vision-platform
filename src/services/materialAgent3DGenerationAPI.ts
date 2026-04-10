import { supabase } from '@/integrations/supabase/client';
import { BrowserApiIntegrationService } from './apiGateway/browserApiIntegrationService';

export interface Generation3DRequest {
  prompt: string;
  room_type?: string;
  style?: string;
  specific_materials?: string[];
  reference_image_url?: string; // Optional reference image for image-to-image generation
}

export interface ModelResult {
  model_id: string;
  model_name: string;
  provider: 'replicate' | 'huggingface';
  image_urls: string[];
  processing_time_ms: number;
  success: boolean;
  error?: string;
}

export interface Generation3DResult {
  success: boolean;
  generation_id: string;
  image_urls: string[]; // All images from all models
  model_results?: ModelResult[]; // Detailed results per model
  total_models?: number;
  successful_models?: number;
  parsed_request: {
    room_type: string;
    style: string;
    materials: string[];
    features: string[];
    layout: string;
    enhanced_prompt: string;
  };
  matched_materials: Array<{
    id: string;
    name: string;
    category: string;
    properties: Record<string, unknown>;
  }>;
  quality_assessment: {
    score: number;
    feedback: string;
  };
  processing_time_ms: number;
  spatial_analysis?: unknown;
}

export interface Generation3DRecord {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  generation_name: string;
  generation_type: string;
  generation_status: string;
  input_data: unknown;
  output_data: unknown;
  generation_config: unknown;
  progress_percentage: number;
  error_message: string | null;
  processing_time_ms: number | null;
  estimated_completion_time: string | null;
  file_urls: unknown;
  preview_url: string | null;
  download_url: string | null;
  file_size_bytes: number | null;
  quality_score: number | null;
  tags: unknown;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export class MaterialAgent3DGenerationAPI {
  /**
   * Generate 3D interior design using BrowserApiIntegrationService
   * This uses Replicate or Hugging Face models for image generation
   */
  static async generate3D(
    request: Generation3DRequest,
  ): Promise<Generation3DResult> {
    const startTime = Date.now();

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('🎨 Generating 3D interior design with request:', {
        user_id: user.id,
        prompt: request.prompt,
        room_type: request.room_type,
        style: request.style,
        specific_materials: request.specific_materials,
        has_reference_image: !!request.reference_image_url,
      });

      // Use BrowserApiIntegrationService for multi-model image generation
      const apiService = BrowserApiIntegrationService.getInstance();

      // Build enhanced prompt with materials if provided
      let enhancedPrompt = request.prompt;
      if (request.specific_materials && request.specific_materials.length > 0) {
        enhancedPrompt += ` featuring ${request.specific_materials.join(', ')}`;
      }

      // Call multi-model generation (Replicate + Hugging Face in parallel)
      const result = await apiService.generateInteriorDesign({
        prompt: enhancedPrompt,
        roomType: request.room_type,
        style: request.style,
        width: 768,
        height: 768,
        imageUrl: request.reference_image_url, // Pass reference image for image-to-image models
      });

      console.log('✅ Multi-model generation response:', result);
      console.log(`📊 Generated ${result.data?.image_urls?.length || 0} images from ${result.data?.successful_models || 0}/${result.data?.total_models || 0} models`);

      if (!result.success || !result.data) {
        throw new Error(
          result.error?.message || 'Failed to generate interior design',
        );
      }

      const processingTime = Date.now() - startTime;

      // Create generation record in database
      const generationId = crypto.randomUUID();
      const imageUrls = Array.isArray(result.data.image_urls)
        ? result.data.image_urls
        : [result.data.image_url].filter(Boolean);

      await supabase.from('generation_3d').insert({
        id: generationId,
        user_id: user.id,
        generation_name: `Interior Design - ${request.room_type || 'general'}`,
        generation_type: 'interior_design',
        generation_status: 'completed',
        input_data: {
          prompt: request.prompt,
          room_type: request.room_type,
          style: request.style,
          specific_materials: request.specific_materials,
        },
        output_data: {
          image_urls: imageUrls,
          spatial_analysis: null,
        },
        processing_time_ms: processingTime,
        file_urls: imageUrls,
        preview_url: imageUrls[0] || null,
        completed_at: new Date().toISOString(),
      });

      // Return standardized response with spatial analysis and model results
      return {
        success: true,
        generation_id: generationId,
        image_urls: imageUrls,
        model_results: result.data.model_results, // Include per-model results
        total_models: result.data.total_models,
        successful_models: result.data.successful_models,
        parsed_request: {
          room_type: request.room_type || 'general',
          style: request.style || 'modern',
          materials: request.specific_materials || [],
          features: [],
          layout: '',
          enhanced_prompt: enhancedPrompt,
        },
        matched_materials: [],
        quality_assessment: {
          score: 0.85,
          feedback: `Generated using ${result.data.successful_models}/${result.data.total_models} AI models`,
        },
        processing_time_ms: processingTime,
        spatial_analysis: null,
      };
    } catch (error) {
      console.error('❌ 3D generation error:', error);
      throw error;
    }
  }

  // Get user's 3D generation history
  static async getUserGenerations(limit = 20): Promise<Generation3DRecord[]> {
    try {
      const { data, error } = await supabase
        .from('generation_3d')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch generations: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching user generations:', error);
      throw error;
    }
  }

  // Get specific generation by ID
  static async getGeneration(id: string): Promise<Generation3DRecord | null> {
    try {
      const { data, error } = await supabase
        .from('generation_3d')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        throw new Error(`Failed to fetch generation: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error fetching generation:', error);
      throw error;
    }
  }

  // Get analytics for 3D generations
  static async getGenerationAnalytics(_timeRange = '30 days') {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('analytics_events')
        .select('event_data, created_at')
        .eq('user_id', user.id)
        .eq('event_type', '3d_generation_completed')
        .gte(
          'created_at',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        )
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch analytics: ${error.message}`);
      }

      // Process analytics data
      const analytics = {
        total_generations: data?.length || 0,
        avg_processing_time: 0,
        avg_quality_score: 0,
        popular_room_types: {} as Record<string, number>,
        popular_styles: {} as Record<string, number>,
        material_usage: {} as Record<string, number>,
      };

      let totalProcessingTime = 0;
      let totalQualityScore = 0;
      let qualityCount = 0;

      data?.forEach((event: any) => {
        const eventData = event.event_data as Record<string, unknown>;

        // Processing time
        if (eventData.processing_time_ms) {
          totalProcessingTime += eventData.processing_time_ms as number;
        }

        // Quality score
        if (eventData.quality_score) {
          totalQualityScore += eventData.quality_score as number;
          qualityCount++;
        }

        // Room types
        if (eventData.room_type) {
          analytics.popular_room_types[eventData.room_type as string] =
            (analytics.popular_room_types[eventData.room_type as string] || 0) +
            1;
        }

        // Styles
        if (eventData.style) {
          analytics.popular_styles[eventData.style as string] =
            (analytics.popular_styles[eventData.style as string] || 0) + 1;
        }
      });

      analytics.avg_processing_time =
        analytics.total_generations > 0
          ? totalProcessingTime / analytics.total_generations
          : 0;
      analytics.avg_quality_score =
        qualityCount > 0 ? totalQualityScore / qualityCount : 0;

      return analytics;
    } catch (error) {
      console.error('Error fetching generation analytics:', error);
      throw error;
    }
  }

  // Search generations by criteria
  static async searchGenerations(
    query: string,
    roomType?: string,
    style?: string,
  ) {
    try {
      let queryBuilder = supabase
        .from('generation_3d')
        .select('*')
        .order('created_at', { ascending: false });

      if (query) {
        queryBuilder = queryBuilder.or(
          `prompt.ilike.%${query}%,materials_used.cs.{${query}}`,
        );
      }

      if (roomType) {
        queryBuilder = queryBuilder.eq('room_type', roomType);
      }

      if (style) {
        queryBuilder = queryBuilder.eq('style', style);
      }

      const { data, error } = await queryBuilder.limit(50);

      if (error) {
        throw new Error(`Search failed: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error searching generations:', error);
      throw error;
    }
  }
}
