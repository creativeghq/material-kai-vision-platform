import React from 'react';
import { Globe, MousePointer, FileText, Search, Map } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type ScrapingMode = 'single-page' | 'sitemap' | 'crawl' | 'search' | 'map';

interface Step1SourceInputProps {
  scrapingMode: ScrapingMode;
  onScrapingModeChange: (mode: ScrapingMode) => void;
  url: string;
  onUrlChange: (url: string) => void;
  sitemapUrl: string;
  onSitemapUrlChange: (url: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  maxPages: number;
  onMaxPagesChange: (pages: number) => void;
  concurrentPages: number;
  onConcurrentPagesChange: (pages: number) => void;
}

const SCRAPING_MODES = [
  {
    id: 'single-page' as ScrapingMode,
    icon: MousePointer,
    title: 'Single Page',
    description: 'Scrape a single product page or specific URL',
    useCase: 'Perfect for testing extraction on one page',
  },
  {
    id: 'sitemap' as ScrapingMode,
    icon: Globe,
    title: 'Sitemap',
    description: 'Scrape pages from a sitemap.xml file',
    useCase: 'Most efficient when sitemap is available',
  },
  {
    id: 'crawl' as ScrapingMode,
    icon: FileText,
    title: 'Crawl',
    description: 'Automatically discover and scrape all pages',
    useCase: 'Discover product pages automatically',
  },
  {
    id: 'search' as ScrapingMode,
    icon: Search,
    title: 'Search',
    description: 'Find and scrape pages via search queries',
    useCase: 'Find relevant pages across the web',
  },
  {
    id: 'map' as ScrapingMode,
    icon: Map,
    title: 'Map',
    description: 'Get a complete list of URLs from a website',
    useCase: 'Fast URL discovery without content extraction',
  },
];

export const Step1SourceInput: React.FC<Step1SourceInputProps> = ({
  scrapingMode,
  onScrapingModeChange,
  url,
  onUrlChange,
  sitemapUrl,
  onSitemapUrlChange,
  searchQuery,
  onSearchQueryChange,
  maxPages,
  onMaxPagesChange,
  concurrentPages,
  onConcurrentPagesChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Scraping Mode</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose how you want to scrape the website
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {SCRAPING_MODES.map((mode) => {
              const Icon = mode.icon;
              const isSelected = scrapingMode === mode.id;

              return (
                <button
                  key={mode.id}
                  onClick={() => onScrapingModeChange(mode.id)}
                  className={cn(
                    'p-4 border rounded-lg text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-muted hover:border-muted-foreground/50 hover:bg-accent/5'
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="font-medium">{mode.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{mode.description}</p>
                  <p className="text-xs text-primary/70 italic">{mode.useCase}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* URL/Query Input */}
      <Card>
        <CardHeader>
          <CardTitle>
            {scrapingMode === 'search' ? 'Search Query' : 'Website URL'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scrapingMode === 'single-page' && (
            <div>
              <Label htmlFor="page-url">Page URL</Label>
              <Input
                id="page-url"
                type="url"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://example.com/product-page"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Enter the URL of the page you want to scrape
              </p>
            </div>
          )}

          {scrapingMode === 'sitemap' && (
            <>
              <div>
                <Label htmlFor="sitemap-url">Sitemap URL</Label>
                <Input
                  id="sitemap-url"
                  type="url"
                  value={sitemapUrl}
                  onChange={(e) => onSitemapUrlChange(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the XML sitemap URL to scrape pages from
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="max-pages">Maximum Pages</Label>
                  <Input
                    id="max-pages"
                    type="number"
                    value={maxPages}
                    onChange={(e) => onMaxPagesChange(parseInt(e.target.value) || 100)}
                    min="1"
                    max="1000"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="concurrent-pages">Concurrent Pages</Label>
                  <Input
                    id="concurrent-pages"
                    type="number"
                    value={concurrentPages}
                    onChange={(e) => onConcurrentPagesChange(parseInt(e.target.value) || 5)}
                    min="1"
                    max="20"
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}

          {scrapingMode === 'crawl' && (
            <>
              <div>
                <Label htmlFor="crawl-url">Website URL</Label>
                <Input
                  id="crawl-url"
                  type="url"
                  value={url}
                  onChange={(e) => onUrlChange(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the website URL to crawl all accessible subpages
                </p>
              </div>
              <div>
                <Label htmlFor="crawl-limit">Page Limit</Label>
                <Input
                  id="crawl-limit"
                  type="number"
                  value={maxPages}
                  onChange={(e) => onMaxPagesChange(parseInt(e.target.value) || 100)}
                  min="1"
                  max="1000"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Maximum number of pages to crawl
                </p>
              </div>
            </>
          )}

          {scrapingMode === 'search' && (
            <div>
              <Label htmlFor="search-query">Search Query</Label>
              <Input
                id="search-query"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="material suppliers ceramic tiles"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Enter search terms to find and scrape relevant web pages
              </p>
            </div>
          )}

          {scrapingMode === 'map' && (
            <div>
              <Label htmlFor="map-url">Website URL</Label>
              <Input
                id="map-url"
                type="url"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://example.com"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Get a complete list of URLs from this website
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

