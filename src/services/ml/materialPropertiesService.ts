/**
 * Material Properties Analysis Service
 * Connects to the material-properties-analysis edge function
 */

import { supabase } from "@/integrations/supabase/client";

export interface MaterialPropertiesRequest {
  image_url?: string;
  image_data?: string; // base64
  material_id?: string;
  analysis_type?: 'thermal' | 'mechanical' | 'chemical' | 'optical' | 'comprehensive';
  user_id?: string;
}

export interface MaterialProperty {
  name: string;
  value: number | string;
  unit: string;
  confidence: number;
  measurement_method: string;
}

export interface MaterialPropertiesResult {
  success: boolean;
  analysis_id: string;
  material_id?: string;
  properties: MaterialProperty[];
  thermal_properties?: any;
  mechanical_properties?: any;
  chemical_properties?: any;
  optical_properties?: any;
  confidence_score: number;
  processing_time_ms: number;
  recommendations?: string[];
}

class MaterialPropertiesService {
  
  /**
   * Analyze material properties from image or existing material
   */
  async analyzeProperties(request: MaterialPropertiesRequest): Promise<MaterialPropertiesResult> {
    try {
      console.log('Starting material properties analysis:', request.analysis_type);

      const { data, error } = await supabase.functions.invoke('material-properties-analysis', {
        body: {
          user_id: (await supabase.auth.getUser()).data.user?.id,
          ...request
        }
      });

      if (error) {
        console.error('Material properties analysis error:', error);
        throw new Error(`Analysis failed: ${error.message}`);
      }

      return data as MaterialPropertiesResult;

    } catch (error) {
      console.error('Error in material properties analysis:', error);
      throw error;
    }
  }

  /**
   * Get properties analysis results by ID
   */
  async getAnalysisResults(analysisId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('material_style_analysis')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (error) throw error;
      return data;

    } catch (error) {
      console.error('Error getting analysis results:', error);
      throw error;
    }
  }

  /**
   * List properties analyses for a user
   */
  async listUserAnalyses(userId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('material_style_analysis')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        // Filter by material creator if needed
        query = query.eq('material_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error('Error listing analyses:', error);
      throw error;
    }
  }

  /**
   * Comprehensive material analysis
   */
  async comprehensiveAnalysis(imageData: string): Promise<MaterialPropertiesResult> {
    return this.analyzeProperties({
      image_data: imageData,
      analysis_type: 'comprehensive'
    });
  }

  /**
   * Quick thermal analysis
   */
  async thermalAnalysis(imageData: string): Promise<MaterialPropertiesResult> {
    return this.analyzeProperties({
      image_data: imageData,
      analysis_type: 'thermal'
    });
  }

  /**
   * Mechanical properties analysis
   */
  async mechanicalAnalysis(imageData: string): Promise<MaterialPropertiesResult> {
    return this.analyzeProperties({
      image_data: imageData,
      analysis_type: 'mechanical'
    });
  }
}

// Export singleton instance
export const materialPropertiesService = new MaterialPropertiesService();
export { MaterialPropertiesService };