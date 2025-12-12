/**
 * Standalone 3D Interior Design Generation Service
 * 
 * This service provides direct image generation for interior design
 * using Replicate/Hugging Face APIs. It does NOT use the agent system.
 * 
 * This is designed for long-running operations that cannot be handled
 * by Supabase Edge Functions due to timeout constraints.
 */

import { supabase } from '@/integrations/supabase/client';
import { BrowserApiIntegrationService } from './apiGateway/browserApiIntegrationService';

export interface Designer3DRequest {
  prompt: string;
  room_type?: string;
  style?: string;
  width?: number;
  height?: number;
}

export interface Designer3DResult {
  success: boolean;
  generation_id: string;
  image_urls: string[];
  enhanced_prompt: string;
  processing_time_ms: number;
  error?: string;
}

/**
 * Standalone 3D Interior Designer Service
 * Uses direct API calls to Replicate/Hugging Face for image generation
 */
export class Designer3DService {
  private static instance: Designer3DService;

  private constructor() {}

  public static getInstance(): Designer3DService {
    if (!Designer3DService.instance) {
      Designer3DService.instance = new Designer3DService();
    }
    return Designer3DService.instance;
  }

  /**
   * Generate 3D interior design images
   * This is a standalone operation that does NOT use agents
   */
  async generateDesign(request: Designer3DRequest): Promise<Designer3DResult> {
    const startTime = Date.now();

    try {
      // Verify user authentication
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('🎨 [Designer3D] Starting image generation:', {
        user_id: user.id,
        prompt: request.prompt,
        room_type: request.room_type,
        style: request.style,
      });

      // Get API service instance
      const apiService = BrowserApiIntegrationService.getInstance();

      // Build enhanced prompt
      const enhancedPrompt = this.buildEnhancedPrompt(request);

      // Generate image using direct API call (Replicate/Hugging Face)
      const result = await apiService.generateInteriorDesign({
        prompt: enhancedPrompt,
        roomType: request.room_type,
        style: request.style,
        width: request.width || 768,
        height: request.height || 768,
      });

      console.log('✅ [Designer3D] Image generation response:', result);

      if (!result.success || !result.data) {
        throw new Error(
          result.error?.message || 'Failed to generate interior design'
        );
      }

      const processingTime = Date.now() - startTime;

      // Extract image URLs from response
      const imageUrls = Array.isArray(result.data.image_urls)
        ? result.data.image_urls
        : [result.data.image_url].filter(Boolean);

      if (imageUrls.length === 0) {
        throw new Error('No images generated');
      }

      // Create generation record in database
      const generationId = crypto.randomUUID();
      
      await supabase.from('generation_3d').insert({
        id: generationId,
        user_id: user.id,
        generation_name: `3D Design - ${request.room_type || 'general'}`,
        generation_type: 'interior_design',
        generation_status: 'completed',
        input_data: {
          prompt: request.prompt,
          room_type: request.room_type,
          style: request.style,
          enhanced_prompt: enhancedPrompt,
        },
        output_data: {
          image_urls: imageUrls,
        },
        processing_time_ms: processingTime,
      });

      console.log(`✅ [Designer3D] Generation completed in ${processingTime}ms`);

      return {
        success: true,
        generation_id: generationId,
        image_urls: imageUrls,
        enhanced_prompt: enhancedPrompt,
        processing_time_ms: processingTime,
      };
    } catch (error) {
      console.error('❌ [Designer3D] Generation error:', error);
      
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        generation_id: '',
        image_urls: [],
        enhanced_prompt: '',
        processing_time_ms: processingTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build enhanced prompt with room type and style
   */
  private buildEnhancedPrompt(request: Designer3DRequest): string {
    let prompt = request.prompt;

    // Add room type prefix
    if (request.room_type) {
      const roomLabel = request.room_type.replace('_', ' ');
      prompt = `${roomLabel} interior: ${prompt}`;
    }

    // Add style suffix
    if (request.style) {
      prompt += `, ${request.style} style`;
    }

    // Add quality enhancers
    prompt += ', high quality, professional interior design, well-lit, detailed, photorealistic';

    return prompt;
  }

  /**
   * Get generation history for current user
   */
  async getGenerationHistory(limit: number = 10): Promise<any[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('generation_3d')
        .select('*')
        .eq('user_id', user.id)
        .eq('generation_type', 'interior_design')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ [Designer3D] Failed to fetch history:', error);
      return [];
    }
  }
}

// Export singleton instance
export const designer3DService = Designer3DService.getInstance();

