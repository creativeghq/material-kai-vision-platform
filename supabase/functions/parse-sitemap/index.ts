import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const { sitemapUrl, maxPages = 100 } = await req.json();

    if (!sitemapUrl) {
      return new Response(
        JSON.stringify({ error: 'Sitemap URL is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log(`Parsing sitemap: ${sitemapUrl}`);

    // Fetch the sitemap directly from the server
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Material-Scraper/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status} ${response.statusText}`);
    }

    const sitemapContent = await response.text();

    // Simple XML parsing without DOMParser (which isn't available in Deno)
    let urls: string[] = [];

    // Extract URLs using regex patterns
    const locMatches = sitemapContent.match(/<loc[^>]*>(.*?)<\/loc>/gi);

    if (locMatches) {
      for (const locMatch of locMatches) {
        // Extract the URL from between the tags
        const urlMatch = locMatch.match(/<loc[^>]*>(.*?)<\/loc>/i);
        if (urlMatch && urlMatch[1]) {
          const url = urlMatch[1].trim();
          // Decode HTML entities
          const decodedUrl = url
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

          if (decodedUrl.length > 0) {
            urls.push(decodedUrl);
          }
        }
      }
    }

    // If no URLs found with standard format, try to find sitemap references
    if (urls.length === 0) {
      const sitemapMatches = sitemapContent.match(/<sitemap[^>]*>.*?<\/sitemap>/gis);
      if (sitemapMatches) {
        for (const sitemapMatch of sitemapMatches) {
          const locMatch = sitemapMatch.match(/<loc[^>]*>(.*?)<\/loc>/i);
          if (locMatch && locMatch[1]) {
            const url = locMatch[1].trim();
            const decodedUrl = url
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");

            if (decodedUrl.length > 0) {
              urls.push(decodedUrl);
            }
          }
        }
      }
    }

    // Apply limit
    urls = urls.slice(0, maxPages);

    console.log(`Found ${urls.length} URLs in sitemap`);

    if (urls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No URLs found in sitemap' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        urls,
        count: urls.length,
        success: true,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );

  } catch (error) {
    console.error('Error parsing sitemap:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to parse sitemap',
        success: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
