import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Globe, Loader2, Plus, ArrowRight, Settings, Zap, Brain } from 'lucide-react';
import { ScrapingSessionsList } from './ScrapingSessionsList';
import { SessionDetailView } from './SessionDetailView';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

interface NewScraperPageProps {}

type ViewMode = 'sessions' | 'detail' | 'create';

export const NewScraperPage: React.FC<NewScraperPageProps> = () => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  
  // New session form
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [maxPages, setMaxPages] = useState(100);
  const [extractionPrompt, setExtractionPrompt] = useState(`Extract material information from this page. Look for:
- Material name
- Price (if available)
- Description
- Images  
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`);

  // API Configuration
  const [selectedService, setSelectedService] = useState<'firecrawl' | 'jina'>('firecrawl');
  const [timeout, setTimeout] = useState(30000);
  const [retryCount, setRetryCount] = useState(3);
  const [concurrentPages, setConcurrentPages] = useState(5);

  // Firecrawl Options
  const [firecrawlOptions, setFirecrawlOptions] = useState({
    formats: ['markdown', 'html'] as string[],
    onlyMainContent: true,
    includeLinks: false,
    includeTags: [] as string[],
    excludeTags: ['nav', 'footer', 'aside'] as string[],
    waitFor: 0,
    extractorMode: 'llm-extraction' as 'llm-extraction' | 'css-extraction',
    schema: ''
  });

  // Jina AI Options  
  const [jinaOptions, setJinaOptions] = useState({
    returnFormat: 'markdown' as 'markdown' | 'html' | 'text',
    targetSelector: '',
    waitForSelector: '',
    includeImages: true,
    includeLinks: false,
    maxLength: 10000,
    removeAds: true,
    removeForms: true
  });

  const parseSitemap = async (url: string): Promise<string[]> => {
    try {
      console.log('Parsing sitemap:', url);
      
      // Use CORS proxy for sitemap parsing
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sitemap: ${response.status}`);
      }
      
      const data = await response.json();
      const sitemapContent = data.contents;
      
      // Parse XML to extract URLs
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(sitemapContent, 'text/xml');
      
      // Handle different sitemap formats
      let urls: string[] = [];
      
      // Standard sitemap format
      const urlElements = xmlDoc.getElementsByTagName('url');
      for (let i = 0; i < urlElements.length; i++) {
        const locElement = urlElements[i].getElementsByTagName('loc')[0];
        if (locElement) {
          urls.push(locElement.textContent || '');
        }
      }
      
      // If no URLs found, try alternate format
      if (urls.length === 0) {
        const locElements = xmlDoc.getElementsByTagName('loc');
        for (let i = 0; i < locElements.length; i++) {
          urls.push(locElements[i].textContent || '');
        }
      }
      
      // Filter out empty URLs and limit
      urls = urls.filter(url => url.trim().length > 0).slice(0, maxPages);
      
      console.log(`Found ${urls.length} URLs in sitemap`);
      return urls;
      
    } catch (error) {
      console.error('Error parsing sitemap:', error);
      throw new Error('Failed to parse sitemap. Please check the URL and try again.');
    }
  };

  const createNewSession = async () => {
    if (!sitemapUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a sitemap URL",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      // Parse sitemap to get URLs
      const urls = await parseSitemap(sitemapUrl);
      
      if (urls.length === 0) {
        throw new Error('No URLs found in sitemap');
      }

      // Create session
      const sessionId = crypto.randomUUID();
      const { data: sessionData, error: sessionError } = await supabase
        .from('scraping_sessions')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          session_id: sessionId,
          source_url: sitemapUrl,
          status: 'pending',
          total_pages: urls.length,
          completed_pages: 0,
          failed_pages: 0,
          pending_pages: urls.length,
          session_type: 'sitemap',
          scraping_config: {
            service: selectedService,
            extractionPrompt,
            maxPages,
            timeout,
            retryCount,
            concurrentPages,
            firecrawlOptions: selectedService === 'firecrawl' ? firecrawlOptions : undefined,
            jinaOptions: selectedService === 'jina' ? jinaOptions : undefined
          }
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Create page entries
      const pageEntries = urls.map((url, index) => ({
        session_id: sessionData.id,
        url,
        status: 'pending',
        page_index: index
      }));

      const { error: pagesError } = await supabase
        .from('scraping_pages')
        .insert(pageEntries);

      if (pagesError) throw pagesError;

      toast({
        title: "Success",
        description: `Session created with ${urls.length} pages`,
      });

      // Navigate to session detail
      setSelectedSessionId(sessionData.id);
      setViewMode('detail');
      
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create session",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const renderCreateForm = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => setViewMode('sessions')}>
          ← Back to Sessions
        </Button>
        <h1 className="text-2xl font-bold">Create New Scraping Session</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Sitemap Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sitemap-url">Sitemap URL</Label>
            <Input
              id="sitemap-url"
              type="url"
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
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
                onChange={(e) => setMaxPages(parseInt(e.target.value) || 100)}
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
                onChange={(e) => setConcurrentPages(parseInt(e.target.value) || 5)}
                min="1"
                max="20"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="extraction-prompt">Extraction Prompt</Label>
            <Textarea
              id="extraction-prompt"
              value={extractionPrompt}
              onChange={(e) => setExtractionPrompt(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            API Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Scraping Service</Label>
            <Select value={selectedService} onValueChange={(value: 'firecrawl' | 'jina') => setSelectedService(value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="firecrawl">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Firecrawl (Advanced AI Extraction)
                  </div>
                </SelectItem>
                <SelectItem value="jina">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Jina AI (Reader + Processing)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value) || 30000)}
                min="5000"
                max="120000"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="retry-count">Retry Count</Label>
              <Input
                id="retry-count"
                type="number"
                value={retryCount}
                onChange={(e) => setRetryCount(parseInt(e.target.value) || 3)}
                min="0"
                max="10"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service-specific Configuration */}
      {selectedService === 'firecrawl' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Firecrawl Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Output Formats</Label>
              <div className="flex gap-4 mt-2">
                {['markdown', 'html', 'links', 'screenshot'].map((format) => (
                  <div key={format} className="flex items-center space-x-2">
                    <Checkbox
                      id={format}
                      checked={firecrawlOptions.formats.includes(format)}
                      onCheckedChange={(checked) => {
                        setFirecrawlOptions(prev => ({
                          ...prev,
                          formats: checked 
                            ? [...prev.formats, format]
                            : prev.formats.filter(f => f !== format)
                        }));
                      }}
                    />
                    <Label htmlFor={format} className="text-sm capitalize">{format}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="onlyMainContent"
                  checked={firecrawlOptions.onlyMainContent}
                  onCheckedChange={(checked) => 
                    setFirecrawlOptions(prev => ({ ...prev, onlyMainContent: !!checked }))
                  }
                />
                <Label htmlFor="onlyMainContent" className="text-sm">Main Content Only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeLinks"
                  checked={firecrawlOptions.includeLinks}
                  onCheckedChange={(checked) => 
                    setFirecrawlOptions(prev => ({ ...prev, includeLinks: !!checked }))
                  }
                />
                <Label htmlFor="includeLinks" className="text-sm">Include Links</Label>
              </div>
            </div>

            <div>
              <Label htmlFor="excludeTags">Exclude HTML Tags (comma separated)</Label>
              <Input
                id="excludeTags"
                value={firecrawlOptions.excludeTags.join(', ')}
                onChange={(e) => setFirecrawlOptions(prev => ({
                  ...prev,
                  excludeTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                }))}
                placeholder="nav, footer, aside"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="waitFor">Wait For (ms)</Label>
              <Input
                id="waitFor"
                type="number"
                value={firecrawlOptions.waitFor}
                onChange={(e) => setFirecrawlOptions(prev => ({
                  ...prev,
                  waitFor: parseInt(e.target.value) || 0
                }))}
                min="0"
                max="10000"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Extractor Mode</Label>
              <Select 
                value={firecrawlOptions.extractorMode} 
                onValueChange={(value: 'llm-extraction' | 'css-extraction') => 
                  setFirecrawlOptions(prev => ({ ...prev, extractorMode: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llm-extraction">LLM Extraction (AI-powered)</SelectItem>
                  <SelectItem value="css-extraction">CSS Extraction (Rule-based)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedService === 'jina' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Jina AI Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Return Format</Label>
              <Select 
                value={jinaOptions.returnFormat} 
                onValueChange={(value: 'markdown' | 'html' | 'text') => 
                  setJinaOptions(prev => ({ ...prev, returnFormat: value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="text">Plain Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="targetSelector">Target CSS Selector (optional)</Label>
              <Input
                id="targetSelector"
                value={jinaOptions.targetSelector}
                onChange={(e) => setJinaOptions(prev => ({ ...prev, targetSelector: e.target.value }))}
                placeholder=".main-content, #product-details"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="waitForSelector">Wait for Selector (optional)</Label>
              <Input
                id="waitForSelector"
                value={jinaOptions.waitForSelector}
                onChange={(e) => setJinaOptions(prev => ({ ...prev, waitForSelector: e.target.value }))}
                placeholder=".dynamic-content"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="maxLength">Max Content Length</Label>
              <Input
                id="maxLength"
                type="number"
                value={jinaOptions.maxLength}
                onChange={(e) => setJinaOptions(prev => ({ ...prev, maxLength: parseInt(e.target.value) || 10000 }))}
                min="1000"
                max="50000"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeImages"
                  checked={jinaOptions.includeImages}
                  onCheckedChange={(checked) => 
                    setJinaOptions(prev => ({ ...prev, includeImages: !!checked }))
                  }
                />
                <Label htmlFor="includeImages" className="text-sm">Include Images</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeLinksJina"
                  checked={jinaOptions.includeLinks}
                  onCheckedChange={(checked) => 
                    setJinaOptions(prev => ({ ...prev, includeLinks: !!checked }))
                  }
                />
                <Label htmlFor="includeLinksJina" className="text-sm">Include Links</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="removeAds"
                  checked={jinaOptions.removeAds}
                  onCheckedChange={(checked) => 
                    setJinaOptions(prev => ({ ...prev, removeAds: !!checked }))
                  }
                />
                <Label htmlFor="removeAds" className="text-sm">Remove Ads</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="removeForms"
                  checked={jinaOptions.removeForms}
                  onCheckedChange={(checked) => 
                    setJinaOptions(prev => ({ ...prev, removeForms: !!checked }))
                  }
                />
                <Label htmlFor="removeForms" className="text-sm">Remove Forms</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button 
        onClick={createNewSession} 
        disabled={creating || !sitemapUrl.trim()}
        className="w-full"
        size="lg"
      >
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating Session...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4 mr-2" />
            Create Session with {selectedService === 'firecrawl' ? 'Firecrawl' : 'Jina AI'}
          </>
        )}
      </Button>
    </div>
  );

  // Main render logic
  switch (viewMode) {
    case 'create':
      return renderCreateForm();
    
    case 'detail':
      return (
        <SessionDetailView 
          sessionId={selectedSessionId}
          onBack={() => setViewMode('sessions')}
        />
      );
    
    default:
      return (
        <ScrapingSessionsList
          onSelectSession={(sessionId) => {
            setSelectedSessionId(sessionId);
            setViewMode('detail');
          }}
          onCreateNew={() => setViewMode('create')}
        />
      );
  }
};