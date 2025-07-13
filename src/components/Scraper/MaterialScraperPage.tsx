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
import { ScrapedMaterialsReview } from './ScrapedMaterialsReview';
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
  sitemapMode?: boolean;
  crawlMode?: boolean;
  maxPages?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  // Firecrawl options
  prompt?: string;
  schema?: Record<string, any>;
  includeTags?: string[]; // CSS selectors to include
  excludeTags?: string[]; // CSS selectors to exclude
  onlyMainContent?: boolean; // Extract only main content
  waitFor?: number; // Wait time in milliseconds
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
  const [batchSize, setBatchSize] = useState(10);
  const [maxPages, setMaxPages] = useState(100);
  const [saveTemporary, setSaveTemporary] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [options, setOptions] = useState<ScrapingOptions>({
    service: 'firecrawl',
    sitemapMode: false,
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
          sitemapMode: options.sitemapMode,
          batchSize: batchSize,
          maxPages: maxPages,
          saveTemporary: saveTemporary,
          options: {
            ...options,
            service: options.service,
            // Pass Firecrawl targeting options
            includeTags: options.includeTags,
            onlyMainContent: options.onlyMainContent,
            waitFor: options.waitFor
          }
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
      setScrapedMaterials(data.data || []);
      
      // Store sessionId if materials were saved temporarily
      if (data.sessionId) {
        setSessionId(data.sessionId);
      }
      
      toast({
        title: "Success",
        description: `Found ${data.data?.length || 0} materials using ${data.service || options.service}${data.savedTemporary ? ' (saved for review)' : ''}`,
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

  const handleAddAllToCatalog = async () => {
    if (scrapedMaterials.length === 0) return;
    
    setIsLoading(true);
    
    try {
      // Add materials to catalog in batches
      const batchSize = 5;
      let addedCount = 0;
      
      for (let i = 0; i < scrapedMaterials.length; i += batchSize) {
        const batch = scrapedMaterials.slice(i, i + batchSize);
        
        for (const material of batch) {
          try {
            const { error } = await supabase.from('materials_catalog').insert({
              name: material.name,
              description: material.description || 'Scraped material',
              category: material.category?.toLowerCase() as any || 'other',
              properties: {
                ...material.properties,
                price: material.price,
                images: material.images,
                sourceUrl: material.sourceUrl,
                supplier: material.supplier,
                scrapedAt: new Date().toISOString()
              },
              thumbnail_url: material.images?.[0] || null
            });
            
            if (!error) {
              addedCount++;
            }
          } catch (err) {
            console.error('Failed to add material:', material.name, err);
          }
        }
        
        // Small delay between batches
        if (i + batchSize < scrapedMaterials.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      toast({
        title: "Success",
        description: `Added ${addedCount} of ${scrapedMaterials.length} materials to catalog`,
      });
      
    } catch (error) {
      console.error('Bulk add error:', error);
      toast({
        title: "Error",
        description: "Failed to add materials to catalog",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
          <TabsTrigger value="review">Review Materials</TabsTrigger>
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

                {/* Batch Processing Controls */}
                <div className="grid grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/30">
                  <div className="space-y-2">
                    <Label htmlFor="batchSize">Batch Size</Label>
                    <Input
                      id="batchSize"
                      type="number"
                      value={batchSize}
                      onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
                      min="1"
                      max="20"
                      placeholder="10"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-muted-foreground">
                      URLs processed simultaneously
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxPages">Max Pages</Label>
                    <Input
                      id="maxPages"
                      type="number"
                      value={maxPages}
                      onChange={(e) => setMaxPages(parseInt(e.target.value) || 100)}
                      min="1"
                      max="1000"
                      placeholder="100"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum pages to process
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Save Options</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="saveTemporary"
                        checked={saveTemporary}
                        onChange={(e) => setSaveTemporary(e.target.checked)}
                        disabled={isLoading}
                      />
                      <Label htmlFor="saveTemporary" className="text-sm">Save for review</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Save results temporarily for review
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Scraping Service</Label>
                      <div className="flex space-x-4">
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            value="firecrawl"
                            checked={options.service === 'firecrawl'}
                            onChange={() => setOptions(prev => ({ ...prev, service: 'firecrawl' }))}
                            disabled={isLoading}
                          />
                          <span className="text-sm">Firecrawl</span>
                        </label>
                        
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            value="jina"
                            checked={options.service === 'jina'}
                            onChange={() => setOptions(prev => ({ ...prev, service: 'jina' }))}
                            disabled={isLoading}
                          />
                          <span className="text-sm">Jina AI</span>
                        </label>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Scraping Mode</Label>
                      <div className="flex space-x-4">
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            value="single"
                            checked={!options.sitemapMode && !options.crawlMode}
                            onChange={() => setOptions(prev => ({ ...prev, sitemapMode: false, crawlMode: false }))}
                            disabled={isLoading}
                          />
                          <span className="text-sm">Single Page</span>
                        </label>
                        
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            value="sitemap"
                            checked={options.sitemapMode}
                            onChange={() => setOptions(prev => ({ ...prev, sitemapMode: true, crawlMode: false }))}
                            disabled={isLoading}
                          />
                          <span className="text-sm">XML Sitemap</span>
                        </label>
                        
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            value="crawl"
                            checked={options.crawlMode && !options.sitemapMode}
                            onChange={() => setOptions(prev => ({ ...prev, sitemapMode: false, crawlMode: true }))}
                            disabled={isLoading}
                          />
                          <span className="text-sm">Auto Crawl</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  {options.sitemapMode && (
                    <div className="p-3 border rounded bg-blue-50 dark:bg-blue-950/30">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        📄 <strong>Sitemap Mode:</strong> Enter the URL of an XML sitemap (e.g., https://example.com/sitemap.xml) 
                        to automatically discover and scrape all product pages listed in the sitemap.
                      </p>
                    </div>
                  )}
                </div>
                
                {(options.sitemapMode || options.crawlMode) && (
                   <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                     <h3 className="font-medium text-sm">
                       {options.sitemapMode ? 'Sitemap Configuration' : 'Multi-page Configuration'}
                     </h3>
                     
                     {!options.sitemapMode && (
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
                     )}
                     
                     
                      <div className="space-y-4 p-3 border rounded bg-background/50">
                        <div className="p-3 border rounded bg-blue-50 dark:bg-blue-950/30">
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            ⚡ <strong>No Page Limits:</strong> Will process ALL pages found. Processing happens in batches to prevent timeouts.
                          </p>
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
                   </div>
                )}
                
                {options.service === 'firecrawl' && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h3 className="font-medium text-sm">Firecrawl Targeting Options</h3>
                    
                    <div className="space-y-4">
                      {/* CSS Selectors Section */}
                      <div className="space-y-3 p-3 border rounded bg-background/50">
                        <h4 className="text-sm font-medium text-foreground">CSS Selectors (Content Filtering)</h4>
                        
                        <div className="space-y-2">
                          <Label htmlFor="includeTags">Include Tags (CSS selectors to target specific elements)</Label>
                          <Input
                            id="includeTags"
                            value={options.includeTags?.join(', ') || ''}
                            onChange={(e) => setOptions(prev => ({ 
                              ...prev, 
                              includeTags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                            }))}
                            placeholder=".product-card, .item-details, .material-info"
                            disabled={isLoading}
                          />
                          <p className="text-xs text-muted-foreground">
                            Only extract content from elements matching these CSS selectors
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="excludeTags">Exclude Tags (CSS selectors to ignore)</Label>
                          <Input
                            id="excludeTags"
                            value={options.excludeTags?.join(', ') || ''}
                            onChange={(e) => setOptions(prev => ({ 
                              ...prev, 
                              excludeTags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                            }))}
                            placeholder=".header, .footer, .navigation, .sidebar"
                            disabled={isLoading}
                          />
                          <p className="text-xs text-muted-foreground">
                            Skip content from elements matching these CSS selectors
                          </p>
                        </div>
                      </div>

                      {/* Extraction Prompt Section */}
                      <div className="space-y-3 p-3 border rounded bg-background/50">
                        <h4 className="text-sm font-medium text-foreground">AI Extraction Prompt</h4>
                        
                        <div className="space-y-2">
                          <Label htmlFor="extractPrompt">Custom Extraction Prompt</Label>
                          <textarea
                            id="extractPrompt"
                            className="w-full min-h-[100px] p-3 border border-input rounded-md bg-background text-sm resize-vertical"
                            value={options.prompt || ''}
                            onChange={(e) => setOptions(prev => ({ ...prev, prompt: e.target.value }))}
                            placeholder="Extract all material and product information from this page. Look for:
- Product names and model numbers
- Prices and pricing tiers
- Technical specifications
- Material properties (dimensions, colors, finishes)
- Stock status and availability
- Brand and manufacturer details
- Product images and descriptions"
                            disabled={isLoading}
                          />
                          <p className="text-xs text-muted-foreground">
                            Tell the AI exactly what information to extract from the filtered content
                          </p>
                        </div>
                      </div>

                      {/* General Options */}
                      <div className="space-y-3 p-3 border rounded bg-background/50">
                        <h4 className="text-sm font-medium text-foreground">General Options</h4>
                        
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="onlyMainContent"
                            checked={options.onlyMainContent !== false}
                            onChange={(e) => setOptions(prev => ({ ...prev, onlyMainContent: e.target.checked }))}
                            disabled={isLoading}
                          />
                          <Label htmlFor="onlyMainContent" className="text-sm">Extract only main content (recommended)</Label>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="waitFor">Wait time (milliseconds) - For dynamic content</Label>
                          <Input
                            id="waitFor"
                            type="number"
                            value={options.waitFor || 0}
                            onChange={(e) => setOptions(prev => ({ ...prev, waitFor: parseInt(e.target.value) || 0 }))}
                            min="0"
                            max="10000"
                            placeholder="0"
                            disabled={isLoading}
                          />
                          <p className="text-xs text-muted-foreground">
                            Wait for JavaScript content to load before extraction
                          </p>
                        </div>
                      </div>

                      {/* Usage Info */}
                      <div className="p-3 border rounded bg-blue-50 dark:bg-blue-950/30">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          💡 <strong>How it works:</strong> CSS selectors filter which page elements to scrape, 
                          then the AI extraction prompt tells Firecrawl exactly what data to extract from those elements. 
                          Both work together for precise targeting.
                        </p>
                      </div>
                    </div>
                   </div>
                 )}
                 
                 {options.service === 'jina' && (
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

        <TabsContent value="results" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Scraped Materials ({scrapedMaterials.length})</CardTitle>
              {scrapedMaterials.length > 0 && (
                <Button 
                  onClick={handleAddAllToCatalog}
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Add All to Catalog
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <ScrapedMaterialsViewer 
                materials={scrapedMaterials}
                onMaterialsUpdate={setScrapedMaterials}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <ScrapedMaterialsReview sessionId={sessionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};