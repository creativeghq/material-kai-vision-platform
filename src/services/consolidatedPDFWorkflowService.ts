/**
 * Consolidated PDF Workflow Service Types
 *
 * Stub file providing type definitions for PDF workflow tracking.
 * These types are used by PDFProcessingWebSocketService.
 *
 * NOTE: This file exists only to prevent TypeScript compilation errors.
 * The actual workflow management is handled by the MIVAA API backend
 * and tracked via job status polling.
 */

/**
 * Workflow job status
 */
export type WorkflowJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Workflow step status
 */
export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Individual workflow step
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStepStatus;
  progress?: number;
  details?: Array<string | { message: string; timestamp?: Date }>;
  metadata?: {
    startTime?: Date;
    endTime?: Date;
    error?: string;
    chunks_created?: number;
    images_extracted?: number;
    text_length?: number;
    kb_entries_saved?: number;
    categories_extracted?: number;
    [key: string]: any;
  };
}

/**
 * Workflow job tracking
 */
export interface WorkflowJob {
  id: string;
  filename?: string;
  status: WorkflowJobStatus;
  steps?: WorkflowStep[];
  currentStepIndex?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Workflow progress update
 */
export interface WorkflowProgressUpdate {
  jobId: string;
  status: WorkflowJobStatus;
  currentStep?: string;
  progress?: number;
  metadata?: Record<string, any>;
}
