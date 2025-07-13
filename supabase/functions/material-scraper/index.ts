import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ScrapeRequest {
  url: string;
  service: 'firecrawl' | 'jina';
  sitemapMode?: boolean;
  batchSize?: number;
  maxPages?: number;
  saveTemporary?: boolean;
  sessionId?: string;
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
    // Firecrawl-specific targeting options
    includeTags?: string[];
    excludeTags?: string[];
    onlyMainContent?: boolean;
    waitFor?: number;
    actions?: Array<{
      type: string;
      milliseconds?: number;
      selector?: string;
    }>;
    location?: {
      country?: string;
      languages?: string[];
    };
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

Deno.serve(async (req) => {
  console.log(`Material scraper function called - Method: ${req.method}, URL: ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  if (req.method !== 'POST') {
    console.log(`Invalid method: ${req.method}`);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Add timeout and better error handling
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Function timeout after 4 minutes')), 240000)
    );

    const processPromise = async () => {
      const requestData = await req.json();
      const { 
        url, 
        service, 
        sitemapMode = false, 
        batchSize = 5,
        maxPages = 100,
        saveTemporary = false,
        sessionId: providedSessionId,
        options = {} 
      }: ScrapeRequest = requestData;
      
      console.log(`Processing: ${service}, sitemap: ${sitemapMode}, url: ${url}`);
      console.log(`Batch size: ${batchSize}, Max pages: ${maxPages}, Save temporary: ${saveTemporary}`);
      
      // Validate inputs
      if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL provided');
      }
      
      if (!['jina', 'firecrawl'].includes(service)) {
        throw new Error('Invalid service provided. Must be "jina" or "firecrawl"');
      }
      
      let materials: MaterialData[] = [];
      let sessionId: string | null = null;
      
      if (sitemapMode) {
        // Progressive sitemap processing - start background job
        sessionId = await startProgressiveSitemapProcessing(url, service, {
          ...options,
          batchSize,
          maxPages
        }, req);
        
        // Return immediately with session ID for tracking
        return {
          success: true,
          data: [],
          totalProcessed: 0,
          service: service,
          sessionId: sessionId,
          message: "Progressive scraping started. Check the review tab to see results as they complete.",
          progressive: true
        };
      } else {
        // Single page processing
        if (service === 'jina') {
          materials = await extractWithJinaSimple(url, options);
        } else {
          materials = await extractWithFirecrawlSimple(url, options);
        }
      }
      
      console.log(`Extracted ${materials.length} materials`);
      
      // Save to temporary storage if requested (for single page only)
      if (saveTemporary && materials.length > 0 && !sitemapMode) {
        try {
          sessionId = await saveToTemporaryStorage(req, materials);
          console.log(`Saved to temporary storage with session ID: ${sessionId}`);
        } catch (saveError) {
          console.error('Warning: Failed to save to temporary storage:', saveError.message);
          // Continue without saving - don't fail the entire operation
        }
      }

      return {
        success: true,
        data: materials,
        totalProcessed: materials.length,
        service: service,
        sessionId: sessionId,
        savedTemporary: saveTemporary && sessionId !== null,
        progressive: false
      };
    };

    const result = await Promise.race([processPromise(), timeoutPromise]);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in material scraper:', error);
    
    // Return more detailed error information
    const errorResponse = {
      success: false,
      error: error.message || 'Unknown error occurred',
      details: error.stack ? error.stack.substring(0, 500) : 'No stack trace available',
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Progressive sitemap processing - runs in background
async function startProgressiveSitemapProcessing(
  sitemapUrl: string, 
  service: 'firecrawl' | 'jina', 
  options: any,
  req: Request
): Promise<string> {
  console.log('Starting progressive sitemap processing for:', sitemapUrl);
  
  // Generate session ID for tracking
  const sessionId = crypto.randomUUID();
  
  // Start background processing using EdgeRuntime.waitUntil for proper background handling
  EdgeRuntime.waitUntil(
    processProgressiveSitemap(sessionId, sitemapUrl, service, options, req).catch(error => {
      console.error('Progressive processing error:', error);
    })
  );
  
  return sessionId;
}

async function processProgressiveSitemap(
  sessionId: string,
  sitemapUrl: string, 
  service: 'firecrawl' | 'jina', 
  options: any,
  req: Request
): Promise<void> {
  console.log(`[${sessionId}] Starting progressive processing`);
  
  try {
    // Get auth info from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header found');
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Extract user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Authentication failed');
    }
    
    // Fetch and parse sitemap
    const urls = await parseSitemapSimple(sitemapUrl, options);
    console.log(`[${sessionId}] Found ${urls.length} URLs in sitemap`);
    
    if (urls.length === 0) {
      console.log(`[${sessionId}] No URLs found in sitemap`);
      return;
    }
    
    const maxUrls = Math.min(urls.length, options.maxPages || 100);
    const urlsToProcess = urls.slice(0, maxUrls);
    
    console.log(`[${sessionId}] Processing ${urlsToProcess.length} URLs progressively`);
    
    let processedCount = 0;
    let successCount = 0;
    
    // Process URLs one by one
    for (let i = 0; i < urlsToProcess.length; i++) {
      const url = urlsToProcess[i];
      const globalIndex = i + 1;
      
      console.log(`[${sessionId}][${globalIndex}/${urlsToProcess.length}] Processing: ${url}`);
      
      try {
        const results = service === 'jina' 
          ? await extractWithJinaSimple(url, options)
          : await extractWithFirecrawlSimple(url, options);
        
        processedCount++;
        
        if (results && results.length > 0) {
          console.log(`[${sessionId}][${globalIndex}] SUCCESS: Found ${results.length} materials`);
          successCount++;
          
          // Save each result immediately to the database with duplicate check
          for (const material of results) {
            try {
              // Check if this material URL has already been scraped for this user
              const { data: existingMaterial } = await supabase
                .from('scraped_materials_temp')
                .select('id')
                .eq('user_id', user.id)
                .eq('source_url', material.sourceUrl)
                .limit(1);

              if (existingMaterial && existingMaterial.length > 0) {
                console.log(`[${sessionId}][${globalIndex}] DUPLICATE: Skipping already scraped URL: ${material.sourceUrl}`);
                continue;
              }

              const { error: insertError } = await supabase
                .from('scraped_materials_temp')
                .insert({
                  user_id: user.id,
                  scraping_session_id: sessionId,
                  source_url: material.sourceUrl,
                  material_data: material,
                  reviewed: false,
                  approved: null,
                  scraped_at: new Date().toISOString()
                });
              
              if (insertError) {
                console.error(`[${sessionId}][${globalIndex}] Database insert error:`, insertError);
              } else {
                console.log(`[${sessionId}][${globalIndex}] Saved material: ${material.name}`);
              }
            } catch (dbError) {
              console.error(`[${sessionId}][${globalIndex}] Database error:`, dbError);
            }
          }
        } else {
          console.log(`[${sessionId}][${globalIndex}] No materials found on this page`);
        }
        
      } catch (error) {
        console.error(`[${sessionId}][${globalIndex}] ERROR processing ${url}:`, error.message);
        processedCount++;
      }
      
      // Small delay between requests to be respectful
      if (i < urlsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`[${sessionId}] Progressive processing complete:`);
    console.log(`[${sessionId}] - URLs found: ${urls.length}`);
    console.log(`[${sessionId}] - URLs processed: ${processedCount}`);
    console.log(`[${sessionId}] - Successful extractions: ${successCount}`);
    
    // Save completion summary
    const summaryMaterial: MaterialData = {
      name: `Progressive Scraping Complete - Session ${sessionId}`,
      description: `Completed progressive scraping of ${processedCount} URLs from sitemap. Found materials on ${successCount} pages. All results have been saved to the review system.`,
      category: 'System Summary',
      price: '',
      images: [],
      properties: {
        sessionId: sessionId,
        totalUrlsFound: urls.length,
        urlsProcessed: processedCount,
        successfulExtractions: successCount,
        service: service,
        completedAt: new Date().toISOString(),
        progressiveMode: true
      },
      sourceUrl: sitemapUrl,
      supplier: 'System'
    };
    
    await supabase
      .from('scraped_materials_temp')
      .insert({
        user_id: user.id,
        scraping_session_id: sessionId,
        source_url: sitemapUrl,
        material_data: summaryMaterial,
        reviewed: false,
        approved: null,
        scraped_at: new Date().toISOString()
      });
    
  } catch (error) {
    console.error(`[${sessionId}] Progressive processing failed:`, error);
  }
}

async function processSitemapEnhanced(sitemapUrl: string, service: 'firecrawl' | 'jina', options: any): Promise<MaterialData[]> {
  console.log('Processing sitemap with enhanced options:', sitemapUrl);
  console.log('Enhanced options:', JSON.stringify(options, null, 2));
  
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
    
    // Use configurable parameters
    const batchSize = options.batchSize || 5;
    const maxUrls = Math.min(urls.length, options.maxPages || 100);
    const urlsToProcess = urls.slice(0, maxUrls);
    
    console.log(`Processing ${urlsToProcess.length} URLs in batches of ${batchSize} (max: ${options.maxPages || 100})`);
    
    const allMaterials: MaterialData[] = [];
    let processedCount = 0;
    let successCount = 0;
    
    // Process URLs in batches
    for (let i = 0; i < urlsToProcess.length; i += batchSize) {
      const batch = urlsToProcess.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urlsToProcess.length/batchSize)}: ${batch.length} URLs`);
      
      // Process batch in parallel for better performance
      const batchPromises = batch.map(async (url, batchIndex) => {
        const globalIndex = i + batchIndex + 1;
        console.log(`[${globalIndex}/${urlsToProcess.length}] Processing: ${url}`);
        
        try {
          const results = service === 'jina' 
            ? await extractWithJinaSimple(url, options)
            : await extractWithFirecrawlSimple(url, options);
          
          processedCount++;
          
          if (results && results.length > 0) {
            console.log(`[${globalIndex}] SUCCESS: Found ${results.length} materials`);
            successCount++;
            return results;
          } else {
            console.log(`[${globalIndex}] No materials found on this page`);
            return [];
          }
          
        } catch (error) {
          console.error(`[${globalIndex}] ERROR processing ${url}:`, error.message);
          processedCount++;
          return [];
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Flatten and add to all materials
      for (const results of batchResults) {
        if (results.length > 0) {
          allMaterials.push(...results);
        }
      }
      
      console.log(`Batch complete. Total materials so far: ${allMaterials.length}`);
      
      // Small delay between batches to be respectful to the server
      if (i + batchSize < urlsToProcess.length) {
        const delayMs = Math.max(1000, batchSize * 500); // Adaptive delay
        console.log(`Waiting ${delayMs}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    console.log(`Enhanced sitemap processing complete:`);
    console.log(`- URLs found: ${urls.length}`);
    console.log(`- URLs processed: ${processedCount}`);
    console.log(`- Successful extractions: ${successCount}`);
    console.log(`- Materials extracted: ${allMaterials.length}`);
    
    // Add comprehensive summary
    allMaterials.unshift({
      name: `Enhanced Sitemap Processing Summary`,
      description: `Successfully extracted ${allMaterials.length} materials from ${successCount} successful pages out of ${processedCount} processed URLs. Total of ${urls.length} URLs found in sitemap.`,
      category: 'System Summary',
      price: '',
      images: [],
      properties: {
        totalUrlsFound: urls.length,
        urlsProcessed: processedCount,
        successfulExtractions: successCount,
        materialsFound: allMaterials.length - 1, // Exclude this summary
        service: service,
        batchSize: batchSize,
        maxPages: options.maxPages || 100,
        successRate: `${Math.round((successCount / processedCount) * 100)}%`
      },
      sourceUrl: sitemapUrl,
      supplier: 'System'
    });
    
    return allMaterials;
    
  } catch (error) {
    console.error('Enhanced sitemap processing error:', error);
    throw new Error(`Failed to process sitemap: ${error.message}`);
  }
}

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
    
    // Process URLs in batches to prevent timeout
    const batchSize = 5;
    const maxUrls = Math.min(urls.length, 20); // Limit to 20 URLs max for performance
    const urlsToProcess = urls.slice(0, maxUrls);
    
    console.log(`Processing ${urlsToProcess.length} URLs in batches of ${batchSize}`);
    
    const allMaterials: MaterialData[] = [];
    let processedCount = 0;
    
    // Process URLs in batches
    for (let i = 0; i < urlsToProcess.length; i += batchSize) {
      const batch = urlsToProcess.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urlsToProcess.length/batchSize)}: ${batch.length} URLs`);
      
      // Process batch in parallel for better performance
      const batchPromises = batch.map(async (url, batchIndex) => {
        const globalIndex = i + batchIndex + 1;
        console.log(`[${globalIndex}/${urlsToProcess.length}] Processing: ${url}`);
        
        try {
          const results = service === 'jina' 
            ? await extractWithJinaSimple(url, options)
            : await extractWithFirecrawlSimple(url, options);
          
          processedCount++;
          
          if (results && results.length > 0) {
            console.log(`[${globalIndex}] SUCCESS: Found ${results.length} materials`);
            return results;
          } else {
            console.log(`[${globalIndex}] No materials found on this page`);
            return [];
          }
          
        } catch (error) {
          console.error(`[${globalIndex}] ERROR processing ${url}:`, error.message);
          return [];
        }
      });
      
      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Flatten and add to all materials
      for (const results of batchResults) {
        if (results.length > 0) {
          allMaterials.push(...results);
        }
      }
      
      console.log(`Batch complete. Total materials so far: ${allMaterials.length}`);
      
      // Small delay between batches to be respectful to the server
      if (i + batchSize < urlsToProcess.length) {
        console.log('Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`Sitemap processing complete:`);
    console.log(`- URLs found: ${urls.length}`);
    console.log(`- URLs processed: ${processedCount}`);
    console.log(`- Materials extracted: ${allMaterials.length}`);
    
    // Add summary if we have materials
    if (allMaterials.length > 0) {
      allMaterials.unshift({
        name: `Sitemap Processing Summary`,
        description: `Successfully extracted ${allMaterials.length} materials from ${processedCount} pages out of ${urls.length} total URLs found in sitemap.`,
        category: 'System Summary',
        price: '',
        images: [],
        properties: {
          totalUrlsFound: urls.length,
          urlsProcessed: processedCount,
          materialsFound: allMaterials.length - 1, // Exclude this summary
          service: service,
          batchSize: batchSize
        },
        sourceUrl: sitemapUrl,
        supplier: 'System'
      });
    } else {
      // If no materials found, return explanatory note
      allMaterials.push({
        name: `No Materials Extracted`,
        description: `Processed ${processedCount} URLs from sitemap but no materials were successfully extracted. This could mean:
        
• The pages don't contain product/material information
• The extraction prompt/selectors need adjustment
• The pages require different scraping parameters
• The content is dynamically loaded and needs wait time

Try adjusting the CSS selectors or extraction prompt for better results.`,
        category: 'System Note',
        price: '',
        images: [],
        properties: {
          totalUrlsFound: urls.length,
          urlsProcessed: processedCount,
          materialsFound: 0,
          service: service,
          suggestions: [
            'Try more specific CSS selectors',
            'Adjust the extraction prompt',
            'Increase wait time for dynamic content',
            'Check if pages require authentication'
          ]
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
    console.error('JINA_API_KEY not configured');
    return [];
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
    return [];
  }
}

async function extractWithFirecrawlSimple(url: string, options: any): Promise<MaterialData[]> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    console.error('FIRECRAWL_API_KEY not configured');
    return [];
  }

  console.log('Using Firecrawl for:', url);
  console.log('Options:', JSON.stringify(options, null, 2));

  try {
    // Build the scrape request with all targeting options
    const scrapeRequest: any = {
      url: url,
      formats: ["markdown", "extract"],
      timeout: 20000,
      onlyMainContent: options.onlyMainContent !== false, // Default to true
      
      // CSS targeting options
      includeTags: options.includeTags || [],
      excludeTags: options.excludeTags || [],
      
      // Wait and action options
      waitFor: options.waitFor || 0,
      actions: options.actions || [],
      
      // Location settings
      location: options.location || { country: "US" },
      
      // Other scraping options
      blockAds: true,
      removeBase64Images: true,
      
      // Extract configuration with custom prompt
      extract: {
        prompt: options.prompt || options.extractionPrompt || 
          "Extract all product/material information from this page. Look for product names, descriptions, prices, specifications, and any material properties. Include building materials, tiles, flooring, fixtures, furniture, or any construction/design products.",
        schema: options.schema || {
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
                  availability: { type: "string", description: "Stock status or availability" },
                  images: { type: "array", items: { type: "string" }, description: "Product image URLs" }
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
    };

    console.log('Firecrawl request:', JSON.stringify(scrapeRequest, null, 2));

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scrapeRequest),
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

async function saveToTemporaryStorage(req: Request, materials: MaterialData[]): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get user ID from request headers
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('No authorization header found');
  }
  
  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  
  if (userError || !userData.user) {
    throw new Error('Invalid user token');
  }
  
  const userId = userData.user.id;
  const sessionId = crypto.randomUUID();
  
  console.log(`Saving ${materials.length} materials for user ${userId} with session ${sessionId}`);
  
  // Prepare data for insertion with duplicate checking
  const insertData = [];
  
  for (const material of materials) {
    // Check if this material URL has already been scraped for this user
    const { data: existingMaterial } = await supabase
      .from('scraped_materials_temp')
      .select('id')
      .eq('user_id', userId)
      .eq('source_url', material.sourceUrl)
      .limit(1);

    if (existingMaterial && existingMaterial.length > 0) {
      console.log(`Duplicate detected: Skipping already scraped URL: ${material.sourceUrl}`);
      continue;
    }

    insertData.push({
      user_id: userId,
      scraping_session_id: sessionId,
      material_data: material,
      source_url: material.sourceUrl
    });
  }
  
  const { error } = await supabase
    .from('scraped_materials_temp')
    .insert(insertData);
  
  if (error) {
    console.error('Error saving to temporary storage:', error);
    throw new Error(`Failed to save materials: ${error.message}`);
  }
  
  console.log(`Successfully saved ${materials.length} materials to temporary storage`);
  return sessionId;
}