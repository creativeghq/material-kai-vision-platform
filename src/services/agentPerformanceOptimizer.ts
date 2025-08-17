import { supabase } from '@/integrations/supabase/client';

interface AgentPerformanceMetrics {
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
        .contains('assigned_agents', [agentId])
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!agentTasks || agentTasks.length === 0) {
        return null;
      }

      // Calculate performance metrics
      const completedTasks = agentTasks.filter(task => task.status === 'completed');
      const failedTasks = agentTasks.filter(task => task.status === 'failed');

      const taskCompletionRate = completedTasks.length / agentTasks.length;
      const errorRate = failedTasks.length / agentTasks.length;

      const averageProcessingTime = completedTasks
        .filter(task => task.processing_time_ms)
        .reduce((sum, task) => sum + (task.processing_time_ms || 0), 0) / completedTasks.length || 0;

      // Get current load factor
      const activeTasks = agentTasks.filter(task => task.status === 'processing');
      const loadFactor = activeTasks.length / this.loadBalancingConfig.maxConcurrentTasks;

      // Extract specializations from task types
      const specializations = [...new Set(agentTasks.map(task => task.task_type))];

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
      // Get all available agents
      const { data: agents, error } = await supabase
        .from('crewai_agents')
        .select('*')
        .eq('status', 'active');

      if (error) throw error;

      if (!agents || agents.length === 0) {
        return [];
      }

      // Get performance metrics for all agents
      const agentMetrics = await Promise.all(
        agents.map(async (agent) => {
          const metrics = await this.getAgentPerformanceMetrics(agent.id);
          return { agent, metrics };
        }),
      );

      // Filter agents suitable for the task
      const suitableAgents = agentMetrics.filter(({ agent, metrics }) => {
        // Check if agent has required specialization
        const hasSpecialization = agent.specialization === taskType ||
          (agent.capabilities && typeof agent.capabilities === 'object' &&
           (agent.capabilities as any)?.supported_tasks?.includes(taskType));

        // Check load factor
        const isNotOverloaded = !metrics || metrics.loadFactor < 0.8;

        // Check error rate
        const hasGoodPerformance = !metrics || metrics.errorRate < 0.1;

        return hasSpecialization && isNotOverloaded && hasGoodPerformance;
      });

      // Score and rank agents
      const scoredAgents = suitableAgents.map(({ agent, metrics }) => {
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

        return { agentId: agent.id, score, agent, metrics };
      });

      // Sort by score and return top agents
      const selectedAgents = scoredAgents
        .sort((a, b) => b.score - a.score)
        .slice(0, 3) // Select top 3 agents
        .map(({ agentId }) => agentId);

      console.log('Optimized agent assignment:', {
        taskType,
        priority,
        selectedAgents,
        totalAgents: agents.length,
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
      // Get all active agents and their current loads
      const { data: agents, error: agentsError } = await supabase
        .from('crewai_agents')
        .select('*')
        .eq('status', 'active');

      if (agentsError) throw agentsError;

      const { data: activeTasks, error: tasksError } = await supabase
        .from('agent_tasks')
        .select('*')
        .in('status', ['pending', 'processing']);

      if (tasksError) throw tasksError;

      // Calculate current load for each agent
      const agentLoads = new Map<string, number>();

      activeTasks?.forEach(task => {
        task.assigned_agents.forEach((agentId: string) => {
          agentLoads.set(agentId, (agentLoads.get(agentId) || 0) + 1);
        });
      });

      // Identify overloaded and underloaded agents
      const overloadedAgents: string[] = [];
      const underloadedAgents: string[] = [];

      agents?.forEach(agent => {
        const currentLoad = agentLoads.get(agent.id) || 0;
        const loadRatio = currentLoad / this.loadBalancingConfig.maxConcurrentTasks;

        if (loadRatio > 0.8) {
          overloadedAgents.push(agent.id);
        } else if (loadRatio < 0.3) {
          underloadedAgents.push(agent.id);
        }
      });

      // Redistribute tasks from overloaded to underloaded agents
      for (const overloadedAgentId of overloadedAgents) {
        const tasksToRedistribute = activeTasks?.filter(task =>
          task.status === 'pending' &&
          task.assigned_agents.includes(overloadedAgentId),
        ) || [];

        for (const task of tasksToRedistribute.slice(0, 2)) { // Redistribute up to 2 tasks
          if (underloadedAgents.length > 0) {
            const targetAgent = underloadedAgents[0];

            // Update task assignment
            const newAssignedAgents = task.assigned_agents
              .filter((id: string) => id !== overloadedAgentId)
              .concat([targetAgent]);

            await supabase
              .from('agent_tasks')
              .update({
                assigned_agents: newAssignedAgents,
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
        totalAgents: agents?.length || 0,
      });

    } catch (error) {
      console.error('Error balancing agent load:', error);
    }
  }

  async updateAgentPerformance(agentId: string, taskResult: any): Promise<void> {
    try {
      // Get current agent performance metrics
      const { data: agent, error } = await supabase
        .from('crewai_agents')
        .select('performance_metrics')
        .eq('id', agentId)
        .single();

      if (error) throw error;

      const currentMetrics = (agent?.performance_metrics && typeof agent.performance_metrics === 'object') ?
        agent.performance_metrics as any : {};

      // Update performance metrics based on task result
      const updatedMetrics = {
        ...currentMetrics,
        last_updated: new Date().toISOString(),
        total_tasks: (currentMetrics.total_tasks || 0) + 1,
        successful_tasks: taskResult.success ?
          (currentMetrics.successful_tasks || 0) + 1 :
          (currentMetrics.successful_tasks || 0),
        average_processing_time: this.calculateMovingAverage(
          currentMetrics.average_processing_time || 0,
          taskResult.processing_time_ms || 0,
          currentMetrics.total_tasks || 0,
        ),
        error_count: taskResult.success ?
          (currentMetrics.error_count || 0) :
          (currentMetrics.error_count || 0) + 1,
      };

      // Calculate derived metrics
      updatedMetrics.success_rate = updatedMetrics.successful_tasks / updatedMetrics.total_tasks;
      updatedMetrics.error_rate = updatedMetrics.error_count / updatedMetrics.total_tasks;

      // Update agent performance in database
      await supabase
        .from('crewai_agents')
        .update({
          performance_metrics: updatedMetrics,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentId);

      // Clear cache to force refresh
      this.performanceCache.delete(agentId);

      console.log(`Updated performance metrics for agent ${agentId}:`, updatedMetrics);

    } catch (error) {
      console.error('Error updating agent performance:', error);
    }
  }

  private calculateMovingAverage(currentAvg: number, newValue: number, count: number): number {
    if (count === 0) return newValue;
    return ((currentAvg * count) + newValue) / (count + 1);
  }

  async getSystemLoadMetrics(): Promise<{
    totalAgents: number;
    activeAgents: number;
    averageLoad: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
  }> {
    try {
      const { data: agents, error: agentsError } = await supabase
        .from('crewai_agents')
        .select('id, status, performance_metrics');

      if (agentsError) throw agentsError;

      const { data: activeTasks, error: tasksError } = await supabase
        .from('agent_tasks')
        .select('assigned_agents')
        .in('status', ['processing']);

      if (tasksError) throw tasksError;

      const totalAgents = agents?.length || 0;
      const activeAgents = agents?.filter(agent => agent.status === 'active').length || 0;

      // Calculate system load
      const totalActiveTasks = activeTasks?.reduce((sum, task) =>
        sum + task.assigned_agents.length, 0) || 0;

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
