/**
 * PDF Processing Monitor Service
 * Polls background_jobs table for real-time progress updates
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface JobStatus {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  last_checkpoint?: {
    stage: string;
    metadata?: Record<string, any>;
  };
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  progress: number;
  metrics?: Record<string, any>;
  error?: string;
}

/**
 * Hook to monitor PDF processing job status
 */
export function usePDFProcessingMonitor(jobId: string) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      console.warn('⚠️ PDF Monitor: No job ID provided');
      return;
    }

    console.log('🔍 PDF Monitor: Starting to monitor job:', jobId);
    let intervalId: NodeJS.Timeout;

    const pollJobStatus = async () => {
      try {
        console.log('📊 PDF Monitor: Polling job status for:', jobId);
        const { data, error: queryError } = await supabase
          .from('background_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (queryError) {
          console.error('❌ PDF Monitor: Query error:', queryError);
          throw queryError;
        }

        if (data) {
          console.log('✅ PDF Monitor: Job status received:', {
            status: data.status,
            progress: data.progress,
            checkpoint: data.last_checkpoint?.stage
          });
          setJobStatus(data as JobStatus);

          // Stop polling if job is completed or failed
          if (data.status === 'completed' || data.status === 'failed') {
            console.log(`🏁 PDF Monitor: Job ${data.status}, stopping polling`);
            setIsPolling(false);
            clearInterval(intervalId);
          }
        } else {
          console.warn('⚠️ PDF Monitor: No data returned for job:', jobId);
        }
      } catch (err) {
        console.error('❌ PDF Monitor: Error polling job status:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsPolling(false);
        clearInterval(intervalId);
      }
    };

    // Poll immediately
    pollJobStatus();

    // Then poll every 2 seconds
    intervalId = setInterval(pollJobStatus, 2000);

    return () => {
      console.log('🛑 PDF Monitor: Cleanup - stopping polling for job:', jobId);
      clearInterval(intervalId);
    };
  }, [jobId]);

  return { jobStatus, isPolling, error };
}

/**
 * Map backend checkpoint stages to UI stages
 * Returns array of stage IDs that should be marked as complete for this checkpoint
 */
export function mapCheckpointToStages(checkpoint: string): number[] {
  const stageMapping: Record<string, number[]> = {
    'INITIALIZED': [1, 2], // Product Discovery + Entity Discovery
    'PDF_EXTRACTED': [3], // Focused Extraction
    'CHUNKS_CREATED': [4], // Chunking
    'TEXT_EMBEDDINGS_GENERATED': [5], // Text Embeddings
    'IMAGES_EXTRACTED': [6, 7, 8], // Image Extraction + Classification + Analysis
    'IMAGE_EMBEDDINGS_GENERATED': [9], // CLIP Embeddings
    'PRODUCTS_CREATED': [10], // Product Creation
    'DOCUMENT_ENTITIES_CREATED': [11], // Document Entities
    'RELATIONSHIPS_CREATED': [12], // Relationship Mapping
    'METADATA_EXTRACTED': [13], // Metadata Extraction
    'COMPLETED': [14], // Quality Enhancement
  };

  return stageMapping[checkpoint] || [];
}

/**
 * Get the current active stage based on checkpoint
 */
export function getCurrentActiveStage(checkpoint: string): number | null {
  const completedStages = mapCheckpointToStages(checkpoint);
  if (completedStages.length === 0) return 1; // Start at stage 1

  const lastCompletedStage = Math.max(...completedStages);

  // If all stages complete, no active stage
  if (lastCompletedStage >= 14) return null;

  // Next stage is active
  return lastCompletedStage + 1;
}

/**
 * Extract metrics from job metadata for display
 * Metadata comes from background_jobs.metadata field
 */
export function extractMetricsFromJob(metadata?: Record<string, any>): Record<string, any> {
  if (!metadata) return {};

  const metrics: Record<string, any> = {};

  // Current stage info
  if (metadata.current_stage) {
    metrics['Current Stage'] = metadata.current_stage;
  }

  // Progress metrics
  if (metadata.pages_completed !== undefined) {
    metrics['Pages Completed'] = metadata.pages_completed;
  }
  if (metadata.pages_failed !== undefined && metadata.pages_failed > 0) {
    metrics['Pages Failed'] = metadata.pages_failed;
  }

  // Content metrics
  if (metadata.products_created !== undefined) {
    metrics['Products Created'] = metadata.products_created;
  }
  if (metadata.chunks_created !== undefined) {
    metrics['Chunks Created'] = metadata.chunks_created;
  }
  if (metadata.images_extracted !== undefined) {
    metrics['Images Extracted'] = metadata.images_extracted;
  }
  if (metadata.embeddings_generated !== undefined) {
    metrics['Embeddings Generated'] = metadata.embeddings_generated;
  }

  // Database records
  if (metadata.database_records_created !== undefined) {
    metrics['DB Records'] = metadata.database_records_created;
  }
  if (metadata.knowledge_base_entries !== undefined) {
    metrics['KB Entries'] = metadata.knowledge_base_entries;
  }

  // Error tracking
  if (metadata.errors_count !== undefined && metadata.errors_count > 0) {
    metrics['Errors'] = metadata.errors_count;
  }
  if (metadata.warnings_count !== undefined && metadata.warnings_count > 0) {
    metrics['Warnings'] = metadata.warnings_count;
  }

  // AI model info
  if (metadata.ai_model) {
    metrics['AI Model'] = metadata.ai_model;
  }

  // Processing time
  if (metadata.processing_time_ms) {
    const seconds = Math.round(metadata.processing_time_ms / 1000);
    metrics['Processing Time'] = `${seconds}s`;
  }

  return metrics;
}

/**
 * Extract stage-specific metrics from checkpoint metadata
 */
export function extractStageMetrics(stageId: number, jobMetadata?: Record<string, any>): Record<string, any> {
  if (!jobMetadata) return {};

  const metrics: Record<string, any> = {};

  switch (stageId) {
    case 1: // Product Discovery
    case 2: // Entity Discovery
      if (jobMetadata.products_discovered !== undefined) {
        metrics['Products Discovered'] = jobMetadata.products_discovered;
      }
      if (jobMetadata.pages_analyzed !== undefined) {
        metrics['Pages Analyzed'] = jobMetadata.pages_analyzed;
      }
      break;

    case 3: // Focused Extraction
      if (jobMetadata.extracted_pages !== undefined) {
        metrics['Pages Extracted'] = jobMetadata.extracted_pages;
      }
      if (jobMetadata.text_length !== undefined) {
        metrics['Text Length'] = `${Math.round(jobMetadata.text_length / 1000)}K chars`;
      }
      break;

    case 4: // Chunking
      if (jobMetadata.chunks_created !== undefined) {
        metrics['Chunks Created'] = jobMetadata.chunks_created;
      }
      break;

    case 5: // Text Embeddings
      if (jobMetadata.embeddings_generated !== undefined) {
        metrics['Embeddings'] = jobMetadata.embeddings_generated;
      }
      break;

    case 6: // Image Extraction
    case 7: // Image Classification
    case 8: // Image Analysis
      if (jobMetadata.images_extracted !== undefined) {
        metrics['Images'] = jobMetadata.images_extracted;
      }
      break;

    case 9: // CLIP Embeddings
      if (jobMetadata.clip_embeddings !== undefined) {
        metrics['CLIP Embeddings'] = jobMetadata.clip_embeddings;
      }
      break;

    case 10: // Product Creation
      if (jobMetadata.products_created !== undefined) {
        metrics['Products'] = jobMetadata.products_created;
      }
      break;

    case 11: // Document Entities
      if (jobMetadata.entities_created !== undefined) {
        metrics['Entities'] = jobMetadata.entities_created;
      }
      break;

    case 12: // Relationship Mapping
      if (jobMetadata.relationships_created !== undefined) {
        metrics['Relationships'] = jobMetadata.relationships_created;
      }
      break;

    case 13: // Metadata Extraction
      if (jobMetadata.metadata_fields !== undefined) {
        metrics['Metadata Fields'] = jobMetadata.metadata_fields;
      }
      break;

    case 14: // Quality Enhancement
      if (jobMetadata.confidence_score !== undefined) {
        metrics['Confidence'] = `${Math.round(jobMetadata.confidence_score * 100)}%`;
      }
      break;
  }

  return metrics;
}

