import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JinaExtractRequest {
  url: string;
  service: 'firecrawl' | 'jina';
  sitemapMode?: boolean;
  options?: {
    prompt?: string;
    schema?: Record<string, any>;
    crawlMode?: boolean;
    maxPages?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    extractionPrompt?: string;
    classificationLabels?: string[];
    useSearch?: boolean;
    searchQuery?: string;
    rerank?: boolean;
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Material scraper function called');

  try {
    const { url, service, sitemapMode = false, options = {} }: JinaExtractRequest = await req.json();
    console.log(`Processing: ${service}, sitemap: ${sitemapMode}, url: ${url}`);
    
    let materials: MaterialData[] = [];
    
    if (sitemapMode) {
      // Simplified sitemap processing
      materials = await processSitemapSimple(url, service, options);
    } else {
      // Single page processing
      if (service === 'jina') {
        materials = await extractWithJinaSimple(url, options);
      } else {
        materials = await extractWithFirecrawlSimple(url, options);
      }
    }
    
    console.log(`Extracted ${materials.length} materials`);

    return new Response(JSON.stringify({
      success: true,
      data: materials,
      totalProcessed: materials.length,
      service: service
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processSitemapSimple(sitemapUrl: string, service: 'firecrawl' | 'jina', options: any): Promise<MaterialData[]> {
  console.log('Processing sitemap:', sitemapUrl);
  
  try {
    // Fetch and parse sitemap
    const urls = await parseSitemapSimple(sitemapUrl, options);
    console.log(`Found ${urls.length} URLs in sitemap`);
    
    // Limit to 3 URLs to prevent timeout
    const urlsToProcess = urls.slice(0, 3);
    console.log(`Processing first ${urlsToProcess.length} URLs to prevent timeout`);
    
    const allMaterials: MaterialData[] = [];
    
    // Process URLs sequentially with timeout
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      console.log(`Processing URL ${i + 1}/${urlsToProcess.length}: ${url}`);
      
      try {
        const results = service === 'jina' 
          ? await extractWithJinaSimple(url, options)
          : await extractWithFirecrawlSimple(url, options);
        
        allMaterials.push(...results);
        console.log(`URL ${i + 1} done: ${results.length} materials found`);
        
        // Small delay between requests
        if (i < urlsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Failed to process URL ${url}:`, error.message);
        // Continue with next URL
      }
    }
    
    // Add note about limitation
    if (urlsToProcess.length < urls.length) {
      allMaterials.unshift({
        name: `Note: Processed ${urlsToProcess.length} of ${urls.length} URLs`,
        description: `To prevent timeouts, only the first ${urlsToProcess.length} URLs were processed. Use single page mode for specific URLs.`,
        category: 'System Note',
        price: '',
        images: [],
        properties: {
          totalUrlsFound: urls.length,
          urlsProcessed: urlsToProcess.length
        },
        sourceUrl: sitemapUrl,
        supplier: 'System'
      });
    }
    
    return allMaterials;
    
  } catch (error) {
    console.error('Sitemap processing error:', error);
    throw new Error(`Failed to process sitemap: ${error.message}`);
  }
}

async function parseSitemapSimple(sitemapUrl: string, options: any): Promise<string[]> {
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`);
  }
  
  const xmlText = await response.text();
  const urls: string[] = [];
  
  // Simple regex to extract URLs from XML
  const urlMatches = xmlText.match(/<loc>(.*?)<\/loc>/g);
  if (urlMatches) {
    for (const match of urlMatches) {
      const url = match.replace(/<loc>|<\/loc>/g, '');
      if (url.includes('.xml')) {
        // Skip nested sitemaps for simplicity
        continue;
      }
      urls.push(url);
    }
  }
  
  // Apply basic filtering
  const includePatterns = options.includePatterns || ['/product', '/item'];
  const excludePatterns = options.excludePatterns || ['/cart', '/checkout'];
  
  return urls.filter(url => {
    const includesMatch = includePatterns.length === 0 || 
                         includePatterns.some((pattern: string) => url.toLowerCase().includes(pattern.toLowerCase()));
    const excludesMatch = excludePatterns.some((pattern: string) => url.toLowerCase().includes(pattern.toLowerCase()));
    return includesMatch && !excludesMatch;
  });
}

async function extractWithJinaSimple(url: string, options: any): Promise<MaterialData[]> {
  const JINA_API_KEY = Deno.env.get('JINA_API_KEY');
  if (!JINA_API_KEY) {
    throw new Error('JINA_API_KEY not configured');
  }

  console.log('Using Jina AI for:', url);
  
  try {
    const response = await fetch('https://r.jina.ai/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JINA_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-With-Images-Summary': 'true',
        'X-Return-Format': 'markdown',
        'X-Timeout': '10'
      },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error('Jina API returned no data');
    }

    const content = data.data.content || '';
    const title = data.data.title || '';
    const images = Object.values(data.data.images || {}) as string[];

    // Create a simple material from the page content
    const material: MaterialData = {
      name: title || extractNameFromUrl(url),
      description: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
      category: inferCategoryFromContent(content + ' ' + title),
      price: extractPriceFromContent(content),
      images: images.slice(0, 5), // Limit images
      properties: {
        contentLength: content.length,
        extractedBy: 'jina',
        hasImages: images.length > 0
      },
      sourceUrl: url,
      supplier: extractSupplierFromUrl(url),
      confidence: 0.8
    };

    return [material];

  } catch (error) {
    console.error('Jina extraction error:', error);
    throw error;
  }
}

async function extractWithFirecrawlSimple(url: string, options: any): Promise<MaterialData[]> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY not configured');
  }

  console.log('Using Firecrawl for:', url);

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        formats: ["extract"],
        timeout: 20000,
        extract: {
          prompt: options.prompt || "Extract material/product information including name, description, price, and properties.",
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
                    price: { type: "string" },
                    category: { type: "string" },
                    images: { type: "array", items: { type: "string" } },
                    properties: { type: "object" }
                  }
                }
              }
            }
          }
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Firecrawl scraping failed');
    }

    const extractedData = data.data?.extract?.materials || [];
    
    const materials: MaterialData[] = extractedData.map((item: any) => ({
      name: item.name || extractNameFromUrl(url),
      description: item.description || '',
      category: item.category || 'Other',
      price: item.price || '',
      images: Array.isArray(item.images) ? item.images.slice(0, 5) : [],
      properties: item.properties || {},
      sourceUrl: url,
      supplier: extractSupplierFromUrl(url),
      confidence: 0.9
    }));

    // If no materials extracted, create a basic one
    if (materials.length === 0) {
      materials.push({
        name: extractNameFromUrl(url),
        description: 'Material information extracted from page',
        category: 'Other',
        price: '',
        images: [],
        properties: { extractedBy: 'firecrawl' },
        sourceUrl: url,
        supplier: extractSupplierFromUrl(url),
        confidence: 0.5
      });
    }

    return materials;

  } catch (error) {
    console.error('Firecrawl extraction error:', error);
    throw error;
  }
}

// Helper functions
function extractNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const segments = path.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    return lastSegment.replace(/[-_]/g, ' ').replace(/\.(html|php)$/, '');
  } catch {
    return 'Unknown Material';
  }
}

function extractSupplierFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return domain.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}

function inferCategoryFromContent(content: string): string {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('tile') || lowerContent.includes('ceramic')) return 'Ceramics';
  if (lowerContent.includes('wood') || lowerContent.includes('timber')) return 'Wood';
  if (lowerContent.includes('stone') || lowerContent.includes('marble')) return 'Stone';
  if (lowerContent.includes('metal') || lowerContent.includes('steel')) return 'Metals';
  if (lowerContent.includes('fabric') || lowerContent.includes('textile')) return 'Textiles';
  if (lowerContent.includes('glass')) return 'Glass';
  if (lowerContent.includes('plastic') || lowerContent.includes('vinyl')) return 'Plastics';
  
  return 'Other';
}

function extractPriceFromContent(content: string): string {
  // Simple price extraction
  const priceMatch = content.match(/[\$€£¥][\d,]+\.?\d*/);
  return priceMatch ? priceMatch[0] : '';
}