import React, { useState, useEffect } from 'react';
import { Globe, Settings, FileJson, Eye, CheckCircle } from 'lucide-react';
import { MultiStepWizard, type Step } from '@/components/core/ui/multi-step-wizard';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';
import { generateExtractionPrompt, generateJsonSchema } from '@/utils/scrapingPromptGenerator';
import type { Json } from '@/integrations/supabase/types';

import { Step1SourceInput } from './steps/Step1SourceInput';
import { Step2Configuration } from './steps/Step2Configuration';
import { Step3FieldMapping } from './steps/Step3FieldMapping';
import { Step4Preview } from './steps/Step4Preview';
import { Step5Review } from './steps/Step5Review';
import type { FieldMapping } from './FieldMappingStep';

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

interface FirecrawlOptions {
  formats: string[];
  onlyMainContent: boolean;
  includeLinks: boolean;
  includeTags: string[];
  excludeTags: string[];
  waitFor: number;
  mobile: boolean;
  skipTlsVerification: boolean;
  parsePDF: boolean;
  removeBase64Images: boolean;
  blockAds: boolean;
  extractorMode: 'llm-extraction' | 'css-extraction';
  schema: string;
  actions: unknown[];
  maxAge: number;
  proxy: 'basic' | 'premium' | 'none';
}

interface MultiStepScraperWizardProps {
  onComplete: (sessionId: string) => void;
  onCancel: () => void;
}

const WIZARD_STEPS: Step[] = [
  {
    id: 'source',
    title: 'Source',
    description: 'Select mode & URL',
    icon: Globe,
  },
  {
    id: 'configuration',
    title: 'Configuration',
    description: 'API settings',
    icon: Settings,
  },
  {
    id: 'fields',
    title: 'Field Mapping',
    description: 'Define data fields',
    icon: FileJson,
  },
  {
    id: 'preview',
    title: 'Preview',
    description: 'Test extraction',
    icon: Eye,
    optional: true,
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Create session',
    icon: CheckCircle,
  },
];

export const MultiStepScraperWizard: React.FC<MultiStepScraperWizardProps> = ({
  onComplete,
  onCancel,
}) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Source Input
  const [scrapingMode, setScrapingMode] = useState<ScrapingMode>('single-page');
  const [url, setUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [maxPages, setMaxPages] = useState(100);
  const [concurrentPages, setConcurrentPages] = useState(5);

  // Step 2: Configuration
  const [timeout, setTimeout] = useState(30000);
  const [retryCount, setRetryCount] = useState(3);
  const [firecrawlOptions, setFirecrawlOptions] = useState<FirecrawlOptions>({
    formats: ['markdown', 'html'],
    onlyMainContent: true,
    includeLinks: false,
    includeTags: [],
    excludeTags: ['nav', 'footer', 'aside'],
    waitFor: 2000,
    mobile: false,
    skipTlsVerification: false,
    parsePDF: true,
    removeBase64Images: false,
    blockAds: true,
    extractorMode: 'llm-extraction',
    schema: '',
    actions: [],
    maxAge: 0,
    proxy: 'basic',
  });

  // Step 3: Field Mappings
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

  // Step 4: Preview
  const [previewMaterials, setPreviewMaterials] = useState<PreviewMaterial[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [hasPreviewRun, setHasPreviewRun] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>('');

  // Fetch workspace ID on mount
  useEffect(() => {
    const fetchWorkspace = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: workspaceData } = await supabase
          .from('workspaces')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (workspaceData) {
          setWorkspaceId(workspaceData.id);
        }
      }
    };
    fetchWorkspace();
  }, []);

  const getSourceUrl = () => {
    switch (scrapingMode) {
      case 'single-page':
      case 'crawl':
      case 'map':
        return url;
      case 'sitemap':
        return sitemapUrl;
      case 'search':
        return searchQuery;
      default:
        return '';
    }
  };

  const parseSitemap = async (url: string): Promise<string[]> => {
    const apiService = BrowserApiIntegrationService.getInstance();
    const result = await apiService.callSupabaseFunction('parse-sitemap', {
      sitemapUrl: url,
      maxPages: maxPages,
    });

    if (!result.success || !result.data?.success) {
      throw new Error(result.data?.error || 'Failed to parse sitemap');
    }

    return result.data.urls;
  };

  const handlePreview = async () => {
    const sourceUrl = getSourceUrl();
    if (!sourceUrl.trim()) {
      toast({
        title: 'Error',
        description: `Please enter a ${scrapingMode === 'search' ? 'search query' : 'URL'}`,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
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

      const promptData = await generateExtractionPrompt(workspaceId, fieldMappings);
      if (!promptData) {
        throw new Error('Failed to generate extraction prompt');
      }

      const schema = generateJsonSchema(fieldMappings);

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
      setHasPreviewRun(true);

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
      setIsLoading(false);
    }
  };

  const handleCreateSession = async () => {
    const sourceUrl = getSourceUrl();
    if (!sourceUrl.trim()) {
      toast({
        title: 'Error',
        description: `Please enter a ${scrapingMode === 'search' ? 'search query' : 'URL'}`,
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      let urls: string[] = [];

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
          urls = [sourceUrl];
          break;
        default:
          throw new Error('Invalid scraping mode');
      }

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

      const { data: workspaceData } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const workspaceId = workspaceData?.id;
      if (!workspaceId) {
        throw new Error('No workspace found');
      }

      const promptData = await generateExtractionPrompt(workspaceId, fieldMappings);
      if (!promptData) {
        throw new Error('Failed to generate extraction prompt');
      }

      const sessionId = crypto.randomUUID();
      const jobId = crypto.randomUUID();

      // Create background job first (for unified job tracking)
      const jobData = {
        id: jobId,
        workspace_id: workspaceId,
        job_type: 'web_scraping',
        status: 'pending',
        progress: 0,
        current_stage: 'initializing',
        metadata: {
          session_id: sessionId,
          source_url: sourceUrl,
          scraping_mode: scrapingMode,
          total_pages: urls.length,
          field_count: fieldMappings.length,
        } as Json,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: jobError } = await supabase
        .from('background_jobs')
        .insert([jobData]);

      if (jobError) {
        throw new Error(`Failed to create background job: ${jobError.message}`);
      }

      // Create scraping session linked to background job
      const sessionData = {
        id: sessionId,
        user_id: user.id,
        workspace_id: workspaceId,
        session_id: sessionId,
        background_job_id: jobId,
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
        } as unknown as Json,
      };

      const { data: insertedSession, error: sessionError } = await supabase
        .from('scraping_sessions')
        .insert([sessionData])
        .select()
        .single();

      if (sessionError) {
        throw new Error(`Failed to create session: ${sessionError.message}`);
      }

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

      toast({
        title: 'Success',
        description: `${scrapingMode} session created with ${urls.length} ${urls.length === 1 ? 'page' : 'pages'}`,
      });

      onComplete(insertedSession.id);
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create session',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 0: // Source
        return getSourceUrl().trim().length > 0;
      case 1: // Configuration
        return true;
      case 2: // Field Mappings
        return fieldMappings.length > 0;
      case 3: // Preview (optional)
        return true;
      case 4: // Review
        return true;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    await handleCreateSession();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <Step1SourceInput
            scrapingMode={scrapingMode}
            onScrapingModeChange={setScrapingMode}
            url={url}
            onUrlChange={setUrl}
            sitemapUrl={sitemapUrl}
            onSitemapUrlChange={setSitemapUrl}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            maxPages={maxPages}
            onMaxPagesChange={setMaxPages}
            concurrentPages={concurrentPages}
            onConcurrentPagesChange={setConcurrentPages}
          />
        );
      case 1:
        return (
          <Step2Configuration
            timeout={timeout}
            onTimeoutChange={setTimeout}
            retryCount={retryCount}
            onRetryCountChange={setRetryCount}
            concurrentPages={concurrentPages}
            onConcurrentPagesChange={setConcurrentPages}
            firecrawlOptions={firecrawlOptions}
            onFirecrawlOptionsChange={setFirecrawlOptions}
          />
        );
      case 2:
        return (
          <Step3FieldMapping
            fieldMappings={fieldMappings}
            onFieldMappingsChange={setFieldMappings}
            workspaceId={workspaceId}
            sampleUrl={getSourceUrl()}
          />
        );
      case 3:
        return (
          <Step4Preview
            onPreview={handlePreview}
            isLoading={isLoading}
            previewMaterials={previewMaterials}
            previewUrl={previewUrl}
            hasPreviewRun={hasPreviewRun}
          />
        );
      case 4:
        return (
          <Step5Review
            scrapingMode={scrapingMode}
            sourceUrl={getSourceUrl()}
            maxPages={maxPages}
            timeout={timeout}
            retryCount={retryCount}
            concurrentPages={concurrentPages}
            fieldMappings={fieldMappings}
            onCreateSession={handleCreateSession}
            isCreating={isLoading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <MultiStepWizard
        steps={WIZARD_STEPS}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onComplete={handleComplete}
        canGoNext={canGoNext()}
        canGoPrevious={currentStep > 0}
        isLoading={isLoading}
      >
        {renderStepContent()}
      </MultiStepWizard>
    </div>
  );
};

