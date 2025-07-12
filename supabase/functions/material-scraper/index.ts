import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CrawlRequest {
  url: string;
  options?: {
    limit?: number;
    includePaths?: string[];
    excludePaths?: string[];
    maxDepth?: number;
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

    const { url, options = {} }: CrawlRequest = await req.json();
    
    console.log('Starting material scraping for URL:', url);
    console.log('Options:', options);
    
    // Use Firecrawl v1 API scrape endpoint (simpler and more reliable)
    const scrapeBody = {
      url: url,
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      includeTags: ['img', 'picture', 'figure', 'div', 'span', 'p', 'h1', 'h2', 'h3'],
      excludeTags: ['nav', 'footer', 'header', 'aside', 'script'],
      waitFor: 3000,
      extract: {
        schema: {
          type: "object",
          properties: {
            materials: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string" },
                  price: { type: "string" },
                  images: { 
                    type: "array",
                    items: { type: "string" }
                  },
                  properties: {
                    type: "object",
                    properties: {
                      dimensions: { type: "string" },
                      finish: { type: "string" },
                      material: { type: "string" },
                      color: { type: "string" },
                      thickness: { type: "string" }
                    }
                  },
                  supplier: { type: "string" }
                }
              }
            }
          }
        },
        systemPrompt: "You are an expert at extracting material and product information from websites.",
        prompt: `Extract all material and product information from this page. Look for:
- Product names and titles
- Material categories (tiles, flooring, stone, wood, metal, fabric, etc.)
- Product descriptions and specifications
- Prices and pricing information
- Technical properties (dimensions, finish, color, material type, thickness)
- Product images (extract URLs)
- Brand/supplier information

Focus on construction materials, interior design materials, flooring, tiles, fabrics, metals, wood, stone, and similar products. Return as many materials as you can find on the page.`
      }
    };

    console.log('Calling Firecrawl v1 scrape API...');

    // Call Firecrawl v1 scrape API
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scrapeBody),
    });

    console.log('Firecrawl response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl API error:', errorText);
      throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Firecrawl response received:', data.success ? 'Success' : 'Failed');

    if (!data.success) {
      throw new Error('Firecrawl scraping failed: ' + (data.error || 'Unknown error'));
    }

    // Process the extracted materials
    const materials: MaterialData[] = [];
    
    if (data.data?.extract?.materials && Array.isArray(data.data.extract.materials)) {
      for (const material of data.data.extract.materials) {
        if (material.name && material.name.trim().length > 2) {
          const cleanMaterial: MaterialData = {
            name: material.name || 'Unknown Material',
            description: material.description || '',
            category: categorizeEffect(material.category || material.properties?.material || 'other'),
            price: material.price || '',
            images: Array.isArray(material.images) ? material.images.filter(Boolean) : [],
            properties: {
              dimensions: material.properties?.dimensions || '',
              finish: material.properties?.finish || '',
              material: material.properties?.material || '',
              color: material.properties?.color || '',
              thickness: material.properties?.thickness || '',
              brand: material.supplier || '',
              ...material.properties
            },
            sourceUrl: url,
            supplier: material.supplier || extractSupplierFromUrl(url)
          };
          
          materials.push(cleanMaterial);
        }
      }
    }

    // Fallback: try to extract from content if no structured data
    if (materials.length === 0 && data.data?.content) {
      console.log('No structured materials found, attempting content analysis...');
      
      // Simple fallback extraction from content
      const content = data.data.content;
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      // Look for product-like patterns
      for (const line of lines.slice(0, 20)) { // Limit to first 20 lines
        if (line.length > 10 && line.length < 100 && 
            (line.includes('tile') || line.includes('wood') || line.includes('stone') || 
             line.includes('floor') || line.includes('material') || line.includes('finish'))) {
          
          materials.push({
            name: line.trim(),
            description: 'Extracted from page content',
            category: 'Other',
            price: '',
            images: [],
            properties: {},
            sourceUrl: url,
            supplier: extractSupplierFromUrl(url)
          });
          
          if (materials.length >= 5) break; // Limit fallback results
        }
      }
    }

    console.log(`Successfully processed ${materials.length} materials`);

    return new Response(JSON.stringify({
      success: true,
      materials,
      totalPages: 1,
      processingTime: Date.now()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Material scraper error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function categorizeEffect(category: string): string {
  const categoryMap: Record<string, string> = {
    'wood': 'Wood',
    'stone': 'Stone & marble',
    'marble': 'Stone & marble',
    'concrete': 'Concrete',
    'brick': 'Brick',
    'metal': 'Metal',
    'fabric': 'Fabric',
    'leather': 'Leather',
    'resin': 'Resin',
    'terracotta': 'Terracotta',
    'terrazzo': 'Terrazzo',
    'tile': 'Encaustic',
    'tiles': 'Encaustic',
    'ceramic': 'Encaustic',
    'porcelain': 'Encaustic'
  };
  
  const lowerCategory = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lowerCategory.includes(key)) {
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