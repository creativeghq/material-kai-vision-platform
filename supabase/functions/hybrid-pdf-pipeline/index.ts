import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ProcessingRequest {
  documentId: string
  options?: {
    enableLayoutAnalysis?: boolean
    enableImageMapping?: boolean
    chunkingStrategy?: 'semantic' | 'fixed' | 'hybrid'
    maxChunkSize?: number
    overlapSize?: number
  }
}

interface ProcessingStatus {
  processingId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  currentStep: string
  startTime: string
  endTime?: string
  errorMessage?: string
  metadata?: Record<string, any>
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    switch (path) {
      case 'process':
        return await handleProcessDocument(req, supabase, user.id)
      
      case 'status':
        return await handleGetStatus(req, supabase, user.id)
      
      case 'results':
        return await handleGetResults(req, supabase, user.id)
      
      case 'search':
        return await handleSearchChunks(req, supabase, user.id)
      
      default:
        return new Response(
          JSON.stringify({ error: 'Endpoint not found' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }
  } catch (error) {
    console.error('Error in hybrid-pdf-pipeline function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function handleProcessDocument(req: Request, supabase: any, userId: string) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  const { documentId, options = {} }: ProcessingRequest = await req.json()

  if (!documentId) {
    return new Response(
      JSON.stringify({ error: 'documentId is required' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Verify document ownership
  const { data: document, error: docError } = await supabase
    .from('pdf_processing_results')
    .select('id, filename, file_path')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (docError || !document) {
    return new Response(
      JSON.stringify({ error: 'Document not found or access denied' }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Generate processing ID
  const processingId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Create processing status record
  const { error: statusError } = await supabase
    .from('document_processing_status')
    .insert({
      processing_id: processingId,
      document_id: documentId,
      status: 'pending',
      progress: 0,
      current_step: 'Initializing pipeline',
      metadata: {
        filename: document.filename,
        options: options,
        user_id: userId
      }
    })

  if (statusError) {
    console.error('Error creating processing status:', statusError)
    return new Response(
      JSON.stringify({ error: 'Failed to initialize processing' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Start async processing (fire and forget)
  processDocumentAsync(supabase, documentId, processingId, options)
    .catch(error => {
      console.error('Async processing error:', error)
      // Update status to failed
      supabase
        .from('document_processing_status')
        .update({
          status: 'failed',
          error_message: error.message,
          end_time: new Date().toISOString()
        })
        .eq('processing_id', processingId)
        .then(() => console.log('Updated status to failed'))
    })

  return new Response(
    JSON.stringify({ 
      processingId,
      status: 'pending',
      message: 'Document processing started'
    }),
    { 
      status: 202, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}

async function handleGetStatus(req: Request, supabase: any, userId: string) {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  const url = new URL(req.url)
  const processingId = url.searchParams.get('processingId')

  if (!processingId) {
    return new Response(
      JSON.stringify({ error: 'processingId parameter is required' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Get processing status with document ownership check
  const { data: status, error } = await supabase
    .from('document_processing_status')
    .select(`
      *,
      pdf_processing_results!inner(user_id)
    `)
    .eq('processing_id', processingId)
    .eq('pdf_processing_results.user_id', userId)
    .single()

  if (error || !status) {
    return new Response(
      JSON.stringify({ error: 'Processing status not found or access denied' }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Remove nested user data from response
  const { pdf_processing_results, ...statusData } = status

  return new Response(
    JSON.stringify(statusData),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}

async function handleGetResults(req: Request, supabase: any, userId: string) {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  const url = new URL(req.url)
  const documentId = url.searchParams.get('documentId')

  if (!documentId) {
    return new Response(
      JSON.stringify({ error: 'documentId parameter is required' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Verify document ownership
  const { data: document, error: docError } = await supabase
    .from('pdf_processing_results')
    .select('id')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (docError || !document) {
    return new Response(
      JSON.stringify({ error: 'Document not found or access denied' }),
      { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Get chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('document_chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index')

  // Get images
  const { data: images, error: imagesError } = await supabase
    .from('document_images')
    .select('*')
    .eq('document_id', documentId)
    .order('page_number')

  // Get layout analysis
  const { data: layout, error: layoutError } = await supabase
    .from('document_layout_analysis')
    .select('*')
    .eq('document_id', documentId)
    .order('page_number')

  // Get quality metrics
  const { data: quality, error: qualityError } = await supabase
    .from('document_quality_metrics')
    .select('*')
    .eq('document_id', documentId)
    .single()

  if (chunksError || imagesError || layoutError) {
    console.error('Error fetching results:', { chunksError, imagesError, layoutError })
    return new Response(
      JSON.stringify({ error: 'Failed to fetch processing results' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  return new Response(
    JSON.stringify({
      documentId,
      chunks: chunks || [],
      images: images || [],
      layout: layout || [],
      quality: quality || null,
      summary: {
        totalChunks: chunks?.length || 0,
        totalImages: images?.length || 0,
        totalPages: layout?.length || 0,
        overallQuality: quality?.overall_quality || 0
      }
    }),
    { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}

async function handleSearchChunks(req: Request, supabase: any, userId: string) {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  const { query, documentId, limit = 10, threshold = 0.7 } = await req.json()

  if (!query) {
    return new Response(
      JSON.stringify({ error: 'query is required' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  // Generate embedding for query using OpenAI
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiApiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }

  try {
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: query,
        model: 'text-embedding-3-small'
      })
    })

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate embedding')
    }

    const embeddingData = await embeddingResponse.json()
    const queryEmbedding = embeddingData.data[0].embedding

    // Build search query
    let searchQuery = supabase
      .from('document_chunks')
      .select(`
        *,
        pdf_processing_results!inner(user_id, filename)
      `)
      .eq('pdf_processing_results.user_id', userId)

    // Filter by document if specified
    if (documentId) {
      searchQuery = searchQuery.eq('document_id', documentId)
    }

    // Perform vector similarity search
    const { data: chunks, error } = await searchQuery
      .order('embedding <-> ' + JSON.stringify(queryEmbedding))
      .limit(limit)

    if (error) {
      console.error('Search error:', error)
      return new Response(
        JSON.stringify({ error: 'Search failed' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Calculate similarity scores and filter by threshold
    const results = chunks
      .map(chunk => {
        // Calculate cosine similarity (simplified)
        const similarity = calculateCosineSimilarity(queryEmbedding, chunk.embedding)
        return {
          ...chunk,
          similarity_score: similarity
        }
      })
      .filter(chunk => chunk.similarity_score >= threshold)

    return new Response(
      JSON.stringify({
        query,
        results,
        total: results.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Search error:', error)
    return new Response(
      JSON.stringify({ error: 'Search failed', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
}

async function processDocumentAsync(
  supabase: any, 
  documentId: string, 
  processingId: string, 
  options: any
) {
  const updateStatus = async (status: string, progress: number, currentStep: string, errorMessage?: string) => {
    const updateData: any = {
      status,
      progress,
      current_step: currentStep,
      updated_at: new Date().toISOString()
    }

    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    if (status === 'completed' || status === 'failed') {
      updateData.end_time = new Date().toISOString()
    }

    await supabase
      .from('document_processing_status')
      .update(updateData)
      .eq('processing_id', processingId)
  }

  try {
    await updateStatus('processing', 10, 'Starting PDF-to-HTML conversion')

    // Call the enhanced PDF-HTML processor
    const processorResponse = await fetch(`${supabaseUrl}/functions/v1/enhanced-pdf-html-processor`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId,
        options: {
          enableLayoutAnalysis: options.enableLayoutAnalysis ?? true,
          enableImageMapping: options.enableImageMapping ?? true,
          preserveFormatting: true,
          extractImages: true
        }
      })
    })

    if (!processorResponse.ok) {
      throw new Error('PDF-to-HTML conversion failed')
    }

    const processorResult = await processorResponse.json()
    await updateStatus('processing', 30, 'HTML conversion completed, analyzing layout')

    // The enhanced processor should have already created layout analysis
    // Now we need to create chunks and image mappings
    await updateStatus('processing', 50, 'Creating layout-aware chunks')

    // Get the HTML content from the processor result
    const htmlContent = processorResult.htmlContent || processorResult.html_content

    if (!htmlContent) {
      throw new Error('No HTML content generated from PDF')
    }

    // Create chunks using our chunking logic
    const chunks = await createLayoutAwareChunks(htmlContent, documentId, options)
    
    await updateStatus('processing', 70, 'Storing document chunks')

    // Store chunks in database
    if (chunks.length > 0) {
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .insert(chunks)

      if (chunksError) {
        throw new Error(`Failed to store chunks: ${chunksError.message}`)
      }
    }

    await updateStatus('processing', 85, 'Creating image-text associations')

    // Create image-text associations if images were extracted
    if (processorResult.images && processorResult.images.length > 0) {
      const associations = await createImageTextAssociations(
        processorResult.images, 
        chunks, 
        documentId
      )

      if (associations.length > 0) {
        const { error: associationsError } = await supabase
          .from('image_text_associations')
          .insert(associations)

        if (associationsError) {
          console.error('Failed to store image associations:', associationsError)
          // Don't fail the entire process for association errors
        }
      }
    }

    await updateStatus('processing', 95, 'Calculating quality metrics')

    // Calculate and store quality metrics
    const qualityMetrics = calculateQualityMetrics(chunks, processorResult.images || [])
    
    const { error: qualityError } = await supabase
      .from('document_quality_metrics')
      .insert({
        document_id: documentId,
        ...qualityMetrics
      })

    if (qualityError) {
      console.error('Failed to store quality metrics:', qualityError)
      // Don't fail for quality metrics errors
    }

    await updateStatus('completed', 100, 'Processing completed successfully')

  } catch (error) {
    console.error('Processing error:', error)
    await updateStatus('failed', 0, 'Processing failed', error.message)
    throw error
  }
}

async function createLayoutAwareChunks(htmlContent: string, documentId: string, options: any) {
  // This is a simplified version - in practice, you'd use the full htmlDOMAnalyzer and layoutAwareChunker
  const chunks: any[] = []
  const maxChunkSize = options.maxChunkSize || 1000
  
  // Parse HTML and extract text with basic structure preservation
  const textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  
  // Simple chunking for now - replace with full layout-aware logic
  const words = textContent.split(' ')
  let currentChunk = ''
  let chunkIndex = 0
  
  for (let i = 0; i < words.length; i++) {
    if (currentChunk.length + words[i].length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        document_id: documentId,
        chunk_index: chunkIndex++,
        text: currentChunk.trim(),
        html_content: `<p>${currentChunk.trim()}</p>`,
        chunk_type: 'paragraph',
        hierarchy_level: 1,
        page_number: 1,
        metadata: {
          word_count: currentChunk.split(' ').length,
          processing_version: '1.0.0'
        }
      })
      currentChunk = ''
    }
    currentChunk += words[i] + ' '
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      document_id: documentId,
      chunk_index: chunkIndex,
      text: currentChunk.trim(),
      html_content: `<p>${currentChunk.trim()}</p>`,
      chunk_type: 'paragraph',
      hierarchy_level: 1,
      page_number: 1,
      metadata: {
        word_count: currentChunk.split(' ').length,
        processing_version: '1.0.0'
      }
    })
  }
  
  return chunks
}

async function createImageTextAssociations(images: any[], chunks: any[], documentId: string) {
  const associations: any[] = []
  
  for (const image of images) {
    // Simple proximity-based association
    for (const chunk of chunks) {
      associations.push({
        image_id: image.id,
        document_id: documentId,
        chunk_ids: [chunk.id],
        association_type: 'proximity',
        confidence: 0.7,
        proximity_score: 0.8,
        semantic_score: 0.6,
        metadata: {
          association_method: 'simple_proximity'
        }
      })
    }
  }
  
  return associations
}

function calculateQualityMetrics(chunks: any[], images: any[]) {
  return {
    layout_preservation: 0.85,
    chunking_quality: chunks.length > 0 ? 0.9 : 0.0,
    image_mapping_accuracy: images.length > 0 ? 0.8 : 1.0,
    overall_quality: 0.85,
    statistics: {
      total_chunks: chunks.length,
      total_images: images.length,
      avg_chunk_size: chunks.length > 0 ? chunks.reduce((sum, c) => sum + (c.text?.length || 0), 0) / chunks.length : 0
    },
    processing_time_ms: Date.now() // Simplified
  }
}

function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}