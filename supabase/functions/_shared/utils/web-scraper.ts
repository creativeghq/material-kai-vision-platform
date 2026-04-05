/**
 * Shared Web Scraper Utility
 * Wraps Firecrawl API for URL scraping — used by B2B tools and Inspiration URL tool
 */

export interface ScrapeResult {
  success: boolean;
  markdown: string;
  images: string[];
  metadata: {
    title?: string;
    description?: string;
    ogImage?: string;
    [key: string]: any;
  };
  error?: string;
}

/**
 * Scrape a URL using Firecrawl API and return clean markdown + metadata
 */
export async function scrapeUrl(url: string, timeoutMs = 30000): Promise<ScrapeResult> {
  const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
  if (!FIRECRAWL_API_KEY) {
    return {
      success: false,
      markdown: '',
      images: [],
      metadata: {},
      error: 'FIRECRAWL_API_KEY not configured',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl API error: ${response.status} - ${errorText}`);
      return {
        success: false,
        markdown: '',
        images: [],
        metadata: {},
        error: `Firecrawl API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const markdown = data.data?.markdown || '';
    const metadata = data.data?.metadata || {};

    // Extract image URLs from markdown content
    const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    const images: string[] = [];
    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
      images.push(match[1]);
    }

    // Also include og:image if present
    if (metadata.ogImage) {
      images.unshift(metadata.ogImage);
    }

    return {
      success: true,
      markdown,
      images: [...new Set(images)], // deduplicate
      metadata: {
        title: metadata.title,
        description: metadata.description,
        ogImage: metadata.ogImage,
        ...metadata,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        markdown: '',
        images: [],
        metadata: {},
        error: `Scrape timeout after ${timeoutMs / 1000}s`,
      };
    }
    return {
      success: false,
      markdown: '',
      images: [],
      metadata: {},
      error: error instanceof Error ? error.message : 'Scrape failed',
    };
  }
}
