import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { createHash } from 'crypto';

import { supabase } from '../../integrations/supabase/client';

/**
 * Job priority levels for queue processing
 */
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Job status enumeration
 */
export type JobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'dead_letter';

/**
 * Base job interface for all batch operations
 */
export interface BatchJob {
  id: string;
  type: string;
  priority: JobPriority;
  status: JobStatus;
  payload: Record<string, unknown>;
  metadata: {
    workspaceId: string;
    userId?: string;
    source: string;
    createdAt: Date;
    updatedAt: Date;
    scheduledAt?: Date;
    startedAt?: Date;
    completedAt?: Date;
    attempts: number;
    maxAttempts: number;
    lastError?: string;
    estimatedDuration?: number;
    actualDuration?: number;
  };
  dependencies?: string[]; // Job IDs this job depends on
  tags?: string[];
}

/**
 * Job execution result interface
 */
export interface JobResult {
  jobId: string;
  success: boolean;
  result?: unknown;
  error?: string;
  metrics: {
    processingTime: number;
    memoryUsage: number;
    cpuUsage?: number;
  };
  warnings?: string[];
}

/**
 * Queue configuration interface
 */
export interface QueueConfig {
  maxSize: number;
  maxConcurrency: number;
  defaultPriority: JobPriority;
  retryPolicy: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    jitterEnabled: boolean;
  };
  deadLetterQueue: {
    enabled: boolean;
    maxSize: number;
  };
  persistence: {
    enabled: boolean;
    interval: number; // ms
    path?: string;
  };
  metrics: {
    enabled: boolean;
    retentionPeriod: number; // ms
  };
}

/**
 * Queue metrics interface
 */
export interface QueueMetrics {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  deadLetterJobs: number;
  averageProcessingTime: number;
  throughputPerMinute: number;
  errorRate: number;
  memoryUsage: number;
  queueSize: number;
  concurrentJobs: number;
  lastUpdated: Date;
}

/**
 * Job processor function type
 */
export type JobProcessor<T = unknown> = (job: BatchJob) => Promise<T>;

/**
 * High-performance batch job queue with priority handling, retry mechanisms,
 * and comprehensive monitoring capabilities
 */
export class BatchJobQueue extends EventEmitter {
  private readonly config: QueueConfig;
  private readonly jobs: Map<string, BatchJob> = new Map();
  private readonly processors: Map<string, JobProcessor> = new Map();
  private readonly priorityQueues: Map<JobPriority, string[]> = new Map();
  private readonly processingJobs: Set<string> = new Set();
  private readonly deadLetterQueue: BatchJob[] = [];
  private readonly metrics: QueueMetrics;
  private readonly jobHistory: Array<{
    timestamp: number;
    event: string;
    jobId: string;
  }> = [];

  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private persistenceInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<QueueConfig> = {}) {
    super();

    this.config = {
      maxSize: 10000,
      maxConcurrency: 10,
      defaultPriority: 'normal',
      retryPolicy: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitterEnabled: true,
      },
      deadLetterQueue: {
        enabled: true,
        maxSize: 1000,
      },
      persistence: {
        enabled: false,
        interval: 30000,
      },
      metrics: {
        enabled: true,
        retentionPeriod: 3600000, // 1 hour
      },
      ...config,
    };

    // Initialize priority queues
    this.priorityQueues.set('critical', []);
    this.priorityQueues.set('high', []);
    this.priorityQueues.set('normal', []);
    this.priorityQueues.set('low', []);

    // Initialize metrics
    this.metrics = {
      totalJobs: 0,
      pendingJobs: 0,
      processingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      deadLetterJobs: 0,
      averageProcessingTime: 0,
      throughputPerMinute: 0,
      errorRate: 0,
      memoryUsage: 0,
      queueSize: 0,
      concurrentJobs: 0,
      lastUpdated: new Date(),
    };

    this.startProcessing();
    this.setupIntervals();
    this.recoverJobs(); // Recover jobs from database on startup
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    type: string,
    payload: Record<string, unknown>,
    options: {
      priority?: JobPriority;
      workspaceId: string;
      userId?: string;
      source: string;
      maxAttempts?: number;
      scheduledAt?: Date;
      dependencies?: string[];
      tags?: string[];
    },
  ): Promise<string> {
    if (this.jobs.size >= this.config.maxSize) {
      throw new Error(`Queue is full. Maximum size: ${this.config.maxSize}`);
    }

    const jobId = this.generateJobId(type, payload);
    const now = new Date();

    const job: BatchJob = {
      id: jobId,
      type,
      priority: options.priority || this.config.defaultPriority,
      status:
        options.scheduledAt && options.scheduledAt > now ? 'pending' : 'queued',
      payload,
      metadata: {
        workspaceId: options.workspaceId,
        ...(options.userId && { userId: options.userId }),
        source: options.source,
        createdAt: now,
        updatedAt: now,
        ...(options.scheduledAt && { scheduledAt: options.scheduledAt }),
        attempts: 0,
        maxAttempts: options.maxAttempts || this.config.retryPolicy.maxAttempts,
      },
      ...(options.dependencies && { dependencies: options.dependencies }),
      ...(options.tags && { tags: options.tags }),
    };

    this.jobs.set(jobId, job);

    if (job.status === 'queued') {
      this.addToQueue(jobId, job.priority);
    }

    this.updateMetrics();
    this.recordEvent('job_added', jobId);
    this.emit('jobAdded', job);

    return jobId;
  }

  /**
   * Register a job processor for a specific job type
   */
  registerProcessor(type: string, processor: JobProcessor): void {
    this.processors.set(type, processor);
    this.emit('processorRegistered', type);
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): BatchJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): BatchJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.status === status,
    );
  }

  /**
   * Get jobs by workspace
   */
  getJobsByWorkspace(workspaceId: string): BatchJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.metadata.workspaceId === workspaceId,
    );
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === 'processing') {
      // Mark for cancellation - processor should check this
      job.status = 'cancelled';
      job.metadata.updatedAt = new Date();
      this.emit('jobCancelled', job);
      return true;
    }

    if (job.status === 'queued' || job.status === 'pending') {
      job.status = 'cancelled';
      job.metadata.updatedAt = new Date();
      this.removeFromQueue(jobId, job.priority);
      this.updateMetrics();
      this.recordEvent('job_cancelled', jobId);
      this.emit('jobCancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get queue status summary
   */
  getStatus(): {
    isProcessing: boolean;
    queueSizes: Record<JobPriority, number>;
    totalJobs: number;
    processingJobs: number;
    deadLetterJobs: number;
  } {
    return {
      isProcessing: this.isProcessing,
      queueSizes: {
        critical: this.priorityQueues.get('critical')?.length || 0,
        high: this.priorityQueues.get('high')?.length || 0,
        normal: this.priorityQueues.get('normal')?.length || 0,
        low: this.priorityQueues.get('low')?.length || 0,
      },
      totalJobs: this.jobs.size,
      processingJobs: this.processingJobs.size,
      deadLetterJobs: this.deadLetterQueue.length,
    };
  }

  /**
   * Clear completed and failed jobs older than specified time
   */
  cleanup(olderThanMs: number = 3600000): number {
    const cutoff = new Date(Date.now() - olderThanMs);
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (
        (job.status === 'completed' ||
          job.status === 'failed' ||
          job.status === 'cancelled') &&
        job.metadata.updatedAt < cutoff
      ) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }

    // Clean job history
    const historyIndex = this.jobHistory.findIndex(
      (entry) => entry.timestamp > Date.now() - olderThanMs,
    );
    if (historyIndex > 0) {
      this.jobHistory.splice(0, historyIndex);
    }

    this.updateMetrics();
    this.emit('cleanup', { cleaned, remaining: this.jobs.size });

    return cleaned;
  }

  /**
   * Shutdown the queue gracefully
   */
  async shutdown(): Promise<void> {
    this.isProcessing = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Wait for current jobs to complete
    const timeout = 30000; // 30 seconds
    const start = Date.now();

    while (this.processingJobs.size > 0 && Date.now() - start < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.emit('shutdown', {
      remainingJobs: this.processingJobs.size,
      forcedShutdown: this.processingJobs.size > 0,
    });
  }

  /**
   * Start the job processing loop
   */
  private startProcessing(): void {
    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processNextJob();
    }, 100); // Check every 100ms
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    if (this.processingJobs.size >= this.config.maxConcurrency) {
      return;
    }

    const jobId = this.getNextJobId();
    if (!jobId) {
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    // Check dependencies
    if (job.dependencies && !this.areDependenciesMet(job.dependencies)) {
      return;
    }

    const processor = this.processors.get(job.type);
    if (!processor) {
      this.handleJobError(
        job,
        new Error(`No processor registered for job type: ${job.type}`),
      );
      return;
    }

    this.processingJobs.add(jobId);
    job.status = 'processing';
    job.metadata.startedAt = new Date();
    job.metadata.updatedAt = new Date();
    job.metadata.attempts++;

    this.updateMetrics();
    this.recordEvent('job_started', jobId);
    this.emit('jobStarted', job);

    try {
      const startTime = performance.now();
      const memoryBefore = process.memoryUsage().heapUsed;

      const result = await processor(job);

      const endTime = performance.now();
      const memoryAfter = process.memoryUsage().heapUsed;
      const processingTime = endTime - startTime;

      job.status = 'completed';
      job.metadata.completedAt = new Date();
      job.metadata.updatedAt = new Date();
      job.metadata.actualDuration = processingTime;

      const jobResult: JobResult = {
        jobId: job.id,
        success: true,
        result,
        metrics: {
          processingTime,
          memoryUsage: memoryAfter - memoryBefore,
        },
      };

      this.processingJobs.delete(jobId);
      this.updateMetrics();
      this.recordEvent('job_completed', jobId);
      this.emit('jobCompleted', job, jobResult);
    } catch (error) {
      this.handleJobError(job, error as Error);
    }
  }

  /**
   * Handle job processing errors
   */
  private async handleJobError(job: BatchJob, error: Error): Promise<void> {
    this.processingJobs.delete(job.id);
    job.metadata.lastError = error.message;
    job.metadata.updatedAt = new Date();

    if (job.metadata.attempts < job.metadata.maxAttempts) {
      // Retry the job
      job.status = 'retrying';
      const delay = this.calculateRetryDelay(job.metadata.attempts);

      setTimeout(() => {
        if (this.jobs.has(job.id) && job.status === 'retrying') {
          job.status = 'queued';
          this.addToQueue(job.id, job.priority);
          this.updateMetrics();
          this.recordEvent('job_retried', job.id);
          this.emit('jobRetried', job);
        }
      }, delay);

      this.recordEvent('job_retry_scheduled', job.id);
      this.emit('jobRetryScheduled', job, delay);
    } else {
      // Move to dead letter queue
      job.status = 'dead_letter';

      if (this.config.deadLetterQueue.enabled) {
        this.deadLetterQueue.push(job);

        // Limit dead letter queue size
        while (
          this.deadLetterQueue.length > this.config.deadLetterQueue.maxSize
        ) {
          this.deadLetterQueue.shift();
        }
      }

      this.updateMetrics();
      this.recordEvent('job_dead_letter', job.id);
      this.emit('jobDeadLetter', job, error);
    }

    const jobResult: JobResult = {
      jobId: job.id,
      success: false,
      error: error.message,
      metrics: {
        processingTime: 0,
        memoryUsage: 0,
      },
    };

    this.emit('jobFailed', job, jobResult);
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    const { baseDelay, maxDelay, backoffMultiplier, jitterEnabled } =
      this.config.retryPolicy;

    let delay = Math.min(
      baseDelay * Math.pow(backoffMultiplier, attempt - 1),
      maxDelay,
    );

    if (jitterEnabled) {
      delay = delay * (0.5 + Math.random() * 0.5); // Add 0-50% jitter
    }

    return Math.floor(delay);
  }

  /**
   * Get the next job ID to process based on priority
   */
  private getNextJobId(): string | null {
    // Check scheduled jobs first
    this.promoteScheduledJobs();

    // Process by priority order
    const priorities: JobPriority[] = ['critical', 'high', 'normal', 'low'];

    for (const priority of priorities) {
      const queue = this.priorityQueues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift()!;
      }
    }

    return null;
  }

  /**
   * Promote scheduled jobs to queued status when their time comes
   */
  private promoteScheduledJobs(): void {
    const now = new Date();

    for (const job of this.jobs.values()) {
      if (
        job.status === 'pending' &&
        job.metadata.scheduledAt &&
        job.metadata.scheduledAt <= now
      ) {
        job.status = 'queued';
        job.metadata.updatedAt = now;
        this.addToQueue(job.id, job.priority);
        this.recordEvent('job_promoted', job.id);
        this.emit('jobPromoted', job);
      }
    }
  }

  /**
   * Check if job dependencies are met
   */
  private areDependenciesMet(dependencies: string[]): boolean {
    return dependencies.every((depId) => {
      const depJob = this.jobs.get(depId);
      return depJob && depJob.status === 'completed';
    });
  }

  /**
   * Add job to appropriate priority queue
   */
  private addToQueue(jobId: string, priority: JobPriority): void {
    const queue = this.priorityQueues.get(priority);
    if (queue) {
      queue.push(jobId);
    }
  }

  /**
   * Remove job from priority queue
   */
  private removeFromQueue(jobId: string, priority: JobPriority): void {
    const queue = this.priorityQueues.get(priority);
    if (queue) {
      const index = queue.indexOf(jobId);
      if (index > -1) {
        queue.splice(index, 1);
      }
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(
    type: string,
    payload: Record<string, unknown>,
  ): string {
    const timestamp = Date.now();
    const hash = createHash('md5')
      .update(JSON.stringify({ type, payload, timestamp }))
      .digest('hex')
      .substring(0, 8);

    return `${type}_${timestamp}_${hash}`;
  }

  /**
   * Update queue metrics
   */
  private updateMetrics(): void {
    const jobs = Array.from(this.jobs.values());

    this.metrics.totalJobs = jobs.length;
    this.metrics.pendingJobs = jobs.filter(
      (j) => j.status === 'pending',
    ).length;
    this.metrics.processingJobs = this.processingJobs.size;
    this.metrics.completedJobs = jobs.filter(
      (j) => j.status === 'completed',
    ).length;
    this.metrics.failedJobs = jobs.filter((j) => j.status === 'failed').length;
    this.metrics.deadLetterJobs = this.deadLetterQueue.length;
    this.metrics.queueSize = this.getTotalQueueSize();
    this.metrics.concurrentJobs = this.processingJobs.size;
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
    this.metrics.lastUpdated = new Date();

    // Calculate average processing time
    const completedJobs = jobs.filter(
      (j) => j.status === 'completed' && j.metadata.actualDuration,
    );
    if (completedJobs.length > 0) {
      this.metrics.averageProcessingTime =
        completedJobs.reduce(
          (sum, job) => sum + (job.metadata.actualDuration || 0),
          0,
        ) / completedJobs.length;
    }

    // Calculate throughput and error rate
    const oneMinuteAgo = Date.now() - 60000;
    const recentEvents = this.jobHistory.filter(
      (e) => e.timestamp > oneMinuteAgo,
    );
    const completedInLastMinute = recentEvents.filter(
      (e) => e.event === 'job_completed',
    ).length;
    const failedInLastMinute = recentEvents.filter(
      (e) => e.event === 'job_dead_letter',
    ).length;

    this.metrics.throughputPerMinute = completedInLastMinute;
    this.metrics.errorRate =
      completedInLastMinute + failedInLastMinute > 0
        ? failedInLastMinute / (completedInLastMinute + failedInLastMinute)
        : 0;
  }

  /**
   * Get total queue size across all priorities
   */
  private getTotalQueueSize(): number {
    return Array.from(this.priorityQueues.values()).reduce(
      (total, queue) => total + queue.length,
      0,
    );
  }

  /**
   * Record event for metrics and history
   */
  private recordEvent(event: string, jobId: string): void {
    this.jobHistory.push({
      timestamp: Date.now(),
      event,
      jobId,
    });

    // Limit history size
    if (this.jobHistory.length > 10000) {
      this.jobHistory.splice(0, 1000);
    }
  }

  /**
   * Setup periodic intervals for maintenance tasks
   */
  private setupIntervals(): void {
    if (this.config.persistence.enabled) {
      this.persistenceInterval = setInterval(() => {
        this.persistState();
      }, this.config.persistence.interval);
    }

    if (this.config.metrics.enabled) {
      this.metricsInterval = setInterval(() => {
        this.updateMetrics();
        this.emit('metricsUpdated', this.metrics);
      }, 5000); // Update metrics every 5 seconds
    }

    // Cleanup interval - run every hour
    setInterval(() => {
      this.cleanup();
    }, 3600000);
  }

  /**
   * Persist queue state to database
   */
  private async persistState(): Promise<void> {
    try {
      const jobs = Array.from(this.jobs.values()).map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        data: {
          payload: job.payload,
          metadata: {
            ...job.metadata,
            createdAt: job.metadata.createdAt.toISOString(),
            updatedAt: job.metadata.updatedAt.toISOString(),
            scheduledAt: job.metadata.scheduledAt?.toISOString(),
            startedAt: job.metadata.startedAt?.toISOString(),
            completedAt: job.metadata.completedAt?.toISOString(),
          },
          dependencies: job.dependencies,
          tags: job.tags,
        },
        priority: this.priorityToNumber(job.priority),
        created_at: job.metadata.createdAt.toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: job.metadata.completedAt?.toISOString(),
        error: job.metadata.lastError,
      }));

      if (jobs.length > 0) {
        const { error } = await supabase
          .from('batch_jobs')
          .upsert(jobs, { onConflict: 'id' });

        if (error) {
          console.error('Failed to persist batch jobs:', error);
        }
      }

      this.emit('statePersisted', {
        jobCount: this.jobs.size,
        queueSizes: this.getStatus().queueSizes,
      });
    } catch (error) {
      console.error('Failed to persist batch job state:', error);
    }
  }

  /**
   * Recover jobs from database on startup
   */
  private async recoverJobs(): Promise<void> {
    try {
      const { data: jobs, error } = await supabase
        .from('batch_jobs')
        .select('*')
        .in('status', ['pending', 'queued', 'processing', 'retrying'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to recover batch jobs:', error);
        return;
      }

      if (jobs && jobs.length > 0) {
        console.log(`Recovering ${jobs.length} batch jobs from database...`);

        for (const job of jobs) {
          const batchJob: BatchJob = {
            id: job.id,
            type: job.type,
            status: job.status === 'processing' ? 'queued' : job.status, // Reset processing jobs to queued
            priority: this.numberToPriority(job.priority),
            payload: job.data.payload,
            metadata: {
              ...job.data.metadata,
              createdAt: new Date(job.data.metadata.createdAt),
              updatedAt: new Date(job.data.metadata.updatedAt),
              scheduledAt: job.data.metadata.scheduledAt
                ? new Date(job.data.metadata.scheduledAt)
                : undefined,
              startedAt: job.data.metadata.startedAt
                ? new Date(job.data.metadata.startedAt)
                : undefined,
              completedAt: job.data.metadata.completedAt
                ? new Date(job.data.metadata.completedAt)
                : undefined,
            },
            dependencies: job.data.dependencies,
            tags: job.data.tags,
          };

          this.jobs.set(job.id, batchJob);

          // Add to appropriate priority queue
          const queue = this.priorityQueues.get(batchJob.priority);
          if (queue && !queue.includes(job.id)) {
            queue.push(job.id);
          }
        }

        console.log(`Successfully recovered ${jobs.length} batch jobs`);
        this.updateMetrics();
      }
    } catch (error) {
      console.error('Failed to recover batch jobs:', error);
    }
  }

  /**
   * Convert priority to number for database storage
   */
  private priorityToNumber(priority: JobPriority): number {
    const map: Record<JobPriority, number> = {
      low: 0,
      normal: 1,
      high: 2,
      critical: 3,
    };
    return map[priority];
  }

  /**
   * Convert number to priority from database
   */
  private numberToPriority(num: number): JobPriority {
    const map: Record<number, JobPriority> = {
      0: 'low',
      1: 'normal',
      2: 'high',
      3: 'critical',
    };
    return map[num] || 'normal';
  }
}
