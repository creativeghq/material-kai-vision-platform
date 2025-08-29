/**
 * Spaceformer Analysis Service
 * Integrates with the spaceformer-analysis edge function for spatial reasoning
 */

import { supabase } from '@/integrations/supabase/client';

export interface UserPreferences {
  style?: string;
  budget_range?: { min: number; max: number };
  accessibility_requirements?: string[];
  color_preferences?: string[];
  material_preferences?: string[];
  lighting_preferences?: string;
  spatial_features?: SpatialFeature[];
}

export interface AnalysisConstraints {
  max_items?: number;
  excluded_areas?: Array<{ x: number; y: number; z: number; radius: number }>;
  required_clearances?: Record<string, number>;
  weight_limits?: Record<string, number>;
  accessibility_compliance?: boolean;
}

export interface SpaceformerRequest {
  nerf_reconstruction_id?: string;
  room_type: string;
  room_dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  user_preferences?: UserPreferences;
  constraints?: AnalysisConstraints;
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

export interface MaterialPlacement {
  material_id: string;
  position: { x: number; y: number; z: number };
  surface_area: number;
  application_method: string;
  confidence: number;
  reasoning: string;
}

export interface AccessibilityAnalysis {
  compliance_score: number;
  accessibility_features: string[];
  recommendations: string[];
  barrier_free_paths: Array<{ start: { x: number; y: number }; end: { x: number; y: number }; width: number }>;
  ada_compliance: boolean;
}

export interface FlowOptimization {
  traffic_patterns: Array<{ path: Array<{ x: number; y: number }>; frequency: number; purpose: string }>;
  bottlenecks: Array<{ position: { x: number; y: number }; severity: number; recommendation: string }>;
  efficiency_score: number;
  suggested_improvements: string[];
}

export interface SpaceformerResult {
  success: boolean;
  analysis_id: string;
  spatial_features: SpatialFeature[];
  layout_suggestions: LayoutSuggestion[];
  material_placements: MaterialPlacement[];
  accessibility_analysis: AccessibilityAnalysis;
  flow_optimization: FlowOptimization;
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
   * Note: spatial_analysis table doesn't exist in current schema
   */
  async getAnalysisResults(analysisId: string): Promise<SpaceformerResult | null> {
    try {
      // TODO: Implement when spatial_analysis table is available
      console.warn('spatial_analysis table not available in current schema');
      return null;

    } catch (error) {
      console.error('Error getting analysis results:', error);
      throw error;
    }
  }

  /**
   * List spatial analyses for a user
   * Note: spatial_analysis table doesn't exist in current schema
   */
  async listUserAnalyses(userId?: string): Promise<SpaceformerResult[]> {
    try {
      // TODO: Implement when spatial_analysis table is available
      console.warn('spatial_analysis table not available in current schema');
      return [];

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
  async quickLayoutAnalysis(
    roomType: string,
    dimensions: { width: number; height: number; depth: number }
  ): Promise<SpaceformerResult> {
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
  ): Promise<SpaceformerResult> {
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
  ): Promise<SpaceformerResult> {
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
