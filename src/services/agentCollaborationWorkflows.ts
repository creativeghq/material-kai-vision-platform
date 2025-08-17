import { supabase } from '@/integrations/supabase/client';

interface CollaborationTask {
  id: string;
  parentTaskId?: string;
  childTaskIds: string[];
  taskType: string;
  requiredAgentTypes: string[];
  assignedAgents: string[];
  status: 'planning' | 'executing' | 'coordinating' | 'completed' | 'failed';
  coordination_plan: any;
  dependencies: string[];
  priority: number;
}

interface AgentCollaborationPlan {
  taskId: string;
  workflow: CollaborationStep[];
  totalEstimatedTime: number;
  requiredAgents: string[];
}

interface CollaborationStep {
  stepId: string;
  agentType: string;
  operation: string;
  dependencies: string[];
  estimatedTime: number;
  inputs: any;
  outputs: any;
}

export class AgentCollaborationWorkflows {
  async createCollaborationTask(
    taskType: string,
    inputData: any,
    priority: number = 5,
    userId: string,
  ): Promise<string | null> {
    try {
      // Analyze task complexity and determine collaboration needs
      const collaborationPlan = await this.analyzeTaskCollaboration(taskType, inputData);

      if (!collaborationPlan.requiredAgents.length) {
        // Simple task, no collaboration needed
        return await this.createSimpleTask(taskType, inputData, priority, userId);
      }

      // Create parent coordination task
      const { data: parentTask, error: parentError } = await supabase
        .from('agent_tasks')
        .insert({
          task_type: `coordination_${taskType}`,
          input_data: inputData,
          priority,
          status: 'planning',
          coordination_plan: collaborationPlan as any,
          assigned_agents: [],
          user_id: userId,
        })
        .select()
        .single();

      if (parentError) throw parentError;

      // Create child tasks for each collaboration step
      const childTaskIds: string[] = [];

      for (const step of collaborationPlan.workflow) {
        const { data: childTask, error: childError } = await supabase
          .from('agent_tasks')
          .insert({
            task_type: step.operation,
            input_data: step.inputs,
            priority: priority + (step.dependencies.length * 0.1), // Adjust priority based on dependencies
            status: 'pending',
            assigned_agents: [],
            user_id: userId,
            coordination_plan: {
              parentTaskId: parentTask.id,
              stepId: step.stepId,
              dependencies: step.dependencies,
              requiredAgentType: step.agentType,
            } as any,
          })
          .select()
          .single();

        if (childError) throw childError;
        childTaskIds.push(childTask.id);
      }

      // Update parent task with child references
      await supabase
        .from('agent_tasks')
        .update({
          coordination_plan: {
            ...collaborationPlan,
            childTaskIds,
            status: 'planned',
          } as any,
        })
        .eq('id', parentTask.id);

      console.log(`Created collaboration task ${parentTask.id} with ${childTaskIds.length} child tasks`);

      // Start orchestrating the workflow
      await this.orchestrateWorkflow(parentTask.id);

      return parentTask.id;

    } catch (error) {
      console.error('Error creating collaboration task:', error);
      return null;
    }
  }

  private async analyzeTaskCollaboration(taskType: string, inputData: any): Promise<AgentCollaborationPlan> {
    const plan: AgentCollaborationPlan = {
      taskId: '',
      workflow: [],
      totalEstimatedTime: 0,
      requiredAgents: [],
    };

    // Define collaboration patterns for different task types
    switch (taskType) {
      case 'complex_material_analysis':
        return this.createMaterialAnalysisWorkflow(inputData);

      case 'multi_modal_recognition':
        return this.createMultiModalRecognitionWorkflow(inputData);

      case '3d_scene_analysis':
        return this.create3DSceneAnalysisWorkflow(inputData);

      case 'comprehensive_material_report':
        return this.createComprehensiveMaterialReportWorkflow(inputData);

      default:
        // Simple task, no collaboration needed
        return plan;
    }
  }

  private createMaterialAnalysisWorkflow(inputData: any): AgentCollaborationPlan {
    const workflow: CollaborationStep[] = [
      {
        stepId: 'image_preprocessing',
        agentType: 'image_processing',
        operation: 'preprocess_material_image',
        dependencies: [],
        estimatedTime: 2000,
        inputs: { imageUrl: inputData.imageUrl, format: 'standard' },
        outputs: { preprocessedImageUrl: '', metadata: {} },
      },
      {
        stepId: 'visual_analysis',
        agentType: 'material_analysis',
        operation: 'analyze_material_properties',
        dependencies: ['image_preprocessing'],
        estimatedTime: 5000,
        inputs: { imageUrl: '', analysisType: 'visual' },
        outputs: { properties: {}, confidence: 0 },
      },
      {
        stepId: 'spectral_analysis',
        agentType: 'spectral_analysis',
        operation: 'analyze_spectral_signature',
        dependencies: ['image_preprocessing'],
        estimatedTime: 7000,
        inputs: { imageUrl: '', spectralBands: ['visible', 'infrared'] },
        outputs: { spectralData: {}, materialComposition: {} },
      },
      {
        stepId: 'result_synthesis',
        agentType: 'synthesis',
        operation: 'synthesize_analysis_results',
        dependencies: ['visual_analysis', 'spectral_analysis'],
        estimatedTime: 3000,
        inputs: { visualResults: {}, spectralResults: {} },
        outputs: { finalAnalysis: {}, confidence: 0 },
      },
    ];

    return {
      taskId: '',
      workflow,
      totalEstimatedTime: workflow.reduce((sum, step) => sum + step.estimatedTime, 0),
      requiredAgents: [...new Set(workflow.map(step => step.agentType))],
    };
  }

  private createMultiModalRecognitionWorkflow(inputData: any): AgentCollaborationPlan {
    const workflow: CollaborationStep[] = [
      {
        stepId: 'image_recognition',
        agentType: 'image_processing',
        operation: 'recognize_material_visual',
        dependencies: [],
        estimatedTime: 3000,
        inputs: { imageUrl: inputData.imageUrl },
        outputs: { visualRecognition: {} },
      },
      {
        stepId: 'text_analysis',
        agentType: 'text_analysis',
        operation: 'analyze_material_description',
        dependencies: [],
        estimatedTime: 2000,
        inputs: { text: inputData.description || '' },
        outputs: { textualAnalysis: {} },
      },
      {
        stepId: 'cross_modal_verification',
        agentType: 'multimodal_fusion',
        operation: 'verify_cross_modal_consistency',
        dependencies: ['image_recognition', 'text_analysis'],
        estimatedTime: 4000,
        inputs: { imageResults: {}, textResults: {} },
        outputs: { verifiedResults: {}, confidence: 0 },
      },
    ];

    return {
      taskId: '',
      workflow,
      totalEstimatedTime: workflow.reduce((sum, step) => sum + step.estimatedTime, 0),
      requiredAgents: [...new Set(workflow.map(step => step.agentType))],
    };
  }

  private create3DSceneAnalysisWorkflow(inputData: any): AgentCollaborationPlan {
    const workflow: CollaborationStep[] = [
      {
        stepId: 'point_cloud_processing',
        agentType: '3d_processing',
        operation: 'process_point_cloud',
        dependencies: [],
        estimatedTime: 8000,
        inputs: { pointCloudUrl: inputData.pointCloudUrl },
        outputs: { processedPointCloud: {} },
      },
      {
        stepId: 'spatial_analysis',
        agentType: 'spatial_analysis',
        operation: 'analyze_spatial_relationships',
        dependencies: ['point_cloud_processing'],
        estimatedTime: 6000,
        inputs: { pointCloud: {} },
        outputs: { spatialFeatures: {} },
      },
      {
        stepId: 'material_mapping',
        agentType: 'material_analysis',
        operation: 'map_materials_to_surfaces',
        dependencies: ['spatial_analysis'],
        estimatedTime: 10000,
        inputs: { spatialData: {}, materialHints: inputData.materialHints || [] },
        outputs: { materialMapping: {} },
      },
    ];

    return {
      taskId: '',
      workflow,
      totalEstimatedTime: workflow.reduce((sum, step) => sum + step.estimatedTime, 0),
      requiredAgents: [...new Set(workflow.map(step => step.agentType))],
    };
  }

  private createComprehensiveMaterialReportWorkflow(inputData: any): AgentCollaborationPlan {
    const workflow: CollaborationStep[] = [
      {
        stepId: 'material_identification',
        agentType: 'material_analysis',
        operation: 'identify_material_comprehensive',
        dependencies: [],
        estimatedTime: 5000,
        inputs: inputData,
        outputs: { identification: {} },
      },
      {
        stepId: 'property_analysis',
        agentType: 'properties_analysis',
        operation: 'analyze_material_properties_detailed',
        dependencies: ['material_identification'],
        estimatedTime: 7000,
        inputs: { materialId: '', analysisDepth: 'comprehensive' },
        outputs: { detailedProperties: {} },
      },
      {
        stepId: 'standards_compliance',
        agentType: 'compliance_analysis',
        operation: 'check_standards_compliance',
        dependencies: ['property_analysis'],
        estimatedTime: 4000,
        inputs: { properties: {}, requiredStandards: inputData.standards || [] },
        outputs: { complianceReport: {} },
      },
      {
        stepId: 'report_generation',
        agentType: 'report_generation',
        operation: 'generate_comprehensive_report',
        dependencies: ['material_identification', 'property_analysis', 'standards_compliance'],
        estimatedTime: 3000,
        inputs: { identification: {}, properties: {}, compliance: {} },
        outputs: { finalReport: {} },
      },
    ];

    return {
      taskId: '',
      workflow,
      totalEstimatedTime: workflow.reduce((sum, step) => sum + step.estimatedTime, 0),
      requiredAgents: [...new Set(workflow.map(step => step.agentType))],
    };
  }

  private async orchestrateWorkflow(parentTaskId: string): Promise<void> {
    try {
      // Get the parent task and its coordination plan
      const { data: parentTask, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', parentTaskId)
        .single();

      if (error) throw error;

      const coordinationPlan = parentTask.coordination_plan;

      // Start with tasks that have no dependencies
      const readyTasks = (coordinationPlan as any).workflow.filter((step: CollaborationStep) =>
        step.dependencies.length === 0,
      );

      for (const step of readyTasks) {
        await this.assignAndExecuteStep(parentTaskId, step);
      }

      // Update parent task status
      await supabase
        .from('agent_tasks')
        .update({
          status: 'executing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentTaskId);

      console.log(`Started orchestration for task ${parentTaskId} with ${readyTasks.length} initial steps`);

    } catch (error) {
      console.error('Error orchestrating workflow:', error);

      // Mark parent task as failed
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: `Orchestration failed: ${error}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentTaskId);
    }
  }

  private async assignAndExecuteStep(parentTaskId: string, step: CollaborationStep): Promise<void> {
    try {
      // Find suitable agent for this step
      const { data: suitableAgents, error } = await supabase
        .from('crewai_agents')
        .select('*')
        .eq('specialization', step.agentType)
        .eq('status', 'active')
        .limit(1);

      if (error) throw error;

      if (!suitableAgents || suitableAgents.length === 0) {
        throw new Error(`No suitable agent found for step ${step.stepId} (type: ${step.agentType})`);
      }

      const selectedAgent = suitableAgents[0];

      // Find the child task for this step
      const { data: childTasks, error: childError } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('task_type', step.operation)
        .contains('coordination_plan', { parentTaskId, stepId: step.stepId });

      if (childError) throw childError;

      if (childTasks && childTasks.length > 0) {
        const childTask = childTasks[0];

        // Assign agent to child task
        await supabase
          .from('agent_tasks')
          .update({
            assigned_agents: [selectedAgent.id],
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', childTask.id);

        console.log(`Assigned agent ${selectedAgent.id} to step ${step.stepId}`);
      }

    } catch (error) {
      console.error(`Error assigning step ${step.stepId}:`, error);
    }
  }

  async handleStepCompletion(stepTaskId: string): Promise<void> {
    try {
      // Get the completed step task
      const { data: stepTask, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', stepTaskId)
        .single();

      if (error) throw error;

      const parentTaskId = (stepTask.coordination_plan as any)?.parentTaskId;
      if (!parentTaskId) return;

      // Get parent task and its coordination plan
      const { data: parentTask, error: parentError } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', parentTaskId)
        .single();

      if (parentError) throw parentError;

      const coordinationPlan = parentTask.coordination_plan;
      const completedStepId = (stepTask.coordination_plan as any)?.stepId;

      // Find next steps that are now ready (dependencies satisfied)
      const readySteps = (coordinationPlan as any).workflow.filter((step: CollaborationStep) => {
        // Check if all dependencies are completed
        return step.dependencies.every((depStepId: string) =>
          this.isStepCompleted(depStepId, (coordinationPlan as any).childTaskIds),
        );
      }).filter((step: CollaborationStep) =>
        !this.isStepStarted(step.stepId, (coordinationPlan as any).childTaskIds),
      );

      // Start ready steps
      for (const step of readySteps) {
        await this.assignAndExecuteStep(parentTaskId, step);
      }

      // Check if all steps are completed
      const allStepsCompleted = await this.areAllStepsCompleted((coordinationPlan as any).childTaskIds);

      if (allStepsCompleted) {
        await this.completeCollaborationTask(parentTaskId);
      }

      console.log(`Handled completion of step ${completedStepId}, started ${readySteps.length} new steps`);

    } catch (error) {
      console.error('Error handling step completion:', error);
    }
  }

  private async isStepCompleted(stepId: string, childTaskIds: string[]): Promise<boolean> {
    const { data: tasks, error } = await supabase
      .from('agent_tasks')
      .select('status, coordination_plan')
      .in('id', childTaskIds);

    if (error) return false;

    return tasks?.some(task =>
      (task.coordination_plan as any)?.stepId === stepId && task.status === 'completed',
    ) || false;
  }

  private async isStepStarted(stepId: string, childTaskIds: string[]): Promise<boolean> {
    const { data: tasks, error } = await supabase
      .from('agent_tasks')
      .select('status, coordination_plan')
      .in('id', childTaskIds);

    if (error) return false;

    return tasks?.some(task =>
      (task.coordination_plan as any)?.stepId === stepId &&
      ['processing', 'completed'].includes(task.status),
    ) || false;
  }

  private async areAllStepsCompleted(childTaskIds: string[]): Promise<boolean> {
    const { data: tasks, error } = await supabase
      .from('agent_tasks')
      .select('status')
      .in('id', childTaskIds);

    if (error) return false;

    return tasks?.every(task => task.status === 'completed') || false;
  }

  private async completeCollaborationTask(parentTaskId: string): Promise<void> {
    try {
      // Collect results from all child tasks
      const { data: parentTask, error: parentError } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('id', parentTaskId)
        .single();

      if (parentError) throw parentError;

      const { data: childTasks, error: childError } = await supabase
        .from('agent_tasks')
        .select('*')
        .in('id', (parentTask.coordination_plan as any)?.childTaskIds || []);

      if (childError) throw childError;

      // Aggregate results
      const aggregatedResults = this.aggregateCollaborationResults(childTasks || []);

      // Update parent task with final results
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          result_data: aggregatedResults,
          processing_time_ms: Date.now() - new Date(parentTask.created_at).getTime(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentTaskId);

      console.log(`Completed collaboration task ${parentTaskId}`);

    } catch (error) {
      console.error('Error completing collaboration task:', error);

      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: `Failed to complete collaboration: ${error}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentTaskId);
    }
  }

  private aggregateCollaborationResults(childTasks: any[]): any {
    const results: any = {
      collaborationSummary: {
        totalSteps: childTasks.length,
        completedSteps: childTasks.filter(task => task.status === 'completed').length,
        totalProcessingTime: childTasks.reduce((sum, task) => sum + (task.processing_time_ms || 0), 0),
        averageStepTime: 0,
      },
      stepResults: {},
    };

    // Calculate average step time
    const completedTasks = childTasks.filter(task => task.processing_time_ms);
    if (completedTasks.length > 0) {
      results.collaborationSummary.averageStepTime =
        results.collaborationSummary.totalProcessingTime / completedTasks.length;
    }

    // Collect individual step results
    childTasks.forEach(task => {
      if (task.coordination_plan?.stepId) {
        results.stepResults[task.coordination_plan.stepId] = {
          status: task.status,
          result: task.result_data,
          processingTime: task.processing_time_ms,
          agent: task.assigned_agents[0],
        };
      }
    });

    return results;
  }

  private async createSimpleTask(taskType: string, inputData: any, priority: number, userId: string): Promise<string> {
    const { data: task, error } = await supabase
      .from('agent_tasks')
      .insert({
        task_type: taskType,
        input_data: inputData,
        priority,
        status: 'pending',
        assigned_agents: [],
        user_id: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return task.id;
  }

  // Public API for monitoring collaboration tasks
  async getCollaborationStatus(parentTaskId: string): Promise<any> {
    const { data: parentTask, error } = await supabase
      .from('agent_tasks')
      .select('*')
      .eq('id', parentTaskId)
      .single();

    if (error) throw error;

    const childTaskIds = (parentTask.coordination_plan as any)?.childTaskIds || [];

    const { data: childTasks, error: childError } = await supabase
      .from('agent_tasks')
      .select('*')
      .in('id', childTaskIds);

    if (childError) throw childError;

    return {
      parentTask,
      childTasks: childTasks || [],
      progress: this.calculateCollaborationProgress(childTasks || []),
      estimatedTimeRemaining: this.estimateRemainingTime(parentTask.coordination_plan, childTasks || []),
    };
  }

  private calculateCollaborationProgress(childTasks: any[]): number {
    if (childTasks.length === 0) return 0;

    const completed = childTasks.filter(task => task.status === 'completed').length;
    return (completed / childTasks.length) * 100;
  }

  private estimateRemainingTime(coordinationPlan: any, childTasks: any[]): number {
    if (!coordinationPlan?.workflow) return 0;

    const remainingSteps = coordinationPlan.workflow.filter((step: CollaborationStep) => {
      const correspondingTask = childTasks.find(task =>
        task.coordination_plan?.stepId === step.stepId,
      );
      return !correspondingTask || correspondingTask.status !== 'completed';
    });

    return remainingSteps.reduce((sum: number, step: CollaborationStep) => sum + step.estimatedTime, 0);
  }
}
