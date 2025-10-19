import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CategoryExtractionRequest {
  content: string;
  documentId: string;
  extractionTypes?: string[];
  options?: {
    includeContext?: boolean;
    confidenceThreshold?: number;
  };
}

interface CategoryExtractionResult {
  category_key: string;
  confidence: number;
  extracted_from: string;
  context: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { content, documentId, extractionTypes = ['material_category', 'product_category'], options = {} } = await req.json() as CategoryExtractionRequest

    if (!content || !documentId) {
      return new Response(
        JSON.stringify({ error: 'Content and documentId are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get available categories from database
    const { data: categories, error: categoriesError } = await supabaseClient
      .from('material_categories')
      .select('category_key, name, display_name, ai_extraction_enabled, ai_confidence_threshold')
      .eq('is_active', true)
      .eq('ai_extraction_enabled', true)

    if (categoriesError) {
      throw new Error(`Failed to fetch categories: ${categoriesError.message}`)
    }

    // Extract categories using multiple methods
    const extractedCategories: CategoryExtractionResult[] = []

    // Method 1: Keyword-based extraction
    const keywordResults = await extractCategoriesWithKeywords(content, categories || [])
    extractedCategories.push(...keywordResults)

    // Method 2: Pattern-based extraction
    const patternResults = await extractCategoriesWithPatterns(content, categories || [])
    extractedCategories.push(...patternResults)

    // Method 3: AI-powered extraction (if available)
    if (Deno.env.get('OPENAI_API_KEY')) {
      const aiResults = await extractCategoriesWithAI(content, categories || [])
      extractedCategories.push(...aiResults)
    }

    // Merge and deduplicate results
    const mergedCategories = mergeAndDeduplicateCategories(extractedCategories)
    
    // Filter by confidence threshold
    const confidenceThreshold = options.confidenceThreshold || 0.6
    const filteredCategories = mergedCategories
      .filter(cat => cat.confidence >= confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10) // Limit to top 10

    // Store extraction results
    await supabaseClient
      .from('documents')
      .update({
        metadata: {
          extracted_categories: filteredCategories,
          last_category_extraction: new Date().toISOString()
        }
      })
      .eq('id', documentId)

    // Store extraction results in database
    let extractionId = null;
    try {
      const { data: authData } = await supabaseClient.auth.getUser();
      const userId = authData?.user?.id;

      const { data: storedExtraction, error: storageError } = await supabaseClient
        .from('category_extractions')
        .insert({
          user_id: userId,
          source_type: 'document',
          source_data: documentId,
          categories: filteredCategories,
          confidence_scores: filteredCategories.reduce((acc: any, cat: any) => {
            acc[cat.category_key] = cat.confidence;
            return acc;
          }, {}),
          extraction_method: extractionTypes.join(','),
        })
        .select()
        .single();

      if (storageError) {
        console.error('Failed to store category extraction:', storageError);
      } else {
        extractionId = storedExtraction?.id;
      }
    } catch (storageErr) {
      console.error('Error storing extraction:', storageErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extractionId,
        categories: filteredCategories,
        metadata: {
          extractionTypes,
          totalFound: extractedCategories.length,
          afterFiltering: filteredCategories.length,
          confidenceThreshold,
          timestamp: new Date().toISOString()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Category extraction error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        categories: []
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Keyword-based extraction
async function extractCategoriesWithKeywords(
  content: string, 
  categories: any[]
): Promise<CategoryExtractionResult[]> {
  const results: CategoryExtractionResult[] = []
  const contentLower = content.toLowerCase()

  const keywordMappings: Record<string, string[]> = {
    // Product categories
    'tiles': ['tile', 'tiles', 'flooring', 'floor tile', 'wall tile', 'ceramic tile', 'porcelain tile'],
    'decor': ['decor', 'decoration', 'decorative', 'ornament', 'art', 'sculpture', 'vase'],
    'lighting': ['light', 'lighting', 'lamp', 'fixture', 'chandelier', 'sconce', 'pendant'],
    'furniture': ['furniture', 'chair', 'table', 'desk', 'cabinet', 'shelf', 'sofa'],
    
    // Material categories
    'wood': ['wood', 'timber', 'oak', 'pine', 'maple', 'cherry', 'walnut', 'bamboo'],
    'metals': ['metal', 'steel', 'aluminum', 'brass', 'copper', 'iron', 'bronze'],
    'ceramics': ['ceramic', 'porcelain', 'clay', 'earthenware', 'stoneware'],
    'glass': ['glass', 'crystal', 'tempered glass', 'laminated glass'],
    'concrete': ['concrete', 'cement', 'mortar', 'aggregate'],
    'plastics': ['plastic', 'polymer', 'vinyl', 'acrylic', 'polycarbonate'],
    'textiles': ['fabric', 'textile', 'cotton', 'wool', 'silk', 'linen'],
    'stone': ['stone', 'marble', 'granite', 'limestone', 'slate', 'travertine']
  }

  for (const [categoryKey, keywords] of Object.entries(keywordMappings)) {
    const categoryExists = categories.some(cat => cat.category_key === categoryKey)
    if (!categoryExists) continue

    const matches = keywords.filter(keyword => contentLower.includes(keyword.toLowerCase()))
    if (matches.length > 0) {
      const confidence = Math.min(0.9, 0.5 + (matches.length * 0.1))
      results.push({
        category_key: categoryKey,
        confidence,
        extracted_from: 'keyword',
        context: `Found keywords: ${matches.join(', ')}`
      })
    }
  }

  return results
}

// Pattern-based extraction
async function extractCategoriesWithPatterns(
  content: string,
  categories: any[]
): Promise<CategoryExtractionResult[]> {
  const results: CategoryExtractionResult[] = []

  const patterns = [
    { pattern: /(?:ceramic|porcelain|stone)\s+tiles?/gi, category: 'tiles', confidence: 0.8 },
    { pattern: /(?:wall|floor)\s+tiles?/gi, category: 'tiles', confidence: 0.7 },
    { pattern: /decorative\s+(?:panel|element|item)/gi, category: 'decor', confidence: 0.7 },
    { pattern: /(?:ceiling|pendant|table)\s+(?:light|lamp)/gi, category: 'lighting', confidence: 0.8 },
    { pattern: /led\s+(?:light|lighting|fixture)/gi, category: 'lighting', confidence: 0.8 },
    { pattern: /(?:solid|engineered)\s+wood/gi, category: 'wood', confidence: 0.8 },
    { pattern: /stainless\s+steel/gi, category: 'metals', confidence: 0.9 },
    { pattern: /tempered\s+glass/gi, category: 'glass', confidence: 0.9 },
    { pattern: /natural\s+stone/gi, category: 'stone', confidence: 0.8 },
  ]

  for (const { pattern, category, confidence } of patterns) {
    const categoryExists = categories.some(cat => cat.category_key === category)
    if (!categoryExists) continue

    const matches = content.match(pattern)
    if (matches && matches.length > 0) {
      results.push({
        category_key: category,
        confidence,
        extracted_from: 'pattern',
        context: `Pattern matches: ${matches.slice(0, 3).join(', ')}`
      })
    }
  }

  return results
}

// AI-powered extraction using OpenAI
async function extractCategoriesWithAI(
  content: string,
  categories: any[]
): Promise<CategoryExtractionResult[]> {
  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) return []

    const availableCategories = categories.map(cat => cat.category_key).join(', ')
    
    const prompt = `Analyze the following content and identify material and product categories. 
Available categories: ${availableCategories}

Content: ${content.substring(0, 2000)}

Return a JSON array of objects with: category_key, confidence (0-1), context (brief explanation).
Only include categories that are clearly mentioned or strongly implied in the content.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert in material and product categorization.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    const aiResponse = data.choices[0]?.message?.content

    if (!aiResponse) return []

    // Parse AI response
    const aiCategories = JSON.parse(aiResponse)
    return aiCategories.map((cat: any) => ({
      category_key: cat.category_key,
      confidence: cat.confidence,
      extracted_from: 'ai',
      context: cat.context
    }))

  } catch (error) {
    console.error('AI extraction failed:', error)
    return []
  }
}

// Merge and deduplicate categories
function mergeAndDeduplicateCategories(categories: CategoryExtractionResult[]): CategoryExtractionResult[] {
  const categoryMap = new Map<string, CategoryExtractionResult>()

  for (const category of categories) {
    const existing = categoryMap.get(category.category_key)
    
    if (!existing) {
      categoryMap.set(category.category_key, category)
    } else {
      // Merge with higher confidence and combined context
      const mergedConfidence = Math.max(existing.confidence, category.confidence)
      const mergedContext = `${existing.context}; ${category.context}`
      const mergedExtractedFrom = existing.extracted_from === category.extracted_from 
        ? existing.extracted_from 
        : `${existing.extracted_from}, ${category.extracted_from}`

      categoryMap.set(category.category_key, {
        category_key: category.category_key,
        confidence: mergedConfidence,
        extracted_from: mergedExtractedFrom,
        context: mergedContext
      })
    }
  }

  return Array.from(categoryMap.values())
}
