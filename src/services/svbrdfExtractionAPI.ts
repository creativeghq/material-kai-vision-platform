import { supabase } from '@/integrations/supabase/client';

export interface SVBRDFExtractionRequest {
  user_id: string;
  source_image_url: string;
  material_id?: string;
  extraction_id?: string;
}

export interface SVBRDFExtractionResult {
  success: boolean;
  extraction_id: string;
  albedo_map_url?: string;
  normal_map_url?: string;
  roughness_map_url?: string;
  metallic_map_url?: string;
  height_map_url?: string;
  extracted_properties?: Record<string, unknown>;
  confidence_score?: number;
  processing_time_ms?: number;
  error_message?: string;
}

export interface SVBRDFExtractionRecord {
  id: string;
  user_id: string;
  source_image_url: string;
  material_id?: string;
  extraction_status: string;
  albedo_map_url?: string;
  normal_map_url?: string;
  roughness_map_url?: string;
  metallic_map_url?: string;
  height_map_url?: string;
  extracted_properties: Record<string, unknown>;
  confidence_score?: number;
  processing_time_ms?: number;
  error_message?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class SVBRDFExtractionAPI {
  /**
   * Start SVBRDF extraction from an image
   */
  static async startExtraction(request: SVBRDFExtractionRequest): Promise<SVBRDFExtractionResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('svbrdf-extractor', {
        body: {
          ...request,
          user_id: user.id,
        },
      });

      if (error) {
        throw error;
      }

      return data as SVBRDFExtractionResult;
    } catch (error) {
      console.error('Error starting SVBRDF extraction:', error);
      throw error;
    }
  }

  /**
   * Get user's SVBRDF extractions
   */
  static async getUserExtractions(limit = 20): Promise<SVBRDFExtractionRecord[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('svbrdf_extractions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching SVBRDF extractions:', error);
      throw error;
    }
  }

  /**
   * Get specific SVBRDF extraction by ID
   */
  static async getExtraction(id: string): Promise<SVBRDFExtractionRecord | null> {
    try {
      const { data, error } = await supabase
        .from('svbrdf_extractions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching SVBRDF extraction:', error);
      throw error;
    }
  }

  /**
   * Upload image and start SVBRDF extraction
   */
  static async uploadImageAndExtract(file: File, materialId?: string): Promise<SVBRDFExtractionResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Upload image to storage
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}/source_image.${file.name.split('.').pop()}`;

      const { data: _data, error } = await supabase.storage
        .from('material-images')
        .upload(fileName, file);

      if (error) {
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from('material-images')
        .getPublicUrl(fileName);

      // Start SVBRDF extraction
      return await this.startExtraction({
        user_id: user.id,
        source_image_url: urlData.publicUrl,
        material_id: materialId,
      });

    } catch (error) {
      console.error('Error uploading image and starting extraction:', error);
      throw error;
    }
  }

  /**
   * Get extraction analytics
   */
  static async getExtractionAnalytics(_timeRange = '30 days') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('svbrdf_extractions')
        .select('extraction_status, confidence_score, processing_time_ms, created_at, extracted_properties')
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) {
        throw error;
      }

      const analytics = {
        total_extractions: data.length,
        successful_extractions: data.filter((e: any) => e.extraction_status === 'completed').length,
        failed_extractions: data.filter((e: any) => e.extraction_status === 'failed').length,
        average_processing_time: data
          .filter((e: any) => e.processing_time_ms)
          .reduce((acc: any, e: any) => acc + (e.processing_time_ms || 0), 0) / data.filter((e: any) => e.processing_time_ms).length || 0,
        average_confidence: data
          .filter((e: any) => e.confidence_score)
          .reduce((acc: any, e: any) => acc + (e.confidence_score || 0), 0) / data.filter((e: any) => e.confidence_score).length || 0,
        material_types: this.analyzeMaterialTypes(data),
        surface_categories: this.analyzeSurfaceCategories(data),
      };

      return analytics;
    } catch (error) {
      console.error('Error fetching extraction analytics:', error);
      throw error;
    }
  }

  /**
   * Link extraction to material in catalog
   */
  static async linkToMaterial(extractionId: string, materialId: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { error } = await supabase
        .from('svbrdf_extractions')
        .update({ material_id: materialId })
        .eq('id', extractionId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error linking extraction to material:', error);
      throw error;
    }
  }

  /**
   * Update material catalog with SVBRDF properties
   */
  static async updateMaterialProperties(extractionId: string): Promise<void> {
    try {
      const extraction = await this.getExtraction(extractionId);
      if (!extraction || !extraction.material_id || !extraction.extracted_properties) {
        throw new Error('Extraction not found or missing material/properties');
      }

      // Update the material catalog with extracted properties
      const { error } = await supabase
        .from('materials_catalog')
        .update({
          properties: {
            ...extraction.extracted_properties,
            svbrdf_maps: {
              albedo: extraction.albedo_map_url,
              normal: extraction.normal_map_url,
              roughness: extraction.roughness_map_url,
              metallic: extraction.metallic_map_url,
              height: extraction.height_map_url,
            },
            extraction_confidence: extraction.confidence_score,
          },
        })
        .eq('id', extraction.material_id);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error updating material properties:', error);
      throw error;
    }
  }

  private static analyzeMaterialTypes(data: SVBRDFExtractionRecord[]): Record<string, number> {
    const types: Record<string, number> = {};
    data.forEach(extraction => {
      if (extraction.extracted_properties?.material_type) {
        const type = extraction.extracted_properties.material_type;
        if (typeof type === 'string') {
          types[type] = (types[type] || 0) + 1;
        }
      }
    });
    return types;
  }

  private static analyzeSurfaceCategories(data: SVBRDFExtractionRecord[]): Record<string, number> {
    const categories: Record<string, number> = {};
    data.forEach(extraction => {
      if (extraction.extracted_properties?.surface_category) {
        const category = extraction.extracted_properties.surface_category;
        if (typeof category === 'string') {
          categories[category] = (categories[category] || 0) + 1;
        }
      }
    });
    return categories;
  }
}
