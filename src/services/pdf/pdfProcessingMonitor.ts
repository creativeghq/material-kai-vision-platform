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
    if (!jobId) return;

    let intervalId: NodeJS.Timeout;

    const pollJobStatus = async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('background_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (queryError) {
          throw queryError;
        }

        if (data) {
          setJobStatus(data as JobStatus);

          // Stop polling if job is completed or failed
          if (data.status === 'completed' || data.status === 'failed') {
            setIsPolling(false);
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
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
      clearInterval(intervalId);
    };
  }, [jobId]);

  return { jobStatus, isPolling, error };
}

/**
 * Map backend checkpoint stages to UI stages
 */
export function mapCheckpointToStages(checkpoint: string, metadata?: Record<string, any>): Partial<Stage>[] {
  const stageMapping: Record<string, Partial<Stage>[]> = {
    'INITIALIZED': [
      { id: 1, name: 'Product Discovery', status: 'complete', progress: 100 },
      { id: 2, name: 'Entity Discovery', status: 'complete', progress: 100 },
    ],
    'PDF_EXTRACTED': [
      { id: 3, name: 'Focused Extraction', status: 'complete', progress: 100 },
    ],
    'CHUNKS_CREATED': [
      { id: 4, name: 'Chunking', status: 'complete', progress: 100 },
    ],
    'TEXT_EMBEDDINGS_GENERATED': [
      { id: 5, name: 'Text Embeddings', status: 'complete', progress: 100 },
    ],
    'IMAGES_EXTRACTED': [
      { id: 6, name: 'Image Extraction', status: 'complete', progress: 100 },
      { id: 7, name: 'Image Classification', status: 'complete', progress: 100 },
      { id: 8, name: 'Image Analysis', status: 'complete', progress: 100 },
    ],
    'IMAGE_EMBEDDINGS_GENERATED': [
      { id: 9, name: 'CLIP Embeddings', status: 'complete', progress: 100 },
    ],
    'PRODUCTS_CREATED': [
      { id: 10, name: 'Product Creation', status: 'complete', progress: 100 },
    ],
    'DOCUMENT_ENTITIES_CREATED': [
      { id: 11, name: 'Document Entities', status: 'complete', progress: 100 },
    ],
    'RELATIONSHIPS_CREATED': [
      { id: 12, name: 'Relationship Mapping', status: 'complete', progress: 100 },
    ],
    'METADATA_EXTRACTED': [
      { id: 13, name: 'Metadata Extraction', status: 'complete', progress: 100 },
    ],
    'COMPLETED': [
      { id: 14, name: 'Quality Enhancement', status: 'complete', progress: 100 },
    ],
  };

  return stageMapping[checkpoint] || [];
}

/**
 * Extract metrics from checkpoint metadata
 */
export function extractMetrics(checkpoint: string, metadata?: Record<string, any>): Record<string, any> {
  if (!metadata) return {};

  const metrics: Record<string, any> = {};

  switch (checkpoint) {
    case 'INITIALIZED':
      if (metadata.products_identified) metrics['Products Identified'] = metadata.products_identified;
      if (metadata.pages_analyzed) metrics['Pages Analyzed'] = metadata.pages_analyzed;
      break;

    case 'CHUNKS_CREATED':
      if (metadata.total_chunks) metrics['Total Chunks'] = metadata.total_chunks;
      if (metadata.avg_chunk_size) metrics['Avg Chunk Size'] = metadata.avg_chunk_size;
      break;

    case 'TEXT_EMBEDDINGS_GENERATED':
      if (metadata.embeddings_count) metrics['Embeddings Generated'] = metadata.embeddings_count;
      if (metadata.model_used) metrics['Model Used'] = metadata.model_used;
      break;

    case 'IMAGES_EXTRACTED':
      if (metadata.total_images) metrics['Total Images'] = metadata.total_images;
      if (metadata.material_images) metrics['Material Images'] = metadata.material_images;
      break;

    case 'PRODUCTS_CREATED':
      if (metadata.total_products) metrics['Products Created'] = metadata.total_products;
      if (metadata.products_with_metadata) metrics['With Metadata'] = metadata.products_with_metadata;
      break;

    case 'RELATIONSHIPS_CREATED':
      if (metadata.relationships?.total_relationships) {
        metrics['Total Relationships'] = metadata.relationships.total_relationships;
      }
      break;
  }

  return metrics;
}

