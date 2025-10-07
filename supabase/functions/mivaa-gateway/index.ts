import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface GatewayRequest {
  action: string;
  payload?: any;
}

interface GatewayResponse {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    timestamp: string;
    processingTime: number;
    version: string;
    mivaaEndpoint?: string;
  };
}

serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get MIVAA configuration
    const MIVAA_SERVICE_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://104.248.68.3:8000';
    const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || 'test-key';

    // MIVAA API key is optional for some endpoints
    console.log('MIVAA Gateway initialized:', {
      serviceUrl: MIVAA_SERVICE_URL,
      hasApiKey: !!MIVAA_API_KEY
    });

    // Parse request body
    const body: GatewayRequest = await req.json();
    const { action, payload } = body;

    console.log(`🚀 MIVAA Gateway: Processing action "${action}"`);

    // Map gateway actions to MIVAA service endpoints
    const endpointMap: Record<string, { path: string; method: string }> = {
      // Health check
      'health_check': { path: '/health', method: 'GET' },
      
      // Embedding actions
      'generate_embedding': { path: '/api/embeddings/generate', method: 'POST' },
      'generate_batch_embeddings': { path: '/api/embeddings/batch', method: 'POST' },
      
      // Search actions
      'semantic_search': { path: '/api/search/semantic', method: 'POST' },
      'vector_search': { path: '/api/search/vector', method: 'POST' },
      'hybrid_search': { path: '/api/search/hybrid', method: 'POST' },
      'get_recommendations': { path: '/api/search/recommendations', method: 'POST' },
      'get_analytics': { path: '/api/analytics', method: 'GET' },
      
      // AI Analysis actions
      'semantic_analysis': { path: '/api/semantic-analysis', method: 'POST' },
      'llama_vision_analysis': { path: '/api/vision/llama-analyze', method: 'POST' },
      'advanced_visual_analysis': { path: '/api/vision/llama-analyze', method: 'POST' },
      
      // CLIP Embedding actions
      'clip_embedding_generation': { path: '/api/embeddings/clip-generate', method: 'POST' },
      
      // Chat completion and conversational AI
      'chat_completion': { path: '/api/chat/completions', method: 'POST' },
      'contextual_response': { path: '/api/chat/contextual', method: 'POST' },
      
      // Audio processing
      'audio_transcription': { path: '/api/audio/transcribe', method: 'POST' },
      
      // Document processing actions
      'extract_text': { path: '/api/documents/extract', method: 'POST' },
      'process_document': { path: '/api/documents/process', method: 'POST' },
      'analyze_material': { path: '/api/materials/analyze', method: 'POST' },

      // Material recognition (MIVAA specific endpoints)
      'material_recognition': { path: '/api/analyze/materials/image', method: 'POST' },
      'material_visual_search': { path: '/api/search/materials/visual', method: 'POST' },
      'material_embeddings': { path: '/api/embeddings/materials/generate', method: 'POST' },

      // PDF processing (MIVAA specific endpoints) - Fixed duplicated paths
      'pdf_extract_markdown': { path: '/api/v1/extract/markdown', method: 'POST' },
      'pdf_extract_tables': { path: '/api/v1/extract/tables', method: 'POST' },
      'pdf_extract_images': { path: '/api/v1/extract/images', method: 'POST' },
      'pdf_process_document': { path: '/api/v1/documents/process-url', method: 'POST' },
      
      // RAG operations
      'rag_query': { path: '/api/rag/query', method: 'POST' },
      'rag_upload': { path: '/api/rag/documents/upload', method: 'POST' },

      // NEW: Enhanced Document Analysis APIs
      'get_related_documents': { path: '/api/documents/{document_id}/related', method: 'GET' },
      'summarize_document': { path: '/api/documents/{document_id}/summarize', method: 'POST' },
      'extract_entities': { path: '/api/documents/{document_id}/extract-entities', method: 'POST' },
      'compare_documents': { path: '/api/documents/compare', method: 'POST' },
      'vector_similarity_search': { path: '/api/search/similarity', method: 'POST' },
      'multimodal_analysis': { path: '/api/analyze/multimodal', method: 'POST' },

      // Enhanced existing APIs
      'get_document_details': { path: '/api/v1/documents/documents/{document_id}', method: 'GET' },
      'get_document_content': { path: '/api/v1/documents/documents/{document_id}/content', method: 'GET' },
      'get_job_status': { path: '/api/v1/documents/job/{job_id}', method: 'GET' },
      'analyze_document': { path: '/api/v1/documents/analyze', method: 'POST' },
      'batch_image_analysis': { path: '/api/v1/images/analyze/batch', method: 'POST' },
      'advanced_image_search': { path: '/api/v1/images/search', method: 'POST' },
    };

    const endpoint = endpointMap[action];
    if (!endpoint) {
      throw new Error(`Unknown action: ${action}`);
    }

    // Handle dynamic path parameters
    let finalPath = endpoint.path;
    if (payload) {
      // Replace path parameters with actual values
      if (payload.document_id && finalPath.includes('{document_id}')) {
        finalPath = finalPath.replace('{document_id}', payload.document_id);
      }
      if (payload.job_id && finalPath.includes('{job_id}')) {
        finalPath = finalPath.replace('{job_id}', payload.job_id);
      }
    }

    // Handle request body and query parameters
    if (endpoint.method === 'GET' && payload) {
      // For GET requests, add query parameters
      const queryParams = new URLSearchParams();
      Object.entries(payload).forEach(([key, value]) => {
        if (key !== 'document_id' && key !== 'job_id' && value !== undefined) {
          queryParams.append(key, String(value));
        }
      });
      if (queryParams.toString()) {
        finalPath += `?${queryParams.toString()}`;
      }
    }

    // Prepare request to MIVAA service
    const mivaaUrl = `${MIVAA_SERVICE_URL}${finalPath}`;
    const requestOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
        'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0',
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    // Add payload for POST requests
    if (endpoint.method === 'POST' && payload) {
      // For POST requests, send payload in body (excluding path parameters)
      let bodyPayload = { ...payload };
      delete bodyPayload.document_id;
      delete bodyPayload.job_id;

      // Special handling for PDF processing - transform frontend payload to MIVAA format
      if (action === 'pdf_process_document') {
        bodyPayload = {
          url: payload.documentId, // Frontend sends documentId which is actually the URL
          async_processing: false,
          options: {
            extract_images: true,
            extract_text: true,
            extract_tables: true,
            quality: 'standard'
          },
          document_name: payload.document_name || 'Uploaded Document',
          tags: payload.tags || [],
          metadata: payload.metadata || {}
        };
      }

      requestOptions.body = JSON.stringify(bodyPayload);
    }

    console.log(`📡 Calling MIVAA: ${endpoint.method} ${mivaaUrl}`);

    // Make request to MIVAA service
    const response = await fetch(mivaaUrl, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ MIVAA service error (${response.status}): ${errorText}`);
      throw new Error(`MIVAA service error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ MIVAA response received successfully`);

    // Log successful request for analytics
    try {
      await supabase
        .from('mivaa_api_usage_logs')
        .insert({
          action: action,
          endpoint: endpoint.path,
          method: endpoint.method,
          response_status: response.status,
          processing_time_ms: Date.now() - startTime,
          success: true,
          created_at: new Date().toISOString(),
        });
    } catch (logError) {
      console.warn('Failed to log API usage:', logError);
    }

    const gatewayResponse: GatewayResponse = {
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        version: '1.0.0',
        mivaaEndpoint: mivaaUrl,
      },
    };

    return new Response(JSON.stringify(gatewayResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('MIVAA Gateway error:', error);

    const errorResponse: GatewayResponse = {
      success: false,
      error: {
        code: 'GATEWAY_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        version: '1.0.0',
      },
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
