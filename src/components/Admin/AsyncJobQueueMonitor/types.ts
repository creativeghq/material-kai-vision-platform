// Interfaces extracted from AsyncJobQueueMonitor

export interface ProductProgress {
  id: string;
  job_id: string;
  product_id: string | null;
  product_name: string;
  product_index: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  current_stage: string | null;
  stages_completed: string[];
  error_message: string | null;
  error_stage: string | null;
  metrics: {
    chunks_created?: number;
    images_processed?: number;
    images_material?: number;
    images_non_material?: number;
    relationships_created?: number;
    pages_extracted?: number;
    product_db_id?: string;
    processing_time_ms?: number;
    text_embeddings_generated?: number;
    clip_embeddings_generated?: number;
    layout_regions_detected?: number;
  };
  metadata?: {
    product_db_id?: string;
    page_range?: number[];
    confidence?: number;
    [key: string]: any;
  };
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Aggregate error rollup written by `update_job_failure_summary` SQL RPC.
// NULL on healthy jobs; non-null when something needs attention.
export interface JobFailureSummary {
  products_failed: number;
  products_failed_by_stage: Record<string, number>;
  ocr_failures: number;
  ocr_retries_succeeded: number;
  recovery_attempts: number;
  recovery_succeeded: number;
  recovery_exhausted: number;
  computed_at: string;
}

// Row from the `pipeline_errors` SQL view (unified across 4 sources).
export interface PipelineError {
  source: 'product_failure' | 'job_failure' | 'ocr_failure' | 'recovery_attempt';
  job_id: string;
  product_id: string | null;
  product_name: string | null;
  stage: string | null;
  error_message: string | null;
  occurred_at: string | null;
  severity: 'error' | 'warning' | 'info';
  context: Record<string, any> | null;
}

export interface BackgroundJob {
  id: string;
  workspace_id: string;
  document_id: string | null;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'cancelled' | 'interrupted' | 'initialized';
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  interrupted_at: string | null;
  updated_at: string | null;
  last_heartbeat: string | null;
  error: string | null;
  // AI cost tracking
  total_ai_cost_usd?: number;
  total_credits_used?: number;
  user_id?: string;
  // Error observability rollup (added 2026-05-02). NULL on clean jobs.
  failure_summary?: JobFailureSummary | null;
  metadata: {
    filename?: string;
    stage?: string;
    products_discovered?: number;
    chunks_created?: number;
    images_extracted?: number;
    embeddings_generated?: number;
    processing_time_ms?: number;
    ai_model?: string;
    retry_count?: number;
    // XML import specific
    source_name?: string;
    import_type?: string;
    total_products?: number;
    processed_products?: number;
    failed_products?: number;
    [key: string]: any;
  } | null;
}

// XML Import Job from data_import_jobs table
export interface XMLImportJob {
  id: string;
  workspace_id: string;
  import_type: string;
  source_name: string | null;
  source_url: string | null;
  status: string;
  total_products: number;
  processed_products: number;
  failed_products: number;
  category: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: any;
}

export interface JobCheckpoint {
  id: string;
  job_id: string;
  stage: string;
  checkpoint_data: any;
  metadata: any;
  created_at: string;
}

export interface JobTypeMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
  interrupted: number;
  cancelled: number;
  total: number;
  success_rate: number;
  avg_processing_time: number;
}

export interface QueueMetrics {
  pdf_processing: JobTypeMetrics;
  web_scraping: JobTypeMetrics;
  xml_import: JobTypeMetrics;
  all_jobs: JobTypeMetrics;
  total_documents: number;
  total_products_created: number;
  total_chunks_created: number;
  total_images_extracted: number;
}

