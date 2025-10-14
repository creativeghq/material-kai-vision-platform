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

// Available MIVAA endpoints
const MIVAA_ENDPOINTS = {
  'health_check': { path: '/api/health', method: 'GET' },
  'bulk_process': { path: '/api/bulk/process', method: 'POST' },
  'get_job_status': { path: '/api/jobs/{job_id}/status', method: 'GET' },
  'list_jobs': { path: '/api/jobs', method: 'GET' },
  'cancel_job': { path: '/api/jobs/{job_id}/cancel', method: 'POST' },
  'material_recognition': { path: '/api/vision/analyze', method: 'POST' },
  'llama_vision_analysis': { path: '/api/vision/llama-analyze', method: 'POST' },
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

    const endpoint = MIVAA_ENDPOINTS[action]
    let finalPath = endpoint.path

    // Handle path parameters
    if (payload && payload.job_id && finalPath.includes('{job_id}')) {
      finalPath = finalPath.replace('{job_id}', payload.job_id)
    }

    // Handle query parameters for GET requests
    if (endpoint.method === 'GET' && payload && Object.keys(payload).length > 0) {
      const queryParams = new URLSearchParams()
      Object.entries(payload).forEach(([key, value]) => {
        if (key !== 'job_id' && value !== undefined && value !== null) {
          queryParams.append(key, String(value))
        }
      })
      if (queryParams.toString()) {
        finalPath += `?${queryParams.toString()}`
      }
    }
    // Prepare request body for POST requests
    let bodyPayload = null
    if (endpoint.method === 'POST' && payload) {
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
    const responseData = await response.json()

    console.log(`📥 MIVAA Response: ${response.status}`, responseData)

    if (!response.ok) {
      throw new Error(`MIVAA API error: ${response.status} ${response.statusText}`)
    }

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ MIVAA Gateway Error:', error)

    return new Response(
      JSON.stringify({
        error: 'Gateway error',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
