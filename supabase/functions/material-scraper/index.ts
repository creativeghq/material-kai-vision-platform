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
      maxDepth: options.maxDepth || 3  // Increased default to 3
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
          console.log(`Processing page: ${page.url}`);
          const extractedMaterials = extractMaterialsFromMarkdown(page.markdown, page.url || url);
          materials.push(...extractedMaterials);
          
          if (materials.length >= 100) break; // Limit total results
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

function extractMaterialsFromMarkdown(markdown: string, pageUrl: string): MaterialData[] {
  const materials: MaterialData[] = [];
  const lines = markdown.split('\n');
  
  // Material indicators
  const materialKeywords = [
    'tile', 'tiles', 'ceramic', 'porcelain', 'stone', 'marble', 'granite',
    'wood', 'timber', 'oak', 'pine', 'mahogany', 'bamboo',
    'fabric', 'textile', 'cotton', 'linen', 'wool', 'silk',
    'metal', 'steel', 'aluminum', 'brass', 'copper', 'iron',
    'glass', 'acrylic', 'plastic', 'vinyl', 'leather',
    'concrete', 'brick', 'laminate', 'veneer', 'composite'
  ];
  
  // Price patterns
  const priceRegex = /[\$£€¥]\s*\d+(?:[.,]\d{2})?(?:\s*-\s*[\$£€¥]\s*\d+(?:[.,]\d{2})?)?/;
  const priceRegex2 = /\d+(?:[.,]\d{2})?\s*(?:USD|EUR|GBP|dollars?|euros?|pounds?)/i;
  
  // Dimension patterns
  const dimensionRegex = /\d+\s*(?:x|×)\s*\d+(?:\s*(?:x|×)\s*\d+)?\s*(?:mm|cm|m|inch|in|ft|feet)(?:es)?/i;
  
  let currentProduct: Partial<MaterialData> | null = null;
  let isInProductSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lowerLine = line.toLowerCase();
    
    // Skip empty lines and navigation
    if (!line || lowerLine.includes('menu') || lowerLine.includes('navigation') || 
        lowerLine.includes('footer') || lowerLine.includes('header')) {
      continue;
    }
    
    // Detect product headings (usually with # or ##)
    if (line.startsWith('#') && materialKeywords.some(keyword => lowerLine.includes(keyword))) {
      // Save previous product if exists
      if (currentProduct && currentProduct.name) {
        materials.push(createMaterialFromPartial(currentProduct, pageUrl));
      }
      
      // Start new product
      currentProduct = {
        name: line.replace(/^#+\s*/, '').trim(),
        properties: {},
        images: []
      };
      isInProductSection = true;
      continue;
    }
    
    // Detect product names in regular text
    if (!currentProduct && materialKeywords.some(keyword => lowerLine.includes(keyword))) {
      // Look for potential product names
      if (line.length > 5 && line.length < 150 && 
          !lowerLine.includes('http') && !lowerLine.includes('www.')) {
        currentProduct = {
          name: line.trim(),
          properties: {},
          images: []
        };
        isInProductSection = true;
        continue;
      }
    }
    
    if (currentProduct && isInProductSection) {
      // Extract price
      if (priceRegex.test(line) || priceRegex2.test(line)) {
        const priceMatch = line.match(priceRegex) || line.match(priceRegex2);
        if (priceMatch) {
          currentProduct.price = priceMatch[0];
        }
      }
      
      // Extract dimensions
      if (dimensionRegex.test(line)) {
        const dimMatch = line.match(dimensionRegex);
        if (dimMatch && currentProduct.properties) {
          currentProduct.properties.dimensions = dimMatch[0];
        }
      }
      
      // Extract color information
      const colorKeywords = ['white', 'black', 'brown', 'grey', 'gray', 'beige', 'cream', 'natural', 'dark', 'light'];
      if (colorKeywords.some(color => lowerLine.includes(color))) {
        const colorMatch = colorKeywords.find(color => lowerLine.includes(color));
        if (colorMatch && currentProduct.properties) {
          currentProduct.properties.color = colorMatch;
        }
      }
      
      // Extract finish information
      const finishKeywords = ['matte', 'gloss', 'satin', 'polished', 'textured', 'smooth', 'rough', 'brushed'];
      if (finishKeywords.some(finish => lowerLine.includes(finish))) {
        const finishMatch = finishKeywords.find(finish => lowerLine.includes(finish));
        if (finishMatch && currentProduct.properties) {
          currentProduct.properties.finish = finishMatch;
        }
      }
      
      // Look for description
      if (!currentProduct.description && line.length > 20 && line.length < 300 &&
          !priceRegex.test(line) && !dimensionRegex.test(line)) {
        currentProduct.description = line;
      }
      
      // Look for image URLs
      if (line.includes('.jpg') || line.includes('.png') || line.includes('.jpeg') || line.includes('.webp')) {
        const imageMatch = line.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp)/i);
        if (imageMatch && currentProduct.images) {
          currentProduct.images.push(imageMatch[0]);
        }
      }
      
      // End product section if we hit another heading or empty lines
      if (line.startsWith('#') || (line === '' && lines[i + 1] === '')) {
        if (currentProduct.name) {
          materials.push(createMaterialFromPartial(currentProduct, pageUrl));
        }
        currentProduct = null;
        isInProductSection = false;
      }
    }
  }
  
  // Save last product
  if (currentProduct && currentProduct.name) {
    materials.push(createMaterialFromPartial(currentProduct, pageUrl));
  }
  
  console.log(`Extracted ${materials.length} materials from page: ${pageUrl}`);
  return materials;
}

function createMaterialFromPartial(partial: Partial<MaterialData>, pageUrl: string): MaterialData {
  return {
    name: partial.name || 'Unknown Material',
    description: partial.description || '',
    category: categorizeEffect(partial.name?.toLowerCase() || ''),
    price: partial.price || '',
    images: partial.images || [],
    properties: {
      ...partial.properties,
      sourceUrl: pageUrl,
      extractedAt: new Date().toISOString()
    },
    sourceUrl: pageUrl,
    supplier: extractSupplierFromUrl(pageUrl)
  };
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