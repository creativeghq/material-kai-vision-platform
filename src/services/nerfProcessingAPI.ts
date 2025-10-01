import { supabase } from '@/integrations/supabase/client';

export interface NeRFProcessingRequest {
  user_id: string;
  source_image_urls: string[];
  reconstruction_id?: string;
}

export interface NeRFProcessingResult {
  success: boolean;
  reconstruction_id: string;
  model_file_url?: string;
  mesh_file_url?: string;
  point_cloud_url?: string;
  quality_score?: number;
  processing_time_ms?: number;
  error_message?: string;
}

export interface NeRFReconstructionRecord {
  id: string;
  user_id: string;
  source_image_urls: string[];
  reconstruction_status: string;
  model_file_url?: string;
  mesh_file_url?: string;
  point_cloud_url?: string;
  processing_time_ms?: number;
  quality_score?: number;
  error_message?: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export class NeRFProcessingAPI {
  /**
   * Start NeRF reconstruction from uploaded images
   */
  static async startReconstruction(request: NeRFProcessingRequest): Promise<NeRFProcessingResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('nerf-processor', {
        body: {
          ...request,
          user_id: user.id,
        },
      });

      if (error) {
        throw error;
      }

      return data as NeRFProcessingResult;
    } catch (error) {
      console.error('Error starting NeRF reconstruction:', error);
      throw error;
    }
  }

  /**
   * Get user's NeRF reconstructions
   */
  static async getUserReconstructions(limit = 20): Promise<NeRFReconstructionRecord[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('nerf_reconstructions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching NeRF reconstructions:', error);
      throw error;
    }
  }

  /**
   * Get specific NeRF reconstruction by ID
   */
  static async getReconstruction(id: string): Promise<NeRFReconstructionRecord | null> {
    try {
      const { data, error } = await supabase
        .from('nerf_reconstructions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching NeRF reconstruction:', error);
      throw error;
    }
  }

  /**
   * Upload images and start NeRF reconstruction
   */
  static async uploadImagesAndReconstruct(files: File[]): Promise<NeRFProcessingResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (files.length < 3) {
        throw new Error('Need at least 3 images for NeRF reconstruction');
      }

      const uploadedUrls: string[] = [];
      const timestamp = Date.now();

      // Upload images to storage
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileName = `${user.id}/${timestamp}/image_${i + 1}.${file.name.split('.').pop()}`;

        const { data: _data, error } = await supabase.storage
          .from('material-images')
          .upload(fileName, file);

        if (error) {
          throw error;
        }

        const { data: urlData } = supabase.storage
          .from('material-images')
          .getPublicUrl(fileName);

        uploadedUrls.push(urlData.publicUrl);
      }

      // Start NeRF reconstruction
      return await this.startReconstruction({
        user_id: user.id,
        source_image_urls: uploadedUrls,
      });

    } catch (error) {
      console.error('Error uploading images and starting reconstruction:', error);
      throw error;
    }
  }

  /**
   * Get reconstruction analytics
   */
  static async getReconstructionAnalytics(_timeRange = '30 days') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('nerf_reconstructions')
        .select('reconstruction_status, quality_score, processing_time_ms, created_at')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw error;
      }

      const analytics = {
        total_reconstructions: data.length,
        successful_reconstructions: data.filter(r => r.reconstruction_status === 'completed').length,
        failed_reconstructions: data.filter(r => r.reconstruction_status === 'failed').length,
        average_processing_time: data
          .filter(r => r.processing_time_ms)
          .reduce((acc, r) => acc + (r.processing_time_ms || 0), 0) / data.filter(r => r.processing_time_ms).length || 0,
        average_quality_score: data
          .filter(r => r.quality_score)
          .reduce((acc, r) => acc + (r.quality_score || 0), 0) / data.filter(r => r.quality_score).length || 0,
      };

      return analytics;
    } catch (error) {
      console.error('Error fetching reconstruction analytics:', error);
      throw error;
    }
  }
}
