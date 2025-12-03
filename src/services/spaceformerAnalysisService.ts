/**
 * Spaceformer Analysis Service
 * AI-powered spatial reasoning for room layout optimization, material placement, and accessibility analysis
 */

import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';

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
  image_url?: string;
  image_data?: string;
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
  barrier_free_paths: Array<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    width: number;
  }>;
  ada_compliance: boolean;
}

export interface FlowOptimization {
  traffic_patterns: Array<{
    path: Array<{ x: number; y: number }>;
    frequency: number;
    purpose: string;
  }>;
  bottlenecks: Array<{
    position: { x: number; y: number };
    severity: number;
    recommendation: string;
  }>;
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
   * Perform spatial analysis using Spaceformer AI (Claude Vision)
   */
  async analyzeSpace(request: SpaceformerRequest): Promise<SpaceformerResult> {
    try {
      console.log('Starting Spaceformer analysis:', request.room_type);

      const response = await mivaaApi.analyzeSpaceformer({
        image_url: request.image_url,
        image_data: request.image_data,
        room_type: request.room_type,
        room_dimensions: request.room_dimensions,
        user_preferences: request.user_preferences,
        constraints: request.constraints,
        analysis_type: request.analysis_type,
      });

      if (!response.success || !response.data) {
        console.error('Spaceformer analysis error:', response.error);
        throw new Error(
          `Spaceformer analysis failed: ${response.error || 'Unknown error'}`,
        );
      }

      return response.data as SpaceformerResult;
    } catch (error) {
      console.error('Error in spaceformer analysis:', error);
      throw error;
    }
  }

  /**
   * Get spatial analysis results by ID
   */
  async getAnalysisResults(
    analysisId: string,
  ): Promise<SpaceformerResult | null> {
    try {
      const { data, error } = await supabase
        .from('spatial_analysis')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (error) {
        throw error;
      }

      return data as SpaceformerResult;
    } catch (error) {
      console.error('Error getting analysis results:', error);
      throw error;
    }
  }

  /**
   * List spatial analyses for a user
   */
  async listUserAnalyses(limit = 20): Promise<SpaceformerResult[]> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('spatial_analysis')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []) as SpaceformerResult[];
    } catch (error) {
      console.error('Error listing analyses:', error);
      throw error;
    }
  }

  /**
   * Quick layout analysis without full spatial processing
   */
  async quickLayoutAnalysis(
    roomType: string,
    dimensions: { width: number; height: number; depth: number },
    imageUrl?: string,
    imageData?: string,
  ): Promise<SpaceformerResult> {
    return this.analyzeSpace({
      image_url: imageUrl,
      image_data: imageData,
      room_type: roomType,
      room_dimensions: dimensions,
      analysis_type: 'layout',
    });
  }

  /**
   * Material placement optimization
   */
  async optimizeMaterialPlacements(
    roomType: string,
    imageUrl?: string,
    imageData?: string,
    userPreferences?: UserPreferences,
  ): Promise<SpaceformerResult> {
    return this.analyzeSpace({
      image_url: imageUrl,
      image_data: imageData,
      room_type: roomType,
      analysis_type: 'materials',
      user_preferences: userPreferences,
    });
  }

  /**
   * Accessibility analysis
   */
  async analyzeAccessibility(
    roomType: string,
    imageUrl?: string,
    imageData?: string,
  ): Promise<SpaceformerResult> {
    return this.analyzeSpace({
      image_url: imageUrl,
      image_data: imageData,
      room_type: roomType,
      analysis_type: 'accessibility',
    });
  }
}

// Export singleton instance
export const spaceformerAnalysisService = new SpaceformerAnalysisService();
export { SpaceformerAnalysisService };

