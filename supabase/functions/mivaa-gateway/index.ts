import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Environment variables
// Try to use local API first (for server environment), fall back to external domain
const MIVAA_LOCAL_URL = Deno.env.get('MIVAA_LOCAL_URL') || 'http://127.0.0.1:8000';
const MIVAA_EXTERNAL_URL = 'https://v1api.materialshub.gr';
const MIVAA_SERVICE_URL = Deno.env.get('MIVAA_SERVICE_URL') || MIVAA_EXTERNAL_URL;
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || 'your-mivaa-api-key';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Available MIVAA endpoints (COMPREHENSIVE - API Consolidation v2.2.0)
const MIVAA_ENDPOINTS = {
  // ==================== CORE ENDPOINTS ====================
  'health_check': { path: '/health', method: 'GET' },  // Consolidated health check for all services

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
  'rag_ai_tracking': { path: '/api/rag/job/{job_id}/ai-tracking', method: 'GET' },  // AI model usage tracking
  'rag_ai_tracking_stage': { path: '/api/rag/job/{job_id}/ai-tracking/stage/{stage}', method: 'GET' },  // AI tracking by stage
  'rag_ai_tracking_model': { path: '/api/rag/job/{job_id}/ai-tracking/model/{model_name}', method: 'GET' },  // AI tracking by model

  // ==================== ADMIN ROUTES ====================
  'admin_list_jobs': { path: '/api/admin/jobs', method: 'GET' },  // List all jobs (admin)
  'admin_job_statistics': { path: '/api/admin/jobs/statistics', method: 'GET' },  // Job statistics
  'admin_get_job': { path: '/api/admin/jobs/{job_id}', method: 'GET' },  // Get job details
  'admin_get_job_status': { path: '/api/admin/jobs/{job_id}/status', method: 'GET' },  // Get job status
  'admin_delete_job': { path: '/api/admin/jobs/{job_id}', method: 'DELETE' },  // Cancel/delete job
  'admin_bulk_process': { path: '/api/admin/bulk/process', method: 'POST' },  // Bulk processing
  'admin_system_health': { path: '/api/admin/system/health', method: 'GET' },  // System health
  'admin_system_metrics': { path: '/api/admin/system/metrics', method: 'GET' },  // System metrics
  'admin_cleanup_data': { path: '/api/admin/data/cleanup', method: 'DELETE' },  // Cleanup old data
  'admin_backup_data': { path: '/api/admin/data/backup', method: 'POST' },  // Create backup
  'admin_export_data': { path: '/api/admin/data/export', method: 'GET' },  // Export data
  'admin_packages_status': { path: '/api/admin/packages/status', method: 'GET' },  // Package status
  'admin_job_progress': { path: '/api/admin/jobs/{job_id}/progress', method: 'GET' },  // Job progress details
  'admin_active_progress': { path: '/api/admin/jobs/progress/active', method: 'GET' },  // Active jobs progress
  'admin_job_pages': { path: '/api/admin/jobs/{job_id}/progress/pages', method: 'GET' },  // Job page progress
  'admin_job_stream': { path: '/api/admin/jobs/{job_id}/progress/stream', method: 'GET' },  // Stream job progress (SSE)
  'admin_test_product': { path: '/api/admin/test-product-creation', method: 'POST' },  // Test product creation
  'admin_process_ocr': { path: '/api/admin/admin/images/{image_id}/process-ocr', method: 'POST' },  // Process OCR for image

  // ==================== ADMIN PROMPTS ====================
  'admin_prompts_list': { path: '/api/admin/prompts', method: 'GET' },  // List prompts
  'admin_prompts_get': { path: '/api/admin/prompts/{stage}/{category}', method: 'GET' },  // Get specific prompt
  'admin_prompts_update': { path: '/api/admin/prompts/{stage}/{category}', method: 'PUT' },  // Update prompt
  'admin_prompts_history': { path: '/api/admin/prompts/history/{prompt_id}', method: 'GET' },  // Prompt history
  'admin_prompts_test': { path: '/api/admin/prompts/test', method: 'POST' },  // Test prompt

  // ==================== DOCUMENTS ROUTES ====================
  'documents_analyze': { path: '/api/documents/analyze', method: 'POST' },  // Analyze document
  'documents_health': { path: '/api/documents/health', method: 'GET' },  // Documents service health
  'documents_list': { path: '/api/documents/documents', method: 'GET' },  // List documents
  'documents_get': { path: '/api/documents/documents/{document_id}', method: 'GET' },  // Get document metadata
  'documents_get_content': { path: '/api/documents/documents/{document_id}/content', method: 'GET' },  // Get document content
  'documents_get_chunks': { path: '/api/documents/documents/{document_id}/chunks', method: 'GET' },  // Get document chunks
  'documents_get_images': { path: '/api/documents/documents/{document_id}/images', method: 'GET' },  // Get document images
  'documents_delete': { path: '/api/documents/documents/{document_id}', method: 'DELETE' },  // Delete document

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

  // ==================== TOGETHER AI (LLAMA) ====================
  'together_analyze_image': { path: '/api/together-ai/analyze-image', method: 'POST' },  // Analyze image with Llama Vision
  'together_health': { path: '/api/together-ai/health', method: 'GET' },  // Together AI health
  'together_models': { path: '/api/together-ai/models', method: 'GET' },  // List available models

  // ==================== MONITORING ====================
  'monitoring_supabase_status': { path: '/api/monitoring/supabase-status', method: 'GET' },  // Supabase status
  'monitoring_health': { path: '/api/monitoring/health', method: 'GET' },  // Monitoring health
  'monitoring_storage_estimate': { path: '/api/monitoring/storage-estimate', method: 'GET' },  // Storage estimate

  // ==================== PDF EXTRACTION (SIMPLE) ====================
  'pdf_extract_markdown': { path: '/api/pdf/extract/markdown', method: 'POST' },  // Extract markdown only
  'pdf_extract_tables': { path: '/api/pdf/extract/tables', method: 'POST' },  // Extract tables only
  'pdf_extract_images': { path: '/api/pdf/extract/images', method: 'POST' },  // Extract images only
  'pdf_health': { path: '/api/pdf/health', method: 'GET' },  // PDF service health

  // ==================== SEARCH (LEGACY - Use /api/rag/search instead) ====================
  'search_documents': { path: '/api/search/documents/{document_id}/query', method: 'POST' },  // Query specific document
  'search_semantic': { path: '/api/search/semantic', method: 'POST' },  // Semantic search (legacy)
  'search_vector': { path: '/api/search/vector-similarity', method: 'POST' },  // Vector search (legacy)
  'search_multimodal': { path: '/api/search/multimodal', method: 'POST' },  // Multimodal search (legacy)
  'search_materials': { path: '/api/search/materials', method: 'POST' },  // Material search (legacy)
  'search_materials_visual': { path: '/api/search/materials/visual', method: 'POST' },  // Visual material search (legacy)
  'search_hybrid': { path: '/api/search/hybrid', method: 'POST' },  // Hybrid search (legacy)
  'search_recommendations': { path: '/api/search/recommendations', method: 'GET' },  // Search recommendations
  'search_analytics': { path: '/api/search/analytics', method: 'POST' },  // Search analytics
  'search_health': { path: '/api/search/health', method: 'GET' },  // Search service health

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

    // Forward the form data to MIVAA RAG async upload endpoint
    // Try local API first (for server environment), then fall back to external
    const mivaaUrl = `${MIVAA_SERVICE_URL}/api/rag/documents/upload-async`;
    console.log(`📡 Forwarding to MIVAA async endpoint: POST ${mivaaUrl}`);

    const response = await fetch(mivaaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
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

    const statusUrl = `${MIVAA_SERVICE_URL}/api/rag/documents/job/${jobId}`;

    const response = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const contentType = req.headers.get('content-type') || '';

    // Handle job status check via URL path
    // Example: /job-status/abc-123-def
    if (url.pathname.startsWith('/job-status/')) {
      const jobId = url.pathname.replace('/job-status/', '');
      console.log('🚀 MIVAA Gateway: Handling job status check');
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
    console.log(`📋 MIVAA Service URL: ${MIVAA_SERVICE_URL}`);
    console.log(`🔑 MIVAA API Key configured: ${!!Deno.env.get('MIVAA_API_KEY')}`);

    // Validate action
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

    let endpoint = MIVAA_ENDPOINTS[action];
    let finalPath = endpoint.path;

    // Handle path parameters
    if (payload && payload.job_id && finalPath.includes('{job_id}')) {
      finalPath = finalPath.replace('{job_id}', payload.job_id);
    }
    if (payload && payload.document_id && finalPath.includes('{document_id}')) {
      finalPath = finalPath.replace('{document_id}', payload.document_id);
    }

    // Handle query parameters for GET requests
    if (endpoint.method === 'GET' && payload && Object.keys(payload).length > 0) {
      const queryParams = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        if (key !== 'job_id' && key !== 'document_id' && value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      if (queryParams.toString()) {
        finalPath += `?${queryParams.toString()}`;
      }
    }
    // Prepare request body for POST requests
    let bodyPayload = null;
    if (payload) {
      // Force asynchronous processing for single PDF URL by using bulk endpoint
      if (action === 'pdf_process_url' && payload.url) {
        endpoint = MIVAA_ENDPOINTS['bulk_process'];
        finalPath = endpoint.path;
        bodyPayload = {
          urls: [payload.url],
          batch_size: 1,
          options: {
            extract_images: payload.options?.extract_images ?? payload.extractImages ?? true,
            enable_multimodal: payload.options?.enable_multimodal ?? payload.enableMultimodal ?? true,
            ocr_languages: payload.options?.ocr_languages ?? payload.ocrLanguages ?? ['en'],
            timeout_seconds: payload.options?.timeout_seconds ?? payload.timeoutSeconds ?? 900,
            ...payload.options,
          },
        };
      } else if (endpoint.method === 'POST') {
        if (action === 'bulk_process') {
          // Handle bulk processing requests
          const urls = payload.urls || payload.documents || [];

          if (!urls || urls.length === 0) {
            throw new Error('Missing URLs for bulk processing. Expected urls array in payload.');
          }

          bodyPayload = {
            urls: urls,
            batch_size: payload.batch_size || payload.batchSize || 1,
            options: {
              extract_images: payload.options?.extract_images ?? payload.extractImages ?? true,
              enable_multimodal: payload.options?.enable_multimodal ?? payload.enableMultimodal ?? true,
              ocr_languages: payload.options?.ocr_languages ?? payload.ocrLanguages ?? ['en'],
              timeout_seconds: payload.options?.timeout_seconds ?? payload.timeoutSeconds ?? 900,
              ...payload.options, // Allow frontend to override options
            },
          };
        } else {
          bodyPayload = payload;
        }
      }
    }

    // Make request to MIVAA service
    const mivaaUrl = `${MIVAA_SERVICE_URL}${finalPath}`;
    console.log(`📡 Calling MIVAA: ${endpoint.method} ${mivaaUrl}`);

    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
      },
    };

    if (bodyPayload) {
      fetchOptions.body = JSON.stringify(bodyPayload);
      console.log('📤 Request body:', bodyPayload);
    }

    console.log(`🔗 Fetching from: ${mivaaUrl}`);
    console.log(`🔐 Authorization header: Bearer ${MIVAA_API_KEY ? MIVAA_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);

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

    return new Response(
      isDocsEndpoint || isJsonEndpoint ? responseData : JSON.stringify(responseData),
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

    // Provide more detailed error information
    const errorDetails = {
      error: 'Gateway error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
      mivaaServiceUrl: MIVAA_SERVICE_URL,
      apiKeyConfigured: !!Deno.env.get('MIVAA_API_KEY'),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
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
});
