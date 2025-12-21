import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ScrapePreviewRequest {
  url: string;
  workspaceId: string;
  options?: {
    prompt?: string;
    systemPrompt?: string | null;
    schema?: Record<string, any>;
    fieldMappings?: any[];
    timeout?: number;
  };
}

interface PreviewMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  supplier?: string;
}

interface ScrapePreviewResponse {
  success: boolean;
  url: string;
  materials: PreviewMaterial[];
  markdown: string;
  service: string;
  timestamp: string;
  error?: string;
}

Deno.serve(async (req) => {
  console.log(`Scrape preview function called - Method: ${req.method}`);

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
    const { url, workspaceId, options = {} }: ScrapePreviewRequest = await req.json();

    console.log(`Preview scraping: ${url}`);

    // Validate inputs
    if (!url || !workspaceId) {
      throw new Error('Missing required parameters: url, workspaceId');
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

    // Use Firecrawl v2 with dynamic prompts and schema
    const result = await scrapePreviewWithFirecrawl(url, options);
    const materials = result.materials;
    const markdown = result.markdown;

    console.log(`Preview extracted ${materials.length} materials from ${url}`);

    const response: ScrapePreviewResponse = {
      success: true,
      url,
      materials,
      markdown,
      service: 'firecrawl',
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in scrape-preview:', error);

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

async function scrapePreviewWithFirecrawl(url: string, options: any): Promise<{ materials: PreviewMaterial[], markdown: string }> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    throw new Error('Firecrawl API key not configured');
  }

  // Use dynamic schema from field mappings or fallback to default
  const extractionSchema = options.schema || {
    type: 'object',
    properties: {
      materials: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Material name or product title' },
            description: { type: 'string', description: 'Material description' },
            category: { type: 'string', description: 'Material category' },
            price: { type: 'string', description: 'Price with currency' },
            images: {
              type: 'array',
              items: { type: 'string' },
              description: 'Image URLs'
            },
            properties: {
              type: 'object',
              description: 'Additional properties'
            },
            supplier: { type: 'string', description: 'Supplier name' },
          },
          required: ['name'],
        },
      },
    },
  };

  // Build v2 API request with structured extraction
  const requestBody: any = {
    url: url,
    formats: ['markdown', 'html'],
    timeout: options.timeout || 30000,
    actions: [
      { type: 'wait', milliseconds: 2000 },
    ],
    extract: {
      schema: {
        type: 'object',
        properties: {
          materials: {
            type: 'array',
            items: extractionSchema,
          },
        },
      },
      prompt: options.prompt || `Extract material/product information from this page. Return all materials found.`,
      systemPrompt: options.systemPrompt || 'You are a precise data extraction assistant. Focus on accuracy and structured output.',
    },
  };

  console.log('Making Firecrawl v2 preview request to:', url);

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

  const markdown = result.data?.markdown || '';
  const materials: PreviewMaterial[] = [];

  if (result.data?.extract?.materials) {
    const extractedMaterials = result.data.extract.materials;

    for (const item of extractedMaterials) {
      if (item && typeof item === 'object' && item.name) {
        materials.push({
          name: item.name,
          description: item.description || '',
          category: item.category || '',
          price: item.price || '',
          images: Array.isArray(item.images) ? item.images : [],
          properties: item.properties || {},
          supplier: item.supplier || '',
        });
      }
    }
  }

  return { materials, markdown };
}
