/**
 * Consolidated PDF Workflow Service - MIVAA API Wrapper
 *
 * This service is a thin wrapper around MIVAA API for PDF processing.
 * All actual processing happens in MIVAA backend - this just manages
 * job state and provides a consistent interface for the frontend.
 *
 * REFACTORED: Removed 3,500+ lines of duplicate processing logic.
 * Now uses MIVAA API exclusively for all PDF processing.
 */

import { supabase } from '../integrations/supabase/client';
import { mivaaApi } from './mivaaApiClient';

// ==================== TYPES ====================

export interface WorkflowStepDetail {
  message: string;
  status?: 'success' | 'error' | 'info';
  error?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  details?: (string | WorkflowStepDetail)[];
  metadata?: Record<string, unknown>;
  result?: unknown;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  logs?: string[];
}

export interface WorkflowJob {
  id: string;
  name?: string;
  filename?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: WorkflowStep[];
  currentStepIndex: number;
  progress: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  result?: {
    documentId?: string;
    productsCreated?: number;
    chunksCreated?: number;
    imagesExtracted?: number;
    embeddingsGenerated?: number;
    [key: string]: any;
  };
}

export interface PDFProcessingOptions {
  categoryId?: string;
  focusedExtraction?: boolean;
  extractCategories?: string[];
  workspaceId?: string;
}

// ==================== SERVICE ====================

class ConsolidatedPDFWorkflowService {
  private jobs: Map<string, WorkflowJob> = new Map();
  private subscribers: Set<(job: WorkflowJob) => void> = new Set();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start PDF processing by uploading to MIVAA API
   */
  async startPDFProcessing(
    file: File,
    options: PDFProcessingOptions = {},
  ): Promise<string> {
    const jobId = crypto.randomUUID();

    // Create initial job
    const job: WorkflowJob = {
      id: jobId,
      filename: file.name,
      status: 'pending',
      steps: this.createInitialSteps(),
      currentStepIndex: 0,
      progress: 0,
      startTime: new Date(),
    };

    this.jobs.set(jobId, job);
    this.notifySubscribers(job);

    // Start processing
    this.processFile(jobId, file, options).catch((error) => {
      console.error(`Job ${jobId} failed:`, error);
      this.updateJobStatus(jobId, 'failed', error.message);
    });

    return jobId;
  }

  /**
   * Process file by uploading to MIVAA and polling for status
   */
  private async processFile(
    jobId: string,
    file: File,
    options: PDFProcessingOptions,
  ): Promise<void> {
    try {
      // Update status
      this.updateJobStatus(jobId, 'running');
      this.updateStep(jobId, 0, 'running', 'Uploading PDF to MIVAA...');

      // Get workspace ID
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const workspaceId = options.workspaceId || user.id;

      // Upload to MIVAA API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workspace_id', workspaceId);
      if (options.categoryId) {
        formData.append('category_id', options.categoryId);
      }
      if (options.focusedExtraction !== undefined) {
        formData.append(
          'focused_extraction',
          String(options.focusedExtraction),
        );
      }
      if (options.extractCategories) {
        formData.append(
          'extract_categories',
          JSON.stringify(options.extractCategories),
        );
      }

      const uploadResponse = await mivaaApi.uploadPDF(formData);

      if (!uploadResponse.success || !uploadResponse.data) {
        throw new Error(uploadResponse.error || 'Upload failed');
      }

      const { job_id: mivaaJobId, document_id: documentId } =
        uploadResponse.data;

      this.updateStep(
        jobId,
        0,
        'completed',
        `Uploaded successfully. MIVAA Job ID: ${mivaaJobId}`,
      );
      this.updateStep(jobId, 1, 'running', 'Processing PDF in MIVAA...');

      // Poll for status
      await this.pollMivaaJobStatus(jobId, mivaaJobId, documentId);
    } catch (error) {
      console.error(`Processing failed for job ${jobId}:`, error);
      this.updateJobStatus(
        jobId,
        'failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Poll MIVAA API for job status
   */
  private async pollMivaaJobStatus(
    jobId: string,
    mivaaJobId: string,
    documentId: string,
  ): Promise<void> {
    const pollInterval = setInterval(async () => {
      try {
        // Get job status from MIVAA
        const statusResponse = await mivaaApi.getJobStatus(mivaaJobId);

        if (!statusResponse.success || !statusResponse.data) {
          console.error('Failed to get job status:', statusResponse.error);
          return;
        }

        const { status, progress, current_stage, result, error } =
          statusResponse.data;

        // Update job progress
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.progress = progress || 0;

        // Update current step based on stage
        this.updateStepFromMivaaStage(jobId, current_stage, progress);

        // Check if completed
        if (status === 'completed') {
          clearInterval(pollInterval);
          this.pollingIntervals.delete(jobId);

          // Update final results
          job.status = 'completed';
          job.endTime = new Date();
          job.result = {
            documentId,
            ...result,
          };

          this.updateStep(
            jobId,
            job.steps.length - 1,
            'completed',
            'PDF processing completed successfully!',
          );
          this.notifySubscribers(job);
        } else if (status === 'failed') {
          clearInterval(pollInterval);
          this.pollingIntervals.delete(jobId);

          job.status = 'failed';
          job.error = error || 'Processing failed';
          job.endTime = new Date();

          this.updateStep(
            jobId,
            job.currentStepIndex,
            'failed',
            error || 'Processing failed',
          );
          this.notifySubscribers(job);
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    }, 2000); // Poll every 2 seconds

    this.pollingIntervals.set(jobId, pollInterval);
  }

  /**
   * Update step based on MIVAA stage
   */
  private updateStepFromMivaaStage(
    jobId: string,
    stage: string,
    progress: number,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const stageMap: Record<string, number> = {
      uploading: 0,
      extracting: 1,
      chunking: 2,
      analyzing: 3,
      embedding: 4,
      products: 5,
      completed: 6,
    };

    const stepIndex = stageMap[stage] || job.currentStepIndex;

    if (stepIndex !== job.currentStepIndex) {
      // Mark previous step as completed
      if (job.currentStepIndex < stepIndex) {
        this.updateStep(jobId, job.currentStepIndex, 'completed');
      }

      // Update current step
      job.currentStepIndex = stepIndex;
      this.updateStep(
        jobId,
        stepIndex,
        'running',
        `Processing: ${stage}`,
        progress,
      );
    } else {
      // Update progress of current step
      this.updateStep(jobId, stepIndex, 'running', undefined, progress);
    }

    this.notifySubscribers(job);
  }

  /**
   * Create initial workflow steps
   */
  private createInitialSteps(): WorkflowStep[] {
    return [
      {
        id: 'upload',
        name: 'Upload PDF',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'extract',
        name: 'Extract Content',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'chunk',
        name: 'Create Chunks',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'analyze',
        name: 'Analyze Content',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'embed',
        name: 'Generate Embeddings',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'products',
        name: 'Create Products',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'complete',
        name: 'Finalize',
        status: 'pending',
        progress: 0,
      },
    ];
  }

  /**
   * Update job status
   */
  private updateJobStatus(
    jobId: string,
    status: WorkflowJob['status'],
    error?: string,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = status;
    if (error) job.error = error;
    if (status === 'completed' || status === 'failed') {
      job.endTime = new Date();
    }

    this.notifySubscribers(job);
  }

  /**
   * Update workflow step
   */
  private updateStep(
    jobId: string,
    stepIndex: number,
    status?: WorkflowStep['status'],
    message?: string,
    progress?: number,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job || !job.steps[stepIndex]) return;

    const step = job.steps[stepIndex];

    if (status) step.status = status;
    if (progress !== undefined) step.progress = progress;
    if (message) {
      step.details = step.details || [];
      step.details.push({ message, status: 'info' });
    }

    if (status === 'running' && !step.startTime) {
      step.startTime = new Date();
    }
    if ((status === 'completed' || status === 'failed') && !step.endTime) {
      step.endTime = new Date();
      if (step.startTime) {
        step.duration = step.endTime.getTime() - step.startTime.getTime();
      }
    }

    this.notifySubscribers(job);
  }

  // ==================== PUBLIC API ====================

  subscribe(callback: (job: WorkflowJob) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getAllJobs(): WorkflowJob[] {
    return Array.from(this.jobs.values());
  }

  getJob(jobId: string): WorkflowJob | undefined {
    return this.jobs.get(jobId);
  }

  async retryJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    job.status = 'pending';
    job.error = undefined;
    job.currentStepIndex = 0;
    job.progress = 0;
    job.steps = this.createInitialSteps();
    job.startTime = new Date();
    job.endTime = undefined;
    this.notifySubscribers(job);
    console.warn('Retry not fully implemented - file needs to be re-uploaded');
  }

  clearCompletedJobs(): void {
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status === 'completed') {
        const interval = this.pollingIntervals.get(jobId);
        if (interval) {
          clearInterval(interval);
          this.pollingIntervals.delete(jobId);
        }
        this.jobs.delete(jobId);
      }
    }
  }

  private notifySubscribers(job: WorkflowJob): void {
    this.subscribers.forEach((callback) => callback(job));
  }
}

export const consolidatedPDFWorkflowService =
  new ConsolidatedPDFWorkflowService();
