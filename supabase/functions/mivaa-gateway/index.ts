import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Environment variables
const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || 'your-mivaa-api-key';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Available MIVAA endpoints (based on OpenAPI spec)
const MIVAA_ENDPOINTS = {
  'health_check': { path: '/api/health', method: 'GET' },
  'bulk_process': { path: '/api/bulk/process', method: 'POST' },
  'pdf_process_document': { path: '/api/documents/process', method: 'POST' },
  'pdf_process_url': { path: '/api/documents/process-url', method: 'POST' },
  'pdf_extract': { path: '/api/documents/process', method: 'POST' },
  'pdf_extract_markdown': { path: '/api/pdf/extract/markdown', method: 'POST' },
  'pdf_extract_tables': { path: '/api/pdf/extract/tables', method: 'POST' },
  'pdf_extract_images': { path: '/api/pdf/extract/images', method: 'POST' },
  'get_job_status': { path: '/api/jobs/{job_id}/status', method: 'GET' },
  'list_jobs': { path: '/api/jobs', method: 'GET' },
  'cancel_job': { path: '/api/jobs/{job_id}/cancel', method: 'DELETE' },
  'get_document_content': { path: '/api/documents/{document_id}', method: 'GET' },
  'get_document_chunks': { path: '/api/documents/{document_id}/chunks', method: 'GET' },
  'get_document_images': { path: '/api/documents/{document_id}/images', method: 'GET' },
  'get_document_metadata': { path: '/api/documents/{document_id}/metadata', method: 'GET' },
  'material_recognition': { path: '/api/semantic-analysis', method: 'POST' },
  'llama_vision_analysis': { path: '/api/semantic-analysis', method: 'POST' },
  'semantic_search': { path: '/api/search/semantic', method: 'POST' },
  'generate_embedding': { path: '/api/embeddings/materials/generate', method: 'POST' },
  'multimodal_analysis': { path: '/api/analyze/multimodal', method: 'POST' },
  'docs': { path: '/docs', method: 'GET' },
  'redoc': { path: '/redoc', method: 'GET' },
  'openapi_json': { path: '/openapi.json', method: 'GET' },
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

    // Provide more detailed error information
    const errorDetails = {
      error: 'Gateway error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
      mivaaServiceUrl: MIVAA_SERVICE_URL,
      apiKeyConfigured: !!Deno.env.get('MIVAA_API_KEY'),
    };

    console.error('❌ Error details:', errorDetails);

    return new Response(
      JSON.stringify(errorDetails),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
