// Import statements
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Chunk type enumeration for semantic classification
 */
enum ChunkType {
  PRODUCT_DESCRIPTION = 'product_description',
  TECHNICAL_SPECS = 'technical_specs',
  VISUAL_SHOWCASE = 'visual_showcase',
  DESIGNER_STORY = 'designer_story',
  COLLECTION_OVERVIEW = 'collection_overview',
  SUPPORTING_CONTENT = 'supporting_content',
  INDEX_CONTENT = 'index_content',
  SUSTAINABILITY_INFO = 'sustainability_info',
  CERTIFICATION_INFO = 'certification_info',
  UNCLASSIFIED = 'unclassified'
}

interface ChunkClassificationRequest {
  document_id?: string;
  chunk_ids?: string[];
  reclassify_all?: boolean;
}

interface ChunkClassificationResult {
  chunk_id: string;
  chunk_type: ChunkType;
  confidence: number;
  metadata: Record<string, any>;
  reasoning: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { document_id, chunk_ids, reclassify_all }: ChunkClassificationRequest = await req.json()

    console.log(`🎯 Chunk classification request:`, { document_id, chunk_ids: chunk_ids?.length, reclassify_all })

    let chunks: any[] = []

    // Determine which chunks to classify
    if (document_id && reclassify_all) {
      // Get all chunks for the document
      const { data, error } = await supabaseClient
        .from('document_chunks')
        .select('id, content')
        .eq('document_id', document_id)

      if (error) {
        throw new Error(`Failed to fetch chunks for document: ${error.message}`)
      }
      chunks = data || []
    } else if (chunk_ids && chunk_ids.length > 0) {
      // Get specific chunks
      const { data, error } = await supabaseClient
        .from('document_chunks')
        .select('id, content')
        .in('id', chunk_ids)

      if (error) {
        throw new Error(`Failed to fetch specific chunks: ${error.message}`)
      }
      chunks = data || []
    } else if (document_id) {
      // Get unclassified chunks for the document
      const { data, error } = await supabaseClient
        .from('document_chunks')
        .select('id, content')
        .eq('document_id', document_id)
        .or('chunk_type.is.null,chunk_type.eq.unclassified')

      if (error) {
        throw new Error(`Failed to fetch unclassified chunks: ${error.message}`)
      }
      chunks = data || []
    } else {
      return new Response(
        JSON.stringify({ error: 'Must provide document_id or chunk_ids' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📊 Processing ${chunks.length} chunks for classification`)

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No chunks to classify',
          results: [],
          stats: { classified: 0, errors: 0, total: 0 }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process chunks in batches of 10
    const results: ChunkClassificationResult[] = []
    const batchSize = 10
    let classified = 0
    let errors = 0

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`)

      // Process batch in parallel
      const batchPromises = batch.map(async (chunk) => {
        try {
          const classification = await classifyChunk(chunk.content)
          const metadata = await extractStructuredMetadata(chunk.content, classification.chunkType)

          // Store classification in database
          const { error: updateError } = await supabaseClient
            .from('document_chunks')
            .update({
              chunk_type: classification.chunkType,
              chunk_type_confidence: classification.confidence,
              chunk_type_metadata: metadata
            })
            .eq('id', chunk.id)

          if (updateError) {
            console.error(`❌ Failed to update chunk ${chunk.id}:`, updateError)
            errors++
            return {
              chunk_id: chunk.id,
              chunk_type: ChunkType.UNCLASSIFIED,
              confidence: 0.0,
              metadata: {},
              reasoning: `Database update failed: ${updateError.message}`
            }
          }

          classified++
          return {
            chunk_id: chunk.id,
            chunk_type: classification.chunkType,
            confidence: classification.confidence,
            metadata,
            reasoning: classification.reasoning
          }
        } catch (error) {
          console.error(`❌ Failed to classify chunk ${chunk.id}:`, error)
          errors++
          return {
            chunk_id: chunk.id,
            chunk_type: ChunkType.UNCLASSIFIED,
            confidence: 0.0,
            metadata: {},
            reasoning: `Classification failed: ${error.message}`
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)

      // Small delay between batches
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log(`✅ Classification complete: ${classified} classified, ${errors} errors`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Classified ${classified} chunks with ${errors} errors`,
        results,
        stats: {
          classified,
          errors,
          total: chunks.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Chunk classification error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Classify a single chunk based on content patterns
 */
async function classifyChunk(content: string): Promise<{ chunkType: ChunkType; confidence: number; reasoning: string }> {
  const contentLower = content.toLowerCase()
  const contentLength = content.length

  // Product Description patterns
  if (isProductDescription(content)) {
    return {
      chunkType: ChunkType.PRODUCT_DESCRIPTION,
      confidence: 0.85,
      reasoning: 'Contains product name, description, and key features'
    }
  }

  // Technical Specs patterns
  if (isTechnicalSpecs(content)) {
    return {
      chunkType: ChunkType.TECHNICAL_SPECS,
      confidence: 0.90,
      reasoning: 'Contains technical specifications, measurements, or detailed properties'
    }
  }

  // Visual Showcase patterns
  if (isVisualShowcase(content)) {
    return {
      chunkType: ChunkType.VISUAL_SHOWCASE,
      confidence: 0.80,
      reasoning: 'Contains visual descriptions, image references, or style elements'
    }
  }

  // Designer Story patterns
  if (isDesignerStory(content)) {
    return {
      chunkType: ChunkType.DESIGNER_STORY,
      confidence: 0.85,
      reasoning: 'Contains designer information, philosophy, or creative process'
    }
  }

  // Collection Overview patterns
  if (isCollectionOverview(content)) {
    return {
      chunkType: ChunkType.COLLECTION_OVERVIEW,
      confidence: 0.80,
      reasoning: 'Contains collection information, themes, or overview content'
    }
  }

  // Index Content patterns
  if (isIndexContent(content)) {
    return {
      chunkType: ChunkType.INDEX_CONTENT,
      confidence: 0.95,
      reasoning: 'Contains table of contents, index, or navigation elements'
    }
  }

  // Sustainability Info patterns
  if (isSustainabilityInfo(content)) {
    return {
      chunkType: ChunkType.SUSTAINABILITY_INFO,
      confidence: 0.90,
      reasoning: 'Contains sustainability, environmental, or eco-friendly information'
    }
  }

  // Certification Info patterns
  if (isCertificationInfo(content)) {
    return {
      chunkType: ChunkType.CERTIFICATION_INFO,
      confidence: 0.90,
      reasoning: 'Contains certification, compliance, or quality assurance information'
    }
  }

  // Supporting Content (default for other content)
  if (contentLength > 50) {
    return {
      chunkType: ChunkType.SUPPORTING_CONTENT,
      confidence: 0.60,
      reasoning: 'General content that supports the document but doesn\'t fit specific categories'
    }
  }

  // Unclassified (very short or unclear content)
  return {
    chunkType: ChunkType.UNCLASSIFIED,
    confidence: 0.30,
    reasoning: 'Content too short or unclear for classification'
  }
}

/**
 * Check if content represents a product description
 */
function isProductDescription(content: string): boolean {
  const contentLower = content.toLowerCase()
  
  // Product name patterns (UPPERCASE words)
  const hasProductName = /\b[A-Z]{2,}\b/.test(content)
  
  // Product description keywords
  const productKeywords = [
    'product', 'design', 'collection', 'series', 'line',
    'available in', 'comes in', 'features', 'includes',
    'material', 'finish', 'color', 'size', 'dimension'
  ]
  
  const keywordMatches = productKeywords.filter(keyword => 
    contentLower.includes(keyword)
  ).length
  
  // Dimension patterns (e.g., "15×38", "20×40")
  const hasDimensions = /\d+\s*[×x]\s*\d+/.test(content)
  
  return hasProductName && (keywordMatches >= 2 || hasDimensions)
}

/**
 * Check if content represents technical specifications
 */
function isTechnicalSpecs(content: string): boolean {
  const contentLower = content.toLowerCase()
  
  // Technical specification keywords
  const techKeywords = [
    'specification', 'specs', 'technical', 'properties',
    'dimensions', 'weight', 'capacity', 'performance',
    'material composition', 'thickness', 'density',
    'resistance', 'durability', 'compliance'
  ]
  
  const keywordMatches = techKeywords.filter(keyword => 
    contentLower.includes(keyword)
  ).length
  
  // Measurement patterns
  const hasMeasurements = /\d+\s*(mm|cm|m|kg|g|%|°C|°F)/.test(content)
  
  // Technical formatting (lists, specifications)
  const hasListFormat = content.includes('•') || content.includes('-') || content.includes(':')
  
  return keywordMatches >= 2 || (hasMeasurements && hasListFormat)
}

/**
 * Check if content represents visual showcase
 */
function isVisualShowcase(content: string): boolean {
  const contentLower = content.toLowerCase()

  // Visual keywords
  const visualKeywords = [
    'image', 'photo', 'visual', 'showcase', 'gallery',
    'moodboard', 'style', 'aesthetic', 'look', 'appearance',
    'color palette', 'texture', 'pattern', 'finish'
  ]

  const keywordMatches = visualKeywords.filter(keyword =>
    contentLower.includes(keyword)
  ).length

  // Image references
  const hasImageRefs = content.includes('![') || content.includes('<img') ||
                      contentLower.includes('see image') || contentLower.includes('shown in')

  return keywordMatches >= 2 || hasImageRefs
}

/**
 * Check if content represents designer story
 */
function isDesignerStory(content: string): boolean {
  const contentLower = content.toLowerCase()

  // Designer keywords
  const designerKeywords = [
    'designer', 'design', 'studio', 'architect', 'creative',
    'inspiration', 'philosophy', 'vision', 'concept',
    'process', 'approach', 'methodology', 'story'
  ]

  const keywordMatches = designerKeywords.filter(keyword =>
    contentLower.includes(keyword)
  ).length

  // Designer name patterns (often in caps or with studio)
  const hasDesignerName = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(content) ||
                         contentLower.includes('studio') ||
                         contentLower.includes('design by')

  return keywordMatches >= 3 || (keywordMatches >= 2 && hasDesignerName)
}

/**
 * Check if content represents collection overview
 */
function isCollectionOverview(content: string): boolean {
  const contentLower = content.toLowerCase()

  // Collection keywords
  const collectionKeywords = [
    'collection', 'series', 'line', 'range', 'family',
    'overview', 'introduction', 'presents', 'featuring',
    'includes', 'comprises', 'consists of'
  ]

  const keywordMatches = collectionKeywords.filter(keyword =>
    contentLower.includes(keyword)
  ).length

  // Collection structure indicators
  const hasStructure = content.includes('•') || content.includes('-') ||
                      /\d+\s+(products|items|pieces)/.test(contentLower)

  return keywordMatches >= 2 || (keywordMatches >= 1 && hasStructure)
}

/**
 * Check if content represents index/navigation content
 */
function isIndexContent(content: string): boolean {
  const contentLower = content.toLowerCase()

  // Index keywords
  const indexKeywords = [
    'table of contents', 'index', 'contents', 'navigation',
    'page', 'section', 'chapter', 'part'
  ]

  const keywordMatches = indexKeywords.filter(keyword =>
    contentLower.includes(keyword)
  ).length

  // Page number patterns
  const hasPageNumbers = /\.\.\.\s*\d+/.test(content) || /page\s+\d+/i.test(content)

  // List structure with numbers
  const hasNumberedList = /^\d+\./.test(content.trim()) || content.includes('...')

  return keywordMatches >= 1 || hasPageNumbers || hasNumberedList
}

/**
 * Check if content represents sustainability information
 */
function isSustainabilityInfo(content: string): boolean {
  const contentLower = content.toLowerCase()

  // Sustainability keywords
  const sustainabilityKeywords = [
    'sustainability', 'sustainable', 'eco', 'environmental',
    'green', 'renewable', 'recycled', 'recyclable',
    'carbon footprint', 'eco-friendly', 'biodegradable',
    'energy efficient', 'responsible sourcing'
  ]

  const keywordMatches = sustainabilityKeywords.filter(keyword =>
    contentLower.includes(keyword)
  ).length

  return keywordMatches >= 2
}

/**
 * Check if content represents certification information
 */
function isCertificationInfo(content: string): boolean {
  const contentLower = content.toLowerCase()

  // Certification keywords
  const certificationKeywords = [
    'certification', 'certified', 'standard', 'compliance',
    'iso', 'ce mark', 'quality assurance', 'tested',
    'approved', 'meets standards', 'conforms to'
  ]

  const keywordMatches = certificationKeywords.filter(keyword =>
    contentLower.includes(keyword)
  ).length

  // Certification codes (ISO, CE, etc.)
  const hasCertCodes = /\b(ISO|CE|EN|ASTM|ANSI)\s*\d+/.test(content)

  return keywordMatches >= 2 || hasCertCodes
}

/**
 * Extract structured metadata based on chunk type
 */
async function extractStructuredMetadata(content: string, chunkType: ChunkType): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {}

  switch (chunkType) {
    case ChunkType.PRODUCT_DESCRIPTION:
      return extractProductMetadata(content)

    case ChunkType.TECHNICAL_SPECS:
      return extractTechnicalMetadata(content)

    case ChunkType.VISUAL_SHOWCASE:
      return extractVisualMetadata(content)

    case ChunkType.DESIGNER_STORY:
      return extractDesignerMetadata(content)

    case ChunkType.COLLECTION_OVERVIEW:
      return extractCollectionMetadata(content)

    default:
      return metadata
  }
}

/**
 * Extract product-specific metadata
 */
function extractProductMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {}

  // Extract product name (UPPERCASE words)
  const productNameMatch = content.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/)
  if (productNameMatch) {
    metadata.productName = productNameMatch[0]
  }

  // Extract dimensions (e.g., "15×38", "20×40")
  const dimensionMatch = content.match(/\d+\s*[×x]\s*\d+(?:\s*[×x]\s*\d+)?/)
  if (dimensionMatch) {
    metadata.dimensions = dimensionMatch[0]
  }

  // Extract materials
  const materialKeywords = ['wood', 'metal', 'glass', 'ceramic', 'fabric', 'leather', 'plastic', 'stone', 'concrete']
  const foundMaterials = materialKeywords.filter(material =>
    content.toLowerCase().includes(material)
  )
  if (foundMaterials.length > 0) {
    metadata.materials = foundMaterials
  }

  // Extract colors
  const colorKeywords = ['white', 'black', 'red', 'blue', 'green', 'yellow', 'brown', 'gray', 'grey', 'beige', 'natural']
  const foundColors = colorKeywords.filter(color =>
    content.toLowerCase().includes(color)
  )
  if (foundColors.length > 0) {
    metadata.colors = foundColors
  }

  return metadata
}

/**
 * Extract technical specifications metadata
 */
function extractTechnicalMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {}

  // Extract specifications (key: value pairs)
  const specifications: Record<string, string> = {}
  const specLines = content.split('\n').filter(line => line.includes(':'))

  specLines.forEach(line => {
    const [key, value] = line.split(':').map(s => s.trim())
    if (key && value) {
      specifications[key] = value
    }
  })

  if (Object.keys(specifications).length > 0) {
    metadata.specifications = specifications
  }

  // Extract measurements
  const measurements: Record<string, string> = {}
  const measurementMatches = content.match(/\d+\s*(mm|cm|m|kg|g|%|°C|°F)/g)
  if (measurementMatches) {
    measurementMatches.forEach((match, index) => {
      measurements[`measurement_${index + 1}`] = match
    })
    metadata.measurements = measurements
  }

  return metadata
}

/**
 * Extract visual showcase metadata
 */
function extractVisualMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {}

  // Extract image references
  const imageRefs = []
  const imgMatches = content.match(/!\[([^\]]*)\]/g)
  if (imgMatches) {
    imageRefs.push(...imgMatches)
  }

  if (content.toLowerCase().includes('image') || content.toLowerCase().includes('photo')) {
    imageRefs.push('Referenced in text')
  }

  if (imageRefs.length > 0) {
    metadata.imageReferences = imageRefs
  }

  return metadata
}

/**
 * Extract designer story metadata
 */
function extractDesignerMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {}

  // Extract designer name
  const designerMatch = content.match(/(?:designer?|design by|created by)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i)
  if (designerMatch) {
    metadata.designerName = designerMatch[1]
  }

  // Extract studio name
  const studioMatch = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+studio/i)
  if (studioMatch) {
    metadata.studioName = studioMatch[1] + ' Studio'
  }

  return metadata
}

/**
 * Extract collection overview metadata
 */
function extractCollectionMetadata(content: string): Record<string, any> {
  const metadata: Record<string, any> = {}

  // Extract collection name
  const collectionMatch = content.match(/(?:collection|series|line)[:\s]+([A-Z][a-zA-Z\s]+)/i)
  if (collectionMatch) {
    metadata.collectionName = collectionMatch[1].trim()
  }

  // Extract product count
  const countMatch = content.match(/(\d+)\s+(?:products|items|pieces)/i)
  if (countMatch) {
    metadata.productCount = parseInt(countMatch[1])
  }

  return metadata
}
