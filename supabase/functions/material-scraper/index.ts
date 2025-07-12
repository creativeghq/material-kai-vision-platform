import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractRequest {
  url: string;
  options?: {
    prompt?: string;
    schema?: Record<string, any>;
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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const { url, options = {} }: ExtractRequest = await req.json();
    
    console.log('Starting material extraction for URL:', url);
    console.log('Options:', JSON.stringify(options, null, 2));
    
    const extractPrompt = options.prompt || `Extract material information from this page. Look for:
- Material name
- Price (if available)
- Description
- Images
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`;

    // Use Firecrawl's extract API
    const extractBody = {
      url: url,
      prompt: extractPrompt,
      schema: options.schema || {
        type: "object",
        properties: {
          materials: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Product/material name" },
                description: { type: "string", description: "Product description" },
                price: { type: "string", description: "Price with currency" },
                category: { type: "string", description: "Material category" },
                images: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "Image URLs" 
                },
                properties: {
                  type: "object",
                  description: "Additional properties like dimensions, color, finish"
                }
              },
              required: ["name"]
            }
          }
        },
        required: ["materials"]
      }
    };

    console.log('Using Firecrawl EXTRACT API with config:', JSON.stringify(extractBody, null, 2));

    const response = await fetch('https://api.firecrawl.dev/v1/extract', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(extractBody),
    });

    console.log('Firecrawl extract response status:', response.status);
    const data = await response.json();
    console.log('Firecrawl extract response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      throw new Error(`Firecrawl extract API error: ${response.status} - ${JSON.stringify(data)}`);
    }

    if (!data.success) {
      throw new Error('Firecrawl extraction failed: ' + (data.error || 'Unknown error'));
    }

    // Process the extracted data
    const materials: MaterialData[] = [];
    
    if (data.data && data.data.materials && Array.isArray(data.data.materials)) {
      console.log(`Processing ${data.data.materials.length} extracted materials`);
      
      for (const material of data.data.materials) {
        if (material.name) {
          const processedMaterial: MaterialData = {
            name: material.name,
            description: material.description || '',
            category: material.category || categorizeFromName(material.name),
            price: material.price || '',
            images: Array.isArray(material.images) ? material.images : [],
            properties: {
              ...material.properties,
              sourceUrl: url,
              extractedAt: new Date().toISOString()
            },
            sourceUrl: url,
            supplier: extractSupplierFromUrl(url)
          };
          
          materials.push(processedMaterial);
          console.log(`Processed material: ${processedMaterial.name}`);
        }
      }
    } else {
      console.log('No materials found in extraction result');
    }

    console.log(`Successfully extracted ${materials.length} materials from ${url}`);

    return new Response(JSON.stringify({
      success: true,
      materials,
      totalPages: 1,
      processingTime: Date.now(),
      extractedCount: materials.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Material extractor error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function categorizeFromName(name: string): string {
  const lowerName = name.toLowerCase();
  
  const categoryMap: Record<string, string> = {
    'wood': 'Wood',
    'timber': 'Wood',
    'oak': 'Wood',
    'pine': 'Wood',
    'stone': 'Stone',
    'marble': 'Stone',
    'granite': 'Stone',
    'concrete': 'Concrete',
    'brick': 'Brick',
    'metal': 'Metal',
    'steel': 'Metal',
    'fabric': 'Textiles',
    'textile': 'Textiles',
    'leather': 'Leather',
    'resin': 'Resin',
    'terracotta': 'Ceramics',
    'terrazzo': 'Ceramics',
    'tile': 'Ceramics',
    'tiles': 'Ceramics',
    'ceramic': 'Ceramics',
    'porcelain': 'Ceramics',
    'glass': 'Glass',
    'plastic': 'Plastics',
    'vinyl': 'Plastics'
  };
  
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  
  return 'Other';
}

function extractSupplierFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}