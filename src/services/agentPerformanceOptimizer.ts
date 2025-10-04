import { supabase } from '@/integrations/supabase/client';

export interface AgentPerformanceMetrics {
  agentId: string;
  taskCompletionRate: number;
  averageProcessingTime: number;
  errorRate: number;
  specializations: string[];
  loadFactor: number;
  lastActiveTime: string;
}

interface LoadBalancingConfig {
  maxConcurrentTasks: number;
  priorityWeights: Record<string, number>;
  specializedAgents: Record<string, string[]>;
}

interface TaskResult {
  success: boolean;
  processingTime?: number;
  errorMessage?: string;
  taskType?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export class AgentPerformanceOptimizer {
  private performanceCache = new Map<string, AgentPerformanceMetrics>();
  private loadBalancingConfig: LoadBalancingConfig = {
    maxConcurrentTasks: 5,
    priorityWeights: {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.6,
      'low': 0.4,
    },
    specializedAgents: {
      'material_analysis': [],
      'image_processing': [],
      'text_analysis': [],
      'ml_training': [],
    },
  };

  async getAgentPerformanceMetrics(agentId: string): Promise<AgentPerformanceMetrics | null> {
    try {
      // Check cache first
      if (this.performanceCache.has(agentId)) {
        const cached = this.performanceCache.get(agentId)!;
        const cacheAge = Date.now() - new Date(cached.lastActiveTime).getTime();
        if (cacheAge < 300000) { // 5 minutes cache
          return cached;
        }
      }

      // Fetch recent tasks for this agent
      const { data: agentTasks, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('assigned_agent', agentId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!agentTasks || agentTasks.length === 0) {
        return null;
      }

      // Calculate performance metrics
      const completedTasks = agentTasks.filter((task: any) => task.task_status === 'completed');
      const failedTasks = agentTasks.filter((task: any) => task.task_status === 'failed');

      const taskCompletionRate = completedTasks.length / agentTasks.length;
      const errorRate = failedTasks.length / agentTasks.length;

      const averageProcessingTime = completedTasks
        .filter((task: any) => task.processing_time_ms)
        .reduce((sum: any, task: any) => sum + (task.processing_time_ms || 0), 0) / completedTasks.length || 0;

      // Get current load factor
      const activeTasks = agentTasks.filter((task: any) => task.task_status === 'processing');
      const loadFactor = activeTasks.length / this.loadBalancingConfig.maxConcurrentTasks;

      // Extract specializations from task types
      const specializations = [...new Set(agentTasks.map((task: any) => task.task_type))] as string[];

      const metrics: AgentPerformanceMetrics = {
        agentId,
        taskCompletionRate,
        averageProcessingTime,
        errorRate,
        specializations,
        loadFactor,
        lastActiveTime: new Date().toISOString(),
      };

      // Update cache
      this.performanceCache.set(agentId, metrics);

      return metrics;
    } catch (error) {
      console.error('Error getting agent performance metrics:', error);
      return null;
    }
  }

  async optimizeAgentAssignment(taskType: string, priority: string = 'medium'): Promise<string[]> {
    try {
      // Get all available agent tasks to simulate agent availability
      const { data: agents, error } = await supabase
        .from('agent_tasks')
        .select('assigned_agent')
        .not('assigned_agent', 'is', null);

      if (error) throw error;

      if (!agents || agents.length === 0) {
        return [];
      }

      // Get unique agent IDs
      const uniqueAgentIds = [...new Set(agents.map((task: any) => task.assigned_agent).filter(Boolean))] as string[];

      // Get performance metrics for all agents
      const agentMetrics = await Promise.all(
        uniqueAgentIds.map(async (agentId: string) => {
          const metrics = await this.getAgentPerformanceMetrics(agentId);
          return { agentId, metrics };
        }),
      );

      // Filter agents suitable for the task
      const suitableAgents = agentMetrics.filter(({ agentId, metrics }) => {
        // Check load factor
        const isNotOverloaded = !metrics || metrics.loadFactor < 0.8;

        // Check error rate
        const hasGoodPerformance = !metrics || metrics.errorRate < 0.1;

        // Basic availability check
        const isAvailable = agentId !== null;

        return isAvailable && isNotOverloaded && hasGoodPerformance;
      });

      // Score and rank agents
      const scoredAgents = suitableAgents.map(({ agentId, metrics }) => {
        let score = 1.0;

        if (metrics) {
          // Performance scoring
          score *= metrics.taskCompletionRate || 0.5;
          score *= (1 - metrics.errorRate);
          score *= (1 - metrics.loadFactor);

          // Speed bonus (inverse of processing time)
          if (metrics.averageProcessingTime > 0) {
            score *= Math.max(0.1, 1 / (metrics.averageProcessingTime / 1000));
          }
        }

        // Priority weight
        score *= this.loadBalancingConfig.priorityWeights[priority] || 0.6;

        return { agentId, score, metrics };
      });

      // Sort by score and return top agents
      const selectedAgents = scoredAgents
        .sort((a, b) => b.score - a.score)
        .slice(0, 3) // Select top 3 agents
        .map(({ agentId }) => agentId)
        .filter(Boolean) as string[];

      console.log('Optimized agent assignment:', {
        taskType,
        priority,
        selectedAgents,
        totalAgents: uniqueAgentIds.length,
        suitableAgents: suitableAgents.length,
      });

      return selectedAgents;
    } catch (error) {
      console.error('Error optimizing agent assignment:', error);
      return [];
    }
  }

  async balanceAgentLoad(): Promise<void> {
    try {
      // Get all active tasks and their current loads
      const { data: activeTasks, error: tasksError } = await supabase
        .from('agent_tasks')
        .select('*')
        .in('task_status', ['pending', 'processing']);

      if (tasksError) throw tasksError;

      // Calculate current load for each agent
      const agentLoads = new Map<string, number>();

      activeTasks?.forEach((task: any) => {
        if (task.assigned_agent) {
          agentLoads.set(task.assigned_agent, (agentLoads.get(task.assigned_agent) || 0) + 1);
        }
      });

      // Get unique agent IDs
      const uniqueAgentIds = [...agentLoads.keys()];

      // Identify overloaded and underloaded agents
      const overloadedAgents: string[] = [];
      const underloadedAgents: string[] = [];

      uniqueAgentIds.forEach(agentId => {
        const currentLoad = agentLoads.get(agentId) || 0;
        const loadRatio = currentLoad / this.loadBalancingConfig.maxConcurrentTasks;

        if (loadRatio > 0.8) {
          overloadedAgents.push(agentId);
        } else if (loadRatio < 0.3) {
          underloadedAgents.push(agentId);
        }
      });

      // Redistribute tasks from overloaded to underloaded agents
      for (const overloadedAgentId of overloadedAgents) {
        const tasksToRedistribute = activeTasks?.filter((task: any) =>
          task.task_status === 'pending' &&
          task.assigned_agent === overloadedAgentId,
        ) || [];

        for (const task of tasksToRedistribute.slice(0, 2)) { // Redistribute up to 2 tasks
          if (underloadedAgents.length > 0) {
            const targetAgent = underloadedAgents[0];
            if (!targetAgent) continue;

            // Update task assignment
            await supabase
              .from('agent_tasks')
              .update({
                assigned_agent: targetAgent,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            console.log(`Redistributed task ${task.id} from ${overloadedAgentId} to ${targetAgent}`);

            // Update load tracking
            agentLoads.set(targetAgent, (agentLoads.get(targetAgent) || 0) + 1);

            // Remove from underloaded if now approaching capacity
            const newLoad = agentLoads.get(targetAgent) || 0;
            if (newLoad / this.loadBalancingConfig.maxConcurrentTasks > 0.6) {
              const index = underloadedAgents.indexOf(targetAgent);
              if (index > -1) underloadedAgents.splice(index, 1);
            }
          }
        }
      }

      console.log('Load balancing completed:', {
        overloadedAgents: overloadedAgents.length,
        underloadedAgents: underloadedAgents.length,
        totalAgents: uniqueAgentIds.length,
      });

    } catch (error) {
      console.error('Error balancing agent load:', error);
    }
  }

  async updateAgentPerformance(agentId: string, taskResult: TaskResult): Promise<void> {
    try {
      // Store performance metrics in agent_ml_tasks table as a workaround
      const performanceData = {
        agent_task_id: null,
        ml_operation_type: 'performance_update',
        input_data: JSON.parse(JSON.stringify({
          agent_id: agentId,
          task_result: {
            success: taskResult.success,
            processingTime: taskResult.processingTime,
            errorMessage: taskResult.errorMessage,
            taskType: taskResult.taskType,
            confidence: taskResult.confidence,
          },
          timestamp: new Date().toISOString(),
        })),
        ml_results: JSON.parse(JSON.stringify({
          success: taskResult.success,
          processing_time: taskResult.processingTime || 0,
          error_message: taskResult.errorMessage || null,
        })),
        confidence_scores: JSON.parse(JSON.stringify({
          performance_score: taskResult.confidence || 0.5,
        })),
        model_versions: JSON.parse(JSON.stringify({
          performance_tracker: '1.0.0',
        })),
        processing_time_ms: taskResult.processingTime || 0,
      };

      await supabase
        .from('agent_ml_tasks')
        .insert(performanceData);

      // Clear cache to force refresh
      this.performanceCache.delete(agentId);

      console.log(`Updated performance metrics for agent ${agentId}:`, performanceData);

    } catch (error) {
      console.error('Error updating agent performance:', error);
    }
  }



  async getSystemLoadMetrics(): Promise<{
    totalAgents: number;
    activeAgents: number;
    averageLoad: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
  }> {
    try {
      const { data: activeTasks, error: tasksError } = await supabase
        .from('agent_tasks')
        .select('assigned_agent')
        .eq('task_status', 'processing');

      if (tasksError) throw tasksError;

      // Get unique agent IDs from all tasks
      const { data: allTasks, error: allTasksError } = await supabase
        .from('agent_tasks')
        .select('assigned_agent')
        .not('assigned_agent', 'is', null);

      if (allTasksError) throw allTasksError;

      const uniqueAgentIds = [...new Set(allTasks?.map((task: any) => task.assigned_agent).filter(Boolean) || [])];
      const totalAgents = uniqueAgentIds.length;
      const activeAgents = totalAgents; // Assume all agents with tasks are active

      // Calculate system load
      const totalActiveTasks = activeTasks?.length || 0;

      const maxCapacity = activeAgents * this.loadBalancingConfig.maxConcurrentTasks;
      const averageLoad = maxCapacity > 0 ? totalActiveTasks / maxCapacity : 0;

      // Determine system health
      let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (averageLoad > 0.9) {
        systemHealth = 'critical';
      } else if (averageLoad > 0.7) {
        systemHealth = 'warning';
      }

      return {
        totalAgents,
        activeAgents,
        averageLoad,
        systemHealth,
      };

    } catch (error) {
      console.error('Error getting system load metrics:', error);
      return {
        totalAgents: 0,
        activeAgents: 0,
        averageLoad: 0,
        systemHealth: 'critical',
      };
    }
  }
}
