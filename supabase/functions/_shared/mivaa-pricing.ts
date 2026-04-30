/**
 * MIVAA Gateway Action Pricing
 * Maps gateway action names to credit costs for billing middleware.
 *
 * Synced with:
 * - src/config/creditPricing.ts (frontend calculator)
 * - mivaa-pdf-extractor/app/config/ai_pricing.py (Python backend)
 */

export interface MivaaRoutePricing {
  creditCost: number;
  operationType: string;
  description: string;
}

/**
 * Billable MIVAA gateway actions and their credit costs.
 * Credits are debited BEFORE the request is proxied to MIVAA.
 */
export const MIVAA_ACTION_PRICING: Record<string, MivaaRoutePricing> = {
  // --- Text/Semantic Search (0.5 credits) ---
  'rag_search': { creditCost: 0.5, operationType: 'text_search', description: 'RAG semantic search' },
  'rag_query': { creditCost: 0.5, operationType: 'rag_query', description: 'RAG query' },
  'rag_search_mmr': { creditCost: 0.5, operationType: 'mmr_search', description: 'MMR diversity search' },
  'rag_search_advanced': { creditCost: 1, operationType: 'advanced_search', description: 'Advanced search query' },
  'kb_search': { creditCost: 0.5, operationType: 'kb_search', description: 'Knowledge base search' },

  // --- Visual/Image Search (1 credit) ---
  'images_search': { creditCost: 1, operationType: 'visual_search', description: 'Image-based visual search' },
  'images_analyze': { creditCost: 1, operationType: 'image_analysis', description: 'Image analysis (Qwen3-VL)' },
  'images_upload_analyze': { creditCost: 1, operationType: 'image_upload_analyze', description: 'Upload and analyze image' },
};

/**
 * Actions that are FREE — no credit deduction.
 * Includes: health checks, admin ops, data retrieval, monitoring, autocomplete.
 */
export const FREE_ACTIONS = new Set([
  // Health checks
  'health_check', 'rag_health', 'kb_health', 'images_health', 'embeddings_health',
  'ai_services_health', 'products_health', 'pdf_health', 'monitoring_health',
  'monitoring_supabase_status', 'monitoring_storage_estimate', 'search_health',
  'docs', 'redoc', 'openapi_json',

  // Admin operations (admin-only, free by design)
  'admin_list_jobs', 'admin_job_statistics', 'admin_get_job', 'admin_get_job_status',
  'admin_delete_job', 'admin_system_health', 'admin_system_metrics',
  'admin_cleanup_data', 'admin_backup_data', 'admin_export_data',
  'admin_packages_status', 'admin_job_progress', 'admin_active_progress',
  'admin_job_pages', 'admin_job_stream', 'admin_job_products', 'admin_test_product',
  'admin_process_ocr', 'admin_generate_product_embeddings',
  'admin_prompts_list', 'admin_prompts_get', 'admin_prompts_update',
  'admin_prompts_history', 'admin_prompts_test',
  'ai_metrics_summary', 'ai_metrics_job',

  // Data retrieval (no AI computation — just fetching stored data)
  'rag_get_job', 'rag_list_jobs', 'rag_get_checkpoints', 'rag_get_chunks',
  'rag_get_images', 'rag_get_products', 'rag_get_embeddings',
  'rag_get_document_content', 'rag_list_documents',
  'rag_ai_tracking', 'rag_ai_tracking_stage', 'rag_ai_tracking_model',
  'rag_stats',
  'kb_get_document', 'kb_list_categories', 'kb_get_doc_attachments', 'kb_get_product_docs',
  'entities_list', 'entities_get', 'entities_by_product', 'entities_by_factory', 'entities_relationships',
  'documents_list', 'documents_get_content', 'documents_get_chunks', 'documents_get_images',

  // Autocomplete & suggestions (lightweight, no AI cost)
  'search_recommendations', 'search_analytics', 'autocomplete', 'trending_searches',
  'typo_correction', 'query_expansion', 'track_suggestion_click',

  // Scraping session status
  'get_scraping_session_status',

  // Document management (CRUD — no AI cost)
  'kb_create_document', 'kb_update_document', 'kb_delete_document',
  'kb_create_from_pdf', 'kb_create_category',

  // PDF processing — billed separately in the PDF pipeline
  'rag_process', 'rag_submit_job', 'rag_reprocess_images',
]);

/**
 * Returns the credit cost for a MIVAA gateway action.
 * Returns null if the action is free or not in the billable list.
 */
export function getMivaaActionCost(action: string): MivaaRoutePricing | null {
  if (FREE_ACTIONS.has(action)) return null;
  return MIVAA_ACTION_PRICING[action] || null;
}
