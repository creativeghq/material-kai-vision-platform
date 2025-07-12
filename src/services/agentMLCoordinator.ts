import { supabase } from '@/integrations/supabase/client';
import { hybridMLService } from './ml/hybridMLService';
import { hybridMaterialPropertiesService } from './ml/hybridMaterialPropertiesService';
import { MLResult } from './ml/types';
import { MaterialAnalysisOptions } from './ml/materialAnalyzer';

export interface AgentMLTask {
  id: string;
  agentTaskId: string;
  mlOperationType: 'material-analysis' | 'style-analysis' | 'material-properties' | 'image-classification';
  inputData: any;
  mlResults?: any;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  confidenceScores?: Record<string, number>;
  processingTimeMs?: number;
  modelVersions?: Record<string, string>;
  createdAt: string;
}

export interface AgentMLCoordinationPlan {
  taskId: string;
  agentIds: string[];
  mlOperations: {
    type: string;
    priority: number;
    dependencies: string[];
    expectedProcessingTime: number;
  }[];
  coordinationStrategy: 'parallel' | 'sequential' | 'conditional';
  fallbackPlan?: string;
}

export class AgentMLCoordinator {
  /**
   * Create a new agent ML task
   */
  async createAgentMLTask(
    agentTaskId: string,
    mlOperationType: AgentMLTask['mlOperationType'],
    inputData: any
  ): Promise<{ success: boolean; taskId?: string; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('agent_ml_tasks')
        .insert({
          agent_task_id: agentTaskId,
          ml_operation_type: mlOperationType,
          input_data: inputData
        })
        .select()
        .single();

      if (error) throw error;

      console.log('AgentML: Created task', data.id);
      
      // Start processing the task
      this.processAgentMLTask(data.id);

      return { success: true, taskId: data.id };
    } catch (error) {
      console.error('AgentML: Failed to create task:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create agent ML task' 
      };
    }
  }

  /**
   * Process an agent ML task
   */
  private async processAgentMLTask(taskId: string): Promise<void> {
    try {
      // Get task details
      const { data: task, error } = await supabase
        .from('agent_ml_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error || !task) {
        throw new Error('Task not found');
      }

      const startTime = performance.now();
      let result: MLResult;

      // Process based on ML operation type
      switch (task.ml_operation_type) {
        case 'material-analysis':
          result = await this.processMaterialAnalysis(task.input_data);
          break;
        case 'material-properties':
          result = await this.processMaterialProperties(task.input_data);
          break;
        case 'style-analysis':
          result = await this.processStyleAnalysis(task.input_data);
          break;
        case 'image-classification':
          result = await this.processImageClassification(task.input_data);
          break;
        default:
          throw new Error(`Unsupported ML operation: ${task.ml_operation_type}`);
      }

      const processingTime = performance.now() - startTime;

      // Update task with results
      await supabase
        .from('agent_ml_tasks')
        .update({
          ml_results: result.data || result,
          confidence_scores: result.confidence || {},
          processing_time_ms: Math.round(processingTime),
          model_versions: result.modelVersion ? { primary: result.modelVersion } : {}
        })
        .eq('id', taskId);

      // Update the parent agent task with ML results
      await this.updateAgentTaskWithMLResults(task.agent_task_id, taskId, result);

      console.log('AgentML: Completed task', taskId, 'in', Math.round(processingTime), 'ms');

    } catch (error) {
      console.error('AgentML: Task processing failed:', error);
      
      // Update task with error
      await supabase
        .from('agent_ml_tasks')
        .update({
          ml_results: { error: error instanceof Error ? error.message : 'Processing failed' }
        })
        .eq('id', taskId);
    }
  }

  /**
   * Process material analysis task
   */
  private async processMaterialAnalysis(inputData: any): Promise<MLResult> {
    const { imageFile, options } = inputData;
    
    if (!imageFile) {
      throw new Error('Image file required for material analysis');
    }

    // Convert base64 to File if needed
    const file = typeof imageFile === 'string' 
      ? this.base64ToFile(imageFile, 'material-image.jpg')
      : imageFile;

    return await hybridMLService.analyzeImage(file, options);
  }

  /**
   * Process material properties analysis task
   */
  private async processMaterialProperties(inputData: any): Promise<MLResult> {
    const { imageFile, options } = inputData;
    
    if (!imageFile) {
      throw new Error('Image file required for material properties analysis');
    }

    const file = typeof imageFile === 'string' 
      ? this.base64ToFile(imageFile, 'material-properties.jpg')
      : imageFile;

      const analysisOptions: MaterialAnalysisOptions = {
        analysisDepth: options?.analysisDepth || 'standard',
        focusAreas: options?.focusAreas || []
      };

    return await hybridMaterialPropertiesService.analyzeAdvancedProperties(file, analysisOptions);
  }

  /**
   * Process style analysis task
   */
  private async processStyleAnalysis(inputData: any): Promise<MLResult> {
    const { imageFile, analysisType } = inputData;
    
    if (!imageFile) {
      throw new Error('Image file required for style analysis');
    }

    const file = typeof imageFile === 'string' 
      ? this.base64ToFile(imageFile, 'style-analysis.jpg')
      : imageFile;

    return await hybridMLService.analyzeImageStyle(file, { analysisType });
  }

  /**
   * Process image classification task
   */
  private async processImageClassification(inputData: any): Promise<MLResult> {
    const { imageFile, categories } = inputData;
    
    if (!imageFile) {
      throw new Error('Image file required for image classification');
    }

    const file = typeof imageFile === 'string' 
      ? this.base64ToFile(imageFile, 'classification.jpg')
      : imageFile;

    return await hybridMLService.classifyImage(file, { categories });
  }

  /**
   * Update parent agent task with ML results
   */
  private async updateAgentTaskWithMLResults(
    agentTaskId: string, 
    mlTaskId: string, 
    mlResult: MLResult
  ): Promise<void> {
    try {
      // Get current agent task
      const { data: agentTask, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', agentTaskId)
        .single();

      if (error || !agentTask) return;

      // Update result data with ML results
      const currentResults = agentTask.result_data as any || {};
      const updatedResultData = {
        ...currentResults,
        mlResults: {
          ...currentResults?.mlResults,
          [mlTaskId]: mlResult
        }
      };

      await supabase
        .from('agent_tasks')
        .update({
          result_data: updatedResultData,
          status: mlResult.success ? 'completed' : 'failed'
        })
        .eq('id', agentTaskId);

    } catch (error) {
      console.error('AgentML: Failed to update agent task:', error);
    }
  }

  /**
   * Create coordination plan for multi-agent ML tasks
   */
  async createCoordinationPlan(
    taskId: string,
    agentIds: string[],
    mlOperations: AgentMLCoordinationPlan['mlOperations']
  ): Promise<AgentMLCoordinationPlan> {
    const plan: AgentMLCoordinationPlan = {
      taskId,
      agentIds,
      mlOperations: mlOperations.sort((a, b) => a.priority - b.priority),
      coordinationStrategy: this.determineCoordinationStrategy(mlOperations),
      fallbackPlan: 'fallback-to-single-agent'
    };

    // Store coordination plan
    await supabase
      .from('agent_tasks')
      .update({
        coordination_plan: plan as any
      })
      .eq('id', taskId);

    return plan;
  }

  /**
   * Determine optimal coordination strategy
   */
  private determineCoordinationStrategy(
    operations: AgentMLCoordinationPlan['mlOperations']
  ): 'parallel' | 'sequential' | 'conditional' {
    const hasDependencies = operations.some(op => op.dependencies.length > 0);
    const totalProcessingTime = operations.reduce((sum, op) => sum + op.expectedProcessingTime, 0);
    
    if (hasDependencies) {
      return 'conditional';
    } else if (totalProcessingTime > 30000) { // > 30 seconds
      return 'parallel';
    } else {
      return 'sequential';
    }
  }

  /**
   * Get agent ML task status
   */
  async getAgentMLTaskStatus(taskId: string): Promise<AgentMLTask | null> {
    try {
      const { data, error } = await supabase
        .from('agent_ml_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error || !data) return null;
      
      return {
        id: data.id,
        agentTaskId: data.agent_task_id,
        mlOperationType: data.ml_operation_type as AgentMLTask['mlOperationType'],
        inputData: data.input_data,
        mlResults: data.ml_results,
        status: 'completed', // Infer status from presence of results
        confidenceScores: data.confidence_scores as Record<string, number> || {},
        processingTimeMs: data.processing_time_ms || 0,
        modelVersions: data.model_versions as Record<string, string> || {},
        createdAt: data.created_at
      };
    } catch (error) {
      console.error('AgentML: Failed to get task status:', error);
      return null;
    }
  }

  /**
   * Get all ML tasks for an agent task
   */
  async getAgentMLTasks(agentTaskId: string): Promise<AgentMLTask[]> {
    try {
      const { data, error } = await supabase
        .from('agent_ml_tasks')
        .select('*')
        .eq('agent_task_id', agentTaskId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];
      
      return data.map(item => ({
        id: item.id,
        agentTaskId: item.agent_task_id,
        mlOperationType: item.ml_operation_type as AgentMLTask['mlOperationType'],
        inputData: item.input_data,
        mlResults: item.ml_results,
        status: 'completed', // Infer status
        confidenceScores: item.confidence_scores as Record<string, number> || {},
        processingTimeMs: item.processing_time_ms || 0,
        modelVersions: item.model_versions as Record<string, string> || {},
        createdAt: item.created_at
      }));
    } catch (error) {
      console.error('AgentML: Failed to get agent ML tasks:', error);
      return [];
    }
  }

  /**
   * Convert base64 string to File
   */
  private base64ToFile(base64: string, filename: string): File {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], filename, { type: mime });
  }
}

export const agentMLCoordinator = new AgentMLCoordinator();