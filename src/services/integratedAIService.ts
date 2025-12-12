import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';
import {
  ValidationError,
  APIError,
  ErrorLogger,
  errorLogger,
} from '@/core/errors';
import {
  MaterialData,
  SpatialAnalysisData,
  AgentExecutionData,
  AgentExecutionMetadata,
} from '@/types/materials';
import {
  validateWithGuard as _validateWithGuard,
  isAgentExecutionResult,
} from '@/types/guards';
import {
  spaceformerAnalysisService,
  type UserPreferences,
  type SpaceformerResult,
} from '@/services/spaceformerAnalysisService';

// Material Agent Orchestrator Services
export interface MaterialAgentTaskRequest {
  user_id: string;
  task_type: string;
  input_data: MaterialAgentInputData;
  priority?: number;
  required_agents?: string[];
  query?: string;
  tools?: string[];
}

export interface AgentExecutionResult {
  success: boolean;
  data?: AgentExecutionData;
  error?: string;
  metadata?: AgentExecutionMetadata;
}

export interface MaterialAgentInputData {
  image_data?: File;
  analysis_type?: string;
  room_type?: string;

  material_data?: MaterialData | null;
  spatial_analysis?: SpatialAnalysisData | null;
  user_preferences?: UserPreferences;
}

export interface AgentExecution {
  agent_id: string;
  agent_name: string;
  specialization: string;
  result: AgentExecutionResult;
  confidence: number;
  execution_time_ms: number;
  reasoning: string;
}

export interface MaterialAgentResult {
  success: boolean;
  task_id: string;
  coordinated_result: AgentExecutionResult;
  agent_executions: AgentExecution[];
  coordination_summary: string;
  overall_confidence: number;
  total_processing_time_ms: number;
  error_message?: string;
}

// SpaceFormer Services
export interface SpaceFormerRequest {
  user_id: string;

  room_type: string;
  room_dimensions?: Record<string, unknown>;
  user_preferences?: UserPreferences;
  constraints?: Record<string, unknown>;
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
  accessibility_analysis: Record<string, unknown>;
  flow_optimization: Record<string, unknown>;
  reasoning_explanation: string;
  confidence_score: number;
  processing_time_ms: number;
  error_message?: string;
}

export class MaterialAgentOrchestratorAPI {
  /**
   * Execute a coordinated task using Material Agent Orchestrator
   */
  static async executeTask(
    request: MaterialAgentTaskRequest,
  ): Promise<MaterialAgentResult> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        errorLogger.logError(authError, {
          service: 'MaterialAgentOrchestratorAPI',
          method: 'executeTask',
        });
        throw authError;
      }

      const response = await mivaaApi.orchestrateAgent({
        query: request.query || '',
        context: request,
        tools: request.tools,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Agent orchestration failed');
      }

      const data = response.data;

      // Add runtime validation for the response data
      if (!data) {
        throw new ValidationError(
          'No data received from Material Agent Orchestrator',
          {
            operation: 'executeTask',
            service: 'MaterialAgentOrchestratorAPI',
            metadata: { endpoint: 'material-agent-orchestrator' },
            timestamp: new Date().toISOString(),
          },
        );
      }

      // Validate the response structure
      const result = data as MaterialAgentResult;
      if (
        typeof result.success !== 'boolean' ||
        typeof result.task_id !== 'string'
      ) {
        throw new ValidationError(
          'Invalid response format from Material Agent Orchestrator',
          {
            operation: 'executeTask',
            service: 'MaterialAgentOrchestratorAPI',
            metadata: {
              endpoint: 'material-agent-orchestrator',
              received: typeof result,
              hasSuccess: 'success' in result,
              hasTaskId: 'task_id' in result,
            },
            timestamp: new Date().toISOString(),
          },
        );
      }

      // Validate coordinated_result if present
      if (result.coordinated_result && result.coordinated_result.data) {
        const isValid = isAgentExecutionResult(result.coordinated_result.data);

        if (!isValid) {
          console.warn(
            'Invalid agent execution data structure:',
            result.coordinated_result.data,
          );
          // Don't throw - log warning but continue with response
        }
      }

      return result;
    } catch (error) {
      const apiError = new APIError(
        'Failed to execute Material Agent Orchestrator task',
        {
          operation: 'executeTask',
          service: 'MaterialAgentOrchestratorAPI',
          metadata: {
            originalError: error instanceof Error ? error.message : String(error),
          },
          timestamp: new Date().toISOString(),
        },
      );
      errorLogger.logError(apiError, {
        service: 'MaterialAgentOrchestratorAPI',
        method: 'executeTask',
      });
      throw apiError;
    }
  }

  /**
   * Get available Material Agent Orchestrator agents
   */
  static async getAvailableAgents() {
    try {
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('prompt_type', 'agent')
        .eq('is_active', true)
        .eq('status', 'active')
        .order('name');

      if (error) {
        throw error;
      }

      return data || [];
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

// REMOVED: SpaceFormerAPI class (deprecated)
// Use spaceformerAnalysisService directly instead for spatial analysis features.
//
// REMOVED: IntegratedAIService class
// This service was only used by the deleted AIStudioPage component.
//
// The MaterialAgentOrchestratorAPI class above is still available for agent orchestration.
