import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { getMivaaActionCost } from '../_shared/mivaa-pricing.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';

// Lazy env getters — resolved per-request so the secrets-bootstrap pass
// (called at the top of the handler) can populate Deno.env from
// platform_secrets first. Previously MIVAA_API_KEY was captured at module
// load AND a missing key threw at parse time — silently ignoring DB-fallback
// secrets and crashing the worker before bootstrap could rescue it.
const MIVAA_LOCAL_URL = () => Deno.env.get('MIVAA_LOCAL_URL') || 'http://127.0.0.1:8000';
const MIVAA_EXTERNAL_URL = 'https://v1api.materialshub.gr';
const MIVAA_SERVICE_URL = () => Deno.env.get('MIVAA_SERVICE_URL') || MIVAA_EXTERNAL_URL;
const MIVAA_API_KEY = () => Deno.env.get('MIVAA_API_KEY') || '';
const SUPABASE_URL = () => Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Available MIVAA endpoints (COMPREHENSIVE - API Consolidation v2.3.0)
const MIVAA_ENDPOINTS = {
  // ==================== CORE ENDPOINTS ====================
  'health_check': { path: '/health', method: 'GET' },  // Consolidated health check for all services

  // ==================== KNOWLEDGE BASE ROUTES (NEW v2.3.0) ====================
  'kb_create_document': { path: '/api/kb/documents', method: 'POST' },  // Create document with embeddings
  'kb_get_document': { path: '/api/kb/documents/{doc_id}', method: 'GET' },  // Get document by ID
  'kb_update_document': { path: '/api/kb/documents/{doc_id}', method: 'PATCH' },  // Update document (smart embedding regeneration)
  'kb_delete_document': { path: '/api/kb/documents/{doc_id}', method: 'DELETE' },  // Delete document
  'kb_create_from_pdf': { path: '/api/kb/documents/from-pdf', method: 'POST' },  // Create document from PDF
  'kb_search': { path: '/api/kb/search', method: 'POST' },  // Search documents (semantic/full-text/hybrid)
  'kb_create_category': { path: '/api/kb/categories', method: 'POST' },  // Create category
  'kb_list_categories': { path: '/api/kb/categories', method: 'GET' },  // List categories
  'kb_create_attachment': { path: '/api/kb/attachments', method: 'POST' },  // Attach document to product
  'kb_get_doc_attachments': { path: '/api/kb/documents/{doc_id}/attachments', method: 'GET' },  // Get document attachments
  'kb_get_product_docs': { path: '/api/kb/products/{product_id}/documents', method: 'GET' },  // Get product documents
  'kb_health': { path: '/api/kb/health', method: 'GET' },  // Knowledge Base health check

  // ==================== RAG ROUTES (CONSOLIDATED) ====================
  'rag_upload': { path: '/api/rag/documents/upload', method: 'POST' },  // Consolidated upload (file + URL)
  'rag_search': { path: '/api/rag/search', method: 'POST' },  // Consolidated search (6 strategies via query param)
  'rag_query': { path: '/api/rag/query', method: 'POST' },  // RAG query with auto-detecting modality
  'rag_chat': { path: '/api/rag/chat', method: 'POST' },  // RAG chat completions
  'rag_get_job': { path: '/api/rag/documents/job/{job_id}', method: 'GET' },  // Get job status
  'rag_list_jobs': { path: '/api/rag/documents/jobs', method: 'GET' },  // List all jobs
  'rag_get_checkpoints': { path: '/api/rag/jobs/{job_id}/checkpoints', method: 'GET' },  // Get job checkpoints
  'rag_restart_job': { path: '/api/rag/jobs/{job_id}/restart', method: 'POST' },  // Restart failed job
  'rag_resume_job': { path: '/api/rag/documents/job/{job_id}/resume', method: 'POST' },  // Resume job from checkpoint
  'rag_get_chunks': { path: '/api/rag/chunks', method: 'GET' },  // Get chunks (with filters)
  'rag_get_images': { path: '/api/rag/images', method: 'GET' },  // Get images (with filters)
  'rag_get_products': { path: '/api/rag/products', method: 'GET' },  // Get products (with filters)
  'rag_get_embeddings': { path: '/api/rag/embeddings', method: 'GET' },  // Get embeddings (with filters)
  'rag_get_document_content': { path: '/api/rag/documents/documents/{document_id}/content', method: 'GET' },  // Get full document content
  'rag_list_documents': { path: '/api/rag/documents', method: 'GET' },  // List documents
  'rag_delete_document': { path: '/api/rag/documents/{document_id}', method: 'DELETE' },  // Delete document
  'rag_health': { path: '/api/rag/health', method: 'GET' },  // RAG service health
  'rag_stats': { path: '/api/rag/stats', method: 'GET' },  // RAG statistics
  'rag_search_mmr': { path: '/api/rag/search/mmr', method: 'POST' },  // MMR search (diversity)
  'rag_search_advanced': { path: '/api/rag/search/advanced', method: 'POST' },  // Advanced query
  'search_knowledge_base': { path: '/api/rag/search/knowledge-base', method: 'POST' },  // KB search with category + price_doc_type filters
  'rag_ai_tracking': { path: '/api/rag/job/{job_id}/ai-tracking', method: 'GET' },  // AI model usage tracking
  'rag_ai_tracking_stage': { path: '/api/rag/job/{job_id}/ai-tracking/stage/{stage}', method: 'GET' },  // AI tracking by stage
  'rag_ai_tracking_model': { path: '/api/rag/job/{job_id}/ai-tracking/model/{model_name}', method: 'GET' },  // AI tracking by model

  // ==================== ADMIN ROUTES ====================
  'admin_list_jobs': { path: '/api/admin/jobs', method: 'GET' },  // List all jobs (admin)
  'admin_job_statistics': { path: '/api/admin/jobs/statistics', method: 'GET' },  // Job statistics
  'admin_get_job': { path: '/api/admin/jobs/{job_id}', method: 'GET' },  // Get job details
  'admin_get_job_status': { path: '/api/admin/jobs/{job_id}/status', method: 'GET' },  // Get job status
  'admin_delete_job': { path: '/api/admin/jobs/{job_id}', method: 'DELETE' },  // Cancel/delete job
  'admin_system_health': { path: '/api/admin/system/health', method: 'GET' },  // System health
  'admin_system_metrics': { path: '/api/admin/system/metrics', method: 'GET' },  // System metrics
  'admin_cleanup_data': { path: '/api/admin/data/cleanup', method: 'DELETE' },  // Cleanup old data
  'admin_backup_data': { path: '/api/admin/data/backup', method: 'POST' },  // Create backup
  'admin_export_data': { path: '/api/admin/data/export', method: 'GET' },  // Export data
  'admin_job_progress': { path: '/api/admin/jobs/{job_id}/progress', method: 'GET' },  // Job progress details
  'admin_active_progress': { path: '/api/admin/jobs/progress/active', method: 'GET' },  // Active jobs progress
  'admin_job_pages': { path: '/api/admin/jobs/{job_id}/progress/pages', method: 'GET' },  // Job page progress
  'admin_job_stream': { path: '/api/admin/jobs/{job_id}/progress/stream', method: 'GET' },  // Stream job progress (SSE)
  'admin_job_products': { path: '/api/admin/jobs/{job_id}/products', method: 'GET' },  // Get product progress for job
  'admin_test_product': { path: '/api/admin/test-product-creation', method: 'POST' },  // Test product creation
  'admin_process_ocr': { path: '/api/admin/admin/images/{image_id}/process-ocr', method: 'POST' },  // Process OCR for image
  'admin_generate_product_embeddings': { path: '/api/admin/generate-product-embeddings', method: 'POST' },  // Generate product embeddings

  // ==================== ADMIN PROMPTS ====================
  'admin_prompts_list': { path: '/api/admin/prompts', method: 'GET' },  // List prompts
  'admin_prompts_get': { path: '/api/admin/prompts/{stage}/{category}', method: 'GET' },  // Get specific prompt
  'admin_prompts_update': { path: '/api/admin/prompts/{stage}/{category}', method: 'PUT' },  // Update prompt
  'admin_prompts_history': { path: '/api/admin/prompts/history/{prompt_id}', method: 'GET' },  // Prompt history
  'admin_prompts_test': { path: '/api/admin/prompts/test', method: 'POST' },  // Test prompt

  // ==================== WEB SCRAPING ROUTES ====================
  'process_scraping_session': { path: '/api/scraping/process-session', method: 'POST' },  // Process scraping session to products
  'get_scraping_session_status': { path: '/api/scraping/session/{session_id}/status', method: 'GET' },  // Get session status
  'retry_scraping_session': { path: '/api/scraping/session/{session_id}/retry', method: 'POST' },  // Retry failed session

  // ==================== DOCUMENTS ROUTES (Migrated to RAG) ====================
  // Legacy /api/documents/* endpoints removed - use /api/rag/* instead
  'documents_list': { path: '/api/rag/documents', method: 'GET' },  // List documents
  'documents_get_content': { path: '/api/rag/documents/documents/{document_id}/content', method: 'GET' },  // Get document content
  'documents_get_chunks': { path: '/api/rag/chunks', method: 'GET' },  // Get document chunks (use ?document_id={id})
  'documents_get_images': { path: '/api/rag/images', method: 'GET' },  // Get document images (use ?document_id={id})
  'documents_delete': { path: '/api/rag/documents/{document_id}', method: 'DELETE' },  // Delete document
  'documents_health': { path: '/api/rag/health', method: 'GET' },  // RAG service health

  // ==================== DOCUMENT ENTITIES ====================
  'entities_list': { path: '/api/document-entities/', method: 'GET' },  // List entities (certificates, logos, specs)
  'entities_get': { path: '/api/document-entities/{entity_id}', method: 'GET' },  // Get entity
  'entities_by_product': { path: '/api/document-entities/product/{product_id}', method: 'GET' },  // Get entities by product
  'entities_by_factory': { path: '/api/document-entities/factory/{factory_name}', method: 'GET' },  // Get entities by factory
  'entities_relationships': { path: '/api/document-entities/relationships/product/{product_id}', method: 'GET' },  // Get product relationships

  // ==================== PRODUCTS ====================
  'products_create_from_chunks': { path: '/api/products/create-from-chunks', method: 'POST' },  // Create products from chunks
  'products_create_from_layout': { path: '/api/products/create-from-layout', method: 'POST' },  // Create products from layout
  'products_health': { path: '/api/products/health', method: 'GET' },  // Products service health

  // ==================== IMAGES ====================
  'images_analyze': { path: '/api/images/analyze', method: 'POST' },  // Analyze single image
  'images_analyze_batch': { path: '/api/images/analyze/batch', method: 'POST' },  // Analyze batch of images
  'images_search': { path: '/api/images/search', method: 'POST' },  // Image search
  'images_upload_analyze': { path: '/api/images/upload-and-analyze', method: 'POST' },  // Upload and analyze
  'images_reclassify': { path: '/api/images/reclassify/{image_id}', method: 'POST' },  // Re-classify image
  'images_health': { path: '/api/images/health', method: 'GET' },  // Images service health

  // ==================== EMBEDDINGS ====================
  'embeddings_clip_image': { path: '/api/embeddings/clip-image', method: 'POST' },  // Generate CLIP image embedding
  'embeddings_clip_text': { path: '/api/embeddings/clip-text', method: 'POST' },  // Generate CLIP text embedding
  'embeddings_health': { path: '/api/embeddings/health', method: 'GET' },  // Embeddings service health

  // ==================== AI SERVICES ====================
  'ai_classify_document': { path: '/api/ai-services/classify-document', method: 'POST' },  // Classify document
  'ai_classify_batch': { path: '/api/ai-services/classify-batch', method: 'POST' },  // Classify batch
  'ai_detect_boundaries': { path: '/api/ai-services/detect-boundaries', method: 'POST' },  // Detect product boundaries
  'ai_group_by_product': { path: '/api/ai-services/group-by-product', method: 'POST' },  // Group chunks by product
  'ai_validate_product': { path: '/api/ai-services/validate-product', method: 'POST' },  // Validate product
  'ai_consensus_validate': { path: '/api/ai-services/consensus-validate', method: 'POST' },  // Consensus validation
  'ai_is_critical': { path: '/api/ai-services/consensus/is-critical/{task_type}', method: 'GET' },  // Check if task is critical
  'ai_escalation_stats': { path: '/api/ai-services/escalation/stats', method: 'GET' },  // Escalation statistics
  'ai_process_pdf_enhanced': { path: '/api/ai-services/process-pdf-enhanced', method: 'POST' },  // Enhanced PDF processing
  'ai_services_health': { path: '/api/ai-services/health', method: 'GET' },  // AI services health

  // ==================== AI METRICS ====================
  'ai_metrics_summary': { path: '/api/ai-metrics/summary', method: 'GET' },  // AI metrics summary
  'ai_metrics_job': { path: '/api/ai-metrics/job/{job_id}', method: 'GET' },  // AI metrics for job

  // ==================== ANTHROPIC (CLAUDE) ====================
  'anthropic_validate_image': { path: '/api/anthropic/images/validate', method: 'POST' },  // Validate image with Claude
  'anthropic_enrich_product': { path: '/api/anthropic/products/enrich', method: 'POST' },  // Enrich product with Claude
  'anthropic_test': { path: '/api/anthropic/test/claude-integration', method: 'POST' },  // Test Claude integration

  // ==================== MONITORING ====================
  'monitoring_supabase_status': { path: '/api/monitoring/supabase-status', method: 'GET' },  // Supabase status
  'monitoring_health': { path: '/api/monitoring/health', method: 'GET' },  // Monitoring health
  'monitoring_storage_estimate': { path: '/api/monitoring/storage-estimate', method: 'GET' },  // Storage estimate

  // ==================== PDF HEALTH ====================
  'pdf_health': { path: '/api/pdf/health', method: 'GET' },  // PDF service health

  // ==================== SEARCH ANALYTICS & RECOMMENDATIONS ====================
  'search_recommendations': { path: '/api/search/recommendations', method: 'GET' },  // Search recommendations
  'search_analytics': { path: '/api/search/analytics', method: 'POST' },  // Search analytics
  'search_health': { path: '/api/search/health', method: 'GET' },  // Search service health

  // ==================== SEARCH SUGGESTIONS (Feature #49) ====================
  'autocomplete': { path: '/api/search/autocomplete', method: 'POST' },  // Auto-complete suggestions
  'trending_searches': { path: '/api/search/trending', method: 'GET' },  // Trending searches
  'typo_correction': { path: '/api/search/typo-correction', method: 'POST' },  // Typo correction
  'query_expansion': { path: '/api/search/query-expansion', method: 'POST' },  // Query expansion
  'track_suggestion_click': { path: '/api/search/track-click', method: 'POST' },  // Track suggestion click

  // ==================== DOCUMENTATION ====================
  'docs': { path: '/docs', method: 'GET' },  // Swagger UI
  'redoc': { path: '/redoc', method: 'GET' },  // ReDoc
  'openapi_json': { path: '/openapi.json', method: 'GET' },  // OpenAPI schema
};

/**
 * Handle file upload for RAG processing
 * Forwards multipart/form-data to MIVAA RAG upload endpoint
 */
async function handleFileUpload(req: Request): Promise<Response> {
  try {
    console.log('📦 Processing file upload for RAG');

    // Get the form data from the request
    const formData = await req.formData();

    // Log form data fields (without file content)
    console.log('📋 Form fields:');
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        console.log(`  ${key}: File(${value.name}, ${value.size} bytes)`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }

    // Forward the form data to MIVAA RAG upload endpoint. The path was
    // `/upload-async` previously which silently 404'd — the actual route is
    // `/upload` (rag_routes.py:539). All uploads through this gateway have
    // been hitting a 404 until this fix (2026-05-23 round-3 audit).
    const mivaaUrl = `${MIVAA_SERVICE_URL()}/api/rag/documents/upload`;
    console.log(`📡 Forwarding to MIVAA upload endpoint: POST ${mivaaUrl}`);

    // Forward the caller's JWT (not the service key) so MIVAA's
    // get_workspace_context resolves to the real user, not the platform service
    // identity. Falls back to the service key only when no caller JWT is
    // present (e.g. internal cron-triggered uploads). Closes the cross-workspace
    // spoofing hole flagged in the round-3 audit.
    const callerAuth = req.headers.get('authorization');
    const forwardedAuth = callerAuth && callerAuth.startsWith('Bearer ')
      ? callerAuth
      : `Bearer ${MIVAA_API_KEY()}`;

    const response = await fetch(mivaaUrl, {
      method: 'POST',
      headers: {
        'Authorization': forwardedAuth,
      },
      body: formData,
    });

    console.log(`📥 MIVAA Response: ${response.status} ${response.statusText}`);

    const responseText = await response.text();

    // Try to parse as JSON
    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('📊 Response data:', JSON.stringify(responseData, null, 2));

      // Check if MIVAA returned an error status even with HTTP 200
      if (responseData.status === 'error') {
        console.error('⚠️  MIVAA returned status="error" even though HTTP status is 200');
        console.error('⚠️  Error details:', responseData.error || 'No error details provided');
        console.error('⚠️  Message:', responseData.message);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON:', responseText.substring(0, 500));
      return new Response(
        JSON.stringify({
          error: 'Invalid response from MIVAA',
          details: responseText.substring(0, 200),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Check if response is 202 Accepted (async job started)
    if (response.status === 202) {
      console.log('📋 Async job started, returning job ID to frontend for polling');

      const jobId = responseData.job_id;

      // Return job ID immediately to frontend
      // Frontend will poll for status using the job status endpoint
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            job_id: jobId,
            status: 'pending',
            message: 'Document processing started. Use job_id to check status.',
          },
        }),
        {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (!response.ok) {
      console.error(`❌ MIVAA returned error: ${response.status}`);
      return new Response(
        JSON.stringify({
          error: 'MIVAA processing failed',
          status: response.status,
          details: responseData,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Return successful response (even if MIVAA has internal errors)
    // The frontend will need to check responseData.status
    return new Response(
      JSON.stringify({
        success: true,
        data: responseData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ File upload error:', errorMessage);

    return new Response(
      JSON.stringify({
        error: 'File upload failed',
        message: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
}

/**
 * Handle job status check
 * Forwards to MIVAA job status endpoint
 */
async function handleJobStatus(jobId: string): Promise<Response> {
  try {
    console.log(`🔍 Checking job status for: ${jobId}`);

    const statusUrl = `${MIVAA_SERVICE_URL()}/api/rag/documents/job/${jobId}`;

    const response = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${MIVAA_API_KEY()}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to get job status: ${response.status}`);
      return new Response(
        JSON.stringify({
          error: 'Failed to get job status',
          details: `MIVAA returned ${response.status}`,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const jobData = await response.json();
    console.log(`📊 Job status: ${jobData.status}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: jobData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Job status check error:', errorMessage);

    return new Response(
      JSON.stringify({
        error: 'Job status check failed',
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
}

serve(withApiLogging('mivaa-gateway', async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Populate Deno.env from platform_secrets BEFORE any env reads. This is the
  // central MIVAA gateway — silently ignoring admin-saved DB secrets here
  // would block every Python backend call across the platform.
  await bootstrapForFunction();

  // Pre-flight: MIVAA_API_KEY MUST be configured (env or DB fallback). Return
  // a clean 503 with admin-actionable message rather than passing an empty
  // Bearer token upstream (which would manifest as cryptic MIVAA 401s).
  if (!MIVAA_API_KEY()) {
    return notConfiguredResponse(
      {
        provider: 'MIVAA',
        envVarHint: 'Set the MIVAA_API_KEY env var on the edge function host, or paste it',
        settingsPath: '/admin/operations → Keys',
      },
      corsHeaders,
    );
  }

  // Tracks a successful credit debit so the catch path can refund on downstream failure.
  let debitInfo: { userId: string; amount: number; action: string } | null = null;

  try {
    const url = new URL(req.url);
    const contentType = req.headers.get('content-type') || '';

    // Handle job status check via URL path
    // Example: /job-status/abc-123-def
    if (url.pathname.startsWith('/job-status/')) {
      const jobId = url.pathname.replace('/job-status/', '').replace(/[^a-zA-Z0-9\-]/g, '');
      if (!jobId || jobId.length > 64) {
        return new Response(JSON.stringify({ error: 'Invalid job ID' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return await handleJobStatus(jobId);
    }

    // Handle multipart/form-data for file uploads (RAG upload endpoint)
    if (contentType.includes('multipart/form-data')) {
      console.log('🚀 MIVAA Gateway: Handling multipart/form-data file upload');
      return await handleFileUpload(req);
    }

    // Handle regular JSON requests
    const { action, payload } = await req.json();

    console.log(`🚀 MIVAA Gateway Request: ${action}`, payload);
    console.log(`📋 MIVAA Service URL: ${MIVAA_SERVICE_URL()}`);
    console.log(`🔑 MIVAA API Key configured: ${!!Deno.env.get('MIVAA_API_KEY')}`);

    // --- AUTH (all actions, not just billable) ---
    const auth = await authenticate(req);
    const isAdmin = isAdminAccess(auth);

    if (!isAdmin && (!auth.success || !auth.userId)) {
      return new Response(
        JSON.stringify({ error: 'Authentication required', action }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Cross-tenant guard: this gateway forwards the platform SERVICE key to MIVAA, and MIVAA's
    // /api/rag/* routes trust the body `workspace_id` for the `service=mivaa` identity without
    // re-checking membership. So a non-admin caller could read another tenant's chunks/products/
    // images by spoofing `workspace_id`. Validate the requested workspace against the caller's
    // own memberships here before forwarding. (Admin-secret callers are exempt — trusted backend.)
    if (!isAdmin && auth.userId && payload && typeof payload.workspace_id === 'string' && payload.workspace_id) {
      const wsCheck = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY());
      const { data: wsMember } = await wsCheck
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', auth.userId)
        .eq('workspace_id', payload.workspace_id)
        .maybeSingle();
      if (!wsMember) {
        return new Response(
          JSON.stringify({ error: 'You are not a member of the requested workspace', action }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Validate action BEFORE any billing/debit so an unknown-but-priced action
    // can never debit credits and then 400 without a refund.
    if (!action || !MIVAA_ENDPOINTS[action]) {
      return new Response(
        JSON.stringify({
          error: 'Invalid action',
          available_actions: Object.keys(MIVAA_ENDPOINTS),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // --- CREDIT BILLING MIDDLEWARE ---
    let pricing = getMivaaActionCost(action);

    if (pricing) {
      if (action === 'rag_search' && payload &&
          (payload.image_url || payload.strategy === 'visual' || payload.image_base64)) {
        pricing = { creditCost: 1, operationType: 'visual_search', description: 'Visual RAG search' };
      }

      if (!isAdmin && auth.userId) {
        const supabaseAdmin = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY());

        const { data: debitData, error: debitError } = await supabaseAdmin.rpc('debit_user_credits', {
          p_user_id: auth.userId,
          p_amount: pricing.creditCost,
          p_operation_type: pricing.operationType,
          p_description: pricing.description,
          p_metadata: { action, gateway: 'mivaa' },
        });

        if (debitError) {
          console.error(`[mivaa-gateway] Credit debit error for action ${action}:`, debitError);
          return new Response(
            JSON.stringify({ error: 'Insufficient credits', message: debitError.message, required_credits: pricing.creditCost, action }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const result = Array.isArray(debitData) ? debitData[0] : debitData;
        if (result && !result.success) {
          console.warn(`[mivaa-gateway] Insufficient credits for user ${auth.userId}: ${result.error_message}`);
          return new Response(
            JSON.stringify({ error: 'Insufficient credits', message: result.error_message || 'Not enough credits', required_credits: pricing.creditCost, action }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        console.log(`[mivaa-gateway] Debited ${pricing.creditCost} credits from user ${auth.userId} for: ${action}`);

        // Remember the debit so the catch / non-OK path can refund on downstream failure.
        debitInfo = { userId: auth.userId, amount: pricing.creditCost, action };

        // Log to ai_usage_logs (non-blocking)
        supabaseAdmin.from('ai_usage_logs').insert({
          user_id: auth.userId,
          operation_type: pricing.operationType,
          model_name: `mivaa-${action}`,
          input_tokens: 0,
          output_tokens: 0,
          input_cost_usd: 0,
          output_cost_usd: 0,
          billed_cost_usd: pricing.creditCost * 0.01,
          credits_debited: pricing.creditCost,
          metadata: { action, gateway: 'mivaa' },
        }).then(({ error }) => {
          if (error) console.error('[mivaa-gateway] Usage log insert error:', error);
        });
      }
    }

    let endpoint = MIVAA_ENDPOINTS[action];
    let finalPath = endpoint.path;

    // Handle path parameters
    if (payload && payload.job_id && finalPath.includes('{job_id}')) {
      finalPath = finalPath.replace('{job_id}', payload.job_id);
    }
    if (payload && payload.document_id && finalPath.includes('{document_id}')) {
      finalPath = finalPath.replace('{document_id}', payload.document_id);
    }
    if (payload && payload.session_id && finalPath.includes('{session_id}')) {
      finalPath = finalPath.replace('{session_id}', payload.session_id);
    }
    // Knowledge Base path parameters
    if (payload && payload.doc_id && finalPath.includes('{doc_id}')) {
      finalPath = finalPath.replace('{doc_id}', payload.doc_id);
    }
    if (payload && payload.product_id && finalPath.includes('{product_id}')) {
      finalPath = finalPath.replace('{product_id}', payload.product_id);
    }
    // Admin prompts path parameters
    if (payload && payload.stage && finalPath.includes('{stage}')) {
      finalPath = finalPath.replace('{stage}', payload.stage);
    }
    if (payload && payload.category && finalPath.includes('{category}')) {
      finalPath = finalPath.replace('{category}', payload.category);
    }
    if (payload && payload.prompt_id && finalPath.includes('{prompt_id}')) {
      finalPath = finalPath.replace('{prompt_id}', payload.prompt_id);
    }
    // Entity and image path parameters
    if (payload && payload.entity_id && finalPath.includes('{entity_id}')) {
      finalPath = finalPath.replace('{entity_id}', payload.entity_id);
    }
    if (payload && payload.image_id && finalPath.includes('{image_id}')) {
      finalPath = finalPath.replace('{image_id}', payload.image_id);
    }
    if (payload && payload.factory_name && finalPath.includes('{factory_name}')) {
      finalPath = finalPath.replace('{factory_name}', encodeURIComponent(payload.factory_name));
    }
    if (payload && payload.task_type && finalPath.includes('{task_type}')) {
      finalPath = finalPath.replace('{task_type}', payload.task_type);
    }
    if (payload && payload.model_name && finalPath.includes('{model_name}')) {
      finalPath = finalPath.replace('{model_name}', payload.model_name);
    }

    // Handle query parameters for GET requests
    // Exclude path parameters from query string
    const pathParamKeys = [
      'job_id', 'document_id', 'session_id', 'doc_id', 'product_id',
      'stage', 'category', 'prompt_id', 'entity_id', 'image_id',
      'factory_name', 'task_type', 'model_name'
    ];
    if (endpoint.method === 'GET' && payload && Object.keys(payload).length > 0) {
      const queryParams = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        if (!pathParamKeys.includes(key) && value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      if (queryParams.toString()) {
        finalPath += `?${queryParams.toString()}`;
      }
    }
    // Prepare request body for POST, PUT, and PATCH requests (not DELETE or GET)
    let bodyPayload = null;
    if (payload && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      // For requests with path parameters, exclude those from body
      const bodyData = { ...payload };
      pathParamKeys.forEach(key => delete bodyData[key]);
      if (Object.keys(bodyData).length > 0) {
        bodyPayload = bodyData;
      }
    }

    // Make request to MIVAA service
    const mivaaUrl = `${MIVAA_SERVICE_URL()}${finalPath}`;
    console.log(`📡 Calling MIVAA: ${endpoint.method} ${mivaaUrl}`);

    // Forward the real end-user JWT (not the platform service key) so MIVAA resolves the actual
    // user and enforces workspace ownership/scoping on its side (e.g. authorize_rag_workspace and
    // the /api/rag resource-ownership dependency). Forwarding the service key made MIVAA see the
    // trusted `service=mivaa` identity and trust the client-supplied workspace_id / skip ownership
    // → cross-tenant reads. Admin-secret + cron/no-JWT callers keep the MIVAA service key. Mirrors
    // the upload path's forwarding.
    // Scope JWT-forwarding to /api/rag/* — those routes are EXCLUDED from MIVAA's JWT middleware
    // and decode the bearer in-handler via get_optional_workspace_context (same as the upload
    // path), so a real user JWT resolves the actual user + enforces ownership there. Other
    // prefixes (/api/search, /api/images, /api/kb) are middleware-validated, so keep sending the
    // service key to avoid coupling to user-JWT middleware behavior.
    const callerAuthHeader = req.headers.get('authorization');
    const isRagPath = typeof endpoint.path === 'string' && endpoint.path.startsWith('/api/rag');
    const forwardedAuthHeader = (!isAdmin && isRagPath && callerAuthHeader && callerAuthHeader.startsWith('Bearer '))
      ? callerAuthHeader
      : `Bearer ${MIVAA_API_KEY()}`;
    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': forwardedAuthHeader,
      },
    };

    if (bodyPayload) {
      fetchOptions.body = JSON.stringify(bodyPayload);
      console.log('📤 Request body:', bodyPayload);
    }

    console.log(`🔗 Fetching from: ${mivaaUrl}`);
    // Never log API keys — even truncated prefixes aid enumeration attacks

    const response = await fetch(mivaaUrl, fetchOptions);

    // Handle HTML responses for docs endpoints
    const isDocsEndpoint = ['docs', 'redoc'].includes(action);
    const isJsonEndpoint = action === 'openapi_json';

    let responseData;
    let responseContentType = 'application/json';
    const responseText = await response.text();

    console.log(`📥 MIVAA Response Status: ${response.status} ${response.statusText}`);
    console.log(`📥 Response Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📥 Response Length: ${responseText.length} bytes`);

    // Handle 204 No Content responses (common for DELETE operations)
    if (response.status === 204 || (response.ok && responseText.length === 0)) {
      console.log(`📥 MIVAA Response: ${response.status} [No Content - Success]`);
      return new Response(
        JSON.stringify({ success: true, message: 'Operation completed successfully' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (isDocsEndpoint) {
      responseData = responseText;
      responseContentType = 'text/html';
      console.log(`📥 MIVAA Response: ${response.status} [HTML Content]`);
    } else if (isJsonEndpoint) {
      responseData = responseText; // Keep as text for OpenAPI JSON
      responseContentType = 'application/json';
      console.log(`📥 MIVAA Response: ${response.status} [OpenAPI JSON]`);
    } else {
      // Try to parse as JSON, but handle HTML error responses
      try {
        responseData = JSON.parse(responseText);
        console.log(`📥 MIVAA Response: ${response.status}`, responseData);
      } catch (parseError) {
        // If JSON parsing fails, it's likely an HTML error page or invalid JSON
        console.error('❌ Failed to parse MIVAA response as JSON');
        console.error(`❌ Response status: ${response.status} ${response.statusText}`);
        console.error(`❌ Response text (first 1000 chars): ${responseText.substring(0, 1000)}`);
        console.error(`❌ Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        throw new Error(`MIVAA API returned non-JSON response: ${response.status} ${response.statusText}. Response: ${responseText.substring(0, 200)}`);
      }
    }

    if (!response.ok) {
      console.error(`❌ MIVAA returned error status: ${response.status}`);
      console.error(`❌ Response data:`, responseData);
      throw new Error(`MIVAA API error: ${response.status} ${response.statusText}`);
    }

    // Wrap response in success object if it doesn't already have success field
    const finalResponse = responseData?.success !== undefined ? responseData : { success: true, data: responseData };

    return new Response(
      isDocsEndpoint || isJsonEndpoint ? responseData : JSON.stringify(finalResponse),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': responseContentType },
      },
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ MIVAA Gateway Error:', errorMessage);
    console.error('❌ Full error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');

    // Refund any credits debited for this request — the downstream MIVAA call failed
    // (this covers both the thrown !response.ok path and any other fetch/parse error).
    if (debitInfo) {
      try {
        const supabaseAdmin = createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY());
        const { error: refundError } = await supabaseAdmin.rpc('credit_user_credits', {
          p_user_id: debitInfo.userId,
          p_amount: debitInfo.amount,
          p_operation_type: 'refund',
          p_description: `Refund for failed MIVAA action: ${debitInfo.action}`,
          p_metadata: { action: debitInfo.action, gateway: 'mivaa', reason: 'downstream_failure' },
        });
        if (refundError) {
          console.error(`[mivaa-gateway] Refund failed for user ${debitInfo.userId}:`, refundError);
        } else {
          console.log(`[mivaa-gateway] Refunded ${debitInfo.amount} credits to user ${debitInfo.userId} for failed action ${debitInfo.action}`);
        }
      } catch (refundEx) {
        console.error('[mivaa-gateway] Refund threw:', refundEx);
      }
    }

    // Provide more detailed error information
    const errorDetails = {
      error: 'Gateway error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
    };

    console.error('❌ Error details:', JSON.stringify(errorDetails, null, 2));

    return new Response(
      JSON.stringify(errorDetails),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
}));
