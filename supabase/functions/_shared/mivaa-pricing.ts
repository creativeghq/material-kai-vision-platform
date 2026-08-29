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
  // Both were free by omission, and neither is metered on the MIVAA side (rag_routes.py has no
  // meter_operation call at all). `search_knowledge_base` runs the SAME 7-vector fusion search as
  // rag_search and kb_search; `rag_chat` is a Claude completion with conversation context, so it
  // costs at least what a one-shot rag_query costs. Priced to match their own twins rather than
  // to a new number nobody can check.
  'search_knowledge_base': { creditCost: 0.5, operationType: 'kb_search', description: 'Knowledge base fusion search' },
  'rag_chat': { creditCost: 0.5, operationType: 'rag_chat', description: 'RAG chat completion' },

  // --- Visual/Image Search (1 credit) ---
  'images_search': { creditCost: 1, operationType: 'visual_search', description: 'Image-based visual search' },
  'images_analyze': { creditCost: 1, operationType: 'image_analysis', description: 'Image analysis (Claude Vision)' },
  'images_upload_analyze': { creditCost: 1, operationType: 'image_upload_analyze', description: 'Upload and analyze image' },
};

/**
 * Actions that are FREE — no credit deduction.
 *
 * EVERY action in mivaa-gateway's ACTION_MAP must appear here or in MIVAA_ACTION_PRICING.
 * `getMivaaActionCost` returns null for both "free on purpose" and "nobody classified it", so an
 * unlisted action is billed at zero and looks exactly like a deliberate decision — the silent-zero
 * shape. 29 of 116 actions were in that state, including `rag_chat` (an LLM completion) and
 * `search_knowledge_base` (the same 7-vector fusion search two priced actions run).
 *
 * Held by tests/unit/mivaaGatewayPricing.test.ts, which reads ACTION_MAP out of the gateway.
 * Being free is fine; being unclassified is not. Add the action with the group comment that says
 * WHY, or price it.
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
  'admin_job_progress', 'admin_active_progress',
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
  'kb_create_from_pdf', 'kb_create_category', 'kb_create_attachment',
  'rag_delete_document', 'documents_delete',

  // PDF INGESTION — billed by the pipeline, per document, not per gateway call.
  // `rag_upload` is the entry point; the rest are stages the pipeline drives itself or job
  // control on a job that has already been paid for. Charging here would bill the same PDF
  // twice, once at the door and again for every stage it walks through.
  'rag_upload', 'rag_restart_job', 'rag_resume_job',
  'ai_process_pdf_enhanced', 'ai_classify_document', 'ai_classify_batch',
  'ai_detect_boundaries', 'ai_group_by_product', 'ai_validate_product',
  'ai_consensus_validate',
  'products_create_from_chunks', 'products_create_from_layout',
  'anthropic_validate_image', 'anthropic_enrich_product',
  'process_scraping_session', 'retry_scraping_session',

  // Image analysis — metered INSIDE MIVAA. app/api/images.py calls
  // meter_operation(current_user, "image-analyze", …) on each of these, so a gateway debit
  // would be the second charge for one call.
  'images_analyze_batch', 'images_reclassify',

  // Internal-only routes. Both carry Depends(verify_internal_access) in app/api/embeddings.py —
  // reachable server-to-server, never by a user session, so there is no one to bill.
  'embeddings_clip_image', 'embeddings_clip_text',

  // Reads and diagnostics with no upstream cost
  'ai_is_critical', 'ai_escalation_stats', 'documents_health', 'anthropic_test',
]);

/**
 * Returns the credit cost for a MIVAA gateway action.
 * Returns null if the action is free or not in the billable list.
 */
export function getMivaaActionCost(action: string): MivaaRoutePricing | null {
  if (FREE_ACTIONS.has(action)) return null;
  return MIVAA_ACTION_PRICING[action] || null;
}
