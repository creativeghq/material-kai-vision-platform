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
    
    console.log('Starting material scraping for:', url);
    
    // Configure Firecrawl crawl options for v1 API
    const crawlBody = {
      url,
      limit: options.limit || 50,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: true,
        includeTags: ['img', 'picture', 'figure'],
        excludeTags: ['nav', 'footer', 'header', 'aside'],
        waitFor: 2000
      },
      extractorOptions: {
        mode: 'llm-extraction',
        extractionPrompt: `
          Extract material/product information from this page. Look for:
          - Product names and titles
          - Material categories (tiles, flooring, stone, wood, etc.)
          - Descriptions and specifications
          - Prices and pricing information
          - Technical properties (dimensions, finish, etc.)
          - High-quality product images
          - Brand/supplier information
          
          Return the data as a JSON array of materials with the following structure:
          {
            "materials": [
              {
                "name": "Product name",
                "description": "Product description",
                "category": "Material category",
                "price": "Price if available",
                "images": ["array of image URLs"],
                "properties": {
                  "dimensions": "size info",
                  "finish": "finish type",
                  "material": "material type",
                  "color": "color info",
                  "thickness": "thickness if applicable"
                },
                "supplier": "Brand or supplier name"
              }
            ]
          }
        `
      }
    };

    console.log('Calling Firecrawl API with body:', crawlBody);

    // Call Firecrawl API
    const firecrawlResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlBody),
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error('Firecrawl API error:', errorText);
      throw new Error(`Firecrawl API error: ${firecrawlResponse.status} - ${errorText}`);
    }

    const crawlData = await firecrawlResponse.json();
    console.log('Firecrawl response:', crawlData);

    // Check if we got a jobId (async crawl) or immediate results
    if (crawlData.jobId) {
      console.log('Async crawl started with jobId:', crawlData.jobId);
      
      // Poll for results
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes max
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        
        const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlData.jobId}`, {
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          },
        });
        
        const statusData = await statusResponse.json();
        console.log(`Crawl status (attempt ${attempts + 1}):`, statusData.status);
        
        if (statusData.status === 'completed') {
          console.log('Crawl completed, processing results...');
          const materials = await processCrawlResults(statusData.data, url);
          
          return new Response(JSON.stringify({
            success: true,
            materials,
            totalPages: statusData.data?.length || 0,
            processingTime: Date.now() - Date.now()
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (statusData.status === 'failed') {
          throw new Error('Crawl failed: ' + statusData.error);
        }
        
        attempts++;
      }
      
      throw new Error('Crawl timeout - please try again');
    } else {
      // Immediate results
      console.log('Processing immediate crawl results...');
      const materials = await processCrawlResults(crawlData.data, url);
      
      return new Response(JSON.stringify({
        success: true,
        materials,
        totalPages: crawlData.data?.length || 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

async function processCrawlResults(crawlData: any[], sourceUrl: string): Promise<MaterialData[]> {
  const allMaterials: MaterialData[] = [];
  
  for (const page of crawlData || []) {
    try {
      // Try to parse extracted data
      let extractedData;
      if (page.extract) {
        extractedData = typeof page.extract === 'string' ? JSON.parse(page.extract) : page.extract;
      }
      
      if (extractedData?.materials && Array.isArray(extractedData.materials)) {
        for (const material of extractedData.materials) {
          // Clean and validate material data
          const cleanMaterial: MaterialData = {
            name: material.name || 'Unknown Material',
            description: material.description || '',
            category: categorizeEffect(material.category || material.material || 'other'),
            price: material.price || '',
            images: Array.isArray(material.images) ? material.images.filter(Boolean) : [],
            properties: {
              dimensions: material.properties?.dimensions || '',
              finish: material.properties?.finish || '',
              material: material.properties?.material || '',
              color: material.properties?.color || '',
              thickness: material.properties?.thickness || '',
              brand: material.supplier || material.brand || '',
              ...material.properties
            },
            sourceUrl: page.metadata?.sourceURL || sourceUrl,
            supplier: material.supplier || material.brand || extractSupplierFromUrl(sourceUrl)
          };
          
          // Only add materials with valid names
          if (cleanMaterial.name && cleanMaterial.name.length > 2) {
            allMaterials.push(cleanMaterial);
          }
        }
      } else {
        // Fallback: try to extract from page content
        console.log('No structured extraction, trying content analysis for:', page.metadata?.title);
        // This is a simplified fallback - in practice you might want more sophisticated parsing
      }
    } catch (error) {
      console.error('Error processing page:', error);
      continue;
    }
  }
  
  console.log(`Processed ${allMaterials.length} materials from crawl`);
  return allMaterials;
}

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