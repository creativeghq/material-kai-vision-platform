/**
 * PDF Processing WebSocket Service
 * 
 * Provides real-time progress updates for PDF processing workflows
 * Integrates with ConsolidatedPDFWorkflowService for live progress monitoring
 */

import { WebSocketManager } from '../websocket/WebSocketManager';
import { WorkflowJob, WorkflowStep } from '../consolidatedPDFWorkflowService';

export interface PDFProcessingProgress {
  jobId: string;
  documentId?: string;
  fileName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  overallProgress: number;
  currentStep: string;
  steps: PDFProcessingStep[];
  startTime: Date;
  endTime?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  statistics: {
    pagesProcessed: number;
    totalPages: number;
    chunksCreated: number;
    imagesExtracted: number;
    textLength: number;
    kbEntriesSaved: number;
    categoriesExtracted: number;
  };
  errors: Array<{
    step: string;
    message: string;
    timestamp: Date;
  }>;
  metadata?: Record<string, unknown>;
}

export interface PDFProcessingStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  details: string[];
  substeps?: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress: number;
  }>;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PDFProcessingWebSocketMessage {
  type: 'progress_update' | 'step_update' | 'error' | 'completed' | 'cancelled';
  jobId: string;
  data: Partial<PDFProcessingProgress>;
  timestamp: Date;
}

class PDFProcessingWebSocketService {
  private wsManager: WebSocketManager | null = null;
  private activeJobs: Map<string, PDFProcessingProgress> = new Map();
  private subscribers: Map<string, Set<(progress: PDFProcessingProgress) => void>> = new Map();

  constructor() {
    this.initializeWebSocket();
  }

  private initializeWebSocket() {
    try {
      // Disable WebSocket in production until properly configured
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL;

      if (!wsUrl) {
        console.log('📡 WebSocket disabled - NEXT_PUBLIC_WS_URL not configured');
        return;
      }

      this.wsManager = new WebSocketManager({
        url: wsUrl,
        maxReconnectAttempts: 5,
        reconnectInterval: 3000,
        heartbeatInterval: 30000,
      });

      this.wsManager.setHandlers({
        onMessage: this.handleWebSocketMessage.bind(this),
        onOpen: () => {
          console.log('📡 PDF Processing WebSocket connected');
        },
        onClose: () => {
          console.log('📡 PDF Processing WebSocket disconnected');
        },
        onError: (event) => {
          console.error('📡 PDF Processing WebSocket error:', event);
        },
      });

      this.wsManager.connect();
    } catch (error) {
      console.error('Failed to initialize PDF Processing WebSocket:', error);
    }
  }

  private handleWebSocketMessage(message: any) {
    try {
      const wsMessage = message as PDFProcessingWebSocketMessage;
      
      if (wsMessage.type === 'progress_update' && wsMessage.jobId) {
        this.updateJobProgress(wsMessage.jobId, wsMessage.data);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Subscribe to progress updates for a specific job
   */
  public subscribeToJob(jobId: string, callback: (progress: PDFProcessingProgress) => void): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    
    this.subscribers.get(jobId)!.add(callback);

    // Send current progress if available
    const currentProgress = this.activeJobs.get(jobId);
    if (currentProgress) {
      callback(currentProgress);
    }

    // Return unsubscribe function
    return () => {
      const jobSubscribers = this.subscribers.get(jobId);
      if (jobSubscribers) {
        jobSubscribers.delete(callback);
        if (jobSubscribers.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }

  /**
   * Start tracking a new PDF processing job
   */
  public startJob(jobId: string, fileName: string, totalPages: number = 0): void {
    const progress: PDFProcessingProgress = {
      jobId,
      fileName,
      status: 'pending',
      overallProgress: 0,
      currentStep: 'Initializing',
      steps: this.createInitialSteps(),
      startTime: new Date(),
      statistics: {
        pagesProcessed: 0,
        totalPages,
        chunksCreated: 0,
        imagesExtracted: 0,
        textLength: 0,
        kbEntriesSaved: 0,
        categoriesExtracted: 0,
      },
      errors: [],
    };

    this.activeJobs.set(jobId, progress);
    this.notifySubscribers(jobId, progress);
  }

  /**
   * Update job progress from workflow service
   */
  public updateFromWorkflowJob(workflowJob: WorkflowJob): void {
    const existingProgress = this.activeJobs.get(workflowJob.id);
    if (!existingProgress) {
      // Create new progress tracking if it doesn't exist
      this.startJob(workflowJob.id, workflowJob.filename || 'Unknown File');
    }

    const progress = this.activeJobs.get(workflowJob.id)!;

    // Update overall status and progress
    progress.status = this.mapWorkflowStatus(workflowJob.status);
    const totalSteps = workflowJob.steps?.length || 0;
    const currentIndex = typeof workflowJob.currentStepIndex === 'number' ? workflowJob.currentStepIndex : 0;
    progress.overallProgress = totalSteps > 0 ? Math.round(((currentIndex + 1) / totalSteps) * 100) : 0;
    progress.currentStep = workflowJob.steps?.[currentIndex]?.name || 'Processing';

    // Update steps
    progress.steps = (workflowJob.steps || []).map(step => this.mapWorkflowStep(step));

    // Extract statistics from step metadata
    this.extractStatisticsFromSteps(progress, workflowJob.steps || []);

    // Update timing
    if (workflowJob.endTime) {
      progress.endTime = workflowJob.endTime;
      progress.actualDuration = progress.endTime.getTime() - progress.startTime.getTime();
    }

    this.activeJobs.set(workflowJob.id, progress);
    this.notifySubscribers(workflowJob.id, progress);
  }

  /**
   * Update specific job statistics
   */
  public updateJobStatistics(
    jobId: string, 
    statistics: Partial<PDFProcessingProgress['statistics']>
  ): void {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      progress.statistics = { ...progress.statistics, ...statistics };
      this.notifySubscribers(jobId, progress);
    }
  }

  /**
   * Add error to job
   */
  public addJobError(jobId: string, step: string, message: string): void {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      progress.errors.push({
        step,
        message,
        timestamp: new Date(),
      });
      this.notifySubscribers(jobId, progress);
    }
  }

  /**
   * Complete job processing
   */
  public completeJob(jobId: string, finalStatistics?: Partial<PDFProcessingProgress['statistics']>): void {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      progress.status = 'completed';
      progress.overallProgress = 100;
      progress.endTime = new Date();
      progress.actualDuration = progress.endTime.getTime() - progress.startTime.getTime();
      
      if (finalStatistics) {
        progress.statistics = { ...progress.statistics, ...finalStatistics };
      }

      this.notifySubscribers(jobId, progress);
      
      // Clean up after 5 minutes
      setTimeout(() => {
        this.activeJobs.delete(jobId);
        this.subscribers.delete(jobId);
      }, 5 * 60 * 1000);
    }
  }

  /**
   * Get current progress for a job
   */
  public getJobProgress(jobId: string): PDFProcessingProgress | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Get all active jobs
   */
  public getActiveJobs(): PDFProcessingProgress[] {
    return Array.from(this.activeJobs.values());
  }

  private createInitialSteps(): PDFProcessingStep[] {
    return [
      {
        id: 'upload',
        name: 'File Upload',
        description: 'Uploading PDF file to processing service',
        status: 'pending',
        progress: 0,
        details: [],
      },
      {
        id: 'mivaa-processing',
        name: 'MIVAA Processing',
        description: 'Advanced PDF analysis and content extraction',
        status: 'pending',
        progress: 0,
        details: [],
        substeps: [
          { name: 'Document Analysis', status: 'pending', progress: 0 },
          { name: 'Text Extraction', status: 'pending', progress: 0 },
          { name: 'Image Extraction', status: 'pending', progress: 0 },
          { name: 'Chunk Generation', status: 'pending', progress: 0 },
          { name: 'Category Extraction', status: 'pending', progress: 0 },
        ],
      },
      {
        id: 'database-storage',
        name: 'Database Storage',
        description: 'Saving processed content to knowledge base',
        status: 'pending',
        progress: 0,
        details: [],
      },
      {
        id: 'finalization',
        name: 'Finalization',
        description: 'Completing processing and cleanup',
        status: 'pending',
        progress: 0,
        details: [],
      },
    ];
  }

  private mapWorkflowStatus(status: string): PDFProcessingProgress['status'] {
    switch (status) {
      case 'pending': return 'pending';
      case 'running': return 'running';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'cancelled': return 'cancelled';
      default: return 'pending';
    }
  }

  private mapWorkflowStep(step: WorkflowStep): PDFProcessingStep {
    return {
      id: step.id,
      name: step.name,
      description: step.description || '',
      status: step.status === 'pending' ? 'pending' :
              step.status === 'running' ? 'running' :
              step.status === 'completed' ? 'completed' :
              step.status === 'failed' ? 'failed' : 'skipped',
      progress: step.progress || 0,
      startTime: step.metadata?.startTime as Date,
      endTime: step.metadata?.endTime as Date,
      details: Array.isArray(step.details) ? step.details.map(d => 
        typeof d === 'string' ? d : d.message
      ) : [],
      error: step.metadata?.error as string,
      metadata: step.metadata,
    };
  }

  private extractStatisticsFromSteps(progress: PDFProcessingProgress, steps: WorkflowStep[]): void {
    const mivaaStep = steps.find(s => s.id === 'mivaa-processing');
    if (mivaaStep?.metadata) {
      const metadata = mivaaStep.metadata;
      
      if (typeof metadata.chunks_created === 'number') {
        progress.statistics.chunksCreated = metadata.chunks_created;
      }
      if (typeof metadata.images_extracted === 'number') {
        progress.statistics.imagesExtracted = metadata.images_extracted;
      }
      if (typeof metadata.text_length === 'number') {
        progress.statistics.textLength = metadata.text_length;
      }
      if (typeof metadata.kb_entries_saved === 'number') {
        progress.statistics.kbEntriesSaved = metadata.kb_entries_saved;
      }
      if (typeof metadata.categories_extracted === 'number') {
        progress.statistics.categoriesExtracted = metadata.categories_extracted;
      }
    }
  }

  private updateJobProgress(jobId: string, data: Partial<PDFProcessingProgress>): void {
    const progress = this.activeJobs.get(jobId);
    if (progress) {
      Object.assign(progress, data);
      this.notifySubscribers(jobId, progress);
    }
  }

  private notifySubscribers(jobId: string, progress: PDFProcessingProgress): void {
    const subscribers = this.subscribers.get(jobId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(progress);
        } catch (error) {
          console.error('Error in progress callback:', error);
        }
      });
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.wsManager) {
      this.wsManager.disconnect();
      this.wsManager = null;
    }
    this.activeJobs.clear();
    this.subscribers.clear();
  }
}

// Export singleton instance
export const pdfProcessingWebSocketService = new PDFProcessingWebSocketService();
export default pdfProcessingWebSocketService;
