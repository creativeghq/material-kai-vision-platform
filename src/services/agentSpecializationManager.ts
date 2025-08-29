import { supabase } from '@/integrations/supabase/client';

import { agentMLCoordinator } from './agentMLCoordinator';

export interface AgentSpecialization {
  id: string;
  name: string;
  type: 'material_expert' | 'style_analyst' | 'quality_controller' | 'research_specialist' | 'coordinator';
  capabilities: {
    primarySkills: string[];
    mlOperations: string[];
    knowledgeDomains: string[];
    collaborationStrengths: string[];
  };
  performanceProfile: {
    accuracy: number;
    speed: number;
    consistency: number;
    adaptability: number;
  };
  preferredTasks: string[];
  workloadCapacity: number;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  confidence: number;
  estimatedTime: number;
  reasoningChain: string[];
}

export class AgentSpecializationManager {
  private agentSpecializations = new Map<string, AgentSpecialization>();

  constructor() {
    this.initializeDefaultSpecializations();
  }

  /**
   * Initialize default agent specializations
   */
  private initializeDefaultSpecializations(): void {
    const defaultSpecs: Omit<AgentSpecialization, 'id'>[] = [
      {
        name: 'Material Analysis Expert',
        type: 'material_expert',
        capabilities: {
          primarySkills: ['material_identification', 'property_analysis', 'composition_analysis'],
          mlOperations: ['material-analysis', 'material-properties', 'image-classification'],
          knowledgeDomains: ['metallurgy', 'polymers', 'ceramics', 'composites'],
          collaborationStrengths: ['data_sharing', 'technical_consultation'],
        },
        performanceProfile: {
          accuracy: 0.9,
          speed: 0.7,
          consistency: 0.85,
          adaptability: 0.8,
        },
        preferredTasks: ['material_analysis', 'property_extraction', 'compliance_checking'],
        workloadCapacity: 10,
      },
      {
        name: 'Style & Aesthetic Analyst',
        type: 'style_analyst',
        capabilities: {
          primarySkills: ['style_analysis', 'trend_identification', 'aesthetic_evaluation'],
          mlOperations: ['style-analysis', 'image-classification'],
          knowledgeDomains: ['design_trends', 'color_theory', 'spatial_aesthetics'],
          collaborationStrengths: ['creative_consultation', 'trend_reporting'],
        },
        performanceProfile: {
          accuracy: 0.85,
          speed: 0.9,
          consistency: 0.8,
          adaptability: 0.9,
        },
        preferredTasks: ['style_analysis', 'trend_research', 'aesthetic_scoring'],
        workloadCapacity: 15,
      },
      {
        name: 'Quality Control Specialist',
        type: 'quality_controller',
        capabilities: {
          primarySkills: ['quality_assessment', 'defect_detection', 'standard_compliance'],
          mlOperations: ['image-classification', 'material-analysis'],
          knowledgeDomains: ['quality_standards', 'manufacturing_processes', 'testing_protocols'],
          collaborationStrengths: ['validation', 'audit_trails'],
        },
        performanceProfile: {
          accuracy: 0.95,
          speed: 0.6,
          consistency: 0.95,
          adaptability: 0.7,
        },
        preferredTasks: ['quality_inspection', 'compliance_verification', 'audit_support'],
        workloadCapacity: 8,
      },
      {
        name: 'Research & Innovation Specialist',
        type: 'research_specialist',
        capabilities: {
          primarySkills: ['research_synthesis', 'innovation_analysis', 'knowledge_discovery'],
          mlOperations: ['material-analysis', 'style-analysis', 'material-properties'],
          knowledgeDomains: ['emerging_materials', 'research_methodologies', 'patent_analysis'],
          collaborationStrengths: ['knowledge_synthesis', 'innovation_guidance'],
        },
        performanceProfile: {
          accuracy: 0.8,
          speed: 0.5,
          consistency: 0.75,
          adaptability: 0.95,
        },
        preferredTasks: ['research_analysis', 'innovation_scouting', 'knowledge_curation'],
        workloadCapacity: 5,
      },
      {
        name: 'Task Coordinator',
        type: 'coordinator',
        capabilities: {
          primarySkills: ['task_orchestration', 'resource_allocation', 'workflow_optimization'],
          mlOperations: ['material-analysis', 'style-analysis'],
          knowledgeDomains: ['project_management', 'workflow_design', 'resource_optimization'],
          collaborationStrengths: ['coordination', 'communication', 'delegation'],
        },
        performanceProfile: {
          accuracy: 0.75,
          speed: 0.95,
          consistency: 0.9,
          adaptability: 0.85,
        },
        preferredTasks: ['task_coordination', 'workflow_management', 'resource_planning'],
        workloadCapacity: 20,
      },
    ];

    defaultSpecs.forEach((spec, index) => {
      this.agentSpecializations.set(`default_${index}`, {
        ...spec,
        id: `default_${index}`,
      });
    });
  }

  /**
   * Assign optimal agents to a task based on specializations
   */
  async assignOptimalAgents(
    taskType: string,
    requirements: {
      mlOperations: string[];
      knowledgeDomains: string[];
      priority: 'speed' | 'accuracy' | 'consistency';
      maxAgents: number;
    },
  ): Promise<TaskAssignment[]> {
    try {
      // Get all available agents from the agent_tasks table
      // Filter for tasks that represent agent definitions/configurations
      const { data: agents, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('task_type', 'agent_definition')
        .eq('task_status', 'completed');

      if (error || !agents) {
        console.error('Failed to fetch agents:', error);
        return [];
      }

      // Score each agent for this task
      const agentScores = await Promise.all(
        agents.map(agent => this.scoreAgentForTask(agent as Record<string, unknown>, taskType, requirements)),
      );

      // Sort by score and take top agents
      const topAssignments = agentScores
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, requirements.maxAgents);

      console.log('AgentSpecialization: Assigned agents:', topAssignments.map(a => a.agentId));

      return topAssignments;

    } catch (error) {
      console.error('Failed to assign optimal agents:', error);
      return [];
    }
  }

  /**
   * Score an agent for a specific task
   */
  private async scoreAgentForTask(
    agent: Record<string, unknown>,
    taskType: string,
    requirements: {
      mlOperations: string[];
      knowledgeDomains: string[];
      priority: 'speed' | 'accuracy' | 'consistency';
    },
  ): Promise<TaskAssignment> {
    let score = 0;
    const reasoning: string[] = [];

    // Get agent specialization
    const specialization = this.getAgentSpecialization(agent);

    // Score based on ML operations compatibility
    const mlCompatibility = this.calculateMLCompatibility(
      specialization.capabilities.mlOperations,
      requirements.mlOperations,
    );
    score += mlCompatibility * 0.3;
    reasoning.push(`ML compatibility: ${(mlCompatibility * 100).toFixed(0)}%`);

    // Score based on knowledge domain overlap
    const domainOverlap = this.calculateDomainOverlap(
      specialization.capabilities.knowledgeDomains,
      requirements.knowledgeDomains,
    );
    score += domainOverlap * 0.3;
    reasoning.push(`Domain expertise: ${(domainOverlap * 100).toFixed(0)}%`);

    // Score based on performance profile and priority
    const performanceScore = this.calculatePerformanceScore(
      specialization.performanceProfile,
      requirements.priority,
    );
    score += performanceScore * 0.2;
    reasoning.push(`Performance fit: ${(performanceScore * 100).toFixed(0)}%`);

    // Score based on current workload
    const workloadScore = await this.calculateWorkloadScore(String(agent.id || ''), specialization.workloadCapacity);
    score += workloadScore * 0.1;
    reasoning.push(`Availability: ${(workloadScore * 100).toFixed(0)}%`);

    // Score based on recent performance
    const recentPerformance = await this.calculateRecentPerformance(String(agent.id || ''));
    score += recentPerformance * 0.1;
    reasoning.push(`Recent performance: ${(recentPerformance * 100).toFixed(0)}%`);

    // Estimate processing time
    const estimatedTime = this.estimateProcessingTime(
      specialization.performanceProfile.speed,
      requirements.mlOperations.length,
    );

    return {
      taskId: '', // Will be set by caller
      agentId: String(agent.id || ''),
      confidence: Math.min(1, Math.max(0, score)),
      estimatedTime,
      reasoningChain: reasoning,
    };
  }

  /**
   * Get agent specialization (from predefined or learned)
   */
  private getAgentSpecialization(agent: Record<string, unknown>): AgentSpecialization {
    // Try to get learned specialization
    const learnedSpec = this.extractLearnedSpecialization(agent);
    if (learnedSpec) return learnedSpec;

    // Fall back to default based on agent type
    const defaultKey = this.mapAgentTypeToSpecialization(
      String(agent.agent_type || ''),
      String(agent.specialization || '')
    );
    return this.agentSpecializations.get(defaultKey) || this.agentSpecializations.get('default_0')!;
  }

  /**
   * Extract learned specialization from agent data
   */
  private extractLearnedSpecialization(agent: Record<string, unknown>): AgentSpecialization | null {
    const capabilities = agent.capabilities as Record<string, unknown>;
    const performance = agent.performance_metrics as Record<string, unknown>;
    const learning = agent.learning_progress as Record<string, unknown>;

    if (!capabilities || !performance) return null;

    return {
      id: String(agent.id || ''),
      name: String(agent.agent_name || ''),
      type: this.inferSpecializationType(capabilities, learning),
      capabilities: {
        primarySkills: Array.isArray(capabilities.skills) ? capabilities.skills as string[] : [],
        mlOperations: Array.isArray(capabilities.ml_operations) ? capabilities.ml_operations as string[] : [],
        knowledgeDomains: Array.isArray(capabilities.knowledge_domains) ? capabilities.knowledge_domains as string[] : [],
        collaborationStrengths: Array.isArray(capabilities.collaboration_strengths) ? capabilities.collaboration_strengths as string[] : [],
      },
      performanceProfile: {
        accuracy: typeof performance.ml_task_accuracy === 'number' ? performance.ml_task_accuracy : 0.7,
        speed: this.normalizeSpeed(typeof performance.average_processing_time === 'number' ? performance.average_processing_time : 5000),
        consistency: typeof performance.task_completion_rate === 'number' ? performance.task_completion_rate : 0.7,
        adaptability: this.calculateAdaptability(learning),
      },
      preferredTasks: this.extractPreferredTasks(learning),
      workloadCapacity: typeof capabilities.max_concurrent_tasks === 'number' ? capabilities.max_concurrent_tasks : 10,
    };
  }

  /**
   * Map agent type to default specialization
   */
  private mapAgentTypeToSpecialization(agentType: string, specialization: string): string {
    const typeMap: Record<string, string> = {
      'material_analyst': 'default_0',
      'style_expert': 'default_1',
      'quality_inspector': 'default_2',
      'researcher': 'default_3',
      'coordinator': 'default_4',
    };

    return typeMap[agentType] || typeMap[specialization] || 'default_0';
  }

  /**
   * Calculate ML operations compatibility
   */
  private calculateMLCompatibility(agentOps: string[], requiredOps: string[]): number {
    if (requiredOps.length === 0) return 1;

    const matches = requiredOps.filter(op => agentOps.includes(op)).length;
    return matches / requiredOps.length;
  }

  /**
   * Calculate knowledge domain overlap
   */
  private calculateDomainOverlap(agentDomains: string[], requiredDomains: string[]): number {
    if (requiredDomains.length === 0) return 1;

    const matches = requiredDomains.filter(domain =>
      agentDomains.some(agentDomain =>
        agentDomain.toLowerCase().includes(domain.toLowerCase()) ||
        domain.toLowerCase().includes(agentDomain.toLowerCase()),
      ),
    ).length;

    return matches / requiredDomains.length;
  }

  /**
   * Calculate performance score based on priority
   */
  private calculatePerformanceScore(
    profile: AgentSpecialization['performanceProfile'],
    priority: 'speed' | 'accuracy' | 'consistency',
  ): number {
    const weights = {
      speed: { speed: 0.6, accuracy: 0.2, consistency: 0.1, adaptability: 0.1 },
      accuracy: { speed: 0.1, accuracy: 0.6, consistency: 0.2, adaptability: 0.1 },
      consistency: { speed: 0.1, accuracy: 0.2, consistency: 0.6, adaptability: 0.1 },
    };

    const weight = weights[priority];
    return (
      profile.speed * weight.speed +
      profile.accuracy * weight.accuracy +
      profile.consistency * weight.consistency +
      profile.adaptability * weight.adaptability
    );
  }

  /**
   * Calculate workload score (higher = more available)
   */
  private async calculateWorkloadScore(agentId: string, maxCapacity: number): Promise<number> {
    try {
      // Get current active tasks for this agent
      const { data: tasks, error } = await supabase
        .from('agent_tasks')
        .select('id')
        .contains('assigned_agents', [agentId])
        .in('status', ['pending', 'processing']);

      if (error) return 0.5; // Default neutral score

      const currentLoad = tasks?.length || 0;
      return Math.max(0, (maxCapacity - currentLoad) / maxCapacity);

    } catch (error) {
      console.error('Failed to calculate workload score:', error);
      return 0.5;
    }
  }

  /**
   * Calculate recent performance score
   */
  private async calculateRecentPerformance(agentId: string): Promise<number> {
    try {
      // Get recent ML tasks for this agent
      const recentTasks = await agentMLCoordinator.getAgentMLTasks(agentId);

      if (recentTasks.length === 0) return 0.7; // Default for new agents

      // Calculate average confidence from recent tasks
      const avgConfidence = recentTasks
        .map(task => {
          if (!task.confidenceScores) return 0.5;
          const scores = Object.values(task.confidenceScores);
          return scores.reduce((sum, score) => sum + score, 0) / scores.length;
        })
        .reduce((sum, conf) => sum + conf, 0) / recentTasks.length;

      return avgConfidence;

    } catch (error) {
      console.error('Failed to calculate recent performance:', error);
      return 0.5;
    }
  }

  /**
   * Estimate processing time for task
   */
  private estimateProcessingTime(speedProfile: number, numOperations: number): number {
    const baseTime = 3000; // 3 seconds base
    const operationTime = 2000; // 2 seconds per operation
    const speedMultiplier = (2 - speedProfile); // Higher speed = lower multiplier

    return Math.round((baseTime + operationTime * numOperations) * speedMultiplier);
  }

  /**
   * Infer specialization type from capabilities and learning
   */
  private inferSpecializationType(capabilities: Record<string, unknown>, learning: Record<string, unknown>): AgentSpecialization['type'] {
    const skills = Array.isArray(capabilities.skills) ? capabilities.skills as string[] : [];
    const strongAreas = (learning?.skill_improvements as Record<string, unknown>) || {};

    if (skills.includes('material_analysis') || strongAreas.material_expertise) {
      return 'material_expert';
    } else if (skills.includes('style_analysis') || strongAreas.aesthetic_evaluation) {
      return 'style_analyst';
    } else if (skills.includes('quality_control') || strongAreas.quality_assessment) {
      return 'quality_controller';
    } else if (skills.includes('research') || strongAreas.knowledge_discovery) {
      return 'research_specialist';
    } else {
      return 'coordinator';
    }
  }

  /**
   * Normalize speed from processing time to 0-1 scale
   */
  private normalizeSpeed(avgProcessingTime: number): number {
    // Assume 1 second is fastest (1.0), 10 seconds is slowest (0.0)
    const maxTime = 10000; // 10 seconds
    const minTime = 1000;  // 1 second

    const normalizedTime = Math.max(minTime, Math.min(maxTime, avgProcessingTime));
    return (maxTime - normalizedTime) / (maxTime - minTime);
  }

  /**
   * Calculate adaptability from learning progress
   */
  private calculateAdaptability(learning: Record<string, unknown>): number {
    if (!learning) return 0.5;

    const recentInsights = Array.isArray(learning.recent_insights) ? learning.recent_insights as unknown[] : [];
    const skillImprovements = (learning.skill_improvements as Record<string, unknown>) || {};

    // More recent insights and skill improvements = higher adaptability
    const insightScore = Math.min(1, recentInsights.length / 10);
    const improvementScore = Object.keys(skillImprovements).length / 5;

    return (insightScore + improvementScore) / 2;
  }

  /**
   * Extract preferred tasks from learning data
   */
  private extractPreferredTasks(learning: Record<string, unknown>): string[] {
    if (!learning) return [];

    const skillImprovements = (learning.skill_improvements as Record<string, unknown>) || {};

    return Object.entries(skillImprovements)
      .filter(([, improvement]: [string, unknown]) => {
        const improvementObj = improvement as Record<string, unknown>;
        return typeof improvementObj.improvement_rate === 'number' && improvementObj.improvement_rate > 0.6;
      })
      .map(([skill]) => skill);
  }

  /**
   * Get all available specializations
   */
  getAvailableSpecializations(): AgentSpecialization[] {
    return Array.from(this.agentSpecializations.values());
  }

  /**
   * Update agent specialization based on performance
   */
  async updateAgentSpecialization(agentId: string): Promise<void> {
    try {
      // TODO: Update to use correct table when agent schema is finalized
      // For now, this method is disabled as the table doesn't exist
      console.log('AgentSpecialization: updateAgentSpecialization called for agent', agentId, 'but disabled due to missing table');
      
      // const { data: agent, error } = await supabase
      //   .from('material_agents')
      //   .select('*')
      //   .eq('id', agentId)
      //   .single();

      // if (error || !agent) return;

      // // Extract learned specialization
      // const learnedSpec = this.extractLearnedSpecialization(agent);
      // if (learnedSpec) {
      //   this.agentSpecializations.set(agentId, learnedSpec);
      //   console.log('AgentSpecialization: Updated specialization for agent', agentId);
      // }

    } catch (error) {
      console.error('Failed to update agent specialization:', error);
    }
  }
}

export const agentSpecializationManager = new AgentSpecializationManager();
