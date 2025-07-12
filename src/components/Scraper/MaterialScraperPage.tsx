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
  limit: number;
  maxDepth: number;
  includePaths: string[];
  excludePaths: string[];
  searchCriteria: {
    materialTypes: string[];
    targetSelectors: string[];
    keywordFilters: string[];
    priceRequired: boolean;
    imageRequired: boolean;
  };
}

export const MaterialScraperPage = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scrapedMaterials, setScrapedMaterials] = useState<ScrapedMaterial[]>([]);
  const [progress, setProgress] = useState(0);
  const [options, setOptions] = useState<ScrapingOptions>({
    limit: 10,
    maxDepth: 1,
    includePaths: [],
    excludePaths: [],
    searchCriteria: {
      materialTypes: ['tiles', 'flooring', 'stone'],
      targetSelectors: [],
      keywordFilters: [],
      priceRequired: false,
      imageRequired: true
    }
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
        description: `Found ${data.materials?.length || 0} materials from ${data.totalPages || 0} pages`,
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="limit">Page Limit</Label>
                    <Input
                      id="limit"
                      type="number"
                      value={options.limit}
                      onChange={(e) => setOptions(prev => ({ ...prev, limit: parseInt(e.target.value) || 10 }))}
                      min="1"
                      max="50"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depth">Max Depth</Label>
                    <Input
                      id="depth"
                      type="number"
                      value={options.maxDepth}
                      onChange={(e) => setOptions(prev => ({ ...prev, maxDepth: parseInt(e.target.value) || 1 }))}
                      min="0"
                      max="3"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <h3 className="font-medium text-sm">Search Configuration</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="materialTypes">Material Types (comma-separated)</Label>
                    <Input
                      id="materialTypes"
                      value={options.searchCriteria.materialTypes.join(', ')}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        searchCriteria: {
                          ...prev.searchCriteria,
                          materialTypes: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                        }
                      }))}
                      placeholder="tiles, stone, wood, ceramic, marble"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="keywords">Additional Keywords (comma-separated)</Label>
                    <Input
                      id="keywords"
                      value={options.searchCriteria.keywordFilters.join(', ')}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        searchCriteria: {
                          ...prev.searchCriteria,
                          keywordFilters: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                        }
                      }))}
                      placeholder="flooring, wall, bathroom, kitchen"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="includePaths">Include URL Paths (comma-separated)</Label>
                    <Input
                      id="includePaths"
                      value={options.includePaths.join(', ')}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        includePaths: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                      }))}
                      placeholder="/products, /catalog, /materials"
                      disabled={isLoading}
                    />
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={options.searchCriteria.priceRequired}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          searchCriteria: {
                            ...prev.searchCriteria,
                            priceRequired: e.target.checked
                          }
                        }))}
                        disabled={isLoading}
                      />
                      <span className="text-sm">Require Price</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={options.searchCriteria.imageRequired}
                        onChange={(e) => setOptions(prev => ({
                          ...prev,
                          searchCriteria: {
                            ...prev.searchCriteria,
                            imageRequired: e.target.checked
                          }
                        }))}
                        disabled={isLoading}
                      />
                      <span className="text-sm">Require Images</span>
                    </label>
                  </div>
                </div>

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
                      <li>• Works best with material supplier websites and catalogs</li>
                      <li>• Automatically extracts product images, names, and specifications</li>
                      <li>• Respects robots.txt and rate limits</li>
                      <li>• Processing time depends on site size and complexity</li>
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