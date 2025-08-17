import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ScrapePageRequest {
  pageUrl: string;
  sessionId: string;
  pageId: string;
  options?: {
    prompt?: string;
    service?: 'firecrawl' | 'jina';
    timeout?: number;
  };
}

interface MaterialData {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  sourceUrl: string;
  supplier?: string;
  confidence?: number;
}

Deno.serve(async (req) => {
  console.log(`Scrape single page function called - Method: ${req.method}`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed. Use POST.',
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { pageUrl, sessionId, pageId, options = {} }: ScrapePageRequest = await req.json();

    console.log(`Processing page: ${pageUrl} for session: ${sessionId}, page: ${pageId}`);

    // Validate inputs
    if (!pageUrl || !sessionId || !pageId) {
      throw new Error('Missing required parameters: pageUrl, sessionId, pageId');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get auth info
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header found');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }

    // Update page status to processing
    const startTime = new Date();
    await supabase
      .from('scraping_pages')
      .update({
        status: 'processing',
        started_at: startTime.toISOString(),
        retry_count: options.retryAttempt || 0,
      })
      .eq('id', pageId);

    let materials: MaterialData[] = [];
    let errorMessage: string | null = null;

    try {
      // Use the specified service or default to firecrawl
      const service = options.service || 'firecrawl';

      if (service === 'firecrawl') {
        materials = await scrapeWithFirecrawl(pageUrl, options);
      } else {
        materials = await scrapeWithJina(pageUrl, options);
      }

      console.log(`Extracted ${materials.length} materials from ${pageUrl}`);

    } catch (scrapeError) {
      console.error(`Scraping error for ${pageUrl}:`, scrapeError);
      errorMessage = scrapeError.message;
    }

    const endTime = new Date();
    const processingTime = endTime.getTime() - startTime.getTime();

    // Update page with results
    await supabase
      .from('scraping_pages')
      .update({
        status: errorMessage ? 'failed' : 'completed',
        completed_at: endTime.toISOString(),
        materials_found: materials.length,
        error_message: errorMessage,
        processing_time_ms: processingTime,
      })
      .eq('id', pageId);

    // Save materials to database if any were found
    if (materials.length > 0) {
      const materialsToInsert = materials.map(material => ({
        user_id: user.id,
        scraping_session_id: sessionId,
        source_url: material.sourceUrl,
        material_data: material,
        reviewed: false,
        approved: null,
        scraped_at: new Date().toISOString(),
      }));

      const { error: materialsError } = await supabase
        .from('scraped_materials_temp')
        .insert(materialsToInsert);

      if (materialsError) {
        console.error('Error saving materials:', materialsError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      pageId,
      materialsFound: materials.length,
      processingTimeMs: processingTime,
      error: errorMessage,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scrape-single-page:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function scrapeWithFirecrawl(url: string, options: any): Promise<MaterialData[]> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    throw new Error('Firecrawl API key not configured');
  }

  const requestBody = {
    url: url,
    formats: ['markdown', 'html'],
    timeout: options.timeout || 30000,
    extractorOptions: {
      mode: 'llm-extraction',
      extractionPrompt: options.prompt || `Extract material information from this page. Look for:
- Material name
- Price (if available)  
- Description
- Images
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`,
    },
  };

  console.log('Making Firecrawl API request to:', url);

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Firecrawl extraction failed');
  }

  // Parse extracted data into our material format
  const materials: MaterialData[] = [];

  if (result.data?.extract) {
    const extracted = result.data.extract;

    // Handle if extracted data is an array or single object
    const items = Array.isArray(extracted) ? extracted : [extracted];

    for (const item of items) {
      if (item && typeof item === 'object') {
        materials.push({
          name: item.name || item.title || 'Unknown Material',
          description: item.description || '',
          category: item.category || '',
          price: item.price || '',
          images: Array.isArray(item.images) ? item.images : [],
          properties: item.properties || {},
          sourceUrl: url,
          supplier: item.supplier || '',
          confidence: 0.8,
        });
      }
    }
  }

  return materials;
}

async function scrapeWithJina(url: string, options: any): Promise<MaterialData[]> {
  const apiKey = Deno.env.get('JINA_API_KEY');
  if (!apiKey) {
    throw new Error('Jina API key not configured');
  }

  // Use Jina Reader API to get clean content
  const readerResponse = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'X-Return-Format': 'markdown',
    },
  });

  if (!readerResponse.ok) {
    throw new Error(`Jina Reader API error: ${readerResponse.status}`);
  }

  const content = await readerResponse.text();

  // Use simple pattern matching to extract material information
  const materials: MaterialData[] = [];

  // Basic material extraction patterns (can be enhanced)
  const materialPatterns = [
    /(?:tile|stone|wood|metal|fabric|glass|plastic|concrete)[^.]*?(?:\$[\d,]+\.?\d*|\d+[\s]*(?:USD|EUR|GBP))/gi,
  ];

  for (const pattern of materialPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        materials.push({
          name: match.split(/[$.]/)[0].trim(),
          description: match,
          category: 'Unknown',
          price: '',
          images: [],
          properties: {},
          sourceUrl: url,
          confidence: 0.6,
        });
      }
    }
  }

  return materials;
}
