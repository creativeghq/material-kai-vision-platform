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
    
    if (urls.length === 0) {
      console.log('No URLs found in sitemap');
      return [{
        name: 'No URLs Found',
        description: 'No product URLs were found in the sitemap that match the filtering criteria.',
        category: 'System Note',
        price: '',
        images: [],
        properties: { totalUrlsFound: 0, urlsProcessed: 0 },
        sourceUrl: sitemapUrl,
        supplier: 'System'
      }];
    }
    
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
        
        if (results && results.length > 0) {
          allMaterials.push(...results);
          console.log(`URL ${i + 1} done: ${results.length} materials found`);
        } else {
          console.log(`URL ${i + 1} done: No materials found`);
        }
        
        // Small delay between requests
        if (i < urlsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`Failed to process URL ${url}:`, error.message);
        // Continue with next URL
      }
    }
    
    console.log(`Total materials extracted: ${allMaterials.length}`);
    
    // Add summary note if we have materials
    if (allMaterials.length > 0 && urlsToProcess.length < urls.length) {
      allMaterials.unshift({
        name: `Summary: Found ${allMaterials.length} materials from ${urlsToProcess.length} of ${urls.length} URLs`,
        description: `Successfully extracted ${allMaterials.length} materials. To prevent timeouts, only the first ${urlsToProcess.length} URLs were processed.`,
        category: 'System Summary',
        price: '',
        images: [],
        properties: {
          totalUrlsFound: urls.length,
          urlsProcessed: urlsToProcess.length,
          materialsFound: allMaterials.length - 1 // Exclude this summary from count
        },
        sourceUrl: sitemapUrl,
        supplier: 'System'
      });
    } else if (allMaterials.length === 0) {
      // If no materials found, return explanatory note
      allMaterials.push({
        name: `No Materials Extracted`,
        description: `Processed ${urlsToProcess.length} URLs from sitemap but no materials were successfully extracted. The pages may not contain material information or may require different extraction settings.`,
        category: 'System Note',
        price: '',
        images: [],
        properties: {
          totalUrlsFound: urls.length,
          urlsProcessed: urlsToProcess.length,
          materialsFound: 0
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
  console.log('Fetching sitemap:', sitemapUrl);
  
  try {
    const response = await fetch(sitemapUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaterialScraper/1.0)' },
      signal: AbortSignal.timeout(15000) // 15 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    console.log(`Sitemap XML length: ${xmlText.length} characters`);
    
    const urls: string[] = [];
    
    // More robust XML parsing - handle both <loc> and <url><loc> patterns
    const urlMatches = xmlText.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi);
    if (urlMatches) {
      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/gi, '').trim();
        
        // Skip nested sitemaps and invalid URLs
        if (url.includes('.xml') || !url.startsWith('http')) {
          continue;
        }
        
        urls.push(url);
      }
    }
    
    console.log(`Found ${urls.length} URLs in sitemap`);
    
    // Apply filtering if provided - default to product-related patterns
    const includePatterns = options.includePatterns && options.includePatterns.length > 0 
      ? options.includePatterns 
      : ['/product', '/item', '/tile', '/material', '/floor', '/wall', '/ceramic', '/stone'];
    const excludePatterns = options.excludePatterns || ['/cart', '/checkout', '/account', '/login', '/search'];
    
    let filteredUrls = urls;
    
    // Always apply include patterns for better results
    filteredUrls = filteredUrls.filter(url => 
      includePatterns.some((pattern: string) => 
        url.toLowerCase().includes(pattern.toLowerCase())
      )
    );
    
    if (excludePatterns.length > 0) {
      filteredUrls = filteredUrls.filter(url => 
        !excludePatterns.some((pattern: string) => 
          url.toLowerCase().includes(pattern.toLowerCase())
        )
      );
    }
    
    console.log(`After filtering: ${filteredUrls.length} URLs`);
    return filteredUrls;
    
  } catch (error) {
    console.error('Sitemap parsing error:', error);
    throw new Error(`Failed to parse sitemap: ${error.message}`);
  }
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
      signal: AbortSignal.timeout(15000), // 15 second timeout
      body: JSON.stringify({
        url: url,
        formats: ["markdown", "html"],
        timeout: 10000,
        actions: [
          {
            type: 'wait',
            milliseconds: 2000
          }
        ]
      }),
    });

    console.log(`Firecrawl response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl API error: ${response.status} - ${errorText}`);
      throw new Error(`Firecrawl API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Firecrawl response received:', !!data.success);
    
    if (!data.success) {
      console.error('Firecrawl scraping failed:', data.error || 'Unknown error');
      throw new Error('Firecrawl scraping failed');
    }

    const scrapedData = data.data;
    if (!scrapedData) {
      console.log('No data returned from Firecrawl');
      return [];
    }

    // Extract material information from the scraped content
    const markdown = scrapedData.markdown || '';
    const html = scrapedData.html || '';
    const title = scrapedData.metadata?.title || extractNameFromUrl(url);
    
    console.log(`Content length - Markdown: ${markdown.length}, HTML: ${html.length}`);

    // Simple material extraction logic
    const material: MaterialData = {
      name: title,
      description: markdown.substring(0, 500) + (markdown.length > 500 ? '...' : ''),
      category: inferCategoryFromContent(markdown + ' ' + title),
      price: extractPriceFromContent(markdown + ' ' + html),
      images: extractImagesFromHtml(html),
      properties: {
        contentLength: markdown.length,
        extractedBy: 'firecrawl',
        hasContent: markdown.length > 0,
        url: url
      },
      sourceUrl: url,
      supplier: extractSupplierFromUrl(url),
      confidence: 0.7
    };

    console.log(`Extracted material: ${material.name}, category: ${material.category}, price: ${material.price}`);
    return [material];

  } catch (error) {
    console.error('Firecrawl extraction error:', error);
    throw error;
  }
}

// Helper function to extract images from HTML
function extractImagesFromHtml(html: string): string[] {
  const images: string[] = [];
  const imgMatches = html.match(/<img[^>]+src="([^"]+)"/gi);
  if (imgMatches) {
    for (const match of imgMatches.slice(0, 5)) { // Limit to 5 images
      const srcMatch = match.match(/src="([^"]+)"/i);
      if (srcMatch) {
        images.push(srcMatch[1]);
      }
    }
  }
  return images;
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