import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { evaluateResponseQuality } from '../_shared/response-quality.ts';;
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

interface SpaceFormerRequest {
  user_id: string;
  nerf_reconstruction_id?: string;
  room_type: string;
  room_dimensions?: any;
  user_preferences?: any;
  constraints?: any;
}

interface SpatialFeature {
  type: string;
  position: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
  importance: number;
  accessibility_rating: number;
}

interface LayoutSuggestion {
  item_type: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  reasoning: string;
  confidence: number;
  alternative_positions?: Array<{ x: number; y: number; z: number }>;
}

interface MaterialPlacement {
  zone: string;
  recommended_materials: string[];
  reasoning: string;
  durability_requirements: string;
  maintenance_level: string;
  cost_range: string;
}

interface SpaceFormerResult {
  success: boolean;
  analysis_id: string;
  spatial_features: SpatialFeature[];
  layout_suggestions: LayoutSuggestion[];
  material_placements: MaterialPlacement[];
  accessibility_analysis: any;
  flow_optimization: any;
  reasoning_explanation: string;
  confidence_score: number;
  processing_time_ms: number;
  error_message?: string;
}

// Advanced SpaceFormer system for spatial reasoning and optimization
class SpaceFormerProcessor {

  async analyzeSpatialContext(request: SpaceFormerRequest): Promise<SpaceFormerResult> {
    const startTime = Date.now();
    const analysisId = crypto.randomUUID();

    try {
      console.log(`Starting SpaceFormer analysis for ${request.room_type}`);

      // Create analysis record
      await this.createAnalysisRecord(analysisId, request);

      // Step 1: Extract spatial features from NeRF data (if available)
      const spatialFeatures = await this.extractSpatialFeatures(request);

      // Step 2: Analyze room function and requirements
      const functionalRequirements = await this.analyzeFunctionalRequirements(request);

      // Step 3: Generate layout suggestions with spatial reasoning
      const layoutSuggestions = await this.generateLayoutSuggestions(
        spatialFeatures,
        functionalRequirements,
        request,
      );

      // Step 4: Optimize material placements based on spatial context
      const materialPlacements = await this.optimizeMaterialPlacements(
        spatialFeatures,
        layoutSuggestions,
        request,
      );

      // Step 5: Analyze accessibility and flow
      const accessibilityAnalysis = await this.analyzeAccessibility(spatialFeatures, layoutSuggestions);
      const flowOptimization = await this.optimizeTrafficFlow(spatialFeatures, layoutSuggestions, request);

      // Step 6: Generate comprehensive reasoning explanation
      const reasoningExplanation = await this.generateReasoningExplanation(
        spatialFeatures,
        layoutSuggestions,
        materialPlacements,
        accessibilityAnalysis,
        flowOptimization,
        request,
      );

      const confidenceScore = this.calculateConfidenceScore(
        spatialFeatures,
        layoutSuggestions,
        materialPlacements,
      );

      const processingTime = Date.now() - startTime;

      // Update database with results
      await this.updateAnalysisRecord(analysisId, {
        result_data: {
          spatial_features: spatialFeatures,
          layout_suggestions: layoutSuggestions,
          material_placements: materialPlacements,
          accessibility_analysis: accessibilityAnalysis,
          flow_optimization: flowOptimization,
          reasoning_explanation: reasoningExplanation,
        },
        confidence_score: confidenceScore,
        processing_time_ms: processingTime,
      });

      return {
        success: true,
        analysis_id: analysisId,
        spatial_features: spatialFeatures,
        layout_suggestions: layoutSuggestions,
        material_placements: materialPlacements,
        accessibility_analysis: accessibilityAnalysis,
        flow_optimization: flowOptimization,
        reasoning_explanation: reasoningExplanation,
        confidence_score: confidenceScore,
        processing_time_ms: processingTime,
      };

    } catch (error) {
      console.error('SpaceFormer analysis failed:', error);

      await this.updateAnalysisRecord(analysisId, {
        status: 'failed',
        error_message: error.message,
        processing_time_ms: Date.now() - startTime,
      });

      return {
        success: false,
        analysis_id: analysisId,
        spatial_features: [],
        layout_suggestions: [],
        material_placements: [],
        accessibility_analysis: {},
        flow_optimization: {},
        reasoning_explanation: '',
        confidence_score: 0,
        processing_time_ms: Date.now() - startTime,
        error_message: error.message,
      };
    }
  }

  private async extractSpatialFeatures(request: SpaceFormerRequest): Promise<SpatialFeature[]> {
    // If NeRF reconstruction is available, extract from it
    if (request.nerf_reconstruction_id) {
      const { data: nerfData } = await supabase
        .from('nerf_reconstructions')
        .select('*')
        .eq('id', request.nerf_reconstruction_id)
        .single();

      if (nerfData) {
        return this.extractFeaturesFromNeRF(nerfData);
      }
    }

    // Otherwise, use room dimensions or generate standard features
    return this.generateStandardFeatures(request);
  }

  private extractFeaturesFromNeRF(nerfData: any): SpatialFeature[] {
    // Simulate feature extraction from NeRF point cloud
    const features: SpatialFeature[] = [
      {
        type: 'wall',
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 4, height: 2.8, depth: 0.1 },
        importance: 0.9,
        accessibility_rating: 0.1,
      },
      {
        type: 'window',
        position: { x: 2, y: 1.5, z: 0 },
        dimensions: { width: 1.2, height: 1.0, depth: 0.1 },
        importance: 0.8,
        accessibility_rating: 0.3,
      },
      {
        type: 'door',
        position: { x: 0, y: 0, z: 2 },
        dimensions: { width: 0.8, height: 2.1, depth: 0.1 },
        importance: 1.0,
        accessibility_rating: 1.0,
      },
      {
        type: 'floor',
        position: { x: 2, y: 0, z: 2 },
        dimensions: { width: 4, height: 0.1, depth: 4 },
        importance: 0.9,
        accessibility_rating: 1.0,
      },
    ];

    return features;
  }

  private generateStandardFeatures(request: SpaceFormerRequest): SpatialFeature[] {
    const dimensions = request.room_dimensions || { width: 4, height: 2.8, depth: 4 };

    const features: SpatialFeature[] = [
      {
        type: 'floor',
        position: { x: dimensions.width / 2, y: 0, z: dimensions.depth / 2 },
        dimensions: { width: dimensions.width, height: 0.1, depth: dimensions.depth },
        importance: 0.9,
        accessibility_rating: 1.0,
      },
      {
        type: 'ceiling',
        position: { x: dimensions.width / 2, y: dimensions.height, z: dimensions.depth / 2 },
        dimensions: { width: dimensions.width, height: 0.1, depth: dimensions.depth },
        importance: 0.3,
        accessibility_rating: 0.1,
      },
    ];

    // Add room-specific features
    switch (request.room_type) {
      case 'bedroom':
        features.push({
          type: 'sleeping_area',
          position: { x: dimensions.width * 0.3, y: 0.5, z: dimensions.depth * 0.7 },
          dimensions: { width: 1.4, height: 0.6, depth: 2.0 },
          importance: 1.0,
          accessibility_rating: 0.8,
        });
        break;
      case 'kitchen':
        features.push({
          type: 'work_triangle',
          position: { x: dimensions.width * 0.5, y: 0.9, z: dimensions.depth * 0.5 },
          dimensions: { width: 2.0, height: 0.1, depth: 2.0 },
          importance: 1.0,
          accessibility_rating: 1.0,
        });
        break;
      case 'living_room':
        features.push({
          type: 'seating_area',
          position: { x: dimensions.width * 0.5, y: 0.4, z: dimensions.depth * 0.6 },
          dimensions: { width: 2.5, height: 0.8, depth: 2.0 },
          importance: 0.9,
          accessibility_rating: 0.9,
        });
        break;
    }

    return features;
  }

  private async analyzeFunctionalRequirements(request: SpaceFormerRequest): Promise<any> {
    const analysisPrompt = `
    Analyze the functional requirements for a ${request.room_type} space.
    
    Room specifications:
    - Type: ${request.room_type}
    - Dimensions: ${JSON.stringify(request.room_dimensions)}
    - User preferences: ${JSON.stringify(request.user_preferences)}
    - Constraints: ${JSON.stringify(request.constraints)}
    
    Provide a detailed analysis including:
    1. Primary functions and activities
    2. Secondary functions
    3. Required furniture and fixtures
    4. Circulation requirements
    5. Lighting needs
    6. Storage requirements
    7. Privacy considerations
    8. Safety requirements
    
    Respond with a structured JSON object.
    `;

    const response = await this.callAI(analysisPrompt);
    return JSON.parse(response);
  }

  private async generateLayoutSuggestions(
    spatialFeatures: SpatialFeature[],
    functionalRequirements: any,
    request: SpaceFormerRequest,
  ): Promise<LayoutSuggestion[]> {

    const layoutPrompt = `
    Generate optimal layout suggestions for a ${request.room_type} based on spatial analysis.
    
    Spatial features identified:
    ${JSON.stringify(spatialFeatures, null, 2)}
    
    Functional requirements:
    ${JSON.stringify(functionalRequirements, null, 2)}
    
    Consider:
    1. Optimal furniture placement for function and flow
    2. Relationships between different zones
    3. Natural lighting utilization
    4. Accessibility and circulation paths
    5. Ergonomic considerations
    6. Safety and building codes
    
    For each layout suggestion, provide:
    - Item type and specific position (x, y, z coordinates)
    - Rotation angle
    - Detailed reasoning for placement
    - Confidence score (0-1)
    - Alternative positions if applicable
    
    Focus on creating a functional, beautiful, and accessible space.
    
    Respond with an array of layout suggestions in JSON format.
    `;

    const response = await this.callAI(layoutPrompt);
    return JSON.parse(response);
  }

  private async optimizeMaterialPlacements(
    spatialFeatures: SpatialFeature[],
    layoutSuggestions: LayoutSuggestion[],
    request: SpaceFormerRequest,
  ): Promise<MaterialPlacement[]> {

    const materialPrompt = `
    Optimize material selections and placements based on spatial context and layout.
    
    Room type: ${request.room_type}
    Spatial features: ${JSON.stringify(spatialFeatures, null, 2)}
    Layout: ${JSON.stringify(layoutSuggestions, null, 2)}
    
    For each zone/area, recommend:
    1. Appropriate materials considering:
       - Foot traffic patterns
       - Moisture exposure
       - Cleaning requirements
       - Aesthetic harmony
       - Durability needs
       - Cost efficiency
    
    2. Specific placement strategies:
       - High-traffic vs low-traffic areas
       - Transition zones between materials
       - Accent vs primary materials
       - Maintenance accessibility
    
    Create material placement recommendations that are both functional and beautiful.
    
    Respond with an array of material placement objects in JSON format.
    `;

    const response = await this.callAI(materialPrompt);
    return JSON.parse(response);
  }

  private async analyzeAccessibility(
    spatialFeatures: SpatialFeature[],
    layoutSuggestions: LayoutSuggestion[],
  ): Promise<any> {
    // Simulate accessibility analysis
    const accessibilityData = {
      wheelchair_accessible: true,
      clear_pathways: layoutSuggestions.filter(item =>
        item.item_type.includes('pathway') || item.item_type.includes('circulation'),
      ).length > 0,
      door_widths: spatialFeatures
        .filter(f => f.type === 'door')
        .map(f => ({ width: f.dimensions.width, accessible: f.dimensions.width >= 0.8 })),
      reach_zones: layoutSuggestions.map(item => ({
        item: item.item_type,
        accessible: item.position.y <= 1.2 && item.position.y >= 0.4,
      })),
      lighting_adequacy: 0.8, // Simulated lighting analysis
      safety_features: ['non_slip_surfaces', 'adequate_lighting', 'clear_sightlines'],
    };

    return accessibilityData;
  }

  private async optimizeTrafficFlow(
    spatialFeatures: SpatialFeature[],
    layoutSuggestions: LayoutSuggestion[],
    request: SpaceFormerRequest,
  ): Promise<any> {
    // Simulate traffic flow optimization
    const flowData = {
      primary_circulation_paths: [
        { from: 'entrance', to: 'main_area', width: 1.2, clearance: 'optimal' },
        { from: 'main_area', to: 'secondary_areas', width: 0.9, clearance: 'adequate' },
      ],
      bottlenecks: [],
      flow_efficiency: 0.85,
      suggested_improvements: [
        'Maintain 90cm minimum pathway width',
        'Position large furniture away from main circulation',
        'Create clear sight lines through the space',
      ],
      heat_map_zones: {
        high_traffic: ['entrance', 'main_pathway'],
        medium_traffic: ['seating_area', 'work_area'],
        low_traffic: ['corners', 'storage_areas'],
      },
    };

    return flowData;
  }

  private async generateReasoningExplanation(
    spatialFeatures: SpatialFeature[],
    layoutSuggestions: LayoutSuggestion[],
    materialPlacements: MaterialPlacement[],
    accessibilityAnalysis: any,
    flowOptimization: any,
    request: SpaceFormerRequest,
  ): Promise<string> {

    const explanationPrompt = `
    Generate a comprehensive explanation of the spatial reasoning and optimization decisions.
    
    Analysis for: ${request.room_type}
    
    Data analyzed:
    - Spatial features: ${spatialFeatures.length} features identified
    - Layout suggestions: ${layoutSuggestions.length} items positioned
    - Material zones: ${materialPlacements.length} zones optimized
    - Accessibility score: ${accessibilityAnalysis.lighting_adequacy || 'N/A'}
    - Flow efficiency: ${flowOptimization.flow_efficiency || 'N/A'}
    
    Create a clear, professional explanation that:
    1. Explains the spatial reasoning methodology
    2. Justifies key layout decisions
    3. Describes material selection logic
    4. Highlights accessibility considerations
    5. Explains flow optimization choices
    6. Provides actionable insights for the user
    
    Write in a clear, engaging style that helps the user understand the spatial intelligence behind the recommendations.
    `;

    return await this.callAI(explanationPrompt);
  }

  private calculateConfidenceScore(
    spatialFeatures: SpatialFeature[],
    layoutSuggestions: LayoutSuggestion[],
    materialPlacements: MaterialPlacement[],
  ): number {
    // Calculate confidence based on various factors
    let confidence = 0.7; // Base confidence

    // Boost confidence based on data quality
    if (spatialFeatures.length >= 3) confidence += 0.1;
    if (layoutSuggestions.length >= 2) confidence += 0.1;
    if (materialPlacements.length >= 2) confidence += 0.1;

    // Average individual suggestion confidences
    const suggestionConfidences = layoutSuggestions
      .filter(s => s.confidence > 0)
      .map(s => s.confidence);

    if (suggestionConfidences.length > 0) {
      const avgConfidence = suggestionConfidences.reduce((a, b) => a + b, 0) / suggestionConfidences.length;
      confidence = (confidence + avgConfidence) / 2;
    }

    return Math.min(confidence, 1.0);
  }

  private async callAI(prompt: string): Promise<string> {
    const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
    const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY');

    if (!MIVAA_API_KEY) {
      throw new Error('MIVAA API key not configured for spatial analysis');
    }

    try {
      const response = await fetch(`${MIVAA_GATEWAY_URL}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MIVAA_API_KEY}`,
        },
        body: JSON.stringify({
          action: 'chat_completion',
          payload: {
            messages: [
              {
                role: 'system',
                content: 'You are a spatial analysis expert specializing in interior design, architecture, and space optimization.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            temperature: 0.3,
          }
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`MIVAA chat completion error: ${response.status} - ${error}`);
      }

      const gatewayResponse = await response.json();
      
      if (!gatewayResponse.success) {
        throw new Error(`MIVAA chat completion failed: ${gatewayResponse.error?.message || 'Unknown error'}`);
      }

      return gatewayResponse.data.choices?.[0]?.message?.content || gatewayResponse.data.response || gatewayResponse.data.content || "Spatial analysis completed successfully.";
    } catch (error) {
      console.error('Error calling MIVAA for spatial analysis:', error);
      throw new Error('Spatial analysis failed - MIVAA service required. Direct AI integration removed as part of centralized AI architecture. Please check MIVAA service availability.');
    }
  }

  private async createAnalysisRecord(analysisId: string, request: SpaceFormerRequest): Promise<void> {
    try {
      const { error } = await supabase
        .from('spaceformer_analysis_results')
        .insert({
          id: analysisId,
          user_id: request.user_id,
          input_data: {
            nerf_reconstruction_id: request.nerf_reconstruction_id,
            room_type: request.room_type,
            room_dimensions: request.room_dimensions || {},
            user_preferences: request.user_preferences,
            constraints: request.constraints,
          },
          result_data: {},
          confidence_score: 0,
          processing_time_ms: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to create analysis record:', error);
      throw error;
    }
  }

  private async updateAnalysisRecord(analysisId: string, updates: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('spaceformer_analysis_results')
        .update({
          result_data: updates.result_data || {},
          confidence_score: updates.confidence_score || 0,
          processing_time_ms: updates.processing_time_ms || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', analysisId);

      if (error) {
        console.error('Failed to update spatial analysis record:', error);
      } else {
        console.log(`✅ Analysis record updated: ${analysisId}`);
      }
    } catch (error) {
      console.error('Error updating analysis record:', error);
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: SpaceFormerRequest = await req.json();

    // Validate request
    if (!request.user_id || !request.room_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: user_id and room_type are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Process SpaceFormer analysis
    const processor = new SpaceFormerProcessor();
    const result = await processor.analyzeSpatialContext(request);

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Error in spaceformer-analysis function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
