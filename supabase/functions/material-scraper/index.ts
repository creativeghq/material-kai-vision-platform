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
    
    // Use Firecrawl v1 API crawl endpoint for multiple pages
    const crawlBody = {
      url: url,
      limit: options.limit || 50,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
        includeTags: ['img', 'picture', 'figure', 'div', 'span', 'p', 'h1', 'h2', 'h3'],
        excludeTags: ['nav', 'footer', 'header', 'aside', 'script'],
        waitFor: 3000
      },
      includePaths: options.includePaths || [],
      excludePaths: options.excludePaths || [],
      maxDepth: options.maxDepth || 2
    };

    console.log('Calling Firecrawl v1 crawl API...');

    // Call Firecrawl v1 crawl API
    const response = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlBody),
    });

    console.log('Firecrawl response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl API error:', errorText);
      throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Firecrawl crawl response received:', data.success ? 'Success' : 'Failed');

    if (!data.success) {
      throw new Error('Firecrawl crawling failed: ' + (data.error || 'Unknown error'));
    }

    // Process the extracted materials
    const materials: MaterialData[] = [];
    
    if (data.data && Array.isArray(data.data)) {
      for (const page of data.data) {
        if (page.markdown) {
          // Extract materials from markdown content
          const lines = page.markdown.split('\n').filter(line => line.trim().length > 0);
          
          for (const line of lines.slice(0, 20)) { // Process first 20 lines per page
            if (line.length > 10 && line.length < 100 && 
                (line.toLowerCase().includes('tile') || 
                 line.toLowerCase().includes('wood') || 
                 line.toLowerCase().includes('stone') || 
                 line.toLowerCase().includes('floor') || 
                 line.toLowerCase().includes('material') || 
                 line.toLowerCase().includes('finish'))) {
              
              materials.push({
                name: line.trim(),
                description: `Found on page: ${page.url || url}`,
                category: categorizeEffect(line.toLowerCase()),
                price: '',
                images: [],
                properties: {
                  sourceUrl: page.url || url,
                  pageTitle: page.title || ''
                },
                sourceUrl: page.url || url,
                supplier: extractSupplierFromUrl(page.url || url)
              });
              
              if (materials.length >= 50) break; // Limit total results
            }
          }
        }
      }
    }

    console.log(`Successfully processed ${materials.length} materials from ${data.data?.length || 0} pages`);

    return new Response(JSON.stringify({
      success: true,
      materials,
      totalPages: data.data?.length || 0,
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