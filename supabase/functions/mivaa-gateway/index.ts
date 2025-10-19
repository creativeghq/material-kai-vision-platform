import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Environment variables
const MIVAA_SERVICE_URL = 'https://v1api.materialshub.gr'
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || 'your-mivaa-api-key'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, payload } = await req.json()

    console.log(`🚀 MIVAA Gateway Request: ${action}`, payload)

    // Validate action
    if (!action || !MIVAA_ENDPOINTS[action]) {
      return new Response(
        JSON.stringify({
          error: 'Invalid action',
          available_actions: Object.keys(MIVAA_ENDPOINTS)
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    let endpoint = MIVAA_ENDPOINTS[action]
    let finalPath = endpoint.path

    // Handle path parameters
    if (payload && payload.job_id && finalPath.includes('{job_id}')) {
      finalPath = finalPath.replace('{job_id}', payload.job_id)
    }
    if (payload && payload.document_id && finalPath.includes('{document_id}')) {
      finalPath = finalPath.replace('{document_id}', payload.document_id)
    }

    // Handle query parameters for GET requests
    if (endpoint.method === 'GET' && payload && Object.keys(payload).length > 0) {
      const queryParams = new URLSearchParams()
      Object.entries(payload).forEach(([key, value]) => {
        if (key !== 'job_id' && key !== 'document_id' && value !== undefined && value !== null) {
          queryParams.append(key, String(value))
        }
      })
      if (queryParams.toString()) {
        finalPath += `?${queryParams.toString()}`
      }
    }
    // Prepare request body for POST requests
    let bodyPayload = null
    if (payload) {
      // Force asynchronous processing for single PDF URL by using bulk endpoint
      if (action === 'pdf_process_url' && payload.url) {
        endpoint = MIVAA_ENDPOINTS['bulk_process']
        finalPath = endpoint.path
        bodyPayload = {
          urls: [payload.url],
          batch_size: 1,
          options: {
            extract_images: payload.options?.extract_images ?? payload.extractImages ?? true,
            enable_multimodal: payload.options?.enable_multimodal ?? payload.enableMultimodal ?? true,
            ocr_languages: payload.options?.ocr_languages ?? payload.ocrLanguages ?? ['en'],
            timeout_seconds: payload.options?.timeout_seconds ?? payload.timeoutSeconds ?? 900,
            ...payload.options
          }
        }
      } else if (endpoint.method === 'POST') {
        if (action === 'bulk_process') {
          // Handle bulk processing requests
          const urls = payload.urls || payload.documents || []

          if (!urls || urls.length === 0) {
            throw new Error('Missing URLs for bulk processing. Expected urls array in payload.')
          }

          bodyPayload = {
            urls: urls,
            batch_size: payload.batch_size || payload.batchSize || 1,
            options: {
              extract_images: payload.options?.extract_images ?? payload.extractImages ?? true,
              enable_multimodal: payload.options?.enable_multimodal ?? payload.enableMultimodal ?? true,
              ocr_languages: payload.options?.ocr_languages ?? payload.ocrLanguages ?? ['en'],
              timeout_seconds: payload.options?.timeout_seconds ?? payload.timeoutSeconds ?? 900,
              ...payload.options // Allow frontend to override options
            }
          }
        } else {
          bodyPayload = payload
        }
      }
    }

    // Make request to MIVAA service
    const mivaaUrl = `${MIVAA_SERVICE_URL}${finalPath}`
    console.log(`📡 Calling MIVAA: ${endpoint.method} ${mivaaUrl}`)

    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
      },
    }

    if (bodyPayload) {
      fetchOptions.body = JSON.stringify(bodyPayload)
      console.log(`📤 Request body:`, bodyPayload)
    }

    const response = await fetch(mivaaUrl, fetchOptions)

    // Handle HTML responses for docs endpoints
    const isDocsEndpoint = ['docs', 'redoc'].includes(action)
    const isJsonEndpoint = action === 'openapi_json'

    let responseData
    let contentType = 'application/json'
    const responseText = await response.text()

    if (isDocsEndpoint) {
      responseData = responseText
      contentType = 'text/html'
      console.log(`📥 MIVAA Response: ${response.status} [HTML Content]`)
    } else if (isJsonEndpoint) {
      responseData = responseText // Keep as text for OpenAPI JSON
      contentType = 'application/json'
      console.log(`📥 MIVAA Response: ${response.status} [OpenAPI JSON]`)
    } else {
      // Try to parse as JSON, but handle HTML error responses
      try {
        responseData = JSON.parse(responseText)
        console.log(`📥 MIVAA Response: ${response.status}`, responseData)
      } catch (parseError) {
        // If JSON parsing fails, it's likely an HTML error page
        console.error(`❌ Failed to parse MIVAA response as JSON. Response text: ${responseText.substring(0, 500)}`)
        throw new Error(`MIVAA API returned non-JSON response: ${response.status} ${response.statusText}. Response: ${responseText.substring(0, 200)}`)
      }
    }

    if (!response.ok) {
      throw new Error(`MIVAA API error: ${response.status} ${response.statusText}`)
    }

    return new Response(
      isDocsEndpoint || isJsonEndpoint ? responseData : JSON.stringify(responseData),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': contentType }
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ MIVAA Gateway Error:', errorMessage)
    console.error('❌ Full error:', error)

    // Provide more detailed error information
    const errorDetails = {
      error: 'Gateway error',
      message: errorMessage,
      timestamp: new Date().toISOString(),
      mivaaServiceUrl: MIVAA_SERVICE_URL,
      apiKeyConfigured: !!Deno.env.get('MIVAA_API_KEY'),
    }

    console.error('❌ Error details:', errorDetails)

    return new Response(
      JSON.stringify(errorDetails),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
