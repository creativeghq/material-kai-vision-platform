import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ScrapedMaterialsViewer } from './ScrapedMaterialsViewer';
import { Globe, Loader2, Search, AlertCircle } from 'lucide-react';

interface ScrapedMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  sourceUrl: string;
  supplier?: string;
}

interface ScrapingOptions {
  service: 'firecrawl' | 'jina';
  crawlMode?: boolean; // New option for multi-page crawling
  maxPages?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  // Firecrawl options
  prompt?: string;
  schema?: Record<string, any>;
  // Jina AI options
  extractionPrompt?: string;
  classificationLabels?: string[];
  useSearch?: boolean;
  searchQuery?: string;
  rerank?: boolean;
}

export const MaterialScraperPage = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scrapedMaterials, setScrapedMaterials] = useState<ScrapedMaterial[]>([]);
  const [progress, setProgress] = useState(0);
  const [options, setOptions] = useState<ScrapingOptions>({
    service: 'firecrawl',
    crawlMode: false,
    maxPages: 10,
    includePatterns: ['/product', '/item', '/material'],
    excludePatterns: ['/cart', '/checkout', '/account', '/login'],
    prompt: `Extract material information from this page. Look for:
- Material name
- Price (if available)
- Description
- Images
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`,
    classificationLabels: ['Tiles', 'Stone', 'Wood', 'Metal', 'Fabric', 'Glass', 'Plastic', 'Concrete'],
    useSearch: false,
    searchQuery: '',
    rerank: true
  });

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a URL to scrape",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setScrapedMaterials([]);
    
    try {
      console.log('Starting scrape for:', url);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 2000);

      const { data, error } = await supabase.functions.invoke('material-scraper', {
        body: {
          url,
          service: options.service,
          options
        }
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) {
        console.error('Scraping error:', error);
        throw new Error(error.message || 'Failed to scrape materials');
      }

      if (!data.success) {
        throw new Error(data.error || 'Scraping failed');
      }

      console.log('Scraping completed:', data);
      setScrapedMaterials(data.materials || []);
      
      toast({
        title: "Success",
        description: `Found ${data.materials?.length || 0} materials using ${data.service || options.service}`,
      });

    } catch (error) {
      console.error('Scraping error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to scrape materials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const popularSites = [
    { name: 'Tile Shop', url: 'https://www.tileshop.com', category: 'Tiles' },
    { name: 'Floor & Decor', url: 'https://www.flooranddecor.com', category: 'Flooring' },
    { name: 'Stone Source', url: 'https://www.stonesource.com', category: 'Stone' },
    { name: 'Daltile', url: 'https://www.daltile.com', category: 'Tiles' }
  ];

  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Material Web Scraper</h1>
        <p className="text-muted-foreground mt-2">
          Extract material data from supplier websites and catalogs
        </p>
      </div>

      <Tabs defaultValue="scraper" className="space-y-6">
        <TabsList>
          <TabsTrigger value="scraper">Web Scraper</TabsTrigger>
          <TabsTrigger value="results">Results ({scrapedMaterials.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="scraper" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Website Scraper
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleScrape} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url">Website URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/materials"
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-medium text-sm">Service Selection</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center space-x-2 p-3 border rounded cursor-pointer hover:bg-muted/50">
                      <input
                        type="radio"
                        name="service"
                        value="firecrawl"
                        checked={options.service === 'firecrawl'}
                        onChange={(e) => setOptions(prev => ({ ...prev, service: e.target.value as 'firecrawl' | 'jina' }))}
                        disabled={isLoading}
                      />
                      <div>
                        <span className="font-medium">Firecrawl</span>
                        <p className="text-xs text-muted-foreground">Structured extraction with prompts</p>
                      </div>
                    </label>
                    <label className="flex items-center space-x-2 p-3 border rounded cursor-pointer hover:bg-muted/50">
                      <input
                        type="radio"
                        name="service"
                        value="jina"
                        checked={options.service === 'jina'}
                        onChange={(e) => setOptions(prev => ({ ...prev, service: e.target.value as 'firecrawl' | 'jina' }))}
                        disabled={isLoading}
                      />
                      <div>
                        <span className="font-medium">Jina AI</span>
                        <p className="text-xs text-muted-foreground">Advanced AI with classification</p>
                      </div>
                    </label>
                  </div>
                </div>

                {options.service === 'firecrawl' ? (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h3 className="font-medium text-sm">Firecrawl Configuration</h3>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="crawlMode"
                        checked={options.crawlMode || false}
                        onChange={(e) => setOptions(prev => ({ ...prev, crawlMode: e.target.checked }))}
                        disabled={isLoading}
                      />
                      <Label htmlFor="crawlMode" className="text-sm">Multi-page crawl mode (for pagination)</Label>
                    </div>
                    
                    {options.crawlMode && (
                      <div className="space-y-4 p-3 border rounded bg-background/50">
                        <div className="space-y-2">
                          <Label htmlFor="maxPages">Maximum pages to crawl</Label>
                          <Input
                            id="maxPages"
                            type="number"
                            value={options.maxPages || 10}
                            onChange={(e) => setOptions(prev => ({ ...prev, maxPages: parseInt(e.target.value) || 10 }))}
                            min="1"
                            max="50"
                            disabled={isLoading}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="includePatterns">Include URL patterns (comma-separated)</Label>
                          <Input
                            id="includePatterns"
                            value={options.includePatterns?.join(', ') || ''}
                            onChange={(e) => setOptions(prev => ({ 
                              ...prev, 
                              includePatterns: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                            }))}
                            placeholder="/product, /item, /material"
                            disabled={isLoading}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="excludePatterns">Exclude URL patterns (comma-separated)</Label>
                          <Input
                            id="excludePatterns"
                            value={options.excludePatterns?.join(', ') || ''}
                            onChange={(e) => setOptions(prev => ({ 
                              ...prev, 
                              excludePatterns: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                            }))}
                            placeholder="/cart, /checkout, /account"
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="prompt">Extraction Instructions</Label>
                      <textarea
                        id="prompt"
                        value={options.prompt}
                        onChange={(e) => setOptions(prev => ({ ...prev, prompt: e.target.value }))}
                        placeholder="Tell the AI what to extract from the page..."
                        disabled={isLoading}
                        rows={6}
                        className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOptions(prev => ({ 
                          ...prev, 
                          prompt: `Extract building materials from this page including:
- Product name
- Price (with currency)
- Material type (tiles, stone, wood, etc.)
- Dimensions and specifications
- Color and finish
- Images
- Availability and stock status` 
                        }))}
                        disabled={isLoading}
                      >
                        Building Materials
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOptions(prev => ({ 
                          ...prev, 
                          prompt: `Extract product catalog information:
- Product name and model
- Price and pricing tiers
- Technical specifications
- Images and gallery
- Category and subcategory
- Brand and manufacturer
- Product description` 
                        }))}
                        disabled={isLoading}
                      >
                        Product Catalog
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h3 className="font-medium text-sm">Jina AI Configuration</h3>
                    
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="useSearch"
                          checked={options.useSearch || false}
                          onChange={(e) => setOptions(prev => ({ ...prev, useSearch: e.target.checked }))}
                          disabled={isLoading}
                        />
                        <Label htmlFor="useSearch" className="text-sm">Use web search instead of single page</Label>
                      </div>
                      
                      {options.useSearch && (
                        <div className="space-y-2">
                          <Label htmlFor="searchQuery">Search Query</Label>
                          <Input
                            id="searchQuery"
                            value={options.searchQuery || ''}
                            onChange={(e) => setOptions(prev => ({ ...prev, searchQuery: e.target.value }))}
                            placeholder="e.g., ceramic tiles, marble flooring, wood materials"
                            disabled={isLoading}
                          />
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Label htmlFor="classificationLabels">Classification Labels (comma-separated)</Label>
                        <Input
                          id="classificationLabels"
                          value={options.classificationLabels?.join(', ') || ''}
                          onChange={(e) => setOptions(prev => ({ 
                            ...prev, 
                            classificationLabels: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                          }))}
                          placeholder="Tiles, Stone, Wood, Metal, Fabric, Glass"
                          disabled={isLoading}
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="rerank"
                          checked={options.rerank || false}
                          onChange={(e) => setOptions(prev => ({ ...prev, rerank: e.target.checked }))}
                          disabled={isLoading}
                        />
                        <Label htmlFor="rerank" className="text-sm">Rerank results by relevance</Label>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setOptions(prev => ({ 
                            ...prev,
                            classificationLabels: ['Ceramic Tiles', 'Natural Stone', 'Hardwood', 'Laminate', 'Vinyl', 'Carpet'],
                            searchQuery: 'flooring materials tiles wood stone',
                            useSearch: false,
                            rerank: true
                          }))}
                          disabled={isLoading}
                        >
                          Flooring Focus
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setOptions(prev => ({ 
                            ...prev,
                            classificationLabels: ['Wall Tiles', 'Backsplash', 'Countertops', 'Fixtures', 'Hardware'],
                            searchQuery: 'kitchen bathroom materials tiles countertops',
                            useSearch: false,
                            rerank: true
                          }))}
                          disabled={isLoading}
                        >
                          Kitchen & Bath
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {progress > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Scraping progress</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || !url}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Scraping Materials...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Start Scraping
                    </>
                  )}
                </Button>
              </form>

              <div className="space-y-3">
                <Label>Popular Material Sites</Label>
                <div className="grid grid-cols-2 gap-2">
                  {popularSites.map((site) => (
                    <Button
                      key={site.url}
                      variant="outline"
                      size="sm"
                      onClick={() => setUrl(site.url)}
                      disabled={isLoading}
                      className="justify-start"
                    >
                      <Globe className="mr-2 h-3 w-3" />
                      {site.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium mb-1">Scraping Tips:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Choose between Firecrawl (structured) or Jina AI (intelligent classification)</li>
                      <li>• Firecrawl can crawl multiple pages with pagination support</li>
                      <li>• Jina AI offers advanced search, classification, and relevance ranking</li>
                      <li>• Both services respect robots.txt and rate limits</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          <ScrapedMaterialsViewer 
            materials={scrapedMaterials}
            onMaterialsUpdate={setScrapedMaterials}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};