import { supabase } from '@/integrations/supabase/client';

import { AgentMLTask } from './agentMLCoordinator';

export interface AgentLearningData {
  agentId: string;
  learningType: 'material_expertise' | 'task_optimization' | 'coordination_patterns' | 'ml_performance';
  knowledgeUpdate: {
    category: string;
    insights: Record<string, unknown>;
    confidence: number;
    evidenceSource: string;
    timestamp: string;
  };
  performanceImpact: {
    accuracyImprovement: number;
    speedImprovement: number;
    consistencyImprovement: number;
  };
}

export interface AgentPerformanceMetrics {
  agentId: string;
  taskCompletionRate: number;
  averageProcessingTime: number;
  mlTaskAccuracy: number;
  coordinationEfficiency: number;
  learningProgress: {
    skillLevel: number;
    knowledgeGaps: string[];
    strongAreas: string[];
    recentImprovements: string[];
  };
}

export class AgentLearningSystem {
  /**
   * Update agent learning based on ML task results
   */
  async updateAgentLearning(
    agentId: string,
    mlTask: AgentMLTask,
    userFeedback?: { rating: number; comments: string },
  ): Promise<void> {
    try {
      // Analyze ML task performance
      const learningData = this.extractLearningInsights(mlTask, userFeedback);

      // Update agent memory and learning progress
      await this.updateAgentMemory(agentId, learningData);

      // Update performance metrics
      await this.updatePerformanceMetrics(agentId, mlTask);

      console.log('AgentLearning: Updated learning for agent', agentId);
    } catch (error) {
      console.error('AgentLearning: Failed to update learning:', error);
    }
  }

  /**
   * Extract learning insights from ML task results
   */
  private extractLearningInsights(
    mlTask: AgentMLTask,
    userFeedback?: { rating: number; comments: string },
  ): AgentLearningData {
    const baseInsights: Record<string, unknown> = {
      taskType: mlTask.mlOperationType,
      processingTime: mlTask.processingTimeMs,
      confidence: mlTask.confidenceScores,
      success: mlTask.mlResults && !mlTask.mlResults.error,
    };

    let learningType: AgentLearningData['learningType'] = 'ml_performance';
    let category = 'general';

    // Determine learning type and category based on ML operation
    switch (mlTask.mlOperationType) {
      case 'material-analysis':
        learningType = 'material_expertise';
        category = 'material_identification';
        break;
      case 'material-properties':
        learningType = 'material_expertise';
        category = 'property_analysis';
        break;
      case 'style-analysis':
        learningType = 'material_expertise';
        category = 'aesthetic_evaluation';
        break;
      case 'image-classification':
        learningType = 'ml_performance';
        category = 'image_processing';
        break;
    }

    // Add user feedback to insights
    if (userFeedback) {
      baseInsights.userRating = userFeedback.rating;
      baseInsights.userComments = userFeedback.comments;
      baseInsights.userSatisfaction = userFeedback.rating >= 4 ? 'high' :
                                      userFeedback.rating >= 3 ? 'medium' : 'low';
    }

    // Calculate performance impact
    const performanceImpact = {
      accuracyImprovement: userFeedback?.rating ? (userFeedback.rating - 3) * 0.1 : 0,
      speedImprovement: mlTask.processingTimeMs ?
        Math.max(-0.1, Math.min(0.1, (5000 - mlTask.processingTimeMs) / 50000)) : 0,
      consistencyImprovement: mlTask.confidenceScores ?
        Object.values(mlTask.confidenceScores).reduce((avg, val) => avg + val, 0) /
        Object.keys(mlTask.confidenceScores).length * 0.1 : 0,
    };

    return {
      agentId: mlTask.agentTaskId, // Using task ID as agent reference
      learningType,
      knowledgeUpdate: {
        category,
        insights: baseInsights,
        confidence: this.calculateInsightConfidence(mlTask, userFeedback),
        evidenceSource: `ml_task_${mlTask.id}`,
        timestamp: new Date().toISOString(),
      },
      performanceImpact,
    };
  }

  /**
   * Calculate confidence level for learning insights
   */
  private calculateInsightConfidence(
    mlTask: AgentMLTask,
    userFeedback?: { rating: number; comments: string },
  ): number {
    let confidence = 0.5; // Base confidence

    // Factor in ML confidence scores
    if (mlTask.confidenceScores) {
      const avgConfidence = Object.values(mlTask.confidenceScores)
        .reduce((sum, val) => sum + val, 0) / Object.keys(mlTask.confidenceScores).length;
      confidence += avgConfidence * 0.3;
    }

    // Factor in user feedback
    if (userFeedback) {
      const feedbackConfidence = (userFeedback.rating - 1) / 4; // Normalize 1-5 to 0-1
      confidence += feedbackConfidence * 0.4;
    }

    // Factor in processing success
    if (mlTask.mlResults && !mlTask.mlResults.error) {
      confidence += 0.2;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Update agent memory with new learning data
   */
  private async updateAgentMemory(agentId: string, learningData: AgentLearningData): Promise<void> {
    try {
      // Note: crewai_agents table doesn't exist in current schema
      // Using agent_ml_tasks as fallback for agent data
      const { data: agent, error } = await supabase
        .from('agent_ml_tasks')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error || !agent) {
        console.warn('Agent not found for learning update:', agentId);
        return;
      }

      const currentMemory: Record<string, unknown> = {};
      const currentLearning: Record<string, unknown> = {};

      // Update memory with new insights
      const updatedMemory = {
        ...currentMemory,
        recent_insights: [
          ...((currentMemory.recent_insights as unknown[]) || []).slice(-9), // Keep last 9
          learningData.knowledgeUpdate,
        ],
        expertise_areas: this.updateExpertiseAreas(
          (currentMemory.expertise_areas as Record<string, unknown>) || ({} as Record<string, unknown>),
          learningData,
        ),
      };

      // Update learning progress
      const updatedLearning = {
        ...currentLearning,
        total_tasks: (Number(currentLearning.total_tasks) || 0) + 1,
        successful_tasks: (Number(currentLearning.successful_tasks) || 0) +
          (learningData.knowledgeUpdate.insights.success ? 1 : 0),
        skill_improvements: this.updateSkillImprovements(
          (currentLearning.skill_improvements as Record<string, unknown>) || ({} as Record<string, unknown>),
          learningData,
        ),
        last_updated: new Date().toISOString(),
      };

      // Save updated data using agent_tasks table
      await supabase
        .from('agent_tasks')
        .update({
          ml_results: JSON.parse(JSON.stringify(updatedMemory)),
          input_data: JSON.parse(JSON.stringify(updatedLearning)),
        })
        .eq('id', agentId);

    } catch (error) {
      console.error('Failed to update agent memory:', error);
    }
  }

  /**
   * Update expertise areas based on learning data
   */
  private updateExpertiseAreas(
    currentExpertise: Record<string, unknown>,
    learningData: AgentLearningData,
  ): Record<string, unknown> {
    const category = learningData.knowledgeUpdate.category;
    const currentLevel = (currentExpertise[category] as Record<string, unknown>) || {
      level: 0,
      confidence: 0.5,
      tasks_completed: 0
    };

    return {
      ...currentExpertise,
      [category]: {
        level: Math.min(1, Number(currentLevel.level || 0) + learningData.performanceImpact.accuracyImprovement),
        confidence: Math.min(1, Number(currentLevel.confidence || 0.5) + learningData.knowledgeUpdate.confidence * 0.1),
        tasks_completed: Number(currentLevel.tasks_completed || 0) + 1,
        last_improvement: new Date().toISOString(),
      },
    };
  }

  /**
   * Update skill improvements tracking
   */
  private updateSkillImprovements(
    currentSkills: Record<string, unknown>,
    learningData: AgentLearningData,
  ): Record<string, unknown> {
    return {
      ...currentSkills,
      [learningData.learningType]: {
        improvement_rate: learningData.performanceImpact.accuracyImprovement,
        consistency: learningData.performanceImpact.consistencyImprovement,
        efficiency: learningData.performanceImpact.speedImprovement,
        last_updated: new Date().toISOString(),
      },
    };
  }

  /**
   * Update agent performance metrics
   */
  private async updatePerformanceMetrics(agentId: string, mlTask: AgentMLTask): Promise<void> {
    try {
      const { data: agent, error } = await supabase
        .from('crewai_agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error || !agent) return;

      // Since we're simulating, create mock data structure
      const currentMetrics: Record<string, unknown> = {};
      const learningProgress: Record<string, unknown> = {};

      // Calculate updated metrics
      const totalTasks = (learningProgress.total_tasks || 0);
      const successfulTasks = (learningProgress.successful_tasks || 0);

      const updatedMetrics = {
        ...currentMetrics,
        task_completion_rate: totalTasks > 0 ? successfulTasks / totalTasks : 0,
        average_processing_time: this.updateAverageProcessingTime(
          currentMetrics.average_processing_time || 0,
          mlTask.processingTimeMs || 0,
          totalTasks,
        ),
        ml_task_accuracy: this.calculateMLAccuracy(mlTask),
        last_task_timestamp: new Date().toISOString(),
        total_ml_tasks: (currentMetrics.total_ml_tasks || 0) + 1,
      };

      await supabase
        .from('crewai_agents')
        .update({
          performance_metrics: updatedMetrics,
        })
        .eq('id', agentId);

    } catch (error) {
      console.error('Failed to update performance metrics:', error);
    }
  }

  /**
   * Update running average of processing time
   */
  private updateAverageProcessingTime(
    currentAverage: number,
    newTime: number,
    totalTasks: number,
  ): number {
    if (totalTasks <= 1) return newTime;
    return ((currentAverage * (totalTasks - 1)) + newTime) / totalTasks;
  }

  /**
   * Calculate ML task accuracy from results
   */
  private calculateMLAccuracy(mlTask: AgentMLTask): number {
    if (!mlTask.confidenceScores) return 0.5; // Default neutral accuracy

    const scores = Object.values(mlTask.confidenceScores);
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  /**
   * Get agent performance metrics
   */
  async getAgentPerformanceMetrics(agentId: string): Promise<AgentPerformanceMetrics | null> {
    try {
      const { data: agent, error } = await supabase
        .from('crewai_agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error || !agent) return null;

      // Since we're simulating, create mock data structure
      const metrics: Record<string, unknown> = {};
      const learning: Record<string, unknown> = {};

      return {
        agentId,
        taskCompletionRate: Number(metrics.task_completion_rate || 0),
        averageProcessingTime: Number(metrics.average_processing_time || 0),
        mlTaskAccuracy: Number(metrics.ml_task_accuracy || 0),
        coordinationEfficiency: Number(metrics.coordination_efficiency || 0.5),
        learningProgress: {
          skillLevel: this.calculateOverallSkillLevel(learning),
          knowledgeGaps: this.identifyKnowledgeGaps(learning),
          strongAreas: this.identifyStrongAreas(learning),
          recentImprovements: this.getRecentImprovements(learning),
        },
      };
    } catch (error) {
      console.error('Failed to get agent performance metrics:', error);
      return null;
    }
  }

  /**
   * Calculate overall skill level
   */
  private calculateOverallSkillLevel(learning: Record<string, unknown>): number {
    const skills = (learning.skill_improvements as Record<string, unknown>) || {};
    const skillLevels = Object.values(skills).map((skill: unknown) => {
      const skillObj = skill as Record<string, unknown>;
      const improvementRate = Number(skillObj.improvement_rate || 0);
      const consistency = Number(skillObj.consistency || 0);
      const efficiency = Number(skillObj.efficiency || 0);
      return (improvementRate + consistency + efficiency) / 3;
    });

    return skillLevels.length > 0
      ? skillLevels.reduce((sum: number, level: number) => sum + level, 0) / skillLevels.length
      : 0.5;
  }

  /**
   * Identify knowledge gaps
   */
  private identifyKnowledgeGaps(learning: Record<string, unknown>): string[] {
    const skills = (learning.skill_improvements as Record<string, unknown>) || {};
    return Object.entries(skills)
      .filter(([, skill]: [string, unknown]) => {
        const skillObj = skill as Record<string, unknown>;
        return Number(skillObj.improvement_rate || 0) < 0.3;
      })
      .map(([skillName]) => skillName);
  }

  /**
   * Identify strong areas
   */
  private identifyStrongAreas(learning: Record<string, unknown>): string[] {
    const skills = (learning.skill_improvements as Record<string, unknown>) || {};
    return Object.entries(skills)
      .filter(([, skill]: [string, unknown]) => {
        const skillObj = skill as Record<string, unknown>;
        return Number(skillObj.improvement_rate || 0) > 0.7;
      })
      .map(([skillName]) => skillName);
  }

  /**
   * Get recent improvements
   */
  private getRecentImprovements(learning: Record<string, unknown>): string[] {
    const recentInsights = (learning.recent_insights as unknown[]) || [];
    return recentInsights
      .filter((insight: unknown) => {
        const insightObj = insight as Record<string, unknown>;
        return Number(insightObj.confidence || 0) > 0.7;
      })
      .map((insight: unknown) => {
        const insightObj = insight as Record<string, unknown>;
        return String(insightObj.category || '');
      })
      .slice(-5); // Last 5 improvements
  }
}

export const agentLearningSystem = new AgentLearningSystem();
