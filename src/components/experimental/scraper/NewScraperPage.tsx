import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
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
} from '@/components/core/ui/select';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Separator } from '@/components/core/ui/separator';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

import { SessionDetailView } from './SessionDetailView';
import { ScrapingSessionsList } from './ScrapingSessionsList';
import { ScrapingPreviewModal } from './ScrapingPreviewModal';
import { FieldMappingStep, type FieldMapping } from './FieldMappingStep';
import { generateExtractionPrompt, generateJsonSchema } from '@/utils/scrapingPromptGenerator';
import { MultiStepScraperWizard } from './MultiStepScraperWizard';

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
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewMaterials, setPreviewMaterials] = useState<PreviewMaterial[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState<any>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);

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

  // Firecrawl Options - Optimized defaults for material extraction
  const [firecrawlOptions, setFirecrawlOptions] = useState({
    formats: ['markdown', 'html'] as string[],
    onlyMainContent: true,
    includeLinks: false,
    includeTags: [] as string[],
    excludeTags: ['nav', 'footer', 'aside'] as string[],
    waitFor: 2000, // Wait for dynamic content to load
    mobile: false,
    skipTlsVerification: false,
    parsePDF: true,
    removeBase64Images: false, // Keep images - we need them for material extraction
    blockAds: true,
    extractorMode: 'llm-extraction' as 'llm-extraction' | 'css-extraction', // Always use LLM for best results
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
        .maybeSingle();

      const workspaceId = workspaceData?.id;
      if (!workspaceId) {
        throw new Error('No workspace found');
      }

      // Determine preview URL based on mode
      let previewUrlToUse = sourceUrl;
      let urls: string[] = [];

      switch (scrapingMode) {
        case 'single-page':
        case 'crawl':
        case 'map':
          urls = [sourceUrl];
          previewUrlToUse = sourceUrl;
          break;
        case 'sitemap':
          urls = await parseSitemap(sourceUrl);
          if (urls.length === 0) {
            throw new Error('No URLs found in sitemap');
          }
          previewUrlToUse = urls[0];
          break;
        case 'search':
          urls = [sourceUrl];
          previewUrlToUse = sourceUrl;
          break;
      }

      // Generate dynamic extraction prompt from field mappings
      const promptData = await generateExtractionPrompt(workspaceId, fieldMappings);
      if (!promptData) {
        throw new Error('Failed to generate extraction prompt');
      }

      // Generate JSON schema from field mappings
      const schema = generateJsonSchema(fieldMappings);

      // Create session in database FIRST (so we have sessionId for preview)
      const sessionId = crypto.randomUUID();
      const sessionData = {
        id: sessionId,
        user_id: user.id,
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
          schema: schema,
          maxPages: scrapingMode === 'sitemap' ? maxPages : 1,
          timeout,
          retryCount,
          concurrentPages,
          firecrawlOptions,
        } as Json,
      };

      const { data: insertedSession, error: sessionError } = await supabase
        .from('scraping_sessions')
        .insert([sessionData])
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

      // Create page entries
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
        await supabase.from('scraping_pages').insert(pageEntries);
      }

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
      setPreviewSessionId(sessionId);
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
        .maybeSingle();

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
        return 'Best for: Scraping a single product page or specific URL with full content extraction';
      case 'sitemap':
        return 'Best for: When you have a sitemap.xml with known product URLs to scrape in bulk';
      case 'crawl':
        return 'Best for: Discovering and scraping all product pages automatically from a website';
      case 'search':
        return 'Best for: Finding and scraping pages based on search queries across the web';
      case 'map':
        return 'Best for: Quickly getting a complete list of URLs from a website without scraping content';
      default:
        return '';
    }
  };

  const getModeUseCase = (mode: ScrapingMode) => {
    switch (mode) {
      case 'single-page':
        return 'Use when you want to extract materials from one specific page';
      case 'sitemap':
        return 'Use when the website provides a sitemap with all product URLs';
      case 'crawl':
        return 'Use when you want to automatically discover all pages on a website';
      case 'search':
        return 'Use when you need to find pages via search engines';
      case 'map':
        return 'Use when you only need URLs without extracting content yet';
      default:
        return '';
    }
  };

  const getModeTips = (mode: ScrapingMode) => {
    switch (mode) {
      case 'single-page':
        return '💡 Perfect for testing extraction on a single product page before scaling up';
      case 'sitemap':
        return '💡 Most efficient when you have a sitemap.xml - usually found at /sitemap.xml';
      case 'crawl':
        return '💡 The crawler will automatically discover product pages - set a reasonable page limit';
      case 'search':
        return '💡 Uses Firecrawl search to find relevant pages across the web';
      case 'map':
        return '💡 Fast way to get all URLs first, then scrape them in a separate session';
      default:
        return '';
    }
  };

  const renderCreateForm = () => {
    const formContent = (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => setViewMode('sessions')}
          >
            ← Back to Sessions
          </Button>
          <h1 className="text-2xl font-bold">Create New Scraping Session</h1>
        </div>

        <MultiStepScraperWizard
          onComplete={async (sessionId) => {
            // Get the background_job_id from the session
            const { data: session } = await supabase
              .from('scraping_sessions')
              .select('background_job_id')
              .eq('id', sessionId)
              .single();

            if (session?.background_job_id) {
              // Redirect to async queue monitor (same as PDF processing)
              if (embedded) {
                // If embedded in DataImportHub, use navigate
                navigate(`/admin/async-queue-monitor?jobId=${session.background_job_id}`);
              } else {
                // If standalone page, also navigate
                navigate(`/admin/async-queue-monitor?jobId=${session.background_job_id}`);
              }
            } else {
              // Fallback to detail view if no job ID
              setSelectedSessionId(sessionId);
              setViewMode('detail');
            }
          }}
          onCancel={() => setViewMode('sessions')}
        />
      </div>
    );

    // Wrap in layout if not embedded
    if (embedded) {
      return formContent;
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
          {formContent}
        </div>
      </div>
    );
  };

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
        onClose={() => {
          setShowPreview(false);
          setPreviewSessionId(null);
        }}
        materials={previewMaterials}
        url={previewUrl}
        totalPages={getTotalPagesForPreview()}
        sessionId={previewSessionId || undefined}
        onConfirm={() => {
          setShowPreview(false);
          // Navigate to session detail view
          if (previewSessionId) {
            setSelectedSessionId(previewSessionId);
            setViewMode('detail');
          }
          setPreviewSessionId(null);
        }}
        onEdit={() => {
          setShowPreview(false);
          setPreviewSessionId(null);
        }}
      />
    </>
  );
};
