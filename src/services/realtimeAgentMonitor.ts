import { supabase } from '@/integrations/supabase/client';

import { AgentPerformanceOptimizer } from './agentPerformanceOptimizer';

interface RealtimeEvent {
  eventType: 'task_started' | 'task_completed' | 'task_failed' | 'agent_status_change' | 'system_alert';
  agentId?: string;
  taskId?: string;
  timestamp: string;
  data: RealtimeEventData;
}

interface RealtimeEventData {
  taskType?: string;
  assignedAgents?: string[];
  priority?: number;
  processingTime?: number;
  errorMessage?: string;
  status?: string;
  performance?: AgentPerformanceMetrics;
  level?: 'info' | 'warning' | 'error' | 'critical';
  message?: string;
  [key: string]: unknown;
}

interface SystemAlert {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  agentId?: string;
  taskId?: string;
  timestamp: string;
}

interface AgentPerformanceMetrics {
  successRate: number;
  averageProcessingTime: number;
  taskCount: number;
  errorRate: number;
  lastUpdated: string;
  [key: string]: unknown;
}

interface AgentStatus {
  agentId: string;
  status: 'active' | 'busy' | 'idle' | 'error' | 'offline';
  currentTasks: string[];
  lastHeartbeat: string;
  performance: AgentPerformanceMetrics;
  [key: string]: unknown;
}

interface DatabaseAgent {
  id: string;
  status: string;
  updated_at: string;
}

interface TaskRecord {
  id: string;
  task_type: string;
  assigned_agents: string[];
  priority: number;
  status: string;
  processing_time_ms?: number;
  error_message?: string;
}

interface SystemAlert {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  agentId?: string;
  taskId?: string;
  timestamp: string;
  [key: string]: unknown;
}

export class RealtimeAgentMonitor {
  private performanceOptimizer: AgentPerformanceOptimizer;
  private listeners: Map<string, Function[]> = new Map();
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private systemAlerts: SystemAlert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.performanceOptimizer = new AgentPerformanceOptimizer();
    this.initializeRealtimeSubscriptions();
    this.startSystemMonitoring();
  }

  private initializeRealtimeSubscriptions(): void {
    // Subscribe to agent task changes
    supabase
      .channel('agent-tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_tasks',
        },
        (payload) => this.handleTaskChange(payload),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_tasks', // TODO: Update to 'material_agents' when table is created
        },
        (payload) => this.handleAgentChange(payload),
      )
      .subscribe();

    console.log('Realtime agent monitoring initialized');
  }

  // Type guard functions
  private isTaskRecord(record: unknown): record is TaskRecord {
    return (
      record !== null &&
      typeof record === 'object' &&
      'id' in record &&
      'task_type' in record &&
      'assigned_agents' in record &&
      'priority' in record &&
      'status' in record &&
      typeof (record as Record<string, unknown>).id === 'string' &&
      typeof (record as Record<string, unknown>).task_type === 'string' &&
      Array.isArray((record as Record<string, unknown>).assigned_agents) &&
      typeof (record as Record<string, unknown>).priority === 'string' &&
      typeof (record as Record<string, unknown>).status === 'string'
    );
  }

  private isDatabaseAgent(record: unknown): record is DatabaseAgent {
    return (
      record !== null &&
      typeof record === 'object' &&
      'id' in record &&
      'name' in record &&
      'status' in record &&
      typeof (record as Record<string, unknown>).id === 'string' &&
      typeof (record as Record<string, unknown>).name === 'string' &&
      typeof (record as Record<string, unknown>).status === 'string'
    );
  }

  private async handleTaskChange(payload: Record<string, unknown>): Promise<void> {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    try {
      if (eventType === 'INSERT' && newRecord && this.isTaskRecord(newRecord)) {
        await this.handleTaskStarted(newRecord);
      } else if (eventType === 'UPDATE' && newRecord && oldRecord &&
                 this.isTaskRecord(newRecord) && this.isTaskRecord(oldRecord)) {
        await this.handleTaskUpdated(newRecord, oldRecord);
      } else if (eventType === 'DELETE' && oldRecord && this.isTaskRecord(oldRecord)) {
        await this.handleTaskCompleted(oldRecord);
      }
    } catch (error) {
      console.error('Error handling task change:', error);
      const taskId = (newRecord && typeof newRecord === 'object' && 'id' in newRecord && typeof newRecord.id === 'string')
        ? newRecord.id
        : undefined;
      this.emitSystemAlert('error', `Failed to process task change: ${error}`, undefined, taskId);
    }
  }

  private async handleTaskStarted(task: TaskRecord): Promise<void> {
    const event: RealtimeEvent = {
      eventType: 'task_started',
      taskId: task.id,
      timestamp: new Date().toISOString(),
      data: {
        taskType: task.task_type,
        assignedAgents: task.assigned_agents,
        priority: task.priority,
      },
    };

    this.emitEvent(event);

    // Update agent statuses
    for (const agentId of task.assigned_agents) {
      await this.updateAgentStatus(agentId, 'busy', [task.id]);
    }

    console.log(`Task started: ${task.id} with agents:`, task.assigned_agents);
  }

  private async handleTaskUpdated(newTask: any, oldTask: any): Promise<void> {
    // Check if task completed or failed
    if (oldTask.status !== newTask.status) {
      if (newTask.status === 'completed') {
        await this.handleTaskCompleted(newTask);
      } else if (newTask.status === 'failed') {
        await this.handleTaskFailed(newTask);
      }
    }

    // Check for agent reassignment
    if (JSON.stringify(oldTask.assigned_agents) !== JSON.stringify(newTask.assigned_agents)) {
      await this.handleAgentReassignment(newTask, oldTask);
    }
  }

  private async handleTaskCompleted(task: any): Promise<void> {
    const event: RealtimeEvent = {
      eventType: 'task_completed',
      taskId: task.id,
      timestamp: new Date().toISOString(),
      data: {
        processingTime: task.processing_time_ms,
        assignedAgents: task.assigned_agents,
      },
    };

    this.emitEvent(event);

    // Update agent performance metrics
    for (const agentId of task.assigned_agents) {
      await this.performanceOptimizer.updateAgentPerformance(agentId, {
        success: true,
        processing_time_ms: task.processing_time_ms,
      });

      await this.updateAgentStatus(agentId, 'idle', []);
    }

    console.log(`Task completed: ${task.id} in ${task.processing_time_ms}ms`);
  }

  private async handleTaskFailed(task: any): Promise<void> {
    const event: RealtimeEvent = {
      eventType: 'task_failed',
      taskId: task.id,
      timestamp: new Date().toISOString(),
      data: {
        errorMessage: task.error_message,
        assignedAgents: task.assigned_agents,
      },
    };

    this.emitEvent(event);

    // Update agent performance metrics
    for (const agentId of task.assigned_agents) {
      await this.performanceOptimizer.updateAgentPerformance(agentId, {
        success: false,
        error_message: task.error_message,
      });

      await this.updateAgentStatus(agentId, 'error', []);
    }

    // Emit system alert for failed task
    this.emitSystemAlert('warning', `Task failed: ${task.error_message}`, task.assigned_agents[0], task.id);

    console.log(`Task failed: ${task.id} - ${task.error_message}`);
  }

  private async handleAgentReassignment(newTask: any, oldTask: any): Promise<void> {
    const removedAgents = oldTask.assigned_agents.filter(
      (agentId: string) => !newTask.assigned_agents.includes(agentId),
    );
    const addedAgents = newTask.assigned_agents.filter(
      (agentId: string) => !oldTask.assigned_agents.includes(agentId),
    );

    // Update statuses for removed agents
    for (const agentId of removedAgents) {
      await this.updateAgentStatus(agentId, 'idle', []);
    }

    // Update statuses for added agents
    for (const agentId of addedAgents) {
      await this.updateAgentStatus(agentId, 'busy', [newTask.id]);
    }

    console.log(`Task ${newTask.id} reassigned: removed ${removedAgents}, added ${addedAgents}`);
  }

  private async handleAgentChange(payload: any): Promise<void> {
    const { eventType, new: newRecord } = payload;

    if (eventType === 'UPDATE') {
      const event: RealtimeEvent = {
        eventType: 'agent_status_change',
        agentId: newRecord.id,
        timestamp: new Date().toISOString(),
        data: {
          status: newRecord.status,
          performance: newRecord.performance_metrics,
        },
      };

      this.emitEvent(event);
    }
  }

  private async updateAgentStatus(agentId: string, status: AgentStatus['status'], currentTasks: string[]): Promise<void> {
    const performanceMetrics = await this.performanceOptimizer.getAgentPerformanceMetrics(agentId);
    
    // Create a default performance metrics object that matches the interface
    const defaultMetrics: AgentPerformanceMetrics = {
      responseTime: 0,
      throughput: 0,
      errorRate: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      averageProcessingTime: 0,
      successRate: 0,
      taskCount: 0,
      lastUpdated: new Date().toISOString()
    };
    
    // Ensure all required fields are present by merging with defaults
    const completeMetrics: AgentPerformanceMetrics = performanceMetrics
      ? { ...defaultMetrics, ...performanceMetrics }
      : defaultMetrics;
    
    const agentStatus: AgentStatus = {
      agentId,
      status,
      lastHeartbeat: new Date().toISOString(),
      performance: completeMetrics,
      currentTasks,
    };

    this.agentStatuses.set(agentId, agentStatus);

    // Emit status change event
    const event: RealtimeEvent = {
      eventType: 'agent_status_change',
      agentId,
      timestamp: new Date().toISOString(),
      data: agentStatus,
    };

    this.emitEvent(event);
  }

  private startSystemMonitoring(): void {
    // Monitor system health every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      await this.performSystemHealthCheck();
      await this.performanceOptimizer.balanceAgentLoad();
    }, 30000);

    console.log('System monitoring started');
  }

  private async performSystemHealthCheck(): Promise<void> {
    try {
      const systemMetrics = await this.performanceOptimizer.getSystemLoadMetrics();

      // Check for system overload
      if (systemMetrics.systemHealth === 'critical') {
        this.emitSystemAlert('critical',
          `System overloaded: ${(systemMetrics.averageLoad * 100).toFixed(1)}% capacity`);
      } else if (systemMetrics.systemHealth === 'warning') {
        this.emitSystemAlert('warning',
          `High system load: ${(systemMetrics.averageLoad * 100).toFixed(1)}% capacity`);
      }

      // Use agent_tasks table as fallback since crewai_agents doesn't exist yet
      const { data: tasks, error } = await supabase
        .from('agent_tasks')
        .select('id, created_at');

      if (!error && tasks) {
        const now = Date.now();
        const staleThreshold = 10 * 60 * 1000; // 10 minutes

        // Check for old tasks as a proxy for system health
        for (const task of tasks) {
          const taskAge = now - new Date(task.created_at || '').getTime();
          if (taskAge > staleThreshold) {
            this.emitSystemAlert('info',
              `Task ${task.id} has been running for ${Math.round(taskAge / 60000)} minutes`,
              undefined,
              task.id);
          }
        }
      }

      // Cleanup old alerts (keep last 100)
      if (this.systemAlerts.length > 100) {
        this.systemAlerts = this.systemAlerts.slice(-100);
      }

    } catch (error) {
      console.error('System health check failed:', error);
      this.emitSystemAlert('error', `System health check failed: ${error}`);
    }
  }

  private emitSystemAlert(level: SystemAlert['level'], message: string, agentId?: string, taskId?: string): void {
    const alert: SystemAlert = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(agentId && { agentId }),
      ...(taskId && { taskId }),
    };

    this.systemAlerts.push(alert);

    const event: RealtimeEvent = {
      eventType: 'system_alert',
      agentId: agentId || '',
      taskId: taskId || '',
      timestamp: alert.timestamp,
      data: alert,
    };

    this.emitEvent(event);

    console.log(`System Alert [${level.toUpperCase()}]:`, message);
  }

  private emitEvent(event: RealtimeEvent): void {
    const listeners = this.listeners.get(event.eventType) || [];
    listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });

    // Also emit to 'all' listeners
    const allListeners = this.listeners.get('all') || [];
    allListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in all event listener:', error);
      }
    });
  }

  // Public API methods
  addEventListener(eventType: string, listener: Function): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(listener);
  }

  removeEventListener(eventType: string, listener: Function): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  getAgentStatus(agentId: string): AgentStatus | undefined {
    return this.agentStatuses.get(agentId);
  }

  getAllAgentStatuses(): AgentStatus[] {
    return Array.from(this.agentStatuses.values());
  }

  getRecentAlerts(count: number = 20): SystemAlert[] {
    return this.systemAlerts.slice(-count).reverse();
  }

  getSystemMetrics(): Promise<any> {
    return this.performanceOptimizer.getSystemLoadMetrics();
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.listeners.clear();
    this.agentStatuses.clear();

    // Unsubscribe from realtime channels
    supabase.removeAllChannels();

    console.log('Realtime agent monitor destroyed');
  }
}
