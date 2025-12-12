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

        // Fetch job data
        const { data: jobData, error: jobError } = await supabase
          .from('background_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobError) {
          console.error('❌ PDF Monitor: Query error:', jobError);
          throw jobError;
        }

        if (!jobData) {
          console.warn('⚠️ PDF Monitor: No data returned for job:', jobId);
          return;
        }

        // Fetch latest checkpoint
        const { data: checkpoints, error: checkpointError } = await supabase
          .from('job_checkpoints')
          .select('*')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (checkpointError) {
          console.warn('⚠️ PDF Monitor: Error fetching checkpoints:', checkpointError);
        }

        const lastCheckpoint = checkpoints && checkpoints.length > 0 ? checkpoints[0] : null;

        // Combine job data with last checkpoint
        const combinedStatus = {
          ...jobData,
          last_checkpoint: lastCheckpoint,
        } as JobStatus;

        console.log('✅ PDF Monitor: Job status received:', {
          status: combinedStatus.status,
          progress: combinedStatus.progress,
          checkpoint: lastCheckpoint?.stage,
          metadata: jobData.metadata,
        });

        setJobStatus(combinedStatus);

        // Stop polling if job is completed or failed
        if (jobData.status === 'completed' || jobData.status === 'failed') {
          console.log(`🏁 PDF Monitor: Job ${jobData.status}, stopping polling`);
          setIsPolling(false);
          clearInterval(intervalId);
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
 *
 * Backend Checkpoints (from checkpoint_recovery_service.py):
 * - INITIALIZED
 * - PRODUCTS_DETECTED (Stage 0 discovery)
 * - PDF_EXTRACTED (Stage 1 focused extraction)
 * - CHUNKS_CREATED (Stage 2 chunking)
 * - TEXT_EMBEDDINGS_GENERATED (Stage 2 embeddings)
 * - IMAGES_EXTRACTED (Stage 3 image processing)
 * - IMAGE_EMBEDDINGS_GENERATED (Stage 3 CLIP embeddings)
 * - PRODUCTS_CREATED (Stage 4 product creation)
 * - RELATIONSHIPS_CREATED (Stage 5 relationships)
 * - DOCUMENT_ENTITIES_CREATED (Stage 5 entities)
 * - METADATA_EXTRACTED (Stage 5 metadata)
 * - COMPLETED (Final stage)
 */
export function mapCheckpointToStages(checkpoint: string): number[] {
  const stageMapping: Record<string, number[]> = {
    'initialized': [1], // Job Initialization
    'products_detected': [2], // Product Discovery (Stage 0)
    'pdf_extracted': [3], // Focused Extraction (Stage 1)
    'chunks_created': [4, 5], // Chunking + Text Embeddings (Stage 2)
    'text_embeddings_generated': [5], // Text Embeddings Complete
    'images_extracted': [6, 7, 8], // Image Extraction + Classification + Analysis (Stage 3)
    'image_embeddings_generated': [9], // CLIP Embeddings (Stage 3)
    'products_created': [10], // Product Creation (Stage 4)
    'relationships_created': [11], // Relationship Mapping (Stage 5)
    'document_entities_created': [12], // Document Entities (Stage 5)
    'metadata_extracted': [13], // Metadata Extraction (Stage 5)
    'completed': [14], // Quality Enhancement & Completion
  };

  // Handle both uppercase and lowercase checkpoint names
  const normalizedCheckpoint = checkpoint.toLowerCase();
  return stageMapping[normalizedCheckpoint] || [];
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
  if (metadata.total_pages !== undefined) {
    metrics['Total Pages'] = metadata.total_pages;
  }
  if (metadata.pages_completed !== undefined) {
    metrics['Pages Completed'] = metadata.pages_completed;
  }
  if (metadata.pages_failed !== undefined && metadata.pages_failed > 0) {
    metrics['Pages Failed'] = metadata.pages_failed;
  }
  if (metadata.pages_skipped !== undefined && metadata.pages_skipped > 0) {
    metrics['Pages Skipped'] = metadata.pages_skipped;
  }

  // Content metrics
  if (metadata.products_created !== undefined) {
    metrics['Products Found'] = metadata.products_created;
  }
  if (metadata.chunks_created !== undefined) {
    metrics['Chunks Created'] = metadata.chunks_created;
  }
  if (metadata.images_extracted !== undefined) {
    metrics['Images Extracted'] = metadata.images_extracted;
  }
  if (metadata.total_images_extracted !== undefined && metadata.total_images_extracted > metadata.images_extracted) {
    metrics['Total Images Found'] = metadata.total_images_extracted;
  }
  if (metadata.embeddings_generated !== undefined) {
    metrics['Embeddings Generated'] = metadata.embeddings_generated;
  }
  if (metadata.ocr_pages_processed !== undefined && metadata.ocr_pages_processed > 0) {
    metrics['OCR Pages'] = metadata.ocr_pages_processed;
  }
  if (metadata.total_text_extracted !== undefined) {
    const textKB = Math.round(metadata.total_text_extracted / 1000);
    metrics['Text Extracted'] = `${textKB}K chars`;
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
 * Maps backend metadata fields to user-friendly display metrics
 *
 * Note: Backend stores data in two places:
 * 1. checkpoint_data - main processing results (counts, IDs, etc.)
 * 2. metadata - additional context (models used, settings, etc.)
 *
 * The jobMetadata parameter may contain fields from both sources merged together.
 */
export function extractStageMetrics(stageId: number, jobMetadata?: Record<string, any>): Record<string, any> {
  if (!jobMetadata) return {};

  const metrics: Record<string, any> = {};

  switch (stageId) {
    case 1: // Job Initialization
      if (jobMetadata.filename) {
        metrics['File'] = jobMetadata.filename;
      }
      if (jobMetadata.file_size) {
        const sizeMB = (jobMetadata.file_size / (1024 * 1024)).toFixed(2);
        metrics['Size'] = `${sizeMB} MB`;
      }
      break;

    case 2: // Product Discovery (Stage 0)
      if (jobMetadata.products_discovered !== undefined) {
        metrics['Products Found'] = jobMetadata.products_discovered;
      }
      if (jobMetadata.certificates_discovered !== undefined && jobMetadata.certificates_discovered > 0) {
        metrics['Certificates'] = jobMetadata.certificates_discovered;
      }
      if (jobMetadata.logos_discovered !== undefined && jobMetadata.logos_discovered > 0) {
        metrics['Logos'] = jobMetadata.logos_discovered;
      }
      if (jobMetadata.specifications_discovered !== undefined && jobMetadata.specifications_discovered > 0) {
        metrics['Specifications'] = jobMetadata.specifications_discovered;
      }
      if (jobMetadata.total_entities !== undefined) {
        metrics['Total Entities'] = jobMetadata.total_entities;
      }
      if (jobMetadata.discovery_model) {
        metrics['AI Model'] = jobMetadata.discovery_model;
      }
      if (jobMetadata.confidence_score !== undefined) {
        metrics['Confidence'] = `${Math.round(jobMetadata.confidence_score * 100)}%`;
      }
      break;

    case 3: // Focused Extraction (Stage 1)
      if (jobMetadata.extracted_pages !== undefined) {
        metrics['Pages Extracted'] = jobMetadata.extracted_pages;
      }
      if (jobMetadata.total_pages !== undefined) {
        metrics['Total Pages'] = jobMetadata.total_pages;
      }
      if (jobMetadata.text_length !== undefined) {
        metrics['Text Length'] = `${Math.round(jobMetadata.text_length / 1000)}K chars`;
      }
      if (jobMetadata.extraction_rate !== undefined) {
        metrics['Extraction Rate'] = `${Math.round(jobMetadata.extraction_rate * 100)}%`;
      }
      break;

    case 4: // Chunking (Stage 2)
      if (jobMetadata.chunks_created !== undefined) {
        metrics['Chunks Created'] = jobMetadata.chunks_created;
      }
      if (jobMetadata.chunk_size) {
        metrics['Chunk Size'] = jobMetadata.chunk_size;
      }
      if (jobMetadata.chunk_overlap) {
        metrics['Overlap'] = jobMetadata.chunk_overlap;
      }
      break;

    case 5: // Text Embeddings (Stage 2)
      if (jobMetadata.chunks_created !== undefined) {
        metrics['Embeddings Generated'] = jobMetadata.chunks_created;
      }
      if (jobMetadata.embeddings_generated !== undefined) {
        metrics['Total Embeddings'] = jobMetadata.embeddings_generated;
      }
      // Also check for text_embeddings field (from rag_routes.py checkpoint)
      if (jobMetadata.text_embeddings !== undefined) {
        metrics['Text Embeddings'] = jobMetadata.text_embeddings;
      }
      // Also check for text_embeddings_generated field (from stage_2_chunking.py)
      if (jobMetadata.text_embeddings_generated !== undefined) {
        metrics['Embeddings Generated'] = jobMetadata.text_embeddings_generated;
      }
      metrics['Model'] = 'OpenAI text-embedding-3-small';
      metrics['Dimensions'] = '1536D';
      break;

    case 6: // Image Extraction (Stage 3)
    case 7: // Image Classification (Stage 3)
    case 8: // Image Analysis (Stage 3)
      if (jobMetadata.images_extracted !== undefined) {
        metrics['Images Extracted'] = jobMetadata.images_extracted;
      }
      if (jobMetadata.images_saved !== undefined) {
        metrics['Images Saved'] = jobMetadata.images_saved;
      }
      if (jobMetadata.images_analyzed !== undefined) {
        metrics['Images Analyzed'] = jobMetadata.images_analyzed;
      }
      if (jobMetadata.images_processed !== undefined) {
        metrics['Images Processed'] = jobMetadata.images_processed;
      }
      break;

    case 9: // CLIP Embeddings (Stage 3)
      if (jobMetadata.clip_embeddings !== undefined) {
        metrics['CLIP Embeddings'] = jobMetadata.clip_embeddings;
      }
      // Also check for clip_embeddings_generated field (from pipeline_orchestrator.py)
      if (jobMetadata.clip_embeddings_generated !== undefined) {
        metrics['CLIP Embeddings'] = jobMetadata.clip_embeddings_generated;
      }
      if (jobMetadata.specialized_embeddings !== undefined) {
        metrics['Specialized Embeddings'] = jobMetadata.specialized_embeddings;
      }
      if (jobMetadata.images_saved !== undefined) {
        const embeddingsPerImage = 5;
        metrics['Embeddings/Image'] = embeddingsPerImage;
        metrics['Total Vectors'] = jobMetadata.images_saved * embeddingsPerImage;
      }
      // Also check for embeddings_per_image from metadata
      if (jobMetadata.embeddings_per_image !== undefined) {
        metrics['Embeddings/Image'] = jobMetadata.embeddings_per_image;
      }
      break;

    case 10: // Product Creation (Stage 4)
      if (jobMetadata.products_created !== undefined) {
        metrics['Products Created'] = jobMetadata.products_created;
      }
      if (jobMetadata.products_discovered !== undefined) {
        metrics['Products Discovered'] = jobMetadata.products_discovered;
      }
      if (jobMetadata.database_records_created !== undefined) {
        metrics['DB Records'] = jobMetadata.database_records_created;
      }
      break;

    case 11: // Relationship Mapping (Stage 5)
      if (jobMetadata.relationships_created !== undefined) {
        metrics['Relationships'] = jobMetadata.relationships_created;
      }
      if (jobMetadata.chunk_product_relationships !== undefined) {
        metrics['Chunk-Product Links'] = jobMetadata.chunk_product_relationships;
      }
      // Also check for chunk_image_relationships and product_image_relationships (from pipeline_orchestrator.py)
      if (jobMetadata.chunk_image_relationships !== undefined) {
        metrics['Chunk-Image Links'] = jobMetadata.chunk_image_relationships;
      }
      if (jobMetadata.product_image_relationships !== undefined) {
        metrics['Product-Image Links'] = jobMetadata.product_image_relationships;
      }
      break;

    case 12: // Document Entities (Stage 5)
      if (jobMetadata.entities_created !== undefined) {
        metrics['Entities Created'] = jobMetadata.entities_created;
      }
      if (jobMetadata.certificates_discovered !== undefined) {
        metrics['Certificates'] = jobMetadata.certificates_discovered;
      }
      if (jobMetadata.logos_discovered !== undefined) {
        metrics['Logos'] = jobMetadata.logos_discovered;
      }
      if (jobMetadata.specifications_discovered !== undefined) {
        metrics['Specifications'] = jobMetadata.specifications_discovered;
      }
      // Also check for entity_types object (from stage_4_products.py)
      if (jobMetadata.entity_types) {
        if (jobMetadata.entity_types.certificates !== undefined) {
          metrics['Certificates'] = jobMetadata.entity_types.certificates;
        }
        if (jobMetadata.entity_types.logos !== undefined) {
          metrics['Logos'] = jobMetadata.entity_types.logos;
        }
        if (jobMetadata.entity_types.specifications !== undefined) {
          metrics['Specifications'] = jobMetadata.entity_types.specifications;
        }
      }
      // Also check for entity_product_relationships
      if (jobMetadata.entity_product_relationships !== undefined) {
        metrics['Entity-Product Links'] = jobMetadata.entity_product_relationships;
      }
      break;

    case 13: // Metadata Extraction (Stage 5)
      if (jobMetadata.metadata_fields !== undefined) {
        metrics['Metadata Fields'] = jobMetadata.metadata_fields;
      }
      if (jobMetadata.knowledge_base_entries !== undefined) {
        metrics['KB Entries'] = jobMetadata.knowledge_base_entries;
      }
      // Also check for metadata_consolidation_count (from stage_4_products.py)
      if (jobMetadata.metadata_consolidation_count !== undefined) {
        metrics['Metadata Consolidated'] = jobMetadata.metadata_consolidation_count;
      }
      if (jobMetadata.metadata_consolidation_failed !== undefined && jobMetadata.metadata_consolidation_failed > 0) {
        metrics['Failed'] = jobMetadata.metadata_consolidation_failed;
      }
      if (jobMetadata.products_with_metadata !== undefined) {
        metrics['Products with Metadata'] = jobMetadata.products_with_metadata;
      }
      if (jobMetadata.metadata_consolidation_ai_calls !== undefined) {
        metrics['AI Calls'] = jobMetadata.metadata_consolidation_ai_calls;
      }
      break;

    case 14: // Quality Enhancement & Completion
      if (jobMetadata.pages_completed !== undefined) {
        metrics['Pages Completed'] = jobMetadata.pages_completed;
      }
      if (jobMetadata.pages_failed !== undefined && jobMetadata.pages_failed > 0) {
        metrics['Pages Failed'] = jobMetadata.pages_failed;
      }
      if (jobMetadata.errors_count !== undefined && jobMetadata.errors_count > 0) {
        metrics['Errors'] = jobMetadata.errors_count;
      }
      if (jobMetadata.warnings_count !== undefined && jobMetadata.warnings_count > 0) {
        metrics['Warnings'] = jobMetadata.warnings_count;
      }
      if (jobMetadata.confidence_score !== undefined) {
        metrics['Quality Score'] = `${Math.round(jobMetadata.confidence_score * 100)}%`;
      }
      break;
  }

  return metrics;
}

