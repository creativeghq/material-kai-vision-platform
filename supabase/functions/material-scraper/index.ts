import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get your Jina AI API key for free: https://jina.ai/?sui=apikey
interface JinaExtractRequest {
  url: string;
  service: 'firecrawl' | 'jina';
  sitemapMode?: boolean; // New option for sitemap processing
  options?: {
    // Firecrawl options
    prompt?: string;
    schema?: Record<string, any>;
    crawlMode?: boolean;
    maxPages?: number;
    includePatterns?: string[];
    excludePatterns?: string[];
    
    // Jina AI options
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

  try {
    const { url, service, sitemapMode = false, options = {} }: JinaExtractRequest = await req.json();
    
    console.log('Starting material extraction:', { url, service, sitemapMode, options });
    
    let materials: MaterialData[] = [];
    let processingTime = Date.now();
    
    if (sitemapMode) {
      materials = await extractFromSitemap(url, service, options);
    } else if (service === 'jina') {
      materials = await extractWithJinaAI(url, options);
    } else {
      // Check if crawling is requested
      if (options.crawlMode) {
        materials = await crawlWithFirecrawl(url, options);
      } else {
        materials = await extractWithFirecrawl(url, options);
      }
    }
    
    processingTime = Date.now() - processingTime;
    
    console.log(`Successfully extracted ${materials.length} materials using ${service}`);

    return new Response(JSON.stringify({
      success: true,
      materials,
      totalPages: 1,
      processingTime,
      service,
      extractedCount: materials.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Material extraction error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function extractFromSitemap(sitemapUrl: string, service: 'firecrawl' | 'jina', options: any): Promise<MaterialData[]> {
  console.log('Processing sitemap:', sitemapUrl);
  
  // Fetch and parse the sitemap
  const urls = await parseSitemap(sitemapUrl, options);
  console.log(`Found ${urls.length} URLs in sitemap after filtering`);
  
  if (urls.length === 0) {
    throw new Error('No URLs found in sitemap matching the include patterns');
  }
  
  const allMaterials: MaterialData[] = [];
  const totalPages = urls.length;
  
  console.log(`Processing ALL ${totalPages} URLs from sitemap (no page limit)`);
  
  // Process URLs in batches to avoid overwhelming the APIs
  const batchSize = 2; // Even smaller batches for sitemap processing
  const totalBatches = Math.ceil(totalPages / batchSize);
  for (let i = 0; i < totalPages; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const currentBatch = Math.floor(i / batchSize) + 1;
    console.log(`Processing batch ${currentBatch}/${totalBatches} (${batch.length} URLs)`);
    
    // Add timeout for each batch to prevent edge function timeout
    const batchPromise = Promise.race([
      processBatch(batch, service, options),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Batch timeout')), 30000) // 30 second timeout per batch
      )
    ]);
    
    try {
      const batchResults = await batchPromise as MaterialData[][];
      
      // Flatten and add to results
      for (const pageResults of batchResults) {
        allMaterials.push(...pageResults);
      }
      
      console.log(`Batch ${currentBatch} complete: ${allMaterials.length} total materials so far`);
      
    } catch (error) {
      console.error(`Batch ${currentBatch} failed:`, error);
      // Continue with next batch even if this one fails
    }
    
    // Add delay between batches to be respectful to the APIs and prevent timeouts
    if (i + batchSize < totalPages) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
    }
  }
  console.log(`Sitemap processing complete: ${allMaterials.length} materials from ${totalPages} pages`);
  return allMaterials;
}

async function processBatch(urls: string[], service: 'firecrawl' | 'jina', options: any): Promise<MaterialData[][]> {
  const batchPromises = urls.map(async (url) => {
    try {
      if (service === 'jina') {
        const results = await extractWithJinaAI(url, options);
        return results;
      } else {
        const results = await extractWithFirecrawl(url, options);
        return results;
      }
    } catch (error) {
      console.error(`Failed to process URL ${url}:`, error);
      return []; // Return empty array on error
    }
  });
  
  return await Promise.all(batchPromises);
}

async function parseSitemap(sitemapUrl: string, options: any): Promise<string[]> {
  console.log('Fetching sitemap:', sitemapUrl);
  
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
  }
  
  const xmlText = await response.text();
  console.log('Sitemap content length:', xmlText.length);
  
  // Parse XML to extract URLs
  const urls: string[] = [];
  
  // Handle both sitemap and sitemap index formats
  const urlMatches = xmlText.match(/<loc[^>]*>([^<]+)<\/loc>/g);
  if (urlMatches) {
    for (const match of urlMatches) {
      const url = match.replace(/<loc[^>]*>/, '').replace(/<\/loc>/, '').trim();
      
      // If this is a sitemap index (contains other sitemaps), recursively parse them
      if (url.includes('sitemap') && url.endsWith('.xml')) {
        try {
          const subUrls = await parseSitemap(url, options);
          urls.push(...subUrls);
        } catch (error) {
          console.error(`Failed to parse sub-sitemap ${url}:`, error);
        }
      } else {
        urls.push(url);
      }
    }
  }
  
  console.log(`Extracted ${urls.length} URLs from sitemap`);
  
  // Filter URLs based on include/exclude patterns
  const includePatterns = options.includePatterns || ['/product', '/item', '/material'];
  const excludePatterns = options.excludePatterns || ['/cart', '/checkout', '/account', '/login'];
  
  const filteredUrls = urls.filter(url => {
    // Check include patterns
    const includesMatch = includePatterns.length === 0 || 
                         includePatterns.some(pattern => url.toLowerCase().includes(pattern.toLowerCase()));
    
    // Check exclude patterns  
    const excludesMatch = excludePatterns.some(pattern => url.toLowerCase().includes(pattern.toLowerCase()));
    
    return includesMatch && !excludesMatch;
  });
  
  console.log(`Filtered to ${filteredUrls.length} URLs matching patterns`);
  return filteredUrls;
}


async function extractWithJinaAI(url: string, options: any): Promise<MaterialData[]> {
  const JINA_API_KEY = Deno.env.get('JINA_API_KEY');
  if (!JINA_API_KEY) {
    throw new Error('JINA_API_KEY not configured');
  }

  console.log('Using Jina AI for extraction');
  
  const materials: MaterialData[] = [];
  let content = '';
  let pageTitle = '';
  let images: string[] = [];
  
  try {
    if (options.useSearch && options.searchQuery) {
      // Use Jina Search API
      console.log('Using Jina Search API with query:', options.searchQuery);
      
      const searchResponse = await fetch('https://s.jina.ai/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JINA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-With-Images-Summary': 'true',
          'X-With-Links-Summary': 'true',
          'X-Site': new URL(url).hostname
        },
        body: JSON.stringify({
          q: options.searchQuery,
          num: 5
        })
      });
      
      if (!searchResponse.ok) {
        throw new Error(`Jina Search API error: ${searchResponse.status}`);
      }
      
      const searchData = await searchResponse.json();
      console.log('Jina search results:', searchData.data?.length || 0, 'pages');
      
      // Process each search result
      for (const result of searchData.data || []) {
        const comprehensiveMaterial = createComprehensiveMaterial(
          result.content,
          result.url,
          result.title,
          []
        );
        if (comprehensiveMaterial) {
          materials.push(comprehensiveMaterial);
        }
      }
      
    } else {
      // Use Jina Reader API
      console.log('Using Jina Reader API for:', url);
      
      const readerResponse = await fetch('https://r.jina.ai/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JINA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-With-Images-Summary': 'true',
          'X-With-Links-Summary': 'true',
          'X-Return-Format': 'markdown',
          'X-Timeout': '30'
        },
        body: JSON.stringify({ url })
      });
      
      if (!readerResponse.ok) {
        throw new Error(`Jina Reader API error: ${readerResponse.status}`);
      }
      
      const readerData = await readerResponse.json();
      console.log('Jina reader response:', readerData.code, readerData.status);
      
      if (readerData.success !== false && readerData.data) {
        content = readerData.data.content || '';
        pageTitle = readerData.data.title || '';
        images = Object.values(readerData.data.images || {});
        
        console.log(`Retrieved content: ${content.length} characters, ${images.length} images`);
        
        // For Jina AI, create a single comprehensive material entry from the entire page
        const comprehensiveMaterial = createComprehensiveMaterial(content, url, pageTitle, images);
        if (comprehensiveMaterial) {
          materials.push(comprehensiveMaterial);
        }
      }
    }
    
    // Classify materials if labels provided
    if (options.classificationLabels && materials.length > 0) {
      console.log('Classifying materials with labels:', options.classificationLabels);
      
      const materialNames = materials.map(m => m.name);
      const classificationResponse = await fetch('https://api.jina.ai/v1/classify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JINA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: 'jina-embeddings-v3',
          input: materialNames,
          labels: options.classificationLabels
        })
      });
      
      if (classificationResponse.ok) {
        const classificationData = await classificationResponse.json();
        
        // Update materials with classification results
        classificationData.data?.forEach((result: any, index: number) => {
          if (materials[index]) {
            materials[index].category = result.prediction;
            materials[index].confidence = result.score;
          }
        });
      }
    }
    
    // Rerank results if requested
    if (options.rerank && materials.length > 1 && options.searchQuery) {
      console.log('Reranking materials based on query:', options.searchQuery);
      
      const documents = materials.map(m => `${m.name} - ${m.description || ''}`);
      const rerankResponse = await fetch('https://api.jina.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JINA_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: 'jina-reranker-v2-base-multilingual',
          query: options.searchQuery,
          documents,
          return_documents: false
        })
      });
      
      if (rerankResponse.ok) {
        const rerankData = await rerankResponse.json();
        
        // Reorder materials based on relevance scores
        const rerankedMaterials = rerankData.results
          ?.sort((a: any, b: any) => b.relevance_score - a.relevance_score)
          .map((result: any) => {
            const material = materials[result.index];
            material.confidence = result.relevance_score;
            return material;
          });
        
        return rerankedMaterials || materials;
      }
    }
    
    return materials;
    
  } catch (error) {
    console.error('Jina AI extraction error:', error);
    throw error;
  }
}

async function extractWithFirecrawl(url: string, options: any): Promise<MaterialData[]> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY not configured');
  }

  console.log('Using Firecrawl for extraction');

  // Use scrape endpoint with extract format
  const scrapeBody: any = {
    url: url,
    formats: ["extract"],
    timeout: 90000, // 90 seconds timeout for complex pages
    extract: {
      prompt: options.prompt || `Extract material information from this page. Look for:
- Material name
- Price (if available)  
- Description
- Images
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`,
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
    }
  };

  // Add CSS selectors if provided
  if (options.cssSelectors && options.cssSelectors.length > 0) {
    scrapeBody.include = options.cssSelectors;
    console.log('Using CSS selectors:', options.cssSelectors);
  }

  // Add wait time if specified
  if (options.waitFor && options.waitFor > 0) {
    scrapeBody.waitFor = options.waitFor;
    console.log('Waiting for:', options.waitFor, 'ms');
  }

  // Extract only main content if requested
  if (options.onlyMainContent) {
    scrapeBody.onlyMainContent = true;
    console.log('Extracting only main content');
  }

  console.log('Firecrawl scrape request:', {
    url: scrapeBody.url,
    formats: scrapeBody.formats,
    timeout: scrapeBody.timeout,
    hasSelectors: !!scrapeBody.include,
    waitFor: scrapeBody.waitFor,
    onlyMainContent: scrapeBody.onlyMainContent
  });
  
  try {
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
      console.error('Firecrawl error response:', errorText);
      
      // Handle timeout specifically
      if (response.status === 408 || errorText.includes('timed out')) {
        throw new Error('Page is too large or complex for Firecrawl to process. Try a simpler page or use Jina AI instead.');
      }
      
      throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Firecrawl response data structure:', JSON.stringify(data, null, 2));
    
    if (!data.success) {
      console.error('Firecrawl scraping failed - full response:', data);
      
      // Handle timeout in response data
      if (data.error && (data.error.includes('timed out') || data.error.includes('timeout'))) {
        throw new Error('Page processing timed out. This usually happens with large product listing pages. Try a specific product page instead.');
      }
      
      throw new Error('Firecrawl scraping failed: ' + (data.error || JSON.stringify(data)));
    }

    const materials: MaterialData[] = [];
    
    console.log('Checking data structure:', {
      hasData: !!data.data,
      hasExtract: !!(data.data && data.data.extract),
      hasMaterials: !!(data.data && data.data.extract && data.data.extract.materials),
      isArray: Array.isArray(data.data?.extract?.materials)
    });
    
    // Check if extraction data exists
    if (data.data && data.data.extract && data.data.extract.materials && Array.isArray(data.data.extract.materials)) {
      console.log('Found materials array with length:', data.data.extract.materials.length);
      
      for (const material of data.data.extract.materials) {
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
              extractedAt: new Date().toISOString(),
              extractedBy: 'firecrawl'
            },
            sourceUrl: url,
            supplier: extractSupplierFromUrl(url)
          };
          
          materials.push(processedMaterial);
        }
      }
    } else {
      console.log('No materials found in expected structure. Full data.data:', JSON.stringify(data.data, null, 2));
    }

    console.log(`Processed ${materials.length} materials from Firecrawl`);
    return materials;
    
  } catch (error) {
    console.error('Firecrawl processing error:', error);
    throw error;
  }
}

async function crawlWithFirecrawl(url: string, options: any): Promise<MaterialData[]> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY not configured');
  }

  console.log('Using Firecrawl crawl mode for multiple pages');

  const crawlBody = {
    url: url,
    limit: 1000, // Process ALL pages (no limit)
    scrapeOptions: {
      formats: ["extract"],
      extract: {
        prompt: options.prompt || `Extract material information from this page. Look for:
- Material name
- Price (if available)  
- Description
- Images
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`,
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
      }
    },
    // Include/exclude patterns for URL filtering
    includePaths: options.includePatterns || ["/product", "/item", "/material"],
    excludePaths: options.excludePatterns || ["/cart", "/checkout", "/account", "/login"]
  };

  console.log('Firecrawl crawl request:', JSON.stringify(crawlBody, null, 2));
  
  try {
    // Start the crawl
    const crawlResponse = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlBody),
    });

    console.log('Firecrawl crawl response status:', crawlResponse.status);
    
    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      console.error('Firecrawl crawl error:', errorText);
      throw new Error(`Firecrawl crawl API error: ${crawlResponse.status} - ${errorText}`);
    }

    const crawlData = await crawlResponse.json();
    console.log('Firecrawl crawl started, job ID:', crawlData.id);
    
    if (!crawlData.success) {
      throw new Error('Failed to start Firecrawl crawl: ' + JSON.stringify(crawlData));
    }

    // Poll for crawl completion
    const jobId = crawlData.id;
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max wait time
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      
      const statusResponse = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        },
      });
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to check crawl status: ${statusResponse.status}`);
      }
      
      const statusData = await statusResponse.json();
      console.log('Crawl status:', statusData.status, `(${statusData.completed}/${statusData.total} pages)`);
      
      if (statusData.status === 'completed') {
        console.log('Crawl completed successfully');
        console.log('Crawl status data structure:', JSON.stringify(statusData, null, 2));
        
        // Process all crawled pages
        const allMaterials: MaterialData[] = [];
        
        if (statusData.data && Array.isArray(statusData.data)) {
          console.log(`Processing ${statusData.data.length} crawled pages`);
          
          for (let i = 0; i < statusData.data.length; i++) {
            const pageData = statusData.data[i];
            console.log(`Page ${i + 1} structure:`, {
              hasExtract: !!pageData.extract,
              hasMaterials: !!(pageData.extract && pageData.extract.materials),
              materialsCount: pageData.extract?.materials?.length || 0,
              sourceURL: pageData.metadata?.sourceURL
            });
            
            if (pageData.extract && pageData.extract.materials && Array.isArray(pageData.extract.materials)) {
              console.log(`Found ${pageData.extract.materials.length} materials on page ${i + 1}`);
              
              for (const material of pageData.extract.materials) {
                if (material.name) {
                  const processedMaterial: MaterialData = {
                    name: material.name,
                    description: material.description || '',
                    category: material.category || categorizeFromName(material.name),
                    price: material.price || '',
                    images: Array.isArray(material.images) ? material.images : [],
                    properties: {
                      ...material.properties,
                      sourceUrl: pageData.metadata?.sourceURL || url,
                      pageUrl: pageData.metadata?.sourceURL,
                      extractedAt: new Date().toISOString(),
                      extractedBy: 'firecrawl-crawl'
                    },
                    sourceUrl: pageData.metadata?.sourceURL || url,
                    supplier: extractSupplierFromUrl(url)
                  };
                  
                  allMaterials.push(processedMaterial);
                }
              }
            } else {
              console.log(`Page ${i + 1} has no materials in expected structure. Full extract:`, JSON.stringify(pageData.extract, null, 2));
            }
          }
        } else {
          console.log('No data array found in crawl results. Status data:', JSON.stringify(statusData, null, 2));
        }
        
        console.log(`Crawl extracted ${allMaterials.length} materials from ${statusData.completed} pages`);
        return allMaterials;
        
      } else if (statusData.status === 'failed') {
        throw new Error('Firecrawl crawl failed: ' + (statusData.error || 'Unknown error'));
      }
      
      attempts++;
    }
    
    throw new Error('Crawl timed out after 5 minutes');
    
  } catch (error) {
    console.error('Firecrawl crawl error:', error);
    throw error;
  }

}

function extractMaterialsFromContent(
  content: string,
  sourceUrl: string,
  pageTitle: string,
  images: string[]
): MaterialData[] {
  const materials: MaterialData[] = [];
  
  // Material keywords for detection
  const materialKeywords = [
    'tile', 'tiles', 'ceramic', 'porcelain', 'stone', 'marble', 'granite',
    'wood', 'timber', 'oak', 'pine', 'mahogany', 'bamboo', 'hardwood',
    'fabric', 'textile', 'cotton', 'linen', 'wool', 'silk',
    'metal', 'steel', 'aluminum', 'brass', 'copper', 'iron',
    'glass', 'acrylic', 'plastic', 'vinyl', 'leather',
    'concrete', 'brick', 'laminate', 'veneer', 'composite'
  ];
  
  // Price patterns
  const priceRegex = /[\$£€¥]\s*\d+(?:[.,]\d{2})?(?:\s*-\s*[\$£€¥]\s*\d+(?:[.,]\d{2})?)?/g;
  const dimensionRegex = /\d+\s*(?:x|×)\s*\d+(?:\s*(?:x|×)\s*\d+)?\s*(?:mm|cm|m|inch|in|ft)(?:es)?/gi;
  
  const lines = content.split('\n');
  let currentMaterial: Partial<MaterialData> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lowerLine = line.toLowerCase();
    
    if (!line) continue;
    
    // Detect potential material names
    const hasKeyword = materialKeywords.some(keyword => lowerLine.includes(keyword));
    const isHeading = line.startsWith('#') || line.includes('**') || (line.length < 100 && line.length > 5);
    
    if (hasKeyword && isHeading) {
      // Save previous material
      if (currentMaterial && currentMaterial.name) {
        materials.push(createMaterialFromPartial(currentMaterial, sourceUrl));
      }
      
      // Start new material
      currentMaterial = {
        name: line.replace(/[#*]/g, '').trim(),
        properties: {},
        images: []
      };
      continue;
    }
    
    if (currentMaterial) {
      // Extract price
      const priceMatch = line.match(priceRegex);
      if (priceMatch && !currentMaterial.price) {
        currentMaterial.price = priceMatch[0];
      }
      
      // Extract dimensions
      const dimMatch = line.match(dimensionRegex);
      if (dimMatch && currentMaterial.properties) {
        currentMaterial.properties.dimensions = dimMatch[0];
      }
      
      // Extract description
      if (!currentMaterial.description && line.length > 20 && line.length < 300 && 
          !priceRegex.test(line) && !dimensionRegex.test(line)) {
        currentMaterial.description = line;
      }
      
      // Look for images
      if (line.includes('http') && (line.includes('.jpg') || line.includes('.png') || 
          line.includes('.jpeg') || line.includes('.webp'))) {
        const imageMatch = line.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp)/i);
        if (imageMatch && currentMaterial.images) {
          currentMaterial.images.push(imageMatch[0]);
        }
      }
    }
  }
  
  // Save last material
  if (currentMaterial && currentMaterial.name) {
    materials.push(createMaterialFromPartial(currentMaterial, sourceUrl));
  }
  
  // Add page images to materials without images
  if (images.length > 0) {
    materials.forEach(material => {
      if (material.images.length === 0) {
        material.images.push(images[0]);
      }
    });
  }
  
  return materials;
}

function createMaterialFromPartial(partial: Partial<MaterialData>, sourceUrl: string): MaterialData {
  return {
    name: partial.name || 'Unknown Material',
    description: partial.description || '',
    category: categorizeFromName(partial.name?.toLowerCase() || ''),
    price: partial.price || '',
    images: partial.images || [],
    properties: {
      ...partial.properties,
      sourceUrl,
      extractedAt: new Date().toISOString(),
      extractedBy: 'jina-ai'
    },
    sourceUrl,
    supplier: extractSupplierFromUrl(sourceUrl),
    confidence: 0.8
  };
}

function createComprehensiveMaterial(
  content: string,
  sourceUrl: string,
  pageTitle: string,
  images: string[]
): MaterialData | null {
  if (!content || !pageTitle) return null;

  // Extract key information from content
  const lines = content.split('\n').filter(line => line.trim());
  
  // Extract prices
  const priceRegex = /[\$£€¥]\s*\d+(?:[.,]\d{2})?(?:\s*-\s*[\$£€¥]\s*\d+(?:[.,]\d{2})?)?/g;
  const prices = content.match(priceRegex) || [];
  
  // Extract dimensions
  const dimensionRegex = /\d+\s*(?:x|×)\s*\d+(?:\s*(?:x|×)\s*\d+)?\s*(?:mm|cm|m|inch|in|ft)(?:es)?/gi;
  const dimensions = content.match(dimensionRegex) || [];
  
  // Extract specifications and properties
  const properties: Record<string, any> = {
    sourceUrl,
    extractedAt: new Date().toISOString(),
    extractedBy: 'jina-ai',
    contentLength: content.length,
    pageTitle
  };
  
  // Add found dimensions
  if (dimensions.length > 0) {
    properties.dimensions = dimensions;
  }
  
  // Add found prices
  if (prices.length > 0) {
    properties.pricesFound = prices;
  }
  
  // Look for technical specs, materials, colors, etc.
  const specPatterns = [
    /(?:material|made of|composition):\s*([^\n.,]+)/gi,
    /(?:color|colour):\s*([^\n.,]+)/gi,
    /(?:finish|surface):\s*([^\n.,]+)/gi,
    /(?:thickness|depth):\s*([^\n.,]+)/gi,
    /(?:weight):\s*([^\n.,]+)/gi,
    /(?:warranty):\s*([^\n.,]+)/gi
  ];
  
  specPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const parts = match.split(':');
        if (parts.length === 2) {
          const key = parts[0].trim().toLowerCase();
          const value = parts[1].trim();
          properties[key] = value;
        }
      });
    }
  });
  
  // Create description from first few meaningful paragraphs
  const meaningfulLines = lines.filter(line => 
    line.length > 30 && 
    line.length < 400 && 
    !line.startsWith('#') &&
    !line.includes('http') &&
    !/^\d+\.\s/.test(line) && // Skip numbered lists
    !line.includes('©') &&
    !line.includes('cookie') &&
    !line.toLowerCase().includes('privacy')
  );
  
  const description = meaningfulLines.slice(0, 3).join(' ').substring(0, 500);
  
  // Determine category from title and content
  const category = categorizeFromContent(pageTitle + ' ' + content);
  
  return {
    name: cleanTitle(pageTitle),
    description: description || 'Material information extracted from web page',
    category,
    price: prices[0] || '',
    images: images.slice(0, 10), // Limit to first 10 images
    properties,
    sourceUrl,
    supplier: extractSupplierFromUrl(sourceUrl),
    confidence: 0.9
  };
}

function cleanTitle(title: string): string {
  // Remove common website suffixes and clean up the title
  return title
    .replace(/\s*[\|\-]\s*.+$/, '') // Remove everything after | or -
    .replace(/\s*\(\d+\).*$/, '') // Remove page numbers in parentheses
    .replace(/\s*(Home|Shop|Store|Buy|Products?).*$/i, '') // Remove common navigation terms
    .trim() || 'Web Page Material';
}

function categorizeFromContent(fullText: string): string {
  const text = fullText.toLowerCase();
  
  const categoryKeywords = {
    'Ceramics': ['ceramic', 'porcelain', 'tile', 'tiles', 'pottery', 'earthenware'],
    'Stone': ['marble', 'granite', 'limestone', 'travertine', 'slate', 'quartzite', 'stone', 'natural stone'],
    'Wood': ['wood', 'timber', 'hardwood', 'softwood', 'oak', 'pine', 'maple', 'cherry', 'walnut', 'bamboo', 'plywood', 'lumber'],
    'Metal': ['steel', 'aluminum', 'aluminium', 'brass', 'copper', 'iron', 'stainless', 'metal', 'alloy'],
    'Glass': ['glass', 'tempered glass', 'laminated glass', 'frosted glass', 'mirror'],
    'Textiles': ['fabric', 'textile', 'cotton', 'linen', 'wool', 'silk', 'polyester', 'upholstery'],
    'Plastics': ['plastic', 'vinyl', 'acrylic', 'polycarbonate', 'pvc', 'polymer'],
    'Concrete': ['concrete', 'cement', 'mortar', 'grout'],
    'Composites': ['composite', 'fiberglass', 'carbon fiber', 'laminate'],
    'Rubber': ['rubber', 'silicone', 'elastomer']
  };
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'Other';
}

function categorizeFromName(name: string): string {
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
    'tile': 'Ceramics',
    'tiles': 'Ceramics',
    'ceramic': 'Ceramics',
    'porcelain': 'Ceramics',
    'glass': 'Glass',
    'plastic': 'Plastics',
    'vinyl': 'Plastics'
  };
  
  for (const [key, value] of Object.entries(categoryMap)) {
    if (name.includes(key)) {
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