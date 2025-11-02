import React, { useState } from 'react';
import { Globe, Loader2, Plus, Settings, Sparkles, Brain, FileText, Search, Map, MousePointer } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

import { SessionDetailView } from './SessionDetailView';
import { ScrapingSessionsList } from './ScrapingSessionsList';

type ViewMode = 'sessions' | 'detail' | 'create';
type ScrapingMode = 'single-page' | 'sitemap' | 'crawl' | 'search' | 'map';



export const NewScraperPage: React.FC = () => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Scraping mode selection
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single-page');

  // Common form fields
  const [url, setUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Firecrawl Options - Enhanced with more API options
  const [firecrawlOptions, setFirecrawlOptions] = useState({
    formats: ['markdown', 'html'] as string[],
    onlyMainContent: true,
    includeLinks: false,
    includeTags: [] as string[],
    excludeTags: ['nav', 'footer', 'aside'] as string[],
    waitFor: 0,
    mobile: false,
    skipTlsVerification: false,
    parsePDF: true,
    removeBase64Images: true,
    blockAds: true,
    extractorMode: 'llm-extraction' as 'llm-extraction' | 'css-extraction',
    schema: '',
    actions: [] as unknown[],
    maxAge: 0,
    proxy: 'basic' as 'basic' | 'premium' | 'none',
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
    removeForms: true,
  });

  const getSourceUrl = () => {
    switch (scrapingMode) {
      case 'single-page': return url;
      case 'sitemap': return sitemapUrl;
      case 'crawl': return url;
      case 'search': return searchQuery;
      case 'map': return url;
      default: return '';
    }
  };

  const parseSitemap = async (url: string): Promise<string[]> => {
    try {
      console.log('Parsing sitemap:', url);

      // Use the centralized API system to parse sitemap
      const apiService = BrowserApiIntegrationService.getInstance();
      const result = await apiService.callSupabaseFunction('parse-sitemap', {
        sitemapUrl: url,
        maxPages: maxPages,
      });

      if (!result.success) {
        console.error('Error parsing sitemap:', result.error);
        throw new Error(result.error?.message || 'Failed to parse sitemap');
      }

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Failed to parse sitemap');
      }

      console.log(`Found ${result.data.count} URLs in sitemap`);
      return result.data.urls;

    } catch (error) {
      console.error('Error parsing sitemap:', error);
      throw new Error('Failed to parse sitemap. Please check the URL and try again.');
    }
  };

  const createNewSession = async () => {
    const sourceUrl = getSourceUrl();
    if (!sourceUrl.trim()) {
      toast({
        title: 'Error',
        description: `Please enter a ${scrapingMode === 'search' ? 'search query' : 'URL'}`,
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      let urls: string[] = [];

      // Handle different scraping modes
      switch (scrapingMode) {
        case 'single-page':
        case 'crawl':
        case 'map':
          urls = [sourceUrl];
          break;
        case 'sitemap':
          urls = await parseSitemap(sourceUrl);
          if (urls.length === 0) {
            throw new Error('No URLs found in sitemap');
          }
          break;
        case 'search':
          // For search, we'll use the search query directly
          urls = [sourceUrl];
          break;
        default:
          throw new Error('Invalid scraping mode');
      }

      // Get current user from Supabase auth
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast({
          title: 'Authentication Error',
          description: 'You must be logged in to create scraping jobs',
          variant: 'destructive',
        });
        return;
      }
      const currentUserId = user.id;

      // Create session in Supabase database
      const sessionId = crypto.randomUUID();
      const sessionData = {
        id: sessionId,
        user_id: currentUserId,
        session_id: sessionId,
        source_url: sourceUrl,
        status: 'pending',
        total_pages: urls.length,
        completed_pages: 0,
        failed_pages: 0,
        materials_processed: 0,
        progress_percentage: 0,
        scraping_config: {
          mode: scrapingMode,
          service: selectedService,
          extractionPrompt,
          maxPages: scrapingMode === 'sitemap' ? maxPages : 1,
          timeout,
          retryCount,
          concurrentPages,
          firecrawlOptions: selectedService === 'firecrawl' ? firecrawlOptions : undefined,
          jinaOptions: selectedService === 'jina' ? jinaOptions : undefined,
        } as Json,
      };

      // Insert session into database
      const { data: insertedSession, error: sessionError } = await supabase
        .from('scraping_sessions')
        .insert([sessionData])
        .select()
        .single();

      if (sessionError) {
        console.error('Error creating session:', sessionError);
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

      // Create page entries in database
      const pageEntries = urls.map((url, index) => ({
        session_id: sessionId,
        url,
        status: 'pending',
        page_index: index,
        materials_found: 0,
        processing_time_ms: null,
        error_message: null,
      }));

      if (pageEntries.length > 0) {
        const { error: pagesError } = await supabase
          .from('scraping_pages')
          .insert(pageEntries);

        if (pagesError) {
          console.error('Error creating page entries:', pagesError);
          // Don't throw here - session was created successfully, just log the error
          console.warn('Session created but failed to create page entries');
        }
      }

      toast({
        title: 'Success',
        description: `${scrapingMode} session created with ${urls.length} ${urls.length === 1 ? 'page' : 'pages'}`,
      });

      // Navigate to session detail
      setSelectedSessionId(insertedSession.id);
      setViewMode('detail');

    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create session',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const getModeIcon = (mode: ScrapingMode) => {
    switch (mode) {
      case 'single-page': return MousePointer;
      case 'sitemap': return Globe;
      case 'crawl': return FileText;
      case 'search': return Search;
      case 'map': return Map;
      default: return Globe;
    }
  };

  const getModeDescription = (mode: ScrapingMode) => {
    switch (mode) {
      case 'single-page': return 'Scrape a single webpage with full content and metadata';
      case 'sitemap': return 'Parse sitemap XML and scrape multiple pages from the list';
      case 'crawl': return 'Crawl website and discover all accessible subpages automatically';
      case 'search': return 'Search the web and get full content from search results';
      case 'map': return 'Get a complete list of URLs from any website quickly';
      default: return '';
    }
  };

  const renderCreateForm = () => (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="Material Scraper"
        description="Scrape material data from websites and external sources"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Material Scraper' },
        ]}
      />
      <div className="p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Button
              className="border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              onClick={() => setViewMode('sessions')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setViewMode('sessions');
                }
              }}
            >
              ← Back to Sessions
            </Button>
            <h1 className="text-2xl font-bold">Create New Scraping Session</h1>
          </div>

      {/* Scraping Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Scraping Mode
          </CardTitle>
        </CardHeader><CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['single-page', 'sitemap', 'crawl', 'search', 'map'] as ScrapingMode[]).map((mode) => {
              const Icon = getModeIcon(mode);
              return (
                <div
                  key={mode}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    scrapingMode === mode
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-muted-foreground/50'
                  }`}
                  onClick={() => setScrapingMode(mode)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setScrapingMode(mode);
                    }
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium capitalize">{mode.replace('-', ' ')}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {getModeDescription(mode)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Input Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {React.createElement(getModeIcon(scrapingMode), { className: 'h-5 w-5' })}
            {scrapingMode === 'single-page' && 'Page URL'}
            {scrapingMode === 'sitemap' && 'Sitemap Configuration'}
            {scrapingMode === 'crawl' && 'Website to Crawl'}
            {scrapingMode === 'search' && 'Search Query'}
            {scrapingMode === 'map' && 'Website to Map'}
          </CardTitle>
        </CardHeader><CardContent className="space-y-4">
          {/* Single Page Input */}
          {scrapingMode === 'single-page' && (
            <div>
              <Label htmlFor="page-url">Page URL</Label>
              <Input
                id="page-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/product-page"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Enter the URL of the page you want to scrape
              </p>
            </div>
          )}

          {/* Sitemap Input */}
          {scrapingMode === 'sitemap' && (
            <>
              <div>
                <Label htmlFor="sitemap-url">Sitemap URL</Label><Input
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
                  <Label htmlFor="concurrent-pages">Concurrent Pages</Label><Input
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
            </>
          )}

          {/* Crawl Input */}
          {scrapingMode === 'crawl' && (
            <>
              <div>
                <Label htmlFor="crawl-url">Website URL</Label>
                <Input
                  id="crawl-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the website URL to crawl all accessible subpages
                </p>
              </div>
              <div>
                <Label htmlFor="crawl-limit">Page Limit</Label><Input
                  id="crawl-limit"
                  type="number"
                  value={maxPages}
                  onChange={(e) => setMaxPages(parseInt(e.target.value) || 100)}
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

          {/* Search Input */}
          {scrapingMode === 'search' && (
            <div>
              <Label htmlFor="search-query">Search Query</Label>
              <Input
                id="search-query"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="material suppliers ceramic tiles"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Enter search terms to find and scrape relevant web pages
              </p>
            </div>
          )}

          {/* Map Input */}
          {scrapingMode === 'map' && (
            <div>
              <Label htmlFor="map-url">Website URL</Label><Input
                id="map-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Get a complete list of URLs from this website
              </p>
            </div>
          )}

          {/* Extraction Prompt */}
          <div>
            <Label htmlFor="extraction-prompt">Extraction Prompt</Label>
            <Textarea
              id="extraction-prompt"
              value={extractionPrompt}
              onChange={(e) => setExtractionPrompt(e.target.value)}
              rows={4}
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Describe what information to extract from the pages
            </p>
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
        </CardHeader><CardContent className="space-y-4">
          <div>
            <Label>Scraping Service</Label>
            <Select value={selectedService} onValueChange={(value: 'firecrawl' | 'jina') => setSelectedService(value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select service" />
              </SelectTrigger><SelectContent>
                <SelectItem value="firecrawl">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
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
              <Label htmlFor="timeout">Timeout (ms)</Label><Input
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
              <Sparkles className="h-5 w-5" />
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
                      onCheckedChange={(checked: boolean) => {
                        setFirecrawlOptions(prev => ({
                          ...prev,
                          formats: checked
                            ? [...prev.formats, format]
                            : prev.formats.filter(f => f !== format),
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
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, onlyMainContent: !!checked }))
                  }
                />
                <Label htmlFor="onlyMainContent" className="text-sm">Main Content Only</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeLinks"
                  checked={firecrawlOptions.includeLinks}
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, includeLinks: !!checked }))
                  }
                />
                <Label htmlFor="includeLinks" className="text-sm">Include Links</Label>
              </div>
            </div>

            <div>
              <Label htmlFor="excludeTags">Exclude HTML Tags (comma separated)</Label><Input
                id="excludeTags"
                value={firecrawlOptions.excludeTags.join(', ')}
                onChange={(e) => setFirecrawlOptions(prev => ({
                  ...prev,
                  excludeTags: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
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
                  waitFor: parseInt(e.target.value) || 0,
                }))}
                min="0"
                max="10000"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Extractor Mode</Label><Select
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

            {/* Advanced Firecrawl Options */}
            <Separator className="my-4" />
            <h4 className="font-medium text-sm mb-3">Advanced Options</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mobile"
                  checked={firecrawlOptions.mobile}
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, mobile: !!checked }))
                  }
                />
                <Label htmlFor="mobile" className="text-sm">Mobile Viewport</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="parsePDF"
                  checked={firecrawlOptions.parsePDF}
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, parsePDF: !!checked }))
                  }
                />
                <Label htmlFor="parsePDF" className="text-sm">Parse PDFs</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="blockAds"
                  checked={firecrawlOptions.blockAds}
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, blockAds: !!checked }))
                  }
                />
                <Label htmlFor="blockAds" className="text-sm">Block Ads</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="removeBase64Images"
                  checked={firecrawlOptions.removeBase64Images}
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, removeBase64Images: !!checked }))
                  }
                />
                <Label htmlFor="removeBase64Images" className="text-sm">Remove Base64 Images</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skipTlsVerification"
                  checked={firecrawlOptions.skipTlsVerification}
                  onCheckedChange={(checked: boolean) =>
                    setFirecrawlOptions(prev => ({ ...prev, skipTlsVerification: !!checked }))
                  }
                />
                <Label htmlFor="skipTlsVerification" className="text-sm">Skip TLS Verification</Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxAge">Cache Max Age (seconds)</Label><Input
                  id="maxAge"
                  type="number"
                  value={firecrawlOptions.maxAge}
                  onChange={(e) => setFirecrawlOptions(prev => ({
                    ...prev,
                    maxAge: parseInt(e.target.value) || 0,
                  }))}
                  min="0"
                  max="86400"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Proxy Level</Label>
                <Select
                  value={firecrawlOptions.proxy}
                  onValueChange={(value: 'basic' | 'premium' | 'none') =>
                    setFirecrawlOptions(prev => ({ ...prev, proxy: value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Proxy</SelectItem>
                    <SelectItem value="basic">Basic Proxy</SelectItem>
                    <SelectItem value="premium">Premium Proxy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
          </CardHeader><CardContent className="space-y-4">
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
              <Label htmlFor="maxLength">Max Content Length</Label><Input
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
                  onCheckedChange={(checked: boolean) =>
                    setJinaOptions(prev => ({ ...prev, includeImages: !!checked }))
                  }
                />
                <Label htmlFor="includeImages" className="text-sm">Include Images</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeLinksJina"
                  checked={jinaOptions.includeLinks}
                  onCheckedChange={(checked: boolean) =>
                    setJinaOptions(prev => ({ ...prev, includeLinks: !!checked }))
                  }
                />
                <Label htmlFor="includeLinksJina" className="text-sm">Include Links</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="removeAds"
                  checked={jinaOptions.removeAds}
                  onCheckedChange={(checked: boolean) =>
                    setJinaOptions(prev => ({ ...prev, removeAds: !!checked }))
                  }
                />
                <Label htmlFor="removeAds" className="text-sm">Remove Ads</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="removeForms"
                  checked={jinaOptions.removeForms}
                  onCheckedChange={(checked: boolean) =>
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
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            createNewSession();
          }
        }}
        disabled={creating || !getSourceUrl().trim()}
        className="w-full h-11 px-8"
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
      </div>
    </div>
  );

  // Main render logic
  switch (viewMode) {
    case 'create':
      return renderCreateForm();

    case 'detail':
      return (
        <div className="min-h-screen bg-background">
          <GlobalAdminHeader
            title="Material Scraper"
            description="Scrape material data from websites and external sources"
            breadcrumbs={[
              { label: 'Admin', path: '/admin' },
              { label: 'Material Scraper' },
            ]}
          />
          <div className="p-6">
            <SessionDetailView
              sessionId={selectedSessionId}
              onBack={() => setViewMode('sessions')}
            />
          </div>
        </div>
      );

    default:
      return (
        <div className="min-h-screen bg-background">
          <GlobalAdminHeader
            title="Material Scraper"
            description="Scrape material data from websites and external sources"
            breadcrumbs={[
              { label: 'Admin', path: '/admin' },
              { label: 'Material Scraper' },
            ]}
          />
          <div className="p-6">
            <ScrapingSessionsList
              onSelectSession={(sessionId) => {
                setSelectedSessionId(sessionId);
                setViewMode('detail');
              }}
              onCreateNew={() => setViewMode('create')}
            />
          </div>
        </div>
      );
  }
};
