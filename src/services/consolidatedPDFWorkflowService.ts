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
  metadata?: Record<string, any>; // Backend metadata from MIVAA
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

        const { status, progress, last_checkpoint, metadata, error } =
          statusResponse.data;

        // Update job progress
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.progress = progress || 0;

        // Extract current stage from last_checkpoint
        // Backend returns: last_checkpoint.stage (e.g., "pdf_extracted", "chunks_created")
        const currentStage = last_checkpoint?.stage || metadata?.current_stage;

        // Update current step based on stage
        this.updateStepFromMivaaStage(jobId, currentStage, progress);

        // Store metadata for display
        if (metadata) {
          job.metadata = metadata;
        }

        // Check if completed
        if (status === 'completed') {
          clearInterval(pollInterval);
          this.pollingIntervals.delete(jobId);

          // Update final results
          job.status = 'completed';
          job.endTime = new Date();
          job.result = {
            documentId,
            ...metadata,
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
   * Update step based on MIVAA stage - COMPLETE MAPPING OF ALL 9 BACKEND STAGES
   *
   * Maps backend checkpoint stages to frontend workflow steps:
   * - INITIALIZED → upload (0%)
   * - PDF_EXTRACTED → extract (15%)
   * - CHUNKS_CREATED → chunk (30%)
   * - TEXT_EMBEDDINGS_GENERATED → chunk (50%)
   * - IMAGES_EXTRACTED → images (60%)
   * - IMAGE_EMBEDDINGS_GENERATED → images (70%)
   * - PRODUCTS_DETECTED → detect (80%)
   * - PRODUCTS_CREATED → products (90%)
   * - COMPLETED → complete (100%)
   */
  private updateStepFromMivaaStage(
    jobId: string,
    stage: string | undefined,
    progress: number,
  ): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Complete mapping of all 9 backend checkpoint stages to 7 frontend steps
    const stageMap: Record<string, number> = {
      // Upload phase
      'initialized': 0,
      'uploading': 0,

      // Extract phase
      'pdf_extracted': 1,
      'extracting': 1,
      'extraction': 1,

      // Chunk phase (includes text embeddings)
      'chunks_created': 2,
      'chunking': 2,
      'text_embeddings_generated': 2,
      'embedding': 2,

      // Image phase (includes visual embeddings)
      'images_extracted': 3,
      'image_embeddings_generated': 3,
      'image_processing': 3,

      // Product detection phase
      'products_detected': 4,
      'product_discovery': 4,

      // Product creation phase
      'products_created': 5,
      'products': 5,
      'product_creation': 5,

      // Completion phase
      'completed': 6,
      'finalizing': 6,
    };

    // Normalize stage name (lowercase, handle underscores)
    const normalizedStage = stage ? stage.toLowerCase().replace(/\s+/g, '_') : undefined;
    const stepIndex = normalizedStage ? (stageMap[normalizedStage] ?? job.currentStepIndex) : job.currentStepIndex;

    if (stepIndex !== job.currentStepIndex) {
      // Mark previous steps as completed
      if (job.currentStepIndex < stepIndex) {
        for (let i = job.currentStepIndex; i < stepIndex; i++) {
          this.updateStep(jobId, i, 'completed');
        }
      }

      // Update current step
      job.currentStepIndex = stepIndex;
      this.updateStep(
        jobId,
        stepIndex,
        'running',
        `Processing: ${stage || 'unknown'}`,
        progress,
      );
    } else {
      // Update progress of current step
      this.updateStep(jobId, stepIndex, 'running', undefined, progress);
    }

    this.notifySubscribers(job);
  }

  /**
   * Create initial workflow steps - ALIGNED WITH 9 BACKEND CHECKPOINTS
   *
   * Backend stages:
   * 1. INITIALIZED (0%) - Job created
   * 2. PDF_EXTRACTED (15%) - PDF analysis complete
   * 3. CHUNKS_CREATED (30%) - Text chunking complete
   * 4. TEXT_EMBEDDINGS_GENERATED (50%) - Text embeddings complete
   * 5. IMAGES_EXTRACTED (60%) - Image extraction complete
   * 6. IMAGE_EMBEDDINGS_GENERATED (70%) - Visual embeddings complete
   * 7. PRODUCTS_DETECTED (80%) - Products identified
   * 8. PRODUCTS_CREATED (90%) - Product creation complete
   * 9. COMPLETED (100%) - All processing complete
   */
  private createInitialSteps(): WorkflowStep[] {
    return [
      {
        id: 'upload',
        name: 'Upload PDF',
        description: 'Uploading and initializing PDF processing',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'extract',
        name: 'Extract Content',
        description: 'Extracting text and analyzing PDF structure',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'chunk',
        name: 'Create Chunks',
        description: 'Creating semantic chunks and generating text embeddings',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'images',
        name: 'Process Images',
        description: 'Extracting images and generating visual embeddings',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'detect',
        name: 'Detect Products',
        description: 'Identifying and detecting products in content',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'products',
        name: 'Create Products',
        description: 'Creating product records and linking entities',
        status: 'pending',
        progress: 0,
      },
      {
        id: 'complete',
        name: 'Finalize',
        description: 'Finalizing processing and quality checks',
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
