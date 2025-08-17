/**
 * Spaceformer Analysis Service
 * Integrates with the spaceformer-analysis edge function for spatial reasoning
 */

import { supabase } from '@/integrations/supabase/client';

export interface SpaceformerRequest {
  nerf_reconstruction_id?: string;
  room_type: string;
  room_dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  user_preferences?: any;
  constraints?: any;
  analysis_type?: 'full' | 'layout' | 'materials' | 'accessibility';
}

export interface SpatialFeature {
  type: string;
  position: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
  importance: number;
  accessibility_rating: number;
}

export interface LayoutSuggestion {
  item_type: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  reasoning: string;
  confidence: number;
  alternative_positions?: Array<{ x: number; y: number; z: number }>;
}

export interface SpaceformerResult {
  success: boolean;
  analysis_id: string;
  spatial_features: SpatialFeature[];
  layout_suggestions: LayoutSuggestion[];
  material_placements: any[];
  accessibility_analysis: any;
  flow_optimization: any;
  reasoning_explanation: string;
  confidence_score: number;
  processing_time_ms: number;
}

class SpaceformerAnalysisService {

  /**
   * Perform spatial analysis using Spaceformer AI
   */
  async analyzeSpace(request: SpaceformerRequest): Promise<SpaceformerResult> {
    try {
      console.log('Starting Spaceformer analysis:', request.room_type);

      const { data, error } = await supabase.functions.invoke('spaceformer-analysis', {
        body: {
          user_id: (await supabase.auth.getUser()).data.user?.id,
          ...request,
        },
      });

      if (error) {
        console.error('Spaceformer analysis error:', error);
        throw new Error(`Spaceformer analysis failed: ${error.message}`);
      }

      return data as SpaceformerResult;

    } catch (error) {
      console.error('Error in spaceformer analysis:', error);
      throw error;
    }
  }

  /**
   * Get spatial analysis results by ID
   */
  async getAnalysisResults(analysisId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('spatial_analysis')
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
   * List spatial analyses for a user
   */
  async listUserAnalyses(userId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('spatial_analysis')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
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
   * Analyze space from NeRF reconstruction
   */
  async analyzeFromNeRF(nerfId: string, roomType: string): Promise<SpaceformerResult> {
    return this.analyzeSpace({
      nerf_reconstruction_id: nerfId,
      room_type: roomType,
      analysis_type: 'full',
    });
  }

  /**
   * Quick layout analysis without full spatial processing
   */
  async quickLayoutAnalysis(roomType: string, dimensions: any): Promise<SpaceformerResult> {
    return this.analyzeSpace({
      room_type: roomType,
      room_dimensions: dimensions,
      analysis_type: 'layout',
    });
  }

  /**
   * Material placement optimization
   */
  async optimizeMaterialPlacements(
    spatialFeatures: SpatialFeature[],
    roomType: string,
  ): Promise<any> {
    return this.analyzeSpace({
      room_type: roomType,
      analysis_type: 'materials',
      user_preferences: { spatial_features: spatialFeatures },
    });
  }

  /**
   * Accessibility analysis
   */
  async analyzeAccessibility(
    spatialFeatures: SpatialFeature[],
    roomType: string,
  ): Promise<any> {
    return this.analyzeSpace({
      room_type: roomType,
      analysis_type: 'accessibility',
      user_preferences: { spatial_features: spatialFeatures },
    });
  }
}

// Export singleton instance
export const spaceformerAnalysisService = new SpaceformerAnalysisService();
export { SpaceformerAnalysisService };
