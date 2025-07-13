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
    
    // Apply filtering if provided
    const includePatterns = options.includePatterns || [];
    const excludePatterns = options.excludePatterns || [];
    
    let filteredUrls = urls;
    
    if (includePatterns.length > 0) {
      filteredUrls = filteredUrls.filter(url => 
        includePatterns.some((pattern: string) => 
          url.toLowerCase().includes(pattern.toLowerCase())
        )
      );
    }
    
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
    // First try to scrape with both markdown and extract formats
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: url,
        formats: ["markdown", "extract"],
        timeout: 20000,
        extract: {
          prompt: "Extract all product/material information from this page. Look for product names, descriptions, prices, specifications, and any material properties. Include building materials, tiles, flooring, fixtures, furniture, or any construction/design products.",
          schema: {
            type: "object",
            properties: {
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Product or material name" },
                    description: { type: "string", description: "Product description or details" },
                    price: { type: "string", description: "Price information if available" },
                    category: { type: "string", description: "Material category (e.g., tiles, wood, metal, etc.)" },
                    brand: { type: "string", description: "Brand or manufacturer" },
                    specifications: { type: "object", description: "Technical specifications or properties" },
                    availability: { type: "string", description: "Stock status or availability" }
                  },
                  required: ["name"]
                }
              },
              page_info: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  images: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Firecrawl response:', JSON.stringify(data, null, 2));
    
    if (!data.success) {
      throw new Error(`Firecrawl scraping failed: ${data.error || 'Unknown error'}`);
    }

    const materials: MaterialData[] = [];
    
    // Extract from structured data
    const extractedProducts = data.data?.extract?.products || [];
    console.log('Extracted products count:', extractedProducts.length);
    
    for (const product of extractedProducts) {
      if (product.name && product.name.trim()) {
        materials.push({
          name: product.name.trim(),
          description: product.description || '',
          category: product.category || inferCategoryFromContent(product.name + ' ' + (product.description || '')),
          price: product.price || '',
          images: data.data?.extract?.page_info?.images?.slice(0, 3) || [],
          properties: {
            brand: product.brand || '',
            specifications: product.specifications || {},
            availability: product.availability || '',
            extractedBy: 'firecrawl-extract'
          },
          sourceUrl: url,
          supplier: product.brand || extractSupplierFromUrl(url),
          confidence: 0.9
        });
      }
    }
    
    // If no structured products found, try to extract from markdown content
    if (materials.length === 0) {
      const markdown = data.data?.markdown || '';
      const pageInfo = data.data?.extract?.page_info || {};
      
      console.log('No structured products found, trying markdown extraction');
      console.log('Markdown content length:', markdown.length);
      
      if (markdown.length > 100) {
        // Extract potential product information from markdown
        const productData = extractProductFromMarkdown(markdown, url, pageInfo);
        if (productData) {
          materials.push(productData);
        }
      }
    }
    
    // If still no materials found, create a basic entry from page content
    if (materials.length === 0) {
      const pageInfo = data.data?.extract?.page_info || {};
      const markdown = data.data?.markdown || '';
      
      console.log('Creating basic material from page content');
      materials.push({
        name: pageInfo.title || extractNameFromUrl(url),
        description: pageInfo.description || markdown.substring(0, 200) + '...',
        category: inferCategoryFromContent((pageInfo.title || '') + ' ' + (pageInfo.description || '')),
        price: extractPriceFromContent(markdown),
        images: pageInfo.images?.slice(0, 3) || [],
        properties: { 
          extractedBy: 'firecrawl-fallback',
          hasContent: markdown.length > 0,
          contentLength: markdown.length
        },
        sourceUrl: url,
        supplier: extractSupplierFromUrl(url),
        confidence: 0.6
      });
    }

    console.log(`Extracted ${materials.length} materials from ${url}`);
    return materials;

  } catch (error) {
    console.error('Firecrawl extraction error:', error);
    throw error;
  }
}

function extractProductFromMarkdown(markdown: string, url: string, pageInfo: any): MaterialData | null {
  // Look for product patterns in markdown
  const lines = markdown.split('\n').filter(line => line.trim());
  
  // Try to find product headings
  const headings = lines.filter(line => line.match(/^#+\s+/));
  const productHeading = headings.find(h => 
    h.toLowerCase().includes('product') || 
    h.toLowerCase().includes('material') ||
    h.toLowerCase().includes('tile') ||
    h.toLowerCase().includes('floor')
  ) || headings[0];
  
  if (!productHeading) return null;
  
  const name = productHeading.replace(/^#+\s+/, '').trim();
  
  // Extract description from following content
  const headingIndex = lines.indexOf(productHeading);
  const descriptionLines = lines.slice(headingIndex + 1, headingIndex + 5);
  const description = descriptionLines.join(' ').substring(0, 300);
  
  return {
    name: name || extractNameFromUrl(url),
    description: description,
    category: inferCategoryFromContent(name + ' ' + description),
    price: extractPriceFromContent(markdown),
    images: pageInfo.images?.slice(0, 3) || [],
    properties: { 
      extractedBy: 'markdown-parsing',
      source: 'markdown'
    },
    sourceUrl: url,
    supplier: extractSupplierFromUrl(url),
    confidence: 0.7
  };
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