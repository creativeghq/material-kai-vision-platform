import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { sitemapUrl, maxPages = 100 } = await req.json();

    if (!sitemapUrl) {
      return new Response(
        JSON.stringify({ error: 'Sitemap URL is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Parsing sitemap: ${sitemapUrl}`);

    // Fetch the sitemap directly from the server
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Material-Scraper/1.0)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }
    
    const sitemapContent = await response.text();
    
    // Parse XML to extract URLs
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sitemapContent, 'text/xml');
    
    // Check for XML parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('Invalid XML format in sitemap');
    }
    
    // Handle different sitemap formats
    let urls: string[] = [];
    
    // Standard sitemap format
    const urlElements = xmlDoc.getElementsByTagName('url');
    for (let i = 0; i < urlElements.length; i++) {
      const locElement = urlElements[i].getElementsByTagName('loc')[0];
      if (locElement && locElement.textContent) {
        urls.push(locElement.textContent.trim());
      }
    }
    
    // If no URLs found, try alternate format (sitemap index or simple loc tags)
    if (urls.length === 0) {
      const locElements = xmlDoc.getElementsByTagName('loc');
      for (let i = 0; i < locElements.length; i++) {
        if (locElements[i].textContent) {
          urls.push(locElements[i].textContent.trim());
        }
      }
    }
    
    // If still no URLs, try to find sitemap references in sitemap index
    if (urls.length === 0) {
      const sitemapElements = xmlDoc.getElementsByTagName('sitemap');
      for (let i = 0; i < sitemapElements.length; i++) {
        const locElement = sitemapElements[i].getElementsByTagName('loc')[0];
        if (locElement && locElement.textContent) {
          urls.push(locElement.textContent.trim());
        }
      }
    }
    
    // Filter out empty URLs and apply limit
    urls = urls.filter(url => url.length > 0).slice(0, maxPages);
    
    console.log(`Found ${urls.length} URLs in sitemap`);
    
    if (urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No URLs found in sitemap' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        urls,
        count: urls.length,
        success: true 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error parsing sitemap:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to parse sitemap',
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});