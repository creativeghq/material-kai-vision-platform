import { supabase } from '@/integrations/supabase/client';

export interface ProcessingStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  progress?: number;
  details?: string;
  timestamp?: string;
  duration?: number;
}

export interface ProcessingStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  steps: ProcessingStep[];
  result?: any;
  error?: string;
  startTime: string;
  endTime?: string;
  totalDuration?: number;
}

export class PollingService {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private statusCallbacks: Map<string, (status: ProcessingStatus) => void> = new Map();

  /**
   * Start polling for a processing job status
   */
  startPolling(
    jobId: string, 
    onStatusUpdate: (status: ProcessingStatus) => void,
    intervalMs: number = 2000
  ): void {
    // Stop any existing polling for this job
    this.stopPolling(jobId);

    // Store the callback
    this.statusCallbacks.set(jobId, onStatusUpdate);

    // Start polling
    const interval = setInterval(async () => {
      try {
        const status = await this.getJobStatus(jobId);
        onStatusUpdate(status);

        // Stop polling if job is completed or errored
        if (status.status === 'completed' || status.status === 'error') {
          this.stopPolling(jobId);
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Continue polling on error, but notify callback
        onStatusUpdate({
          jobId,
          status: 'error',
          progress: 0,
          currentStep: 'Error',
          steps: [],
          error: error instanceof Error ? error.message : 'Unknown error',
          startTime: new Date().toISOString()
        });
      }
    }, intervalMs);

    this.pollingIntervals.set(jobId, interval);
  }

  /**
   * Stop polling for a specific job
   */
  stopPolling(jobId: string): void {
    const interval = this.pollingIntervals.get(jobId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(jobId);
    }
    this.statusCallbacks.delete(jobId);
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    this.pollingIntervals.forEach((interval) => clearInterval(interval));
    this.pollingIntervals.clear();
    this.statusCallbacks.clear();
  }

  /**
   * Get current job status from MIVAA service
   */
  private async getJobStatus(jobId: string): Promise<ProcessingStatus> {
    const response = await supabase.functions.invoke('mivaa-gateway', {
      body: {
        action: 'get_job_status',
        payload: { job_id: jobId }
      }
    });

    if (response.error) {
      throw new Error(`Failed to get job status: ${response.error.message}`);
    }

    if (!response.data?.success) {
      throw new Error(`Job status request failed: ${response.data?.error?.message || 'Unknown error'}`);
    }

    return this.transformMivaaStatus(response.data.data);
  }

  /**
   * Transform MIVAA service response to our ProcessingStatus format
   */
  private transformMivaaStatus(mivaaStatus: any): ProcessingStatus {
    const steps: ProcessingStep[] = [
      {
        id: 'upload',
        name: 'File Upload',
        description: 'Uploading and validating PDF file',
        status: mivaaStatus.upload_completed ? 'completed' : 
                mivaaStatus.current_step === 'upload' ? 'in-progress' : 'pending',
        progress: mivaaStatus.upload_progress || 0,
        details: mivaaStatus.upload_details,
        timestamp: mivaaStatus.upload_timestamp
      },
      {
        id: 'extraction',
        name: 'Content Extraction',
        description: 'Extracting text, images, and tables from PDF',
        status: mivaaStatus.extraction_completed ? 'completed' : 
                mivaaStatus.current_step === 'extraction' ? 'in-progress' : 'pending',
        progress: mivaaStatus.extraction_progress || 0,
        details: mivaaStatus.extraction_details,
        timestamp: mivaaStatus.extraction_timestamp
      },
      {
        id: 'processing',
        name: 'AI Processing',
        description: 'Analyzing content with LLaMA and generating insights',
        status: mivaaStatus.processing_completed ? 'completed' : 
                mivaaStatus.current_step === 'processing' ? 'in-progress' : 'pending',
        progress: mivaaStatus.processing_progress || 0,
        details: mivaaStatus.processing_details,
        timestamp: mivaaStatus.processing_timestamp
      },
      {
        id: 'embedding',
        name: 'Vector Embedding',
        description: 'Creating embeddings for semantic search',
        status: mivaaStatus.embedding_completed ? 'completed' : 
                mivaaStatus.current_step === 'embedding' ? 'in-progress' : 'pending',
        progress: mivaaStatus.embedding_progress || 0,
        details: mivaaStatus.embedding_details,
        timestamp: mivaaStatus.embedding_timestamp
      },
      {
        id: 'storage',
        name: 'Data Storage',
        description: 'Saving results to database and knowledge base',
        status: mivaaStatus.storage_completed ? 'completed' : 
                mivaaStatus.current_step === 'storage' ? 'in-progress' : 'pending',
        progress: mivaaStatus.storage_progress || 0,
        details: mivaaStatus.storage_details,
        timestamp: mivaaStatus.storage_timestamp
      }
    ];

    return {
      jobId: mivaaStatus.job_id,
      status: mivaaStatus.status,
      progress: mivaaStatus.overall_progress || 0,
      currentStep: mivaaStatus.current_step || 'upload',
      steps,
      result: mivaaStatus.result,
      error: mivaaStatus.error,
      startTime: mivaaStatus.start_time,
      endTime: mivaaStatus.end_time,
      totalDuration: mivaaStatus.total_duration
    };
  }

  /**
   * Create a new processing job and start polling
   */
  async startProcessingJob(
    action: string,
    payload: any,
    onStatusUpdate: (status: ProcessingStatus) => void
  ): Promise<string> {
    // Start the processing job
    const response = await supabase.functions.invoke('mivaa-gateway', {
      body: { action, payload }
    });

    if (response.error) {
      throw new Error(`Failed to start processing: ${response.error.message}`);
    }

    if (!response.data?.success) {
      throw new Error(`Processing failed to start: ${response.data?.error?.message || 'Unknown error'}`);
    }

    const jobId = response.data.data?.job_id;
    if (!jobId) {
      throw new Error('No job ID returned from processing service');
    }

    // Start polling for status updates
    this.startPolling(jobId, onStatusUpdate);

    return jobId;
  }
}

// Export singleton instance
export const pollingService = new PollingService();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    pollingService.stopAllPolling();
  });
}
