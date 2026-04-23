import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

interface ScrapePageRequest {
  pageUrl: string;
  sessionId: string;
  pageId: string;
  options?: {
    prompt?: string;
    systemPrompt?: string | null;
    schema?: Record<string, any>;
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

/**
 * Scrape Single Page
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(withApiLogging('scrape-single-page', async (req) => {
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

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new Error(auth.error || 'Authentication failed');
    }

    const user = auth.user;
    const userId = auth.userId;

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
    let markdownContent: string | null = null;
    let errorMessage: string | null = null;

    try {
      // Use Firecrawl v2 API for scraping
      const result = await scrapeWithFirecrawl(pageUrl, options);
      materials = result.materials;
      markdownContent = result.markdown;

      console.log(`Extracted ${materials.length} materials from ${pageUrl}`);
      console.log(`Markdown content length: ${markdownContent?.length || 0} characters`);

      // Track Firecrawl spend (1 page per call)
      try {
        const { debitExternalServiceCredits } = await import('../_shared/credit-utils.ts');
        await debitExternalServiceCredits(
          supabase, userId, 'firecrawl-scrape', 'scrape_single_page', 1,
          { url: pageUrl, page_id: pageId, session_id: sessionId },
        );
      } catch (logErr) {
        console.warn('[scrape-single-page] credit-utils logging failed:', logErr);
      }

    } catch (scrapeError) {
      console.error(`Scraping error for ${pageUrl}:`, scrapeError);
      errorMessage = scrapeError.message;
    }

    const endTime = new Date();
    const processingTime = endTime.getTime() - startTime.getTime();

    // Update page with results (including markdown content)
    await supabase
      .from('scraping_pages')
      .update({
        status: errorMessage ? 'failed' : 'completed',
        completed_at: endTime.toISOString(),
        materials_found: materials.length,
        markdown_content: markdownContent,
        error_message: errorMessage,
        processing_time_ms: processingTime,
      })
      .eq('id', pageId);

    // Save materials to database if any were found
    if (materials.length > 0) {
      const materialsToInsert = materials.map(material => ({
        user_id: userId,
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
}));

async function scrapeWithFirecrawl(url: string, options: any): Promise<{ materials: MaterialData[], markdown: string | null }> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    throw new Error('Firecrawl API key not configured');
  }

  // Build v2 API request with structured extraction schema
  const requestBody: any = {
    url: url,
    formats: ['markdown'], // Only markdown to avoid duplicate chunks
    timeout: options.timeout || 30000,
  };

  // Add browser actions if needed (for dynamic content)
  if (options.actions) {
    requestBody.actions = options.actions;
  } else {
    // Default actions for better scraping
    requestBody.actions = [
      { type: 'wait', milliseconds: 2000 }, // Wait for dynamic content to load
    ];
  }

  // Use dynamic schema from field mappings or fallback to default
  const extractionSchema = options.schema || {
    type: 'object',
    properties: {
      name:        { type: 'string', description: 'Material name or product title' },
      description: { type: 'string', description: 'Material description' },
      category:    { type: 'string', description: 'Material category (tiles, stone, wood, etc.)' },
      price:       { type: 'string', description: 'Price with currency' },
      images: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of image URLs',
      },
      properties: {
        type: 'object',
        description: 'Additional properties like dimensions, color, finish',
      },
      // Factory / manufacturer fields — aligned with all 3 import pipelines
      factory_name:        { type: 'string', description: 'Manufacturer or factory company name' },
      factory_group_name:  { type: 'string', description: 'Parent group or holding company of the manufacturer' },
      manufacturer_address:{ type: 'string', description: 'Full street address of the manufacturer' },
      manufacturer_city:   { type: 'string', description: 'City where the manufacturer is located' },
      manufacturer_country:{ type: 'string', description: 'Country where the manufacturer is located' },
      manufacturer_phone:  { type: 'string', description: 'Phone number of the manufacturer' },
      manufacturer_email:  { type: 'string', description: 'Email address of the manufacturer' },
      manufacturer_website:{ type: 'string', description: 'Website URL of the manufacturer' },
      country_of_origin:   { type: 'string', description: 'Country where the product is manufactured' },
    },
    required: ['name'],
  };

  // Add structured extraction with dynamic schema (v2 feature)
  if (options.useStructuredExtraction !== false) {
    // Load extraction prompts from database (editable via /admin/ai-configs)
    const dbExtractionPrompt = options.prompt || await getToolPrompt(supabase, 'single_page_extractor');
    const dbExtractionSystemPrompt = options.systemPrompt || await getToolPrompt(supabase, 'extraction_system');

    // Firecrawl v2: structured extraction is an entry inside `formats`, not a
    // sibling `extract` key. v2 rejects the old shape with HTTP 400
    // 'Unrecognized key in body'. Result lands at data.json, not data.extract.
    requestBody.formats = [
      ...(Array.isArray(requestBody.formats) ? requestBody.formats : []),
      {
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            materials: {
              type: 'array',
              items: extractionSchema,
            },
          },
        },
        prompt: dbExtractionPrompt,
        systemPrompt: dbExtractionSystemPrompt,
      },
    ];
  }

  console.log('Making Firecrawl v2 API request to:', url);
  console.log('Request config:', JSON.stringify({
    formats: Array.isArray(requestBody.formats) ? requestBody.formats.map((f: any) => typeof f === 'string' ? f : f.type) : requestBody.formats,
    hasActions: !!requestBody.actions,
  }));

  const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl v2 API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Firecrawl v2 extraction failed');
  }

  // Extract markdown content (v2 response structure)
  const markdown = result.data?.markdown || null;

  // Parse extracted data into our material format
  const materials: MaterialData[] = [];

  // v2 structured extraction returns data in `json` (was `extract` in v1 shape)
  const extracted = result.data?.json ?? result.data?.extract;
  if (extracted?.materials) {
    const extractedMaterials = extracted.materials;

    for (const item of extractedMaterials) {
      if (item && typeof item === 'object' && item.name) {
        // Build canonical factory nested object for metadata
        const factoryObj: Record<string, string> = {};
        if (item.factory_name)          factoryObj.factory_name         = item.factory_name;
        if (item.factory_group_name)    factoryObj.factory_group_name   = item.factory_group_name;
        if (item.manufacturer_address)  factoryObj.address              = item.manufacturer_address;
        if (item.manufacturer_city)     factoryObj.city                 = item.manufacturer_city;
        if (item.manufacturer_country)  factoryObj.country              = item.manufacturer_country;
        if (item.manufacturer_phone)    factoryObj.phone                = item.manufacturer_phone;
        if (item.manufacturer_email)    factoryObj.email                = item.manufacturer_email;
        if (item.manufacturer_website)  factoryObj.website              = item.manufacturer_website;
        if (item.country_of_origin)     factoryObj.country_of_origin    = item.country_of_origin;

        const enrichedProperties = {
          ...(item.properties || {}),
          ...(Object.keys(factoryObj).length > 0 ? { factory: factoryObj } : {}),
          ...(item.factory_name       ? { factory_name:        item.factory_name }       : {}),
          ...(item.factory_group_name ? { factory_group_name:  item.factory_group_name } : {}),
          ...(item.country_of_origin  ? { country_of_origin:   item.country_of_origin }  : {}),
        };

        materials.push({
          name:        item.name,
          description: item.description || '',
          category:    item.category    || '',
          price:       item.price       || '',
          images:      Array.isArray(item.images) ? item.images : [],
          properties:  enrichedProperties,
          sourceUrl:   url,
          supplier:    item.factory_name || item.supplier || '',
          confidence:  0.9,
        });
      }
    }
  }

  console.log(`Firecrawl v2 extracted ${materials.length} materials from ${url}`);

  return { materials, markdown };
}