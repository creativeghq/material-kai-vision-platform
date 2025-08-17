import { supabase } from '@/integrations/supabase/client';

export interface Generation3DRequest {
  prompt: string;
  room_type?: string;
  style?: string;
  specific_materials?: string[];
}

export interface Generation3DResult {
  success: boolean;
  generation_id: string;
  image_urls: string[];
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
    properties: Record<string, any>;
  }>;
  quality_assessment: {
    score: number;
    feedback: string;
  };
  processing_time_ms: number;
}

export interface Generation3DRecord {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  generation_name: string;
  generation_type: string;
  generation_status: string;
  input_data: any;
  output_data: any;
  generation_config: any;
  progress_percentage: number;
  error_message: string | null;
  processing_time_ms: number | null;
  estimated_completion_time: string | null;
  file_urls: any;
  preview_url: string | null;
  download_url: string | null;
  file_size_bytes: number | null;
  quality_score: number | null;
  tags: any;
  metadata: any;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export class MaterialAgent3DGenerationAPI {
  // Generate 3D interior design using Material Agent Orchestrator
  static async generate3D(request: Generation3DRequest): Promise<Generation3DResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      console.log('Calling edge function with request:', {
        user_id: user.id,
        prompt: request.prompt,
        room_type: request.room_type,
        style: request.style,
        specific_materials: request.specific_materials,
      });

      const { data, error } = await supabase.functions.invoke('material-agent-3d-generation', {
        body: {
          user_id: user.id,
          prompt: request.prompt,
          room_type: request.room_type,
          style: request.style,
          specific_materials: request.specific_materials,
        },
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Supabase functions error:', error);
        throw new Error(`Failed to send a request to the Edge Function: ${error.message}`);
      }

      // Check if the response indicates an error
      if (data && !data.success && data.error) {
        throw new Error(`${data.error}: ${data.details || 'Unknown error'}`);
      }

      return data;
    } catch (error) {
      console.error('3D generation error:', error);
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
  static async getGenerationAnalytics(timeRange = '30 days') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('analytics_events')
        .select('event_data, created_at')
        .eq('user_id', user.id)
        .eq('event_type', '3d_generation_completed')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
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

      data?.forEach(event => {
        const eventData = event.event_data as any;

        // Processing time
        if (eventData.processing_time_ms) {
          totalProcessingTime += eventData.processing_time_ms;
        }

        // Quality score
        if (eventData.quality_score) {
          totalQualityScore += eventData.quality_score;
          qualityCount++;
        }

        // Room types
        if (eventData.room_type) {
          analytics.popular_room_types[eventData.room_type] =
            (analytics.popular_room_types[eventData.room_type] || 0) + 1;
        }

        // Styles
        if (eventData.style) {
          analytics.popular_styles[eventData.style] =
            (analytics.popular_styles[eventData.style] || 0) + 1;
        }
      });

      analytics.avg_processing_time = analytics.total_generations > 0 ?
        totalProcessingTime / analytics.total_generations : 0;
      analytics.avg_quality_score = qualityCount > 0 ?
        totalQualityScore / qualityCount : 0;

      return analytics;
    } catch (error) {
      console.error('Error fetching generation analytics:', error);
      throw error;
    }
  }

  // Search generations by criteria
  static async searchGenerations(query: string, roomType?: string, style?: string) {
    try {
      let queryBuilder = supabase
        .from('generation_3d')
        .select('*')
        .order('created_at', { ascending: false });

      if (query) {
        queryBuilder = queryBuilder.or(`prompt.ilike.%${query}%,materials_used.cs.{${query}}`);
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
