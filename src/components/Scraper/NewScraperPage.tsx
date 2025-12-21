import React, { useState } from 'react';
import {
  Globe,
  Loader2,
  Plus,
  Settings,
  Sparkles,
  Brain,
  FileText,
  Search,
  Map,
  MousePointer,
} from 'lucide-react';

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
import { ScrapingPreviewModal } from './ScrapingPreviewModal';
import { FieldMappingStep, type FieldMapping } from './FieldMappingStep';
import { generateExtractionPrompt, generateJsonSchema } from '@/utils/scrapingPromptGenerator';

type ViewMode = 'sessions' | 'detail' | 'create';
type ScrapingMode = 'single-page' | 'sitemap' | 'crawl' | 'search' | 'map';

interface PreviewMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  supplier?: string;
}

interface NewScraperPageProps {
  embedded?: boolean; // If true, don't render GlobalAdminHeader or min-h-screen wrapper
}

export const NewScraperPage: React.FC<NewScraperPageProps> = ({ embedded = false }) => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMaterials, setPreviewMaterials] = useState<PreviewMaterial[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState<any>(null);

  // Scraping mode selection
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single-page');

  // Common form fields
  const [url, setUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxPages, setMaxPages] = useState(100);
  const [extractionPrompt, setExtractionPrompt] =
    useState(`Extract material information from this page. Look for:
- Material name
- Price (if available)
- Description
- Images  
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`);

  // API Configuration
  const [timeout, setTimeout] = useState(30000);
  const [retryCount, setRetryCount] = useState(3);
  const [concurrentPages, setConcurrentPages] = useState(5);

  // Field Mappings
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([
    {
      id: 'default_1',
      name: 'material_name',
      label: 'Material Name',
      type: 'text',
      description: 'The name or title of the material product',
      required: true,
    },
    {
      id: 'default_2',
      name: 'price',
      label: 'Price',
      type: 'text',
      description: 'Price of the material (include currency if available)',
      required: false,
    },
    {
      id: 'default_3',
      name: 'description',
      label: 'Description',
      type: 'text',
      description: 'Detailed description of the material',
      required: false,
    },
    {
      id: 'default_4',
      name: 'images',
      label: 'Images',
      type: 'array',
      description: 'Array of image URLs for the material',
      required: false,
    },
    {
      id: 'default_5',
      name: 'category',
      label: 'Category',
      type: 'text',
      description: 'Material category (e.g., tiles, stone, wood, metal)',
      required: false,
    },
  ]);

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



  const getSourceUrl = () => {
    switch (scrapingMode) {
      case 'single-page':
        return url;
      case 'sitemap':
        return sitemapUrl;
      case 'crawl':
        return url;
      case 'search':
        return searchQuery;
      case 'map':
        return url;
      default:
        return '';
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
      throw new Error(
        'Failed to parse sitemap. Please check the URL and try again.',
      );
    }
  };

  const handlePreviewScraping = async () => {
    const sourceUrl = getSourceUrl();
    if (!sourceUrl.trim()) {
      toast({
        title: 'Error',
        description: `Please enter a ${scrapingMode === 'search' ? 'search query' : 'URL'}`,
        variant: 'destructive',
      });
      return;
    }

    setLoadingPreview(true);
    try {
      // Get current user and workspace
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('You must be logged in to preview scraping');
      }

      const { data: workspaceData } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const workspaceId = workspaceData?.id;
      if (!workspaceId) {
        throw new Error('No workspace found');
      }

      // Determine preview URL based on mode
      let previewUrlToUse = sourceUrl;
      if (scrapingMode === 'sitemap') {
        // For sitemap, parse and use first URL
        const urls = await parseSitemap(sourceUrl);
        if (urls.length === 0) {
          throw new Error('No URLs found in sitemap');
        }
        previewUrlToUse = urls[0];
      }

      // Generate dynamic extraction prompt from field mappings
      const promptData = await generateExtractionPrompt(workspaceId, fieldMappings);
      if (!promptData) {
        throw new Error('Failed to generate extraction prompt');
      }

      // Generate JSON schema from field mappings
      const schema = generateJsonSchema(fieldMappings);

      // Call preview Edge Function
      const apiService = BrowserApiIntegrationService.getInstance();
      const result = await apiService.callSupabaseFunction('scrape-preview', {
        url: previewUrlToUse,
        workspaceId: workspaceId,
        options: {
          prompt: promptData.prompt,
          systemPrompt: promptData.systemPrompt,
          schema: schema,
          fieldMappings: fieldMappings,
          timeout: timeout,
        },
      });

      if (!result.success || !result.data?.success) {
        throw new Error(result.data?.error || 'Preview failed');
      }

      setPreviewMaterials(result.data.materials || []);
      setPreviewUrl(previewUrlToUse);
      setShowPreview(true);

      toast({
        title: 'Preview Ready',
        description: `Found ${result.data.materials?.length || 0} materials on sample page`,
      });
    } catch (error) {
      console.error('Preview error:', error);
      toast({
        title: 'Preview Failed',
        description: error instanceof Error ? error.message : 'Failed to preview scraping',
        variant: 'destructive',
      });
    } finally {
      setLoadingPreview(false);
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
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        toast({
          title: 'Authentication Error',
          description: 'You must be logged in to create scraping jobs',
          variant: 'destructive',
        });
        return;
      }
      const currentUserId = user.id;

      // Get user's workspace
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', currentUserId)
        .single();

      const workspaceId = workspaceData?.id || null;

      // Generate dynamic extraction prompt from field mappings
      const promptData = await generateExtractionPrompt(workspaceId || '', fieldMappings);
      if (!promptData) {
        throw new Error('Failed to generate extraction prompt');
      }

      // Create session in Supabase database
      const sessionId = crypto.randomUUID();
      const sessionData = {
        id: sessionId,
        user_id: currentUserId,
        workspace_id: workspaceId,
        session_id: sessionId,
        source_url: sourceUrl,
        status: 'pending',
        total_pages: urls.length,
        completed_pages: 0,
        failed_pages: 0,
        materials_processed: 0,
        progress_percentage: 0,
        field_mappings: {
          fields: fieldMappings,
        },
        scraping_config: {
          mode: scrapingMode,
          extractionPrompt: promptData.prompt,
          systemPrompt: promptData.systemPrompt,
          schema: generateJsonSchema(fieldMappings),
          maxPages: scrapingMode === 'sitemap' ? maxPages : 1,
          timeout,
          retryCount,
          concurrentPages,
          firecrawlOptions,
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
        description:
          error instanceof Error ? error.message : 'Failed to create session',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const getModeIcon = (mode: ScrapingMode) => {
    switch (mode) {
      case 'single-page':
        return MousePointer;
      case 'sitemap':
        return Globe;
      case 'crawl':
        return FileText;
      case 'search':
        return Search;
      case 'map':
        return Map;
      default:
        return Globe;
    }
  };

  const getModeDescription = (mode: ScrapingMode) => {
    switch (mode) {
      case 'single-page':
        return 'Scrape a single webpage with full content and metadata';
      case 'sitemap':
        return 'Parse sitemap XML and scrape multiple pages from the list';
      case 'crawl':
        return 'Crawl website and discover all accessible subpages automatically';
      case 'search':
        return 'Search the web and get full content from search results';
      case 'map':
        return 'Get a complete list of URLs from any website quickly';
      default:
        return '';
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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(
                  [
                    'single-page',
                    'sitemap',
                    'crawl',
                    'search',
                    'map',
                  ] as ScrapingMode[]
                ).map((mode) => {
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
                        <span className="font-medium capitalize">
                          {mode.replace('-', ' ')}
                        </span>
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
                {React.createElement(getModeIcon(scrapingMode), {
                  className: 'h-5 w-5',
                })}
                {scrapingMode === 'single-page' && 'Page URL'}
                {scrapingMode === 'sitemap' && 'Sitemap Configuration'}
                {scrapingMode === 'crawl' && 'Website to Crawl'}
                {scrapingMode === 'search' && 'Search Query'}
                {scrapingMode === 'map' && 'Website to Map'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        onChange={(e) =>
                          setMaxPages(parseInt(e.target.value) || 100)
                        }
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
                        onChange={(e) =>
                          setConcurrentPages(parseInt(e.target.value) || 5)
                        }
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
                    <Label htmlFor="crawl-limit">Page Limit</Label>
                    <Input
                      id="crawl-limit"
                      type="number"
                      value={maxPages}
                      onChange={(e) =>
                        setMaxPages(parseInt(e.target.value) || 100)
                      }
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
                  <Label htmlFor="map-url">Website URL</Label>
                  <Input
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

            </CardContent>
          </Card>

          {/* Field Mappings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Field Mappings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldMappingStep
                fields={fieldMappings}
                onChange={setFieldMappings}
              />
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={timeout}
                    onChange={(e) =>
                      setTimeout(parseInt(e.target.value) || 30000)
                    }
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
                    onChange={(e) =>
                      setRetryCount(parseInt(e.target.value) || 3)
                    }
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
                    {['markdown', 'html', 'links', 'screenshot'].map(
                      (format) => (
                        <div
                          key={format}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={format}
                            checked={firecrawlOptions.formats.includes(format)}
                            onCheckedChange={(checked: boolean) => {
                              setFirecrawlOptions((prev) => ({
                                ...prev,
                                formats: checked
                                  ? [...prev.formats, format]
                                  : prev.formats.filter((f) => f !== format),
                              }));
                            }}
                          />
                          <Label
                            htmlFor={format}
                            className="text-sm capitalize"
                          >
                            {format}
                          </Label>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="onlyMainContent"
                      checked={firecrawlOptions.onlyMainContent}
                      onCheckedChange={(checked: boolean) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          onlyMainContent: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="onlyMainContent" className="text-sm">
                      Main Content Only
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeLinks"
                      checked={firecrawlOptions.includeLinks}
                      onCheckedChange={(checked: boolean) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          includeLinks: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="includeLinks" className="text-sm">
                      Include Links
                    </Label>
                  </div>
                </div>

                <div>
                  <Label htmlFor="excludeTags">
                    Exclude HTML Tags (comma separated)
                  </Label>
                  <Input
                    id="excludeTags"
                    value={firecrawlOptions.excludeTags.join(', ')}
                    onChange={(e) =>
                      setFirecrawlOptions((prev) => ({
                        ...prev,
                        excludeTags: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
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
                    onChange={(e) =>
                      setFirecrawlOptions((prev) => ({
                        ...prev,
                        waitFor: parseInt(e.target.value) || 0,
                      }))
                    }
                    min="0"
                    max="10000"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Extractor Mode</Label>
                  <Select
                    value={firecrawlOptions.extractorMode}
                    onValueChange={(
                      value: 'llm-extraction' | 'css-extraction',
                    ) =>
                      setFirecrawlOptions((prev) => ({
                        ...prev,
                        extractorMode: value,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llm-extraction">
                        LLM Extraction (AI-powered)
                      </SelectItem>
                      <SelectItem value="css-extraction">
                        CSS Extraction (Rule-based)
                      </SelectItem>
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
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          mobile: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="mobile" className="text-sm">
                      Mobile Viewport
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="parsePDF"
                      checked={firecrawlOptions.parsePDF}
                      onCheckedChange={(checked: boolean) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          parsePDF: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="parsePDF" className="text-sm">
                      Parse PDFs
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="blockAds"
                      checked={firecrawlOptions.blockAds}
                      onCheckedChange={(checked: boolean) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          blockAds: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="blockAds" className="text-sm">
                      Block Ads
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="removeBase64Images"
                      checked={firecrawlOptions.removeBase64Images}
                      onCheckedChange={(checked: boolean) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          removeBase64Images: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="removeBase64Images" className="text-sm">
                      Remove Base64 Images
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="skipTlsVerification"
                      checked={firecrawlOptions.skipTlsVerification}
                      onCheckedChange={(checked: boolean) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          skipTlsVerification: !!checked,
                        }))
                      }
                    />
                    <Label htmlFor="skipTlsVerification" className="text-sm">
                      Skip TLS Verification
                    </Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="maxAge">Cache Max Age (seconds)</Label>
                    <Input
                      id="maxAge"
                      type="number"
                      value={firecrawlOptions.maxAge}
                      onChange={(e) =>
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          maxAge: parseInt(e.target.value) || 0,
                        }))
                      }
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
                        setFirecrawlOptions((prev) => ({
                          ...prev,
                          proxy: value,
                        }))
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

          <div className="flex gap-3">
            <Button
              onClick={handlePreviewScraping}
              disabled={loadingPreview || creating || !getSourceUrl().trim()}
              variant="outline"
              className="flex-1 h-11 px-8"
            >
              {loadingPreview ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading Preview...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Preview
                </>
              )}
            </Button>

            <Button
              onClick={createNewSession}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  createNewSession();
                }
              }}
              disabled={creating || loadingPreview || !getSourceUrl().trim()}
              className="flex-1 h-11 px-8"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Session...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Session
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // Main render logic
  const renderContent = () => {
    switch (viewMode) {
      case 'create':
        return renderCreateForm();

      case 'detail':
        if (embedded) {
          return (
            <SessionDetailView
              sessionId={selectedSessionId}
              onBack={() => setViewMode('sessions')}
            />
          );
        }
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
        if (embedded) {
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

  const getTotalPagesForPreview = () => {
    switch (scrapingMode) {
      case 'single-page':
        return 1;
      case 'sitemap':
        return maxPages;
      case 'crawl':
        return maxPages;
      case 'map':
        return maxPages;
      default:
        return 1;
    }
  };

  return (
    <>
      {renderContent()}

      {/* Preview Modal */}
      <ScrapingPreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        materials={previewMaterials}
        url={previewUrl}
        totalPages={getTotalPagesForPreview()}
        onConfirm={() => {
          setShowPreview(false);
          createNewSession();
        }}
        onEdit={() => {
          setShowPreview(false);
        }}
      />
    </>
  );
};
