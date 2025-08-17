import { supabase } from '@/integrations/supabase/client';
import {
  AppError,
  ValidationError,
  NetworkError,
  APIError,
  DatabaseError,
  ExternalServiceError,
  ErrorLogger,
  errorLogger,
} from '@/core/errors';

// Material Agent Orchestrator Services
export interface MaterialAgentTaskRequest {
  user_id: string;
  task_type: string;
  input_data: any;
  priority?: number;
  required_agents?: string[];
}

export interface AgentExecution {
  agent_id: string;
  agent_name: string;
  specialization: string;
  result: any;
  confidence: number;
  execution_time_ms: number;
  reasoning: string;
}

export interface MaterialAgentResult {
  success: boolean;
  task_id: string;
  coordinated_result: any;
  agent_executions: AgentExecution[];
  coordination_summary: string;
  overall_confidence: number;
  total_processing_time_ms: number;
  error_message?: string;
}

// SpaceFormer Services
export interface SpaceFormerRequest {
  user_id: string;
  nerf_reconstruction_id?: string;
  room_type: string;
  room_dimensions?: any;
  user_preferences?: any;
  constraints?: any;
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
  zone: string;
  recommended_materials: string[];
  reasoning: string;
  durability_requirements: string;
  maintenance_level: string;
  cost_range: string;
}

export interface SpaceFormerResult {
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

export class MaterialAgentOrchestratorAPI {
  /**
   * Execute a coordinated task using Material Agent Orchestrator
   */
  static async executeTask(request: MaterialAgentTaskRequest): Promise<MaterialAgentResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const authError = new APIError(
          'User authentication required for Material Agent Orchestrator API access',
          {
            operation: 'executeTask',
            service: 'MaterialAgentOrchestratorAPI',
            metadata: { endpoint: 'executeTask' },
            timestamp: new Date().toISOString(),
          },
        );
        errorLogger.logError(authError, { service: 'MaterialAgentOrchestratorAPI', method: 'executeTask' });
        throw authError;
      }

      const { data, error } = await supabase.functions.invoke('material-agent-orchestrator', {
        body: {
          ...request,
          user_id: user.id,
        },
      });

      if (error) {
        throw error;
      }

      return data as MaterialAgentResult;
    } catch (error) {
      // DIAGNOSTIC: Validating error handling issues
      console.log('DEBUG: ErrorContext interface requires these fields:');
      console.log('- operation: string');
      console.log('- service: string');
      console.log('- metadata?: Record<string, any>');
      console.log('- timestamp: string');
      console.log('DEBUG: Additional context like "endpoint" should go in metadata field');
      console.log('DEBUG: logDiagnostic functions are undefined and need to be removed');
      console.error('Error executing Material Agent Orchestrator task:', error);
      throw error;
    }
  }

  /**
   * Get available Material Agent Orchestrator agents
   */
  static async getAvailableAgents() {
    try {
      // TODO: Update when material_agents table is created
      // For now, return empty array as the table doesn't exist in current schema
      return [];

      // const { data, error } = await supabase
      //   .from('material_agents')
      //   .select('*')
      //   .eq('status', 'active')
      //   .order('agent_name');

      // if (error) {
      //   throw error;
      // }

      // return data || [];
    } catch (error) {
      console.error('Error fetching agents:', error);
      throw error;
    }
  }

  /**
   * Get user's task history
   */
  static async getUserTasks(limit = 20) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching user tasks:', error);
      throw error;
    }
  }

  /**
   * Get task by ID
   */
  static async getTask(taskId: string) {
    try {
      const { data, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching task:', error);
      throw error;
    }
  }
}

export class SpaceFormerAPI {
  /**
   * Analyze spatial context and generate layout suggestions
   */
  static async analyzeSpatialContext(request: SpaceFormerRequest): Promise<SpaceFormerResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('spaceformer-analysis', {
        body: {
          ...request,
          user_id: user.id,
        },
      });

      if (error) {
        throw error;
      }

      return data as SpaceFormerResult;
    } catch (error) {
      console.error('Error analyzing spatial context:', error);
      throw error;
    }
  }

  /**
   * Get user's spatial analyses
   */
  static async getUserAnalyses(limit = 20) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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

      return data || [];
    } catch (error) {
      console.error('Error fetching spatial analyses:', error);
      throw error;
    }
  }

  /**
   * Get analysis by ID
   */
  static async getAnalysis(analysisId: string) {
    try {
      const { data, error } = await supabase
        .from('spatial_analysis')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error fetching analysis:', error);
      throw error;
    }
  }

  /**
   * Analyze room with integrated NeRF and SVBRDF data
   */
  static async analyzeRoomComplete(
    roomType: string,
    nerfReconstructionId?: string,
    svbrdfExtractionIds?: string[],
    userPreferences?: any,
  ): Promise<SpaceFormerResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Prepare comprehensive request with all available data
      const request: SpaceFormerRequest = {
        user_id: user.id,
        room_type: roomType,
        nerf_reconstruction_id: nerfReconstructionId,
        user_preferences: userPreferences,
        constraints: {
          svbrdf_extraction_ids: svbrdfExtractionIds,
        },
      };

      return await this.analyzeSpatialContext(request);
    } catch (error) {
      console.error('Error in complete room analysis:', error);
      throw error;
    }
  }
}

// Integrated service that combines all AI systems
export class IntegratedAIService {
  /**
   * Complete end-to-end design process
   */
  static async generateCompleteDesign(
    images: File[],
    roomType: string,
    userPreferences: any = {},
  ) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const results = {
        nerfReconstruction: null,
        svbrdfExtractions: [],
        spatialAnalysis: null,
        crewaiCoordination: null,
      };

      // Step 1: NeRF Reconstruction (if multiple images)
      if (images.length >= 3) {
        const { NeRFProcessingAPI } = await import('./nerfProcessingAPI');
        results.nerfReconstruction = await NeRFProcessingAPI.uploadImagesAndReconstruct(images);
      }

      // Step 2: SVBRDF Material Extraction (for each image)
      if (images.length > 0) {
        const { SVBRDFExtractionAPI } = await import('./svbrdfExtractionAPI');

        for (const image of images.slice(0, 3)) { // Limit to 3 for performance
          try {
            const extraction = await SVBRDFExtractionAPI.uploadImageAndExtract(image);
            if (extraction.success) {
              results.svbrdfExtractions.push(extraction);
            }
          } catch (error) {
            console.warn('SVBRDF extraction failed for image:', error);
          }
        }
      }

      // Step 3: SpaceFormer Spatial Analysis
      results.spatialAnalysis = await SpaceFormerAPI.analyzeRoomComplete(
        roomType,
        results.nerfReconstruction?.reconstruction_id,
        results.svbrdfExtractions.map(e => e.extraction_id),
        userPreferences,
      );

      // Step 4: Material Agent Orchestrator Coordination and Final Recommendations
      results.crewaiCoordination = await MaterialAgentOrchestratorAPI.executeTask({
        user_id: user.id,
        task_type: 'comprehensive_design',
        input_data: {
          room_type: roomType,
          nerf_data: results.nerfReconstruction,
          material_data: results.svbrdfExtractions,
          spatial_analysis: results.spatialAnalysis,
          user_preferences: userPreferences,
        },
        priority: 1,
      });

      return results;
    } catch (error) {
      const apiError = new APIError(
        'Failed to generate complete design',
        {
          operation: 'generateCompleteDesign',
          service: 'IntegratedAIService',
          metadata: {
            roomType,
            imageCount: images.length,
            originalError: error instanceof Error ? error.message : String(error),
          },
          timestamp: new Date().toISOString(),
        },
      );

      ErrorLogger.getInstance().logError(apiError);
      throw apiError;
    }
  }

  /**
   * Quick material analysis for single image
   */
  static async quickMaterialAnalysis(image: File) {
    try {
      // Use Material Agent Orchestrator for coordinated material analysis
      const result = await MaterialAgentOrchestratorAPI.executeTask({
        user_id: '', // Will be set by the API
        task_type: 'material_analysis',
        input_data: {
          image_data: image,
          analysis_type: 'quick_assessment',
        },
      });

      return result;
    } catch (error) {
      console.error('Error in quick material analysis:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive analytics across all AI systems
   */
  static async getIntegratedAnalytics(timeRange = '30 days') {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const [nerfStats, svbrdfStats, spatialStats, taskStats] = await Promise.allSettled([
        supabase.from('nerf_reconstructions').select('*').eq('user_id', user.id),
        supabase.from('svbrdf_extractions').select('*').eq('user_id', user.id),
        supabase.from('spatial_analysis').select('*').eq('user_id', user.id),
        supabase.from('agent_tasks').select('*').eq('user_id', user.id),
      ]);

      return {
        nerf_reconstructions: nerfStats.status === 'fulfilled' ? nerfStats.value.data?.length || 0 : 0,
        svbrdf_extractions: svbrdfStats.status === 'fulfilled' ? svbrdfStats.value.data?.length || 0 : 0,
        spatial_analyses: spatialStats.status === 'fulfilled' ? spatialStats.value.data?.length || 0 : 0,
        agent_tasks: taskStats.status === 'fulfilled' ? taskStats.value.data?.length || 0 : 0,
        integration_health: 'optimal', // Would be calculated based on success rates
      };
    } catch (error) {
      console.error('Error fetching integrated analytics:', error);
      throw error;
    }
  }
}
