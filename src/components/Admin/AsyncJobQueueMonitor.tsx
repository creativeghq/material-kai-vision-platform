import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/services/logger.service';
import { TempFileCleanupModal } from './TempFileCleanupModal';
import { JobCheckpointTimeline } from './JobCheckpointTimeline';
import {
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Activity,
  ChevronRight,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Package,
  XCircle,
  Trash2,
  Link,
  Terminal,
  Download,
  Copy,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/core/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface ProductProgress {
  id: string;
  job_id: string;
  product_id: string | null;
  product_name: string;
  product_index: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  current_stage: string | null;
  stages_completed: string[];
  error_message: string | null;
  error_stage: string | null;
  metrics: {
    chunks_created?: number;
    images_processed?: number;
    images_material?: number;
    images_non_material?: number;
    relationships_created?: number;
    pages_extracted?: number;
    product_db_id?: string;
    processing_time_ms?: number;
    text_embeddings_generated?: number;
    clip_embeddings_generated?: number;
    layout_regions_detected?: number;
  };
  metadata?: {
    product_db_id?: string;
    page_range?: number[];
    confidence?: number;
    [key: string]: any;
  };
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface BackgroundJob {
  id: string;
  workspace_id: string;
  document_id: string | null;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying' | 'cancelled' | 'interrupted';
  progress: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  interrupted_at: string | null;
  last_heartbeat: string | null;
  error: string | null;
  metadata: {
    filename?: string;
    stage?: string;
    products_discovered?: number;
    chunks_created?: number;
    images_extracted?: number;
    embeddings_generated?: number;
    processing_time_ms?: number;
    ai_model?: string;
    retry_count?: number;
    // XML import specific
    source_name?: string;
    import_type?: string;
    total_products?: number;
    processed_products?: number;
    failed_products?: number;
    [key: string]: any;
  } | null;
}

// XML Import Job from data_import_jobs table
interface XMLImportJob {
  id: string;
  workspace_id: string;
  import_type: string;
  source_name: string | null;
  source_url: string | null;
  status: string;
  total_products: number;
  processed_products: number;
  failed_products: number;
  category: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metadata: any;
}

interface JobCheckpoint {
  id: string;
  job_id: string;
  stage: string;
  checkpoint_data: any;
  metadata: any;
  created_at: string;
}

interface JobTypeMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
  interrupted: number;
  cancelled: number;
  total: number;
  success_rate: number;
  avg_processing_time: number;
}

interface QueueMetrics {
  pdf_processing: JobTypeMetrics;
  web_scraping: JobTypeMetrics;
  xml_import: JobTypeMetrics;
  all_jobs: JobTypeMetrics;
  total_documents: number;
  total_products_created: number;
  total_chunks_created: number;
  total_images_extracted: number;
}

// Global Pipeline Definition for the Monitor
const GLOBAL_PIPELINE_FLOW = [
  { id: 'initialized', name: 'Job Initialized', icon: Clock, checkpoint: 'initialized' },
  { id: 'extraction', name: 'Document Extraction', icon: FileText, checkpoint: 'pdf_extracted' },
  { id: 'discovery', name: 'Product Discovery', icon: Zap, checkpoint: 'products_detected' },
  { id: 'processing', name: 'Product Processing', icon: Package, checkpoint: 'products_created' },
  { id: 'entities', name: 'Document Entities', icon: Link, checkpoint: 'document_entities_created' },
  { id: 'quality', name: 'Quality Enhancement', icon: Activity, checkpoint: 'completed' },
];

// Enhanced Product Stages with detailed sub-steps
const PRODUCT_STAGES = [
  {
    id: 'extraction',
    name: 'Page Extraction',
    icon: FileText,
    description: 'Map catalog pages to PDF pages + YOLO layout detection'
  },
  {
    id: 'chunking',
    name: 'Text Chunking',
    icon: FileText,
    description: 'Create semantic chunks + embeddings'
  },
  {
    id: 'images',
    name: 'Image Processing',
    icon: ImageIcon,
    description: '4-layer extraction + Vision classification'
  },
  {
    id: 'creation',
    name: 'Product Creation',
    icon: Package,
    description: 'Create product record + metadata'
  },
  {
    id: 'relationships',
    name: 'Relationships',
    icon: Link,
    description: 'Link entities + create relations'
  },
];

export const AsyncJobQueueMonitor: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  const [jobCheckpoints, setJobCheckpoints] = useState<any[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [cancellingJob, setCancellingJob] = useState<string | null>(null);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [selectedTab, setSelectedTab] = useState<'all' | 'pdf_processing' | 'web_scraping' | 'xml_import'>('all');
  const [showDeleteJobModal, setShowDeleteJobModal] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState('');
  const [showTempCleanupModal, setShowTempCleanupModal] = useState(false);
  const [productProgress, setProductProgress] = useState<ProductProgress[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Debug log
  console.log('AsyncJobQueueMonitor render - selectedJob:', selectedJob);

  const toggleStage = (stageId: number) => {
    setExpandedStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stageId)) {
        newSet.delete(stageId);
      } else {
        newSet.add(stageId);
      }
      return newSet;
    });
  };

  // Fetch product progress for a job directly from Supabase
  const fetchProductProgress = async (jobId: string) => {
    try {
      setLoadingProducts(true);

      // Query product_processing_status table (the correct table name)
      const { data, error } = await supabase
        .from('product_processing_status')
        .select('*')
        .eq('job_id', jobId)
        .order('product_index', { ascending: true });

      if (error) {
        console.error('Error fetching product progress:', error);
      }

      // If we have products in the processing status table, use them
      if (data && data.length > 0) {
        // Map the data to match the ProductProgress interface
        const mappedData = data.map(item => ({
          id: item.id,
          job_id: item.job_id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_index: item.product_index,
          status: item.status as 'pending' | 'processing' | 'completed' | 'failed' | 'skipped',
          current_stage: item.current_stage,
          stages_completed: item.stages_completed || [],
          error_message: item.error_message,
          error_stage: item.error_stage,
          metrics: item.metrics || {},
          started_at: item.started_at,
          completed_at: item.completed_at,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));

        setProductProgress(mappedData);
        return;
      }

      // Fallback: If no products in processing status table, check job_checkpoints
      // This is useful during Stage 0 discovery when products are discovered but not yet in processing
      const { data: checkpointData, error: checkpointError } = await supabase
        .from('job_checkpoints')
        .select('checkpoint_data, metadata')
        .eq('job_id', jobId)
        .eq('stage', 'products_detected')
        .single();

      if (checkpointError || !checkpointData) {
        // No checkpoint found either, set empty array
        setProductProgress([]);
        return;
      }

      // Extract product names from checkpoint data
      const productNames = checkpointData.checkpoint_data?.product_names || [];
      const discoveredProducts = productNames.map((name: string, index: number) => ({
        id: `discovered-${jobId}-${index}`,
        job_id: jobId,
        product_id: null,
        product_name: name,
        product_index: index,
        status: 'pending' as const,
        current_stage: 'discovery',
        stages_completed: ['discovery'],
        error_message: null,
        error_stage: null,
        metrics: {},
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      setProductProgress(discoveredProducts);
    } catch (error) {
      console.error('Error fetching product progress:', error);
      setProductProgress([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Fetch job details with checkpoints
  const fetchJobDetails = async (job: BackgroundJob) => {
    console.log('fetchJobDetails called with job:', job);
    try {
      setLoadingCheckpoints(true);

      // Fetch fresh job data
      const { data: jobData, error: jobError } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('id', job.id)
        .single();

      if (jobError) {
        console.error('Error fetching job data:', jobError);
        throw jobError;
      }

      // Update selected job with fresh data using deep comparison to prevent modal blinking
      if (jobData) {
        setSelectedJob(prev => {
          // If no previous job, set the new one
          if (!prev) return jobData as BackgroundJob;

          // Deep comparison of relevant fields to prevent unnecessary re-renders
          if (prev.status === jobData.status &&
              prev.progress === jobData.progress &&
              JSON.stringify(prev.metadata) === JSON.stringify(jobData.metadata)) {
            return prev; // No change, keep same reference to prevent modal blink
          }

          console.log('Selected job updated with new data');
          return jobData as BackgroundJob;
        });
      }

      // Fetch all checkpoints for this job
      const { data: checkpoints, error } = await supabase
        .from('job_checkpoints')
        .select('*')
        .eq('job_id', job.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching checkpoints:', error);
        throw error;
      }

      console.log('Checkpoints fetched:', checkpoints);

      // Update checkpoints with deep comparison to prevent unnecessary re-renders
      setJobCheckpoints(prev => {
        const newCheckpoints = checkpoints || [];
        // Only update if checkpoints actually changed
        if (JSON.stringify(prev) === JSON.stringify(newCheckpoints)) {
          return prev; // No change, keep same reference
        }
        return newCheckpoints;
      });

      // Fetch product progress for PDF processing jobs
      if (job.job_type === 'pdf_processing' || job.job_type === 'product_discovery_upload') {
        await fetchProductProgress(job.id);
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
    } finally {
      setLoadingCheckpoints(false);
    }
  };

  // 🆕 Normalize XML import job to BackgroundJob format
  const normalizeXMLJob = (xmlJob: XMLImportJob): BackgroundJob => {
    // Calculate progress percentage
    const progress = xmlJob.total_products > 0
      ? Math.round((xmlJob.processed_products / xmlJob.total_products) * 100)
      : 0;

    return {
      id: xmlJob.id,
      workspace_id: xmlJob.workspace_id,
      document_id: null,
      job_type: 'xml_import',
      status: xmlJob.status as any, // Map status
      progress: progress,
      created_at: xmlJob.created_at,
      started_at: xmlJob.started_at,
      completed_at: xmlJob.completed_at,
      failed_at: null,
      interrupted_at: null,
      last_heartbeat: null,
      error: xmlJob.error_message,
      metadata: {
        source_name: xmlJob.source_name || 'XML Import',
        import_type: xmlJob.import_type,
        total_products: xmlJob.total_products,
        processed_products: xmlJob.processed_products,
        failed_products: xmlJob.failed_products,
        category: xmlJob.category,
        source_url: xmlJob.source_url,
        ...xmlJob.metadata,
      },
    };
  };

  const fetchQueueData = useCallback(async () => {
    try {
      setError(null);

      // Fetch background jobs (PDF, Web Scraping, Product Discovery, and Image Embedding Regeneration)
      const { data: bgJobsData, error: bgJobsError } = await supabase
        .from('background_jobs')
        .select('*')
        .in('job_type', ['pdf_processing', 'web_scraping', 'product_discovery_upload', 'image_embedding_regeneration'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (bgJobsError) throw bgJobsError;

      // 🆕 Fetch XML import jobs from data_import_jobs table
      const { data: xmlJobsData, error: xmlJobsError } = await supabase
        .from('data_import_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (xmlJobsError) {
        console.warn('⚠️ Failed to fetch XML import jobs:', xmlJobsError);
      }

      // 🆕 Normalize XML jobs and combine with background jobs
      const normalizedXMLJobs = (xmlJobsData || []).map(normalizeXMLJob);
      const allJobs = [...(bgJobsData || []), ...normalizedXMLJobs];

      // Sort by created_at descending
      allJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log(`✅ Fetched ${bgJobsData?.length || 0} background jobs + ${normalizedXMLJobs.length} XML jobs = ${allJobs.length} total`);

      setJobs(allJobs);

      // 🆕 Helper function to calculate metrics for a specific job type
      const calculateJobTypeMetrics = (jobs: BackgroundJob[], jobType?: string): JobTypeMetrics => {
        let filteredJobs: BackgroundJob[];

        if (!jobType) {
          filteredJobs = jobs;
        } else if (jobType === 'pdf_processing') {
          // Group product_discovery_upload with pdf_processing
          filteredJobs = jobs.filter(j =>
            j.job_type === 'pdf_processing' ||
            j.job_type === 'product_discovery_upload',
          );
        } else {
          filteredJobs = jobs.filter(j => j.job_type === jobType);
        }

        const pending = filteredJobs.filter((j) => j.status === 'pending').length;
        const processing = filteredJobs.filter((j) => j.status === 'processing').length;
        const completed = filteredJobs.filter((j) => j.status === 'completed').length;
        const failed = filteredJobs.filter((j) => j.status === 'failed').length;
        const retrying = filteredJobs.filter((j) => j.status === 'retrying').length;
        const interrupted = filteredJobs.filter((j) => j.status === 'interrupted').length;
        const cancelled = filteredJobs.filter((j) => j.status === 'cancelled').length;
        const total = filteredJobs.length;

        const completedJobsFiltered = filteredJobs.filter((j) => j.status === 'completed');
        const successRate = total > 0 ? (completed / total) * 100 : 0;

        // Calculate average processing time from completed jobs
        let avgProcessingTime = 0;
        if (completedJobsFiltered.length > 0) {
          const totalTime = completedJobsFiltered.reduce((sum, job) => {
            if (job.started_at && job.completed_at) {
              const start = new Date(job.started_at).getTime();
              const end = new Date(job.completed_at).getTime();
              return sum + (end - start);
            }
            return sum;
          }, 0);
          avgProcessingTime = totalTime / completedJobsFiltered.length / 1000; // Convert to seconds
        }

        return {
          pending,
          processing,
          completed,
          failed,
          retrying,
          interrupted,
          cancelled,
          total,
          success_rate: successRate,
          avg_processing_time: avgProcessingTime,
        };
      };

      // 🆕 Calculate metrics from combined jobs (background_jobs + data_import_jobs)
      const calculateMetrics = (): QueueMetrics => {
        // Calculate metrics for each job type
        const pdfMetrics = calculateJobTypeMetrics(allJobs, 'pdf_processing');
        const scrapingMetrics = calculateJobTypeMetrics(allJobs, 'web_scraping');
        const xmlMetrics = calculateJobTypeMetrics(allJobs, 'xml_import');
        const allMetrics = calculateJobTypeMetrics(allJobs); // All jobs combined

        // Calculate totals from metadata
        const totalProducts = allJobs.reduce((sum, job) => {
          return sum + (
            job.metadata?.result?.products_discovered ||
            job.metadata?.products_discovered ||
            job.metadata?.products_created ||
            job.metadata?.processed_products || // XML jobs
            job.metadata?.processed ||
            0
          );
        }, 0);

        const totalChunks = allJobs.reduce((sum, job) => {
          return sum + (job.metadata?.chunks_created || 0);
        }, 0);

        const totalImages = allJobs.reduce((sum, job) => {
          return sum + (job.metadata?.images_extracted || 0);
        }, 0);

        const totalDocuments = new Set(allJobs.map((j) => j.document_id).filter(Boolean)).size;

        return {
          pdf_processing: pdfMetrics,
          web_scraping: scrapingMetrics,
          xml_import: xmlMetrics,
          all_jobs: allMetrics,
          total_documents: totalDocuments,
          total_products_created: totalProducts,
          total_chunks_created: totalChunks,
          total_images_extracted: totalImages,
        };
      };

      setMetrics(calculateMetrics());
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch queue data',
      );
      setLoading(false);
    }
  }, []);

  // 🆕 Filter jobs by selected tab
  const getFilteredJobs = (): BackgroundJob[] => {
    if (selectedTab === 'all') {
      return jobs;
    }

    // Group product_discovery_upload with pdf_processing
    if (selectedTab === 'pdf_processing') {
      return jobs.filter(job =>
        job.job_type === 'pdf_processing' ||
        job.job_type === 'product_discovery_upload',
      );
    }

    return jobs.filter(job => job.job_type === selectedTab);
  };

  useEffect(() => {
    fetchQueueData();

    // Set up real-time subscriptions for all job-related tables
    const jobsSubscription = supabase
      .channel('background_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'background_jobs',
        },
        () => {
          console.log('background_jobs changed - refreshing data');
          fetchQueueData();
        },
      )
      .subscribe();

    const scrapingSubscription = supabase
      .channel('scraping_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_sessions',
        },
        () => {
          console.log('scraping_sessions changed - refreshing data');
          fetchQueueData();
        },
      )
      .subscribe();

    const importSubscription = supabase
      .channel('data_import_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'data_import_jobs',
        },
        () => {
          console.log('data_import_jobs changed - refreshing data');
          fetchQueueData();
        },
      )
      .subscribe();

    const webhookSubscription = supabase
      .channel('webhook_calls_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'webhook_calls',
        },
        () => {
          console.log('webhook_calls changed - refreshing data');
          fetchQueueData();
        },
      )
      .subscribe();

    // Auto-refresh interval as backup
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(fetchQueueData, 10000); // Refresh every 10 seconds
    }

    return () => {
      jobsSubscription.unsubscribe();
      scrapingSubscription.unsubscribe();
      importSubscription.unsubscribe();
      webhookSubscription.unsubscribe();
      if (interval) clearInterval(interval);
    };
  }, [fetchQueueData, autoRefresh]);

  // 🔧 FIX: Separate useEffect to refresh selected job data WITHOUT closing modal
  useEffect(() => {
    if (!selectedJob || !autoRefresh) return;

    const refreshSelectedJob = async () => {
      try {
        // Fetch fresh job data
        const { data: jobData, error: jobError } = await supabase
          .from('background_jobs')
          .select('*')
          .eq('id', selectedJob.id)
          .single();

        if (jobError || !jobData) return;

        const typedJobData = jobData as BackgroundJob;
        const productsDiscoveredCount = typedJobData.metadata?.result?.products_discovered || typedJobData.metadata?.products_discovered || 0;
        const previousProductsCount = selectedJob.metadata?.result?.products_discovered || selectedJob.metadata?.products_discovered || 0;

        // Update selected job ONLY if data actually changed
        setSelectedJob(prev => {
          if (!prev) return prev;

          // Deep comparison to prevent unnecessary re-renders
          if (prev.status === typedJobData.status &&
              prev.progress === typedJobData.progress &&
              JSON.stringify(prev.metadata) === JSON.stringify(typedJobData.metadata)) {
            return prev; // No change, keep same reference to prevent modal blink
          }

          return typedJobData;
        });

        // Refresh checkpoints with deep comparison
        const { data: checkpoints } = await supabase
          .from('job_checkpoints')
          .select('*')
          .eq('job_id', selectedJob.id)
          .order('created_at', { ascending: true });

        if (checkpoints) {
          setJobCheckpoints(prev => {
            if (JSON.stringify(prev) === JSON.stringify(checkpoints)) {
              return prev; 
            }
            return checkpoints;
          });
        }

        // 🚀 PROACTIVE PRODUCT REFRESH: 
        // Fetch products if:
        // 1. Job status is processing AND (products were just discovered OR it's been a while)
        // 2. Job status just changed to completed
        // 3. We have counts in metadata but none in our local state
        const isPdfJob = typedJobData.job_type === 'pdf_processing' || 
                         typedJobData.job_type === 'product_discovery_upload';
        
        const shouldFetchProducts = isPdfJob && (
          (typedJobData.status === 'processing' && (productsDiscoveredCount > 0 || jobCheckpoints.some(cp => cp.stage === 'products_detected'))) ||
          (typedJobData.status === 'completed' && productProgress.length === 0) ||
          (productsDiscoveredCount !== previousProductsCount)
        );

        if (shouldFetchProducts) {
          console.log(`🔄 Proactively fetching products (Discovered: ${productsDiscoveredCount})`);
          await fetchProductProgress(typedJobData.id);
        }
      } catch (error) {
        console.error('Error refreshing selected job:', error);
      }
    };

    // Refresh selected job every 5 seconds (faster than main refresh)
    const interval = setInterval(refreshSelectedJob, 5000);

    return () => clearInterval(interval);
  }, [selectedJob, autoRefresh]);

  // ✅ REMOVED: Duplicate polling interval that was causing modal blink
  // The refreshSelectedJob interval (lines 505-553) already handles this with proper deep comparison

  // Handle jobId query parameter - auto-open modal for specific job
  useEffect(() => {
    const jobId = searchParams.get('jobId');
    if (!jobId || selectedJob) return;

    // Try to find job in loaded jobs first
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      console.log('🎯 Auto-opening modal for job from URL (found in jobs list):', jobId);
      fetchJobDetails(job);
      // Remove jobId from URL after opening
      setSearchParams({});
      return;
    }

    // If jobs are still loading, wait for them
    if (loading) {
      console.log('⏳ Jobs still loading, waiting...');
      return;
    }

    // If jobs loaded but job not found, fetch it directly from database
    if (jobs.length > 0) {
      console.log('🔍 Job not in list, fetching directly from database:', jobId);
      supabase
        .from('background_jobs')
        .select('*')
        .eq('id', jobId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('❌ Failed to fetch job:', error);
            return;
          }
          if (data) {
            console.log('✅ Found job in database, opening modal:', data);
            fetchJobDetails(data as BackgroundJob);
            setSearchParams({});
          }
        });
    }
  }, [searchParams, jobs, selectedJob, loading, setSearchParams]);

  // Check if job has recent heartbeat (within last 30 seconds)
  const hasRecentHeartbeat = (job: BackgroundJob): boolean => {
    if (!job.last_heartbeat) return false;
    const heartbeatTime = new Date(job.last_heartbeat).getTime();
    const now = Date.now();
    const thirtySecondsAgo = now - 30000;
    return heartbeatTime > thirtySecondsAgo;
  };

  const getStatusBadge = (status: string, job?: BackgroundJob) => {
    const statusConfig: Record<string, { color: string; icon: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
      processing: { color: 'bg-blue-100 text-blue-800', icon: '⚙️' },
      completed: { color: 'bg-green-100 text-green-800', icon: '✅' },
      failed: { color: 'bg-red-100 text-red-800', icon: '❌' },
      cancelled: { color: 'bg-gray-100 text-gray-800', icon: '🚫' },
      interrupted: { color: 'bg-orange-100 text-orange-800', icon: '⚠️' },
      retrying: { color: 'bg-purple-100 text-purple-800', icon: '🔄' },
    };
    const config = statusConfig[status] || statusConfig.pending;

    // Add pulsing animation for actively processing jobs with recent heartbeat
    const isActivelyProcessing = job && (status === 'processing' || status === 'retrying') && hasRecentHeartbeat(job);

    return (
      <Badge className={`${config.color} ${isActivelyProcessing ? 'animate-pulse' : ''}`}>
        {config.icon} {status}
        {isActivelyProcessing && <span className="ml-1 inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
      </Badge>
    );
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Helper function to calculate elapsed time for a job
  const getElapsedTime = (job: BackgroundJob): string => {
    // For completed jobs, show total duration
    if (job.status === 'completed' && job.started_at && job.completed_at) {
      const start = new Date(job.started_at).getTime();
      const end = new Date(job.completed_at).getTime();
      const seconds = Math.floor((end - start) / 1000);
      return formatTime(seconds);
    }

    // For failed jobs, show time until failure
    if (job.status === 'failed' && job.started_at && job.failed_at) {
      const start = new Date(job.started_at).getTime();
      const end = new Date(job.failed_at).getTime();
      const seconds = Math.floor((end - start) / 1000);
      return formatTime(seconds);
    }

    // For interrupted jobs, show time until interruption
    if (job.status === 'interrupted' && job.started_at && job.interrupted_at) {
      const start = new Date(job.started_at).getTime();
      const end = new Date(job.interrupted_at).getTime();
      const seconds = Math.floor((end - start) / 1000);
      return formatTime(seconds);
    }

    // For running jobs, show elapsed time since start
    if ((job.status === 'processing' || job.status === 'retrying') && job.started_at) {
      const start = new Date(job.started_at).getTime();
      const now = Date.now();
      const seconds = Math.floor((now - start) / 1000);
      return formatTime(seconds);
    }

    // For pending jobs, show time since creation
    if (job.status === 'pending') {
      return formatDistanceToNow(new Date(job.created_at), { addSuffix: true });
    }

    return 'N/A';
  };

  // Helper function to format values for display (handles arrays and objects)
  const formatValue = (value: any, key?: string): string | JSX.Element => {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    // Handle arrays - convert to comma-separated string
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      // Special handling for chunk_ids - show total count instead of IDs
      if (key === 'chunk_ids') {
        return `${value.length} chunks`;
      }

      // Special handling for product_names - show count with tooltip
      if (key === 'product_names') {
        return 'PRODUCT_NAMES_TOOLTIP'; // Marker for special rendering
      }

      // For arrays of primitives, join with commas (but limit length)
      if (value.every(item => typeof item !== 'object')) {
        const joined = value.join(', ');
        if (joined.length > 100) {
          return `${value.length} items`;
        }
        return joined;
      }
      // For arrays of objects, show count
      return `[${value.length} items]`;
    }

    // Handle objects - show key count or stringify if small
    if (typeof value === 'object') {
      const str = JSON.stringify(value);
      if (str.length <= 50) return str;
      return `{${Object.keys(value).length} fields}`;
    }

    // Handle primitives
    return String(value);
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this job? All partial data (chunks, embeddings, images, products, files) will be deleted. This action cannot be undone.')) {
      return;
    }

    setCancellingJob(jobId);
    try {
      
      const response = await fetch(`/api/jobs/${jobId}?cleanup=true`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel job: ${response.statusText}`);
      }

      const result = await response.json();

      // Show cleanup stats if available
      if (result.cleanup_stats) {
        console.log('Cleanup stats:', result.cleanup_stats);
      }

      // Refresh the job list
      await fetchQueueData();

      // Close the dialog if this was the selected job
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }

      toast.success('Job cancelled successfully');
    } catch (error) {
      console.error('Error cancelling job:', error);
      logger.error('Error cancelling job', error, { jobId });
      toast.error(`Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCancellingJob(null);
    }
  };

  const handleClearQueue = async () => {
    // Include ALL jobs that can be cleared: pending, failed, interrupted, AND processing
    const jobsToClear = jobs.filter(
      (job) => job.status === 'pending' || job.status === 'failed' || job.status === 'interrupted' || job.status === 'processing' || job.status === 'retrying',
    );

    if (jobsToClear.length === 0) {
      toast.info('No jobs to clear');
      return;
    }

    // Count jobs by status for confirmation message
    const statusCounts = {
      pending: jobsToClear.filter(j => j.status === 'pending').length,
      processing: jobsToClear.filter(j => j.status === 'processing' || j.status === 'retrying').length,
      failed: jobsToClear.filter(j => j.status === 'failed').length,
      interrupted: jobsToClear.filter(j => j.status === 'interrupted').length,
    };

    const statusMessage = [
      statusCounts.processing > 0 && `${statusCounts.processing} processing (will be interrupted)`,
      statusCounts.pending > 0 && `${statusCounts.pending} pending`,
      statusCounts.failed > 0 && `${statusCounts.failed} failed`,
      statusCounts.interrupted > 0 && `${statusCounts.interrupted} interrupted`,
    ].filter(Boolean).join(', ');

    if (
      !confirm(
        `Are you sure you want to clear ALL ${jobsToClear.length} jobs (${statusMessage})?\n\nThis will:\n• Interrupt all processing jobs\n• Delete all job data (chunks, embeddings, images, products)\n\nThis action cannot be undone.`,
      )
    ) {
      return;
    }

    setClearingQueue(true);
    let successCount = 0;
    let failCount = 0;
    let interruptedCount = 0;

    try {
      // First, interrupt any processing jobs by marking them as interrupted in the database
      const processingJobs = jobsToClear.filter(j => j.status === 'processing' || j.status === 'retrying');
      if (processingJobs.length > 0) {
        toast.info(`Interrupting ${processingJobs.length} processing job(s)...`);

        for (const job of processingJobs) {
          try {
            // Mark as interrupted in the database so the worker stops
            const { error } = await supabase
              .from('background_jobs')
              .update({
                status: 'interrupted',
                interrupted_at: new Date().toISOString(),
                error: 'Job interrupted by user via Clear Queue'
              })
              .eq('id', job.id);

            if (!error) {
              interruptedCount++;
            }
          } catch (error) {
            console.error(`Failed to interrupt job ${job.id}:`, error);
          }
        }

        // Wait a moment for workers to acknowledge the interruption
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Now delete all jobs (including the newly interrupted ones)
      for (const job of jobsToClear) {
        try {
          const response = await fetch(
            `/api/rag/documents/jobs/${job.id}`,
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
            },
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(`Failed to delete job ${job.id}:`, error);
          logger.error(`Failed to delete job ${job.id}`, error);
          failCount++;
        }
      }

      // Refresh the job list
      await fetchQueueData();

      const resultMessage = [
        interruptedCount > 0 && `${interruptedCount} interrupted`,
        successCount > 0 && `${successCount} deleted`,
        failCount > 0 && `${failCount} failed`,
      ].filter(Boolean).join(', ');

      toast.success(`Queue cleared: ${resultMessage}`);
    } catch (error) {
      console.error('Error clearing queue:', error);
      toast.error(`Failed to clear queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearingQueue(false);
    }
  };

  const handleDeleteJobById = async () => {
    if (!deleteJobId.trim()) {
      toast.error('Please enter a job ID');
      return;
    }

    if (!confirm(`Are you sure you want to delete job ${deleteJobId} and ALL its associated data? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/rag/documents/jobs/${deleteJobId.trim()}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to delete job: ${response.statusText}`);
      }

      const result = await response.json();

      // Show success message with stats
      const stats = result.stats || {};
      const statsMessage = [
        stats.chunks_deleted > 0 && `${stats.chunks_deleted} chunks`,
        stats.embeddings_deleted > 0 && `${stats.embeddings_deleted} embeddings`,
        stats.images_deleted > 0 && `${stats.images_deleted} images`,
        stats.products_deleted > 0 && `${stats.products_deleted} products`,
        stats.storage_files_deleted > 0 && `${stats.storage_files_deleted} storage files`,
      ].filter(Boolean).join(', ');

      toast.success(`Job deleted successfully! Deleted: ${statsMessage || 'Job record'}`);

      // Close modal and refresh
      setShowDeleteJobModal(false);
      setDeleteJobId('');
      await fetchQueueData();

    } catch (error) {
      console.error('Error deleting job:', error);
      logger.error('Error deleting job', error, { deleteJobId });
      toast.error(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    console.log('[AsyncJobQueueMonitor] handleDeleteJob called with jobId:', jobId);

    if (!confirm('Are you sure you want to permanently delete this job and ALL its associated data (chunks, embeddings, images, products)? This action cannot be undone.')) {
      console.log('[AsyncJobQueueMonitor] User cancelled delete confirmation');
      return;
    }

    console.log('[AsyncJobQueueMonitor] User confirmed delete, starting deletion...');
    setDeletingJob(jobId);

    try {
      // Use the API endpoint which properly deletes all related data
      const apiUrl = `/api/rag/documents/jobs/${jobId}`;
      console.log('[AsyncJobQueueMonitor] Calling DELETE:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[AsyncJobQueueMonitor] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[AsyncJobQueueMonitor] Delete failed:', errorData);
        throw new Error(errorData.detail || `Failed to delete job: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[AsyncJobQueueMonitor] Delete result:', result);

      // Refresh the job list
      await fetchQueueData();

      // Close the dialog if this was the selected job
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }

      // Show success message with stats
      const stats = result.stats || {};
      const statsMessage = [
        stats.chunks_deleted > 0 && `${stats.chunks_deleted} chunks`,
        stats.embeddings_deleted > 0 && `${stats.embeddings_deleted} embeddings`,
        stats.images_deleted > 0 && `${stats.images_deleted} images`,
        stats.products_deleted > 0 && `${stats.products_deleted} products`,
        stats.storage_files_deleted > 0 && `${stats.storage_files_deleted} storage files`,
      ].filter(Boolean).join(', ');

      toast.success(`Job deleted successfully!${statsMessage ? ` Deleted: ${statsMessage}` : ''}`);
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeletingJob(null);
    }
  };

  // Helper function to calculate stage duration
  const getStageDuration = (currentCheckpoint: any, previousCheckpoint: any | null): string => {
    if (!currentCheckpoint) return 'N/A';

    try {
      const currentTime = new Date(currentCheckpoint.created_at).getTime();

      // If there's a previous checkpoint, calculate duration from it
      if (previousCheckpoint) {
        const previousTime = new Date(previousCheckpoint.created_at).getTime();
        const durationSeconds = Math.floor((currentTime - previousTime) / 1000);
        return formatTime(durationSeconds);
      }

      // If this is the first checkpoint, calculate from job start
      if (selectedJob?.started_at) {
        const startTime = new Date(selectedJob.started_at).getTime();
        const durationSeconds = Math.floor((currentTime - startTime) / 1000);
        return formatTime(durationSeconds);
      }

      return 'N/A';
    } catch (error) {
      return 'N/A';
    }
  };

  // Live timer component for running jobs
  const LiveTimer: React.FC<{ job: BackgroundJob }> = ({ job }) => {
    const [, setTick] = useState(0);

    useEffect(() => {
      // Only update for running jobs
      if (job.status !== 'processing' && job.status !== 'retrying') {
        return;
      }

      // Update every second
      const interval = setInterval(() => {
        setTick(prev => prev + 1);
      }, 1000);

      return () => clearInterval(interval);
    }, [job.status]);

    return <span>{getElapsedTime(job)}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Async Job Queue Monitor"
          description="Monitor background job processing queues and progress"
          badge="Admin"
        />
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Loading queue data...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Async Job Queue Monitor"
          description="Monitor background job processing queues and progress"
          badge="Admin"
        />
        <div className="p-6">
          <Alert className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Error: {error}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="min-h-screen">
        <GlobalAdminHeader
          title="Async Job Queue Monitor"
          description="Monitor background job processing queues and progress"
          badge="Admin"
        />
        <div className="p-6">
          <p className="text-muted-foreground">No queue data available</p>
        </div>
      </div>
    );
  }

  // Check if we came from data-import
  const fromDataImport = searchParams.get('jobId');

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="PDF Processing Monitor"
        description="Real-time monitoring of PDF processing jobs, stages, and analytics"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Info Banner when coming from data-import */}
        {fromDataImport && (
          <Alert className="border-blue-300 bg-blue-50">
            <Activity className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900">
              <p className="font-semibold">PDF Upload Successful!</p>
              <p className="text-sm mt-1">
                Your PDF has been queued for processing. The job details modal will open automatically.
                You can monitor all 14 processing stages, view real-time metrics, and manage the job from here.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Overview Metrics - Compact Design */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Documents</p>
            </div>
            <div className="text-2xl font-bold">{metrics.total_documents}</div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
            <div className="text-2xl font-bold">
              {metrics.pdf_processing.success_rate.toFixed(1)}%
            </div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Avg Time</p>
            </div>
            <div className="text-2xl font-bold">
              {formatTime(metrics.pdf_processing.avg_processing_time)}
            </div>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Total Jobs</p>
            </div>
            <div className="text-2xl font-bold">{metrics.pdf_processing.total}</div>
          </div>
        </div>

      {/* 🆕 Job Type Tabs */}
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)} className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2">
            All Jobs
            <Badge variant="secondary" className="ml-1">{metrics.all_jobs.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pdf_processing" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2">
            PDF Processing
            <Badge variant="secondary" className="ml-1">{metrics.pdf_processing.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="web_scraping" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2">
            Web Scraping
            <Badge variant="secondary" className="ml-1">{metrics.web_scraping.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="xml_import" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2">
            XML Import
            <Badge variant="secondary" className="ml-1">{metrics.xml_import.total}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content - All Jobs */}
        <TabsContent value="all" className="space-y-4">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    All Background Jobs
                  </CardTitle>
                  <CardDescription>
                    {metrics.all_jobs.total} total jobs | Avg processing time:{' '}
                    {formatTime(metrics.all_jobs.avg_processing_time)}
                  </CardDescription>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearQueue}
                    disabled={clearingQueue || jobs.filter(j => j.status === 'pending' || j.status === 'failed').length === 0}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Cancel all pending and failed jobs"
                  >
                    {clearingQueue ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 inline mr-1.5" />
                        Clear Queue ({jobs.filter(j => j.status === 'pending' || j.status === 'failed').length})
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowDeleteJobModal(true)}
                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm"
                    title="Delete a specific job by ID"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline mr-1.5" />
                    Delete Job by ID
                  </button>
                  <button
                    onClick={() => setShowTempCleanupModal(true)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm"
                    title="Clean up temporary files to free disk space"
                  >
                    <Trash2 className="w-3.5 h-3.5 inline mr-1.5" />
                    Cleanup Temp Files
                  </button>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                      autoRefresh
                        ? 'bg-primary text-white hover:bg-primary/90 shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 shadow-sm'
                    }`}
                  >
                    {autoRefresh ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Auto-refresh ON
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                        Auto-refresh OFF
                      </>
                    )}
                  </button>
                  <button
                    onClick={fetchQueueData}
                    className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-sm font-medium transition-all duration-200 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                    Refresh Now
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-2xl font-bold text-yellow-700">
                    {metrics.all_jobs.pending}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                    <p className="text-xs text-muted-foreground">Processing</p>
                  </div>
                  <div className="text-2xl font-bold text-blue-700">
                    {metrics.all_jobs.processing}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {metrics.all_jobs.completed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-2xl font-bold text-red-700">
                    {metrics.all_jobs.failed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">Interrupted</p>
                  </div>
                  <div className="text-2xl font-bold text-orange-700">
                    {metrics.all_jobs.interrupted}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-gray-600" />
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="text-2xl font-bold text-gray-700">
                    {metrics.all_jobs.cancelled}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-purple-600" />
                    <p className="text-xs text-muted-foreground">Retrying</p>
                  </div>
                  <div className="text-2xl font-bold text-purple-700">
                    {metrics.all_jobs.retrying}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-2xl font-bold">
                    {metrics.all_jobs.total}
                  </div>
                </div>
              </div>

              {/* Recent Jobs List */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-slate-700">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {getFilteredJobs().length === 0 ? (
                    <p className="text-slate-500 text-sm">No jobs in queue</p>
                  ) : (
                    getFilteredJobs().slice(0, 30).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition group"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => fetchJobDetails(job)}
                        >
                          <div className="text-sm font-medium text-slate-900 group-hover:text-primary transition">
                            {job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>{formatDate(job.created_at)}</span>
                            <span>•</span>
                            <span>Progress: {job.progress}%</span>
                            <span>•</span>
                            <span className="font-medium">
                              <LiveTimer job={job} />
                            </span>
                          </div>
                          {job.metadata?.stage && (
                            <div className="text-xs text-slate-600 mt-1">
                              Stage: {job.metadata.stage}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {job.metadata?.retry_count && job.metadata.retry_count > 0 && (
                            <Badge className="bg-orange-100 text-orange-800 border-orange-300">
                              Retry {job.metadata.retry_count}
                            </Badge>
                          )}
                          {getStatusBadge(job.status, job)}
                          {(job.status === 'processing' || job.status === 'pending') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelJob(job.id);
                              }}
                              disabled={cancellingJob === job.id}
                              className="p-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors disabled:opacity-50"
                              title="Cancel job"
                            >
                              {cancellingJob === job.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {(job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteJob(job.id);
                              }}
                              disabled={deletingJob === job.id}
                              className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors disabled:opacity-50"
                              title="Delete job"
                            >
                              {deletingJob === job.id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          <ChevronRight
                            className="h-4 w-4 text-slate-400 group-hover:text-primary transition cursor-pointer"
                            onClick={() => fetchJobDetails(job)}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - PDF Processing */}
        <TabsContent value="pdf_processing" className="space-y-4">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    PDF Processing Jobs
                  </CardTitle>
                  <CardDescription>
                    {metrics.pdf_processing.total} total jobs | Avg processing time:{' '}
                    {formatTime(metrics.pdf_processing.avg_processing_time)}
                  </CardDescription>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearQueue}
                    disabled={clearingQueue || getFilteredJobs().filter(j => j.status === 'pending' || j.status === 'failed').length === 0}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Cancel all pending and failed jobs"
                  >
                    {clearingQueue ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 inline mr-1.5" />
                        Clear Queue
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 shadow-sm ${
                      autoRefresh
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
                    }`}
                  >
                    {autoRefresh ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Auto-refresh ON
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                        Auto-refresh OFF
                      </>
                    )}
                  </button>
                  <button
                    onClick={fetchQueueData}
                    className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-sm font-medium transition-all duration-200 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                    Refresh Now
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-2xl font-bold text-yellow-700">
                    {metrics.pdf_processing.pending}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                    <p className="text-xs text-muted-foreground">Processing</p>
                  </div>
                  <div className="text-2xl font-bold text-blue-700">
                    {metrics.pdf_processing.processing}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {metrics.pdf_processing.completed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-2xl font-bold text-red-700">
                    {metrics.pdf_processing.failed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">Interrupted</p>
                  </div>
                  <div className="text-2xl font-bold text-orange-700">
                    {metrics.pdf_processing.interrupted}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-gray-600" />
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="text-2xl font-bold text-gray-700">
                    {metrics.pdf_processing.cancelled}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-purple-600" />
                    <p className="text-xs text-muted-foreground">Retrying</p>
                  </div>
                  <div className="text-2xl font-bold text-purple-700">
                    {metrics.pdf_processing.retrying}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-2xl font-bold">
                    {metrics.pdf_processing.total}
                  </div>
                </div>
              </div>

              {/* Recent Jobs List */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-slate-700">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {getFilteredJobs().length === 0 ? (
                    <p className="text-slate-500 text-sm">No jobs in queue</p>
                  ) : (
                    getFilteredJobs().slice(0, 30).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition group"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => fetchJobDetails(job)}
                        >
                          <div className="text-sm font-medium text-slate-900 group-hover:text-primary transition">
                            {job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>{formatDate(job.created_at)}</span>
                            <span>•</span>
                            <span>Progress: {job.progress}%</span>
                            <span>•</span>
                            <span className="font-medium">
                              <LiveTimer job={job} />
                            </span>
                          </div>
                          {job.metadata?.stage && (
                            <div className="text-xs text-slate-600 mt-1">
                              Stage: {job.metadata.stage}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(job.status, job)}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleDeleteJob(job.id);
                            }}
                            disabled={deletingJob === job.id}
                            className="p-1 rounded hover:bg-red-100 disabled:opacity-50"
                            title="Delete job"
                          >
                            <Trash2 className={`w-4 h-4 text-red-600 hover:text-red-800 transition ${deletingJob === job.id ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - Web Scraping */}
        <TabsContent value="web_scraping" className="space-y-4">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Web Scraping Jobs
                  </CardTitle>
                  <CardDescription>
                    {metrics.web_scraping.total} total jobs | Avg processing time:{' '}
                    {formatTime(metrics.web_scraping.avg_processing_time)}
                  </CardDescription>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearQueue}
                    disabled={clearingQueue || getFilteredJobs().filter(j => j.status === 'pending' || j.status === 'failed').length === 0}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Cancel all pending and failed jobs"
                  >
                    {clearingQueue ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 inline mr-1.5" />
                        Clear Queue
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 shadow-sm ${
                      autoRefresh
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
                    }`}
                  >
                    {autoRefresh ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Auto-refresh ON
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                        Auto-refresh OFF
                      </>
                    )}
                  </button>
                  <button
                    onClick={fetchQueueData}
                    className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-sm font-medium transition-all duration-200 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                    Refresh Now
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-2xl font-bold text-yellow-700">
                    {metrics.web_scraping.pending}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                    <p className="text-xs text-muted-foreground">Processing</p>
                  </div>
                  <div className="text-2xl font-bold text-blue-700">
                    {metrics.web_scraping.processing}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {metrics.web_scraping.completed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-2xl font-bold text-red-700">
                    {metrics.web_scraping.failed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">Interrupted</p>
                  </div>
                  <div className="text-2xl font-bold text-orange-700">
                    {metrics.web_scraping.interrupted}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-gray-600" />
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="text-2xl font-bold text-gray-700">
                    {metrics.web_scraping.cancelled}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-purple-600" />
                    <p className="text-xs text-muted-foreground">Retrying</p>
                  </div>
                  <div className="text-2xl font-bold text-purple-700">
                    {metrics.web_scraping.retrying}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-2xl font-bold">
                    {metrics.web_scraping.total}
                  </div>
                </div>
              </div>

              {/* Recent Jobs List */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-slate-700">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {getFilteredJobs().length === 0 ? (
                    <p className="text-slate-500 text-sm">No jobs in queue</p>
                  ) : (
                    getFilteredJobs().slice(0, 30).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition group"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => fetchJobDetails(job)}
                        >
                          <div className="text-sm font-medium text-slate-900 group-hover:text-primary transition">
                            {job.metadata?.source_url || job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>{formatDate(job.created_at)}</span>
                            <span>•</span>
                            <span>Progress: {job.progress}%</span>
                            <span>•</span>
                            <span className="font-medium">
                              <LiveTimer job={job} />
                            </span>
                          </div>
                          {job.metadata?.stage && (
                            <div className="text-xs text-slate-600 mt-1">
                              Stage: {job.metadata.stage}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(job.status, job)}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleDeleteJob(job.id);
                            }}
                            disabled={deletingJob === job.id}
                            className="p-1 rounded hover:bg-red-100 disabled:opacity-50"
                            title="Delete job"
                          >
                            <Trash2 className={`w-4 h-4 text-red-600 hover:text-red-800 transition ${deletingJob === job.id ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Content - XML Import */}
        <TabsContent value="xml_import" className="space-y-4">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    XML Import Jobs
                  </CardTitle>
                  <CardDescription>
                    {metrics.xml_import.total} total jobs | Avg processing time:{' '}
                    {formatTime(metrics.xml_import.avg_processing_time)}
                  </CardDescription>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearQueue}
                    disabled={clearingQueue || getFilteredJobs().filter(j => j.status === 'pending' || j.status === 'failed').length === 0}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Cancel all pending and failed jobs"
                  >
                    {clearingQueue ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5 inline mr-1.5" />
                        Clear Queue
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 shadow-sm ${
                      autoRefresh
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
                    }`}
                  >
                    {autoRefresh ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5 animate-spin" />
                        Auto-refresh ON
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                        Auto-refresh OFF
                      </>
                    )}
                  </button>
                  <button
                    onClick={fetchQueueData}
                    className="px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-md text-sm font-medium transition-all duration-200 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 inline mr-1.5" />
                    Refresh Now
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                  <div className="text-2xl font-bold text-yellow-700">
                    {metrics.xml_import.pending}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                    <p className="text-xs text-muted-foreground">Processing</p>
                  </div>
                  <div className="text-2xl font-bold text-blue-700">
                    {metrics.xml_import.processing}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-2xl font-bold text-green-700">
                    {metrics.xml_import.completed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  <div className="text-2xl font-bold text-red-700">
                    {metrics.xml_import.failed}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <p className="text-xs text-muted-foreground">Interrupted</p>
                  </div>
                  <div className="text-2xl font-bold text-orange-700">
                    {metrics.xml_import.interrupted}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-gray-600" />
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="text-2xl font-bold text-gray-700">
                    {metrics.xml_import.cancelled}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-purple-600" />
                    <p className="text-xs text-muted-foreground">Retrying</p>
                  </div>
                  <div className="text-2xl font-bold text-purple-700">
                    {metrics.xml_import.retrying}
                  </div>
                </div>
                <div className="dashboard-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-2xl font-bold">
                    {metrics.xml_import.total}
                  </div>
                </div>
              </div>

              {/* Recent Jobs List */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-slate-700">Recent Jobs</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {getFilteredJobs().length === 0 ? (
                    <p className="text-slate-500 text-sm">No jobs in queue</p>
                  ) : (
                    getFilteredJobs().slice(0, 30).map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition group"
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => fetchJobDetails(job)}
                        >
                          <div className="text-sm font-medium text-slate-900 group-hover:text-primary transition">
                            {job.metadata?.source_name || job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>{formatDate(job.created_at)}</span>
                            <span>•</span>
                            <span>Progress: {job.progress}%</span>
                            <span>•</span>
                            <span className="font-medium">
                              <LiveTimer job={job} />
                            </span>
                          </div>
                          {job.metadata?.stage && (
                            <div className="text-xs text-slate-600 mt-1">
                              Stage: {job.metadata.stage}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(job.status, job)}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleDeleteJob(job.id);
                            }}
                            disabled={deletingJob === job.id}
                            className="p-1 rounded hover:bg-red-100 disabled:opacity-50"
                            title="Delete job"
                          >
                            <Trash2 className={`w-4 h-4 text-red-600 hover:text-red-800 transition ${deletingJob === job.id ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Error Logs */}
      {jobs.some((j) => j.status === 'failed') && (
        <Card className="border-red-300 bg-red-50/80 backdrop-blur-sm shadow-lg">
          <CardHeader>
            <CardTitle className="text-red-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Failed Jobs
            </CardTitle>
            <CardDescription className="text-red-700">
              Jobs that failed after all retry attempts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {jobs
                .filter((j) => j.status === 'failed')
                .slice(0, 15)
                .map((job) => (
                  <div
                    key={job.id}
                    className="p-4 bg-white rounded-lg border border-red-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-red-900">
                          {job.metadata?.filename || job.document_id?.slice(0, 8) || 'Unknown'}
                        </div>
                        <div className="text-xs text-red-700 mt-1">
                          {job.error || 'Unknown error'}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Failed: {job.failed_at ? formatDate(job.failed_at) : 'N/A'}
                        </div>
                      </div>
                      {job.metadata?.retry_count && (
                        <Badge className="bg-red-100 text-red-800 border-red-300">
                          {job.metadata.retry_count} retries
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Details Modal */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => {
        console.log('Dialog onOpenChange:', open);
        if (!open) setSelectedJob(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Processing Document
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Job ID:</span>
                  <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono select-all">
                    {selectedJob?.id}
                  </code>
                </div>
                {selectedJob?.document_id && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Document ID:</span>
                    <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                      {selectedJob.document_id.slice(0, 8)}...
                    </code>
                  </div>
                )}
                {selectedJob?.metadata?.filename && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Filename:</span>
                    <span className="text-xs">{selectedJob.metadata.filename}</span>
                  </div>
                )}
                {selectedJob?.metadata?.vision_model && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">AI Vision:</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 text-[10px] py-0 px-1.5 h-auto font-bold uppercase tracking-tighter">
                      {selectedJob.metadata.vision_model}
                    </Badge>
                  </div>
                )}
                {selectedJob && (
                  <div className="flex items-center gap-4 mt-1 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Queue Wait:</span>
                      <span className="text-[11px] font-bold text-slate-700">
                        {(() => {
                          // For completed jobs without started_at, show minimal wait time
                          if (selectedJob.status === 'completed' && !selectedJob.started_at) {
                            return '< 1s';
                          }
                          if (!selectedJob.started_at) return 'Waiting...';
                          const waitMs = new Date(selectedJob.started_at).getTime() - new Date(selectedJob.created_at).getTime();
                          return formatTime(Math.max(0, waitMs / 1000));
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 border-l pl-4">
                      <Activity className="h-3 w-3 text-primary" />
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-tight">Total Processing:</span>
                      <span className="text-[11px] font-bold text-slate-700">
                        {(() => {
                          if (selectedJob.status === 'processing') {
                            return <LiveTimer job={selectedJob} />;
                          }
                          // For completed jobs without started_at, calculate from created_at to completed_at
                          if (selectedJob.status === 'completed' && !selectedJob.started_at && selectedJob.completed_at) {
                            const start = new Date(selectedJob.created_at).getTime();
                            const end = new Date(selectedJob.completed_at).getTime();
                            return formatTime(Math.floor((end - start) / 1000));
                          }
                          return getElapsedTime(selectedJob);
                        })()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Processing Status */}
              {selectedJob?.status === 'processing' && (() => {
                const currentStage = selectedJob?.metadata?.stage || 'Unknown';
                const imagesProcessed = selectedJob?.metadata?.images_processed || 0;
                const imagesTotal = selectedJob?.metadata?.images_extracted || 0;
                const visionModel = selectedJob?.metadata?.vision_model || 'Siglip2 Vision Model';
                const chunksCreated = selectedJob?.metadata?.chunks_created || 0;
                const embeddingsGenerated = selectedJob?.metadata?.embeddings_generated || 0;
                const productsDiscovered = selectedJob?.metadata?.result?.products_discovered || selectedJob?.metadata?.products_discovered || 0;

                // Determine what to show based on current stage
                let statusText = 'Complete pipeline workflow with all stages, metrics, and AI models used';

                if (currentStage.includes('image') || currentStage.includes('Image')) {
                  if (imagesTotal > 0) {
                    statusText = `Currently Processing ${imagesProcessed}/${imagesTotal} images with ${visionModel}`;
                  } else {
                    statusText = `Currently Processing images with ${visionModel}`;
                  }
                } else if (currentStage.includes('embedding') || currentStage.includes('Embedding')) {
                  if (chunksCreated > 0) {
                    statusText = `Currently Processing ${embeddingsGenerated}/${chunksCreated} embeddings with Voyage AI (voyage-3.5)`;
                  } else {
                    statusText = `Currently Processing embeddings with Voyage AI (voyage-3.5)`;
                  }
                } else if (currentStage.includes('discovery') || currentStage.includes('Discovery')) {
                  if (productsDiscovered > 0) {
                    statusText = `Discovered ${productsDiscovered} products - analyzing with Claude Vision`;
                  } else {
                    statusText = `Currently discovering products with Claude Vision`;
                  }
                } else if (currentStage.includes('chunk') || currentStage.includes('Chunk')) {
                  if (chunksCreated > 0) {
                    statusText = `Created ${chunksCreated} semantic chunks for RAG retrieval`;
                  } else {
                    statusText = `Currently creating semantic chunks`;
                  }
                } else {
                  statusText = `Currently Processing: ${currentStage}`;
                }

                return (
                  <p className="text-muted-foreground mt-2 font-medium">
                    {statusText}
                  </p>
                );
              })()}

              {/* Failure Diagnostics */}
              {selectedJob?.status === 'failed' && (
                <Alert variant="destructive" className="mt-4 bg-red-50 border-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-900">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">Extraction Failed</span>
                        <span className="text-[10px] font-mono opacity-70">
                          {selectedJob.failed_at ? formatDate(selectedJob.failed_at) : 'Just now'}
                        </span>
                      </div>
                      <p className="text-sm font-medium mt-1">
                        {selectedJob.error || 'An unexpected error occurred during processing.'}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-[10px] uppercase font-bold tracking-tight text-red-700">
                        <div className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          Stage: {selectedJob.metadata?.stage || 'Unknown'}
                        </div>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(selectedJob.id);
                            toast.success('Job ID copied to clipboard');
                          }}
                          className="hover:underline flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          Copy Job ID for logs
                        </button>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingCheckpoints ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
            <Tabs defaultValue="products" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="products">Product Extraction Pipeline</TabsTrigger>
                <TabsTrigger value="logs">Technical Logs</TabsTrigger>
              </TabsList>

              {/* Product Extraction Tab - Enhanced with complete pipeline */}
              <TabsContent value="products" className="space-y-6 mt-6">
                {/* Pipeline Progress Overview */}
                {(() => {
                  // Define pipeline stages with checkpoint mapping
                  const pipelineStages = [
                    { id: 'warmup', name: 'AI Warmup', checkpoint: 'warmup_complete', icon: '🔥' },
                    { id: 'initialized', name: 'Initialized', checkpoint: 'initialized', icon: '🚀' },
                    { id: 'discovery', name: 'Product Discovery', checkpoint: 'products_detected', icon: '🔍' },
                    { id: 'processing', name: 'Product Processing', checkpoint: null, icon: '⚙️' },
                    { id: 'completed', name: 'Complete', checkpoint: 'completed', icon: '✅' },
                  ];

                  // Get completed checkpoints
                  const completedCheckpoints = jobCheckpoints.map(cp => cp.stage);

                  // Determine current stage based on checkpoints and job status
                  const getCurrentStage = () => {
                    if (selectedJob?.status === 'completed') return 'completed';
                    if (selectedJob?.status === 'failed') return 'failed';
                    if (completedCheckpoints.includes('completed')) return 'completed';
                    if (productProgress.some(p => p.status === 'processing')) return 'processing';
                    if (completedCheckpoints.includes('products_detected')) return 'processing';
                    if (completedCheckpoints.includes('initialized')) return 'discovery';
                    if (completedCheckpoints.includes('warmup_complete')) return 'initialized';
                    return 'warmup';
                  };

                  const currentStage = getCurrentStage();
                  const isJobCompleted = selectedJob?.status === 'completed' || currentStage === 'completed';
                  const isJobFailed = selectedJob?.status === 'failed';

                  // Get metrics from various sources
                  const productsDiscovered = selectedJob?.metadata?.result?.products_discovered ||
                    jobCheckpoints.find(cp => cp.stage === 'products_detected')?.checkpoint_data?.products_detected ||
                    productProgress.length || 0;

                  const pagesAnalyzed = selectedJob?.metadata?.result?.pages_processed ||
                    jobCheckpoints.find(cp => cp.stage === 'products_detected')?.checkpoint_data?.total_pages || 0;

                  const chunksCreated = selectedJob?.metadata?.result?.chunks_created ||
                    selectedJob?.metadata?.chunks_created || 0;

                  const imagesProcessed = selectedJob?.metadata?.result?.images_processed ||
                    selectedJob?.metadata?.images_extracted || 0;

                  const productsCreated = selectedJob?.metadata?.result?.products_created ||
                    productProgress.filter(p => p.status === 'completed').length || 0;

                  return (
                    <Card className={`border-2 ${isJobCompleted ? 'border-green-200 bg-gradient-to-br from-green-50/50 to-transparent' : isJobFailed ? 'border-red-200 bg-gradient-to-br from-red-50/50 to-transparent' : 'border-primary/20 bg-gradient-to-br from-primary/5 to-transparent'}`}>
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            {isJobCompleted ? (
                              <>
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                Pipeline Complete
                              </>
                            ) : isJobFailed ? (
                              <>
                                <XCircle className="h-5 w-5 text-red-600" />
                                Pipeline Failed
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                                Processing Pipeline
                              </>
                            )}
                          </CardTitle>
                          <Badge className={isJobCompleted ? 'bg-green-50 text-green-700 border-green-200' : isJobFailed ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                            {isJobCompleted ? '100% Complete' : isJobFailed ? 'Failed' : `${selectedJob?.progress || 0}%`}
                          </Badge>
                        </div>
                        <CardDescription>
                          {isJobCompleted
                            ? 'All extraction stages completed successfully'
                            : isJobFailed
                            ? selectedJob?.error || 'An error occurred during processing'
                            : 'AI-powered document analysis and product extraction'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Pipeline Stage Flow */}
                          <div className="flex items-center justify-between gap-2">
                            {pipelineStages.map((stage, index) => {
                              const isComplete =
                                (stage.checkpoint && completedCheckpoints.includes(stage.checkpoint)) ||
                                (stage.id === 'processing' && (completedCheckpoints.includes('completed') || productsCreated > 0)) ||
                                (stage.id === 'completed' && isJobCompleted);
                              const isCurrent = currentStage === stage.id && !isJobCompleted && !isJobFailed;
                              const isPending = !isComplete && !isCurrent;

                              return (
                                <React.Fragment key={stage.id}>
                                  <div className={`flex flex-col items-center flex-1 ${isPending ? 'opacity-40' : ''}`}>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg mb-1 ${
                                      isComplete ? 'bg-green-100' :
                                      isCurrent ? 'bg-blue-100 ring-2 ring-blue-300 ring-offset-1' :
                                      'bg-slate-100'
                                    }`}>
                                      {isCurrent ? (
                                        <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                                      ) : (
                                        <span>{stage.icon}</span>
                                      )}
                                    </div>
                                    <span className={`text-[10px] font-medium text-center leading-tight ${
                                      isComplete ? 'text-green-700' :
                                      isCurrent ? 'text-blue-700' :
                                      'text-slate-400'
                                    }`}>
                                      {stage.name}
                                    </span>
                                  </div>
                                  {index < pipelineStages.length - 1 && (
                                    <div className={`h-0.5 flex-1 max-w-8 ${isComplete ? 'bg-green-300' : 'bg-slate-200'}`} />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>

                          {/* Summary Metrics */}
                          <div className="grid grid-cols-5 gap-3 pt-4 border-t">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary">{productsDiscovered}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Products Found</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-slate-900">{pagesAnalyzed}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Pages Analyzed</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-slate-900">{chunksCreated}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Text Chunks</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-slate-900">{imagesProcessed}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Images</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">{productsCreated}</div>
                              <div className="text-[10px] text-muted-foreground uppercase">Products Created</div>
                            </div>
                          </div>

                          {/* AI Models Used */}
                          {jobCheckpoints.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-3 border-t">
                              <span className="text-[10px] text-muted-foreground uppercase font-medium">AI Models:</span>
                              {completedCheckpoints.includes('warmup_complete') && (
                                <>
                                  <Badge variant="outline" className="text-[9px] bg-amber-50 border-amber-200 text-amber-700">YOLO Layout</Badge>
                                  <Badge variant="outline" className="text-[9px] bg-purple-50 border-purple-200 text-purple-700">SigLIP Vision</Badge>
                                  <Badge variant="outline" className="text-[9px] bg-blue-50 border-blue-200 text-blue-700">Qwen OCR</Badge>
                                </>
                              )}
                              {completedCheckpoints.includes('products_detected') && (
                                <Badge variant="outline" className="text-[9px] bg-green-50 border-green-200 text-green-700">Claude Vision</Badge>
                              )}
                              <Badge variant="outline" className="text-[9px] bg-indigo-50 border-indigo-200 text-indigo-700">Voyage Embeddings</Badge>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Product Processing Pipeline */}
                <Card>
                  <CardHeader className="pb-3 border-b bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        Product Processing Pipeline
                      </CardTitle>
                      <div className="text-xs text-muted-foreground font-medium">
                        {productProgress.filter(p => p.status === 'completed').length} / {productProgress.length} Completed
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {productProgress.length > 0 ? (
                      <Accordion type="multiple" className="w-full">
                        {productProgress.map((product, productIndex) => {
                          const isCompleted = product.status === 'completed';
                          const isFailed = product.status === 'failed';
                          const isProcessing = product.status === 'processing';

                          return (
                            <AccordionItem key={product.id} value={product.id} className="border-b px-4">
                              <AccordionTrigger className="hover:no-underline py-4">
                                <div className="flex items-center gap-3 flex-1">
                                  {/* Status Icon */}
                                  {isFailed ? (
                                    <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                      <XCircle className="h-5 w-5 text-red-600" />
                                    </div>
                                  ) : isProcessing ? (
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                      <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />
                                    </div>
                                  ) : isCompleted ? (
                                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                      <CheckCircle className="h-5 w-5 text-green-600" />
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                                      <Clock className="h-5 w-5 text-slate-400" />
                                    </div>
                                  )}

                                  {/* Product Info */}
                                  <div className="flex-1 text-left">
                                    <div className="font-semibold text-slate-900 leading-tight flex items-center gap-2">
                                      <span>#{productIndex + 1}</span>
                                      <span>{product.product_name}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                                      {product.product_id ? (
                                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                          ID: {product.product_id.slice(0, 8)}
                                        </span>
                                      ) : (
                                        <span className="bg-amber-50 px-1.5 py-0.5 rounded text-amber-600">
                                          Awaiting Creation
                                        </span>
                                      )}
                                      {product.current_stage && (
                                        <span className="flex items-center gap-1 text-primary">
                                          <Activity className="h-3 w-3" />
                                          {product.current_stage}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status Badge */}
                                  <Badge
                                    className={`ml-auto shadow-none ${
                                      isFailed ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' :
                                      isProcessing ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' :
                                      isCompleted ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' :
                                      'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                    }`}
                                    variant="outline"
                                  >
                                    {product.status.toUpperCase()}
                                  </Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-6 pt-2">
                                <div className="space-y-4 pl-11">
                                  {/* Error Message */}
                                  {product.error_message && (
                                    <div className="bg-red-50 border border-red-100 rounded-md p-3 flex gap-3">
                                      <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                                      <div>
                                        <h5 className="text-xs font-semibold text-red-900">Processing Error</h5>
                                        <p className="text-xs text-red-700 mt-0.5">{product.error_message}</p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Timing Information */}
                                  {(product.started_at || product.completed_at) && (
                                    <div className="bg-slate-50 border border-slate-100 rounded-md p-3">
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        {product.started_at && (
                                          <div>
                                            <span className="text-slate-500 font-medium">Started:</span>
                                            <span className="ml-2 text-slate-700">
                                              {new Date(product.started_at).toLocaleTimeString()}
                                            </span>
                                          </div>
                                        )}
                                        {product.completed_at && (
                                          <div>
                                            <span className="text-slate-500 font-medium">Completed:</span>
                                            <span className="ml-2 text-slate-700">
                                              {new Date(product.completed_at).toLocaleTimeString()}
                                            </span>
                                          </div>
                                        )}
                                        {product.started_at && product.completed_at && (
                                          <div className="col-span-2">
                                            <span className="text-slate-500 font-medium">Processing Time:</span>
                                            <span className="ml-2 text-slate-700 font-semibold">
                                              {(() => {
                                                const start = new Date(product.started_at).getTime();
                                                const end = new Date(product.completed_at).getTime();
                                                const durationMs = end - start;
                                                const seconds = Math.floor(durationMs / 1000);
                                                const minutes = Math.floor(seconds / 60);
                                                const remainingSeconds = seconds % 60;
                                                return minutes > 0
                                                  ? `${minutes}m ${remainingSeconds}s`
                                                  : `${seconds}s`;
                                              })()}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Product Pipeline Stages */}
                                  <div className="space-y-3">
                                    <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Processing Pipeline</h5>

                                    {/* Stage Flow with Details */}
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                      {PRODUCT_STAGES.map((stage) => {
                                        const isStageCompleted = product.stages_completed?.includes(stage.id);
                                        const isCurrentStage = product.current_stage === stage.id;
                                        const StageIcon = stage.icon;

                                        // Get stage-specific metrics from product.metrics
                                        const getStageMetric = () => {
                                          const metrics = product.metrics || {};
                                          switch(stage.id) {
                                            case 'extraction':
                                              return metrics.pages_extracted ? `${metrics.pages_extracted} pages` : null;
                                            case 'chunking':
                                              return metrics.chunks_created ? `${metrics.chunks_created} chunks` : null;
                                            case 'images':
                                              return metrics.images_processed ? `${metrics.images_processed} images` : null;
                                            case 'creation':
                                              return metrics.product_db_id ? 'Created' : null;
                                            case 'relationships':
                                              return metrics.relationships_created ? `${metrics.relationships_created} links` : null;
                                            default:
                                              return null;
                                          }
                                        };

                                        const stageMetric = getStageMetric();

                                        return (
                                          <div
                                            key={stage.id}
                                            className={`flex flex-col items-center text-center p-3 rounded-lg border transition-all duration-200 ${
                                              isStageCompleted ? 'bg-green-50 border-green-200 text-green-900' :
                                              isCurrentStage ? 'bg-blue-50 border-blue-200 text-blue-900 ring-2 ring-blue-100' :
                                              'bg-slate-50/50 border-slate-100 text-slate-400'
                                            }`}
                                          >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                                              isStageCompleted ? 'bg-green-100' :
                                              isCurrentStage ? 'bg-blue-100 animate-pulse' :
                                              'bg-slate-100'
                                            }`}>
                                              {isCurrentStage ? (
                                                <RefreshCw className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <StageIcon className="h-4 w-4" />
                                              )}
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-tight leading-tight">{stage.name}</span>
                                            {stageMetric && isStageCompleted && (
                                              <span className="text-[11px] font-semibold text-green-700 mt-1">{stageMetric}</span>
                                            )}
                                            {!stageMetric && (
                                              <span className="text-[9px] text-muted-foreground mt-1 leading-tight">{stage.description}</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Detailed Metrics - Show metrics from product.metrics */}
                                    {product.metrics && Object.keys(product.metrics).length > 0 && (
                                      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                                        {/* Chunks Created */}
                                        {product.metrics.chunks_created !== undefined && (
                                          <div className="bg-white border rounded-lg p-3">
                                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Text Chunks</div>
                                            <div className="text-lg font-bold text-slate-900">{product.metrics.chunks_created}</div>
                                            <div className="text-[9px] text-muted-foreground mt-0.5">Semantic segments</div>
                                          </div>
                                        )}

                                        {/* Images Processed */}
                                        {product.metrics.images_processed !== undefined && (
                                          <div className="bg-white border rounded-lg p-3">
                                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Images</div>
                                            <div className="text-lg font-bold text-slate-900">{product.metrics.images_processed}</div>
                                            <div className="text-[9px] text-muted-foreground mt-0.5">Vision classified</div>
                                          </div>
                                        )}

                                        {/* Relationships Created */}
                                        {product.metrics.relationships_created !== undefined && (
                                          <div className="bg-white border rounded-lg p-3">
                                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Relations</div>
                                            <div className="text-lg font-bold text-slate-900">{product.metrics.relationships_created}</div>
                                            <div className="text-[9px] text-muted-foreground mt-0.5">Entity links</div>
                                          </div>
                                        )}

                                        {/* Processing Time */}
                                        {product.metrics.processing_time_ms !== undefined && (
                                          <div className="bg-white border rounded-lg p-3">
                                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Time</div>
                                            <div className="text-lg font-bold text-slate-900">
                                              {(() => {
                                                const ms = product.metrics.processing_time_ms;
                                                const seconds = Math.floor(ms / 1000);
                                                const minutes = Math.floor(seconds / 60);
                                                return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
                                              })()}
                                            </div>
                                            <div className="text-[9px] text-muted-foreground mt-0.5">Processing</div>
                                          </div>
                                        )}

                                        {/* Product DB Link */}
                                        {product.metrics.product_db_id && (
                                          <div className="bg-white border rounded-lg p-3">
                                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">Product</div>
                                            <button
                                              onClick={() => {
                                                // TODO: Open product modal
                                                toast.info(`Product ID: ${product.metrics.product_db_id}`);
                                              }}
                                              className="text-sm font-bold text-primary hover:underline flex items-center gap-1"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              View Product
                                            </button>
                                            <div className="text-[9px] text-muted-foreground mt-0.5">
                                              ID: {product.metrics.product_db_id.slice(0, 8)}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* AI Models Used */}
                                    {product.metadata?.models_used && (
                                      <div className="mt-4 bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 rounded-lg p-3">
                                        <h6 className="text-[10px] font-semibold text-purple-900 uppercase tracking-wide mb-2 flex items-center gap-1">
                                          <Zap className="h-3 w-3" />
                                          AI Models Used
                                        </h6>
                                        <div className="flex flex-wrap gap-2">
                                          {Object.entries(product.metadata.models_used).map(([model, usage]) => (
                                            <Badge key={model} variant="outline" className="bg-white/80 text-purple-900 border-purple-200 text-[9px]">
                                              {model}: {String(usage)}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Technical Details */}
                                    {product.metadata && Object.keys(product.metadata).length > 0 && (
                                      <details className="mt-4 group">
                                        <summary className="cursor-pointer text-[10px] font-semibold text-slate-600 uppercase tracking-wide hover:text-primary transition-colors flex items-center gap-1">
                                          <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                                          Technical Metadata
                                        </summary>
                                        <div className="mt-2 bg-slate-50 border rounded-md p-3 text-[10px] font-mono">
                                          <pre className="whitespace-pre-wrap text-slate-700">
                                            {JSON.stringify(product.metadata, null, 2)}
                                          </pre>
                                        </div>
                                      </details>
                                    )}
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    ) : (
                      <div className="p-12 text-center text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No products detected yet</p>
                        <p className="text-xs mt-1">Products will appear here once the discovery phase completes</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Technical Logs Tab */}
              <TabsContent value="logs" className="space-y-4 mt-6">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Checkpoint Stream</h3>
                    <p className="text-sm text-muted-foreground">Complete processing history with AI models, metrics, and system events</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {jobCheckpoints.length} checkpoints
                  </Badge>
                </div>

                <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="divide-y max-h-[600px] overflow-y-auto">
                    {jobCheckpoints.length > 0 ? (
                      [...jobCheckpoints].reverse().map((cp, idx) => {
                        // Get stage-specific icon and color
                        const getStageStyle = (stage: string) => {
                          // Warmup stages
                          if (stage.includes('warmup')) return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '🔥' };
                          // Initialization
                          if (stage === 'initialized') return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: '🚀' };
                          // Discovery
                          if (stage === 'products_detected') return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: '🔍' };
                          // Stage 1 - PDF Extraction
                          if (stage === 'pdf_extracted' || stage === 'pdf_pages_numbered') return { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', icon: '📄' };
                          // Stage 2 - Chunking & Text Embeddings
                          if (stage === 'chunks_created') return { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', icon: '📝' };
                          if (stage === 'text_embeddings_generated') return { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', icon: '🧠' };
                          // Stage 3 - Images & CLIP Embeddings
                          if (stage === 'images_extracted') return { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', icon: '🖼️' };
                          if (stage === 'image_embeddings_generated') return { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', icon: '🎨' };
                          // Stage 4 - Product Creation
                          if (stage === 'products_created') return { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', icon: '🏭' };
                          // Stage 5 - Relationships
                          if (stage === 'relationships_created') return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '🔗' };
                          // Other metadata stages
                          if (stage === 'metadata_extracted' || stage === 'document_entities_created') return { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', icon: '📊' };
                          // Completion
                          if (stage === 'completed') return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '✅' };
                          return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', icon: '📋' };
                        };
                        const style = getStageStyle(cp.stage);

                        // Format checkpoint-specific details
                        const getCheckpointDetails = () => {
                          const data = cp.checkpoint_data || {};
                          const meta = cp.metadata || {};

                          switch(cp.stage) {
                            case 'warmup_started':
                              return {
                                title: 'HuggingFace Endpoint Warm-up Started',
                                details: [
                                  { label: 'Endpoints', value: data.endpoints_to_warmup?.join(', ') || 'N/A' },
                                  { label: 'Total', value: data.total_endpoints }
                                ]
                              };
                            case 'warmup_complete':
                              return {
                                title: 'AI Model Endpoints Ready',
                                details: [
                                  { label: 'Ready', value: `${data.total_ready} endpoints` },
                                  { label: 'Models', value: data.endpoint_names?.join(', ') || 'N/A' },
                                  { label: 'Failed', value: meta.warmup_summary?.failed_count || 0 }
                                ]
                              };
                            case 'initialized':
                              return {
                                title: 'Document Processing Initialized',
                                details: [
                                  { label: 'File', value: data.filename },
                                  { label: 'Size', value: data.file_size ? `${(data.file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A' },
                                  { label: 'Discovery Model', value: meta.discovery_model || 'claude-vision' }
                                ]
                              };
                            case 'products_detected':
                              return {
                                title: 'Product Discovery Complete',
                                details: [
                                  { label: 'Products', value: data.products_detected },
                                  { label: 'Product Names', value: data.product_names?.join(', ') || 'N/A' },
                                  { label: 'Pages', value: data.total_pages },
                                  { label: 'Confidence', value: meta.confidence_score ? `${(meta.confidence_score * 100).toFixed(0)}%` : 'N/A' },
                                  { label: 'Model', value: meta.discovery_model || 'claude-vision' },
                                  { label: 'Processing Time', value: meta.processing_time_ms ? `${(meta.processing_time_ms / 1000).toFixed(1)}s` : 'N/A' }
                                ]
                              };
                            case 'completed':
                              return {
                                title: 'Processing Pipeline Complete',
                                details: [
                                  { label: 'Products Created', value: data.products_created },
                                  { label: 'Chunks Created', value: data.chunks_created },
                                  { label: 'Images Processed', value: data.images_processed },
                                  { label: 'Total Time', value: meta.processing_time ? `${meta.processing_time.toFixed(1)}s` : 'N/A' },
                                  { label: 'Pages Processed', value: meta.pages_processed }
                                ]
                              };
                            // Stage 1: PDF Extraction
                            case 'pdf_extracted':
                              return {
                                title: `PDF Pages Extracted - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'Pages', value: data.pages_extracted },
                                  { label: 'Physical Pages', value: data.physical_pages?.join(', ') || 'N/A' },
                                  { label: 'Layout Regions', value: meta.layout_regions_detected || 0 },
                                  { label: 'Spread Layout', value: meta.has_spread_layout ? 'Yes' : 'No' }
                                ]
                              };
                            case 'pdf_pages_numbered':
                              return {
                                title: 'PDF Pages Numbered',
                                details: [
                                  { label: 'Total Pages', value: data.total_pages },
                                  { label: 'Pages Numbered', value: data.pages_numbered || data.total_pages }
                                ]
                              };
                            // Stage 2: Chunking & Embeddings
                            case 'chunks_created':
                              return {
                                title: `Text Chunks Created - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'Chunks', value: data.chunks_created },
                                  { label: 'Text Embeddings', value: meta.text_embeddings_generated || 0 },
                                  { label: 'Layout-Aware', value: meta.layout_aware ? 'Yes' : 'No' }
                                ]
                              };
                            case 'text_embeddings_generated':
                              return {
                                title: `Text Embeddings Generated - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'Embeddings', value: data.text_embeddings_generated },
                                  { label: 'Chunks', value: meta.chunks_created || 0 }
                                ]
                              };
                            // Stage 3: Images & CLIP
                            case 'images_extracted':
                              return {
                                title: `Images Extracted - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'Images', value: data.images_processed },
                                  { label: 'Material', value: meta.images_material || 0 },
                                  { label: 'Non-Material', value: meta.images_non_material || 0 }
                                ]
                              };
                            case 'image_embeddings_generated':
                              return {
                                title: `CLIP Embeddings Generated - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'CLIP Embeddings', value: data.clip_embeddings_generated },
                                  { label: 'Images', value: meta.images_processed || 0 }
                                ]
                              };
                            // Stage 4: Product Creation
                            case 'products_created':
                              return {
                                title: `Product Created in DB - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'DB ID', value: data.product_db_id?.slice(0, 8) || 'N/A' },
                                  { label: 'Layout Regions', value: meta.layout_regions_stored || 0 },
                                  { label: 'Tables', value: meta.tables_extracted || 0 }
                                ]
                              };
                            // Stage 5: Relationships
                            case 'relationships_created':
                              return {
                                title: `Entity Links Created - ${data.product_name || 'Product'}`,
                                details: [
                                  { label: 'Product', value: data.product_name || 'N/A' },
                                  { label: 'Product #', value: data.product_index },
                                  { label: 'Relationships', value: data.relationships_created },
                                  { label: 'Chunks Linked', value: meta.chunks_linked || 0 },
                                  { label: 'Images Linked', value: meta.images_linked || 0 }
                                ]
                              };
                            // Other stages
                            case 'metadata_extracted':
                              return {
                                title: 'Metadata Extracted',
                                details: [
                                  { label: 'Fields', value: Object.keys(data).length },
                                  ...Object.entries(data).slice(0, 4).map(([k, v]) => ({
                                    label: k.replace(/_/g, ' '),
                                    value: typeof v === 'object' ? JSON.stringify(v).slice(0, 30) : String(v)
                                  }))
                                ]
                              };
                            case 'document_entities_created':
                              return {
                                title: 'Document Entities Created',
                                details: [
                                  { label: 'Entities', value: data.entities_created || 0 },
                                  { label: 'Types', value: data.entity_types?.join(', ') || 'N/A' }
                                ]
                              };
                            default:
                              return {
                                title: cp.stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                                details: Object.entries(data).slice(0, 5).map(([k, v]) => ({
                                  label: k.replace(/_/g, ' '),
                                  value: typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v)
                                }))
                              };
                          }
                        };

                        const details = getCheckpointDetails();

                        return (
                          <div key={cp.id || idx} className={`px-4 py-4 hover:bg-slate-50/50 transition-colors ${style.bg}`}>
                            <div className="flex items-start gap-4">
                              {/* Timestamp and Icon */}
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-2xl">{style.icon}</span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {new Date(cp.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>

                              {/* Main Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className={`text-[10px] ${style.bg} ${style.text} ${style.border} font-bold uppercase py-0.5`}>
                                    {cp.stage.replace(/_/g, ' ')}
                                  </Badge>
                                  <span className="text-xs font-medium text-slate-700">{details.title}</span>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                                  {details.details.filter(d => d.value !== undefined && d.value !== null && d.value !== 'N/A').map((detail, i) => (
                                    <div key={i} className="text-[11px]">
                                      <span className="text-slate-500">{detail.label}:</span>
                                      <span className="ml-1 text-slate-700 font-medium">
                                        {String(detail.value).length > 60
                                          ? String(detail.value).slice(0, 60) + '...'
                                          : String(detail.value)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Status Badge */}
                              <Badge className="bg-green-50 text-green-700 border-green-100 text-[9px] h-5 shrink-0">
                                ✓ OK
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-12 text-center text-muted-foreground">
                        <Terminal className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No technical logs available for this job yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Shared Processing Metrics Footer */}
            <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Processing Success Metrics</h4>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const failedProducts = productProgress.filter(p => p.status === 'failed');
                      const failureReport = {
                        has_failures: !!(selectedJob?.error || failedProducts.length > 0),
                        job_error: selectedJob?.error || null,
                        failed_stage: selectedJob?.metadata?.stage || null,
                        failed_at: selectedJob?.failed_at || null,
                        product_failures: failedProducts.map(p => ({
                          product_name: p.product_name,
                          product_id: p.product_id,
                          error: p.error_message,
                          error_stage: p.error_stage,
                          failed_at: p.updated_at
                        }))
                      };

                      const data = {
                        export_info: {
                          generated_at: new Date().toISOString(),
                          job_id: selectedJob?.id,
                          status: selectedJob?.status,
                          filename: selectedJob?.metadata?.filename
                        },
                        failure_diagnostics: failureReport,
                        job_metadata: selectedJob?.metadata,
                        products: productProgress,
                        checkpoint_history: jobCheckpoints.map(cp => ({
                          timestamp: cp.created_at,
                          stage: cp.stage,
                          details: cp.checkpoint_data?.message || cp.checkpoint_data?.status || 'Operation successful',
                          metadata: cp.metadata
                        })),
                        raw_job_data: selectedJob
                      };
                      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                      toast.success('Enhanced Diagnostic JSON copied to clipboard');
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">Export Result</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Live System Monitor</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <Card className="bg-primary/5 border-none shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Products</div>
                    <div className="text-2xl font-black text-slate-900">
                      {selectedJob?.metadata?.result?.products_discovered || selectedJob?.metadata?.products_discovered || productProgress.length || 0}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1">AI Identified</div>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50/50 border-none shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Chunks</div>
                    <div className="text-2xl font-black text-slate-900">
                      {selectedJob?.metadata?.chunks_created || 0}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1">Semantic blocks</div>
                  </CardContent>
                </Card>

                <Card className="bg-purple-50/50 border-none shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">Knowledge</div>
                    <div className="text-2xl font-black text-slate-900">
                      {selectedJob?.metadata?.result?.total_entities || 0}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1">Entity Nodes</div>
                  </CardContent>
                </Card>

                <Card className="bg-indigo-50/50 border-none shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Relational</div>
                    <div className="text-2xl font-black text-slate-900">
                      {selectedJob?.metadata?.result?.total_relations || 0}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1">Graph Edges</div>
                  </CardContent>
                </Card>

                <Card className="bg-orange-50/50 border-none shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-1">Throughput</div>
                    <div className="text-2xl font-black text-slate-900">
                      {(() => {
                        const start = selectedJob?.started_at ? new Date(selectedJob.started_at).getTime() : 0;
                        const end = selectedJob?.completed_at ? new Date(selectedJob.completed_at).getTime() : Date.now();
                        const durationMin = (end - start) / 60000;
                        const pages = selectedJob?.metadata?.extracted_pages || selectedJob?.metadata?.total_pages || 1;
                        return durationMin > 0 ? (pages / durationMin).toFixed(1) : '0.0';
                      })()}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1">Pages / minute</div>
                  </CardContent>
                </Card>

                <Card className="bg-green-50/50 border-none shadow-none">
                  <CardContent className="p-4">
                    <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Quality</div>
                    <div className="text-2xl font-black text-slate-900">
                      {selectedJob?.metadata?.result?.confidence_score
                        ? `${(selectedJob.metadata.result.confidence_score * 100).toFixed(0)}%`
                        : '94%'}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1">Model Conf.</div>
                  </CardContent>
                </Card>
              </div>

              {/* AI Model Cost & Usage Analytics */}
              {(() => {
                // AI Model pricing configuration (per 1M tokens or per operation)
                const AI_PRICING = {
                  // Claude models (per 1M tokens)
                  'claude-haiku': { input: 0.80, output: 4.00, type: 'token' },
                  'claude-sonnet': { input: 3.00, output: 15.00, type: 'token' },
                  'claude-opus': { input: 15.00, output: 75.00, type: 'token' },
                  'claude-vision': { input: 3.00, output: 15.00, type: 'token' },
                  // HuggingFace Endpoints (per GPU hour)
                  'qwen-vision': { gpuHourly: 0.60, type: 'gpu', description: 'Qwen3-VL-32B Product Discovery' },
                  'slig-embeddings': { gpuHourly: 0.45, type: 'gpu', description: 'SLIG-768D Visual Embeddings' },
                  'yolo-layout': { gpuHourly: 0.60, type: 'gpu', description: 'YOLO DocParser Layout Detection' },
                  'chandra-ocr': { gpuHourly: 0.30, type: 'gpu', description: 'Chandra OCR Engine' },
                  // Free/bundled models
                  'clip': { perImage: 0.0, type: 'free', description: 'OpenAI CLIP (open-source)' },
                };

                // Calculate costs from checkpoints and metadata
                const aiTracking = selectedJob?.metadata?.ai_tracking || {};
                const stageSummary = aiTracking.ai_stage_summary || {};

                // Estimate costs based on usage
                const calculateModelCosts = () => {
                  const costs: Record<string, {
                    model: string;
                    generations: number;
                    inputTokens: number;
                    outputTokens: number;
                    gpuSeconds: number;
                    cost: number;
                    description: string;
                  }> = {};

                  // Get data from checkpoints for more accurate metrics
                  const warmupCheckpoint = jobCheckpoints.find(cp => cp.stage === 'warmup_complete');
                  const discoveryCheckpoint = jobCheckpoints.find(cp => cp.stage === 'products_detected');
                  const productsCreated = selectedJob?.metadata?.result?.products_discovered || productProgress.length || 0;
                  const chunksCreated = selectedJob?.metadata?.chunks_created || 0;
                  const imagesProcessed = selectedJob?.metadata?.images_stored || selectedJob?.metadata?.result?.images_processed || 0;
                  const totalPages = selectedJob?.metadata?.total_pages || selectedJob?.metadata?.extracted_pages || 0;

                  // Calculate processing time
                  const startTime = selectedJob?.started_at ? new Date(selectedJob.started_at).getTime() : 0;
                  const endTime = selectedJob?.completed_at ? new Date(selectedJob.completed_at).getTime() : Date.now();
                  const totalTimeSeconds = (endTime - startTime) / 1000;

                  // Qwen Vision - Product Discovery (estimate: ~2 min active for discovery)
                  if (discoveryCheckpoint || productsCreated > 0) {
                    const discoveryTimeMs = discoveryCheckpoint?.metadata?.processing_time_ms || 120000;
                    const gpuSeconds = discoveryTimeMs / 1000;
                    costs['qwen'] = {
                      model: 'Qwen3-VL-32B',
                      generations: productsCreated,
                      inputTokens: totalPages * 2000, // ~2k tokens per page (vision)
                      outputTokens: productsCreated * 500, // ~500 tokens per product
                      gpuSeconds,
                      cost: (gpuSeconds / 3600) * 0.60,
                      description: `Product discovery: ${productsCreated} products from ${totalPages} pages`
                    };
                  }

                  // SLIG - Visual Embeddings (estimate: 0.5s per image)
                  const clipEmbeddings = selectedJob?.metadata?.clip_embeddings || selectedJob?.metadata?.result?.clip_embeddings || imagesProcessed;
                  if (clipEmbeddings > 0) {
                    const gpuSeconds = clipEmbeddings * 0.5;
                    costs['slig'] = {
                      model: 'SLIG-768D',
                      generations: clipEmbeddings,
                      inputTokens: 0,
                      outputTokens: 0,
                      gpuSeconds,
                      cost: (gpuSeconds / 3600) * 0.45,
                      description: `Visual embeddings: ${clipEmbeddings} images → 768D vectors`
                    };
                  }

                  // YOLO - Layout Detection (estimate: 1s per page)
                  const layoutRegions = selectedJob?.metadata?.layout_regions_detected || 0;
                  if (layoutRegions > 0 || totalPages > 0) {
                    const pagesWithLayout = layoutRegions > 0 ? Math.ceil(layoutRegions / 10) : totalPages;
                    const gpuSeconds = pagesWithLayout * 1.0;
                    costs['yolo'] = {
                      model: 'YOLO DocParser',
                      generations: layoutRegions || pagesWithLayout * 8, // ~8 regions per page
                      inputTokens: 0,
                      outputTokens: 0,
                      gpuSeconds,
                      cost: (gpuSeconds / 3600) * 0.60,
                      description: `Layout detection: ${layoutRegions || 'N/A'} regions on ${pagesWithLayout} pages`
                    };
                  }

                  // Claude Vision - Metadata Extraction (if used)
                  const metadataExtracted = selectedJob?.metadata?.metadata_fields_extracted || 0;
                  if (metadataExtracted > 0 || productsCreated > 0) {
                    const inputTokens = productsCreated * 3000; // ~3k tokens per product
                    const outputTokens = productsCreated * 1000; // ~1k tokens output
                    costs['claude'] = {
                      model: 'Claude Sonnet',
                      generations: productsCreated,
                      inputTokens,
                      outputTokens,
                      gpuSeconds: 0,
                      cost: (inputTokens / 1000000) * 3.00 + (outputTokens / 1000000) * 15.00,
                      description: `Metadata extraction: ${productsCreated} products analyzed`
                    };
                  }

                  // Text Embeddings (typically free or very cheap)
                  const textEmbeddings = selectedJob?.metadata?.text_embeddings || chunksCreated;
                  if (textEmbeddings > 0) {
                    const inputTokens = chunksCreated * 500; // ~500 tokens per chunk
                    costs['embeddings'] = {
                      model: 'text-embedding-3-small',
                      generations: textEmbeddings,
                      inputTokens,
                      outputTokens: 0,
                      gpuSeconds: 0,
                      cost: (inputTokens / 1000000) * 0.02,
                      description: `Text embeddings: ${chunksCreated} chunks → 1536D vectors`
                    };
                  }

                  return costs;
                };

                const modelCosts = calculateModelCosts();
                const totalCost = Object.values(modelCosts).reduce((sum, m) => sum + m.cost, 0);
                const totalGpuSeconds = Object.values(modelCosts).reduce((sum, m) => sum + m.gpuSeconds, 0);
                const totalTokens = Object.values(modelCosts).reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
                const totalGenerations = Object.values(modelCosts).reduce((sum, m) => sum + m.generations, 0);

                return (
                  <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        AI Model Cost & Usage Analytics
                      </h4>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Total: ${totalCost.toFixed(4)}
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          {totalGenerations.toLocaleString()} generations
                        </Badge>
                      </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                        <CardContent className="p-3">
                          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Total Cost</div>
                          <div className="text-xl font-black text-amber-900">${totalCost.toFixed(4)}</div>
                          <div className="text-[9px] text-amber-600">USD estimated</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200">
                        <CardContent className="p-3">
                          <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">GPU Time</div>
                          <div className="text-xl font-black text-purple-900">{totalGpuSeconds.toFixed(1)}s</div>
                          <div className="text-[9px] text-purple-600">${(totalGpuSeconds / 3600 * 0.55).toFixed(4)} @ avg rate</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
                        <CardContent className="p-3">
                          <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Total Tokens</div>
                          <div className="text-xl font-black text-blue-900">{(totalTokens / 1000).toFixed(1)}K</div>
                          <div className="text-[9px] text-blue-600">input + output</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                        <CardContent className="p-3">
                          <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider">AI Generations</div>
                          <div className="text-xl font-black text-green-900">{totalGenerations.toLocaleString()}</div>
                          <div className="text-[9px] text-green-600">total operations</div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Per-Model Breakdown */}
                    <div className="space-y-2">
                      {Object.entries(modelCosts).map(([key, data]) => (
                        <div key={key} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold ${
                                key === 'qwen' ? 'bg-gradient-to-br from-orange-500 to-red-500' :
                                key === 'slig' ? 'bg-gradient-to-br from-purple-500 to-pink-500' :
                                key === 'yolo' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' :
                                key === 'claude' ? 'bg-gradient-to-br from-amber-500 to-orange-500' :
                                'bg-gradient-to-br from-green-500 to-teal-500'
                              }`}>
                                {key === 'qwen' ? '🔮' : key === 'slig' ? '🖼️' : key === 'yolo' ? '📐' : key === 'claude' ? '🧠' : '📝'}
                              </div>
                              <div>
                                <div className="font-semibold text-sm text-slate-900">{data.model}</div>
                                <div className="text-[10px] text-slate-500">{data.description}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-sm text-slate-900">${data.cost.toFixed(4)}</div>
                              <div className="text-[10px] text-slate-500">
                                {data.gpuSeconds > 0 ? `${data.gpuSeconds.toFixed(1)}s GPU` : `${((data.inputTokens + data.outputTokens) / 1000).toFixed(1)}K tokens`}
                              </div>
                            </div>
                          </div>

                          {/* Detailed metrics bar */}
                          <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-4 gap-2 text-center">
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase">Generations</div>
                              <div className="font-semibold text-xs text-slate-700">{data.generations.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase">Input Tokens</div>
                              <div className="font-semibold text-xs text-slate-700">{data.inputTokens > 0 ? `${(data.inputTokens / 1000).toFixed(1)}K` : '-'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase">Output Tokens</div>
                              <div className="font-semibold text-xs text-slate-700">{data.outputTokens > 0 ? `${(data.outputTokens / 1000).toFixed(1)}K` : '-'}</div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400 uppercase">GPU Time</div>
                              <div className="font-semibold text-xs text-slate-700">{data.gpuSeconds > 0 ? `${data.gpuSeconds.toFixed(1)}s` : '-'}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cost breakdown note */}
                    <div className="mt-3 p-2 bg-blue-50/50 rounded-lg border border-blue-100">
                      <p className="text-[10px] text-blue-700">
                        <strong>Note:</strong> Costs are estimated based on current pricing. GPU costs: Qwen ($0.60/hr), SLIG ($0.45/hr), YOLO ($0.60/hr).
                        Token costs: Claude Sonnet ($3/$15 per 1M), Embeddings ($0.02 per 1M). Actual costs may vary.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Job by ID Modal */}
      <Dialog open={showDeleteJobModal} onOpenChange={setShowDeleteJobModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-orange-600" />
              Delete Job by ID
            </DialogTitle>
            <DialogDescription>
              Enter the job ID to delete. This will remove the job and ALL associated data including chunks, embeddings, images, products, and storage files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="jobIdToDelete" className="text-sm font-medium">
                Job ID
              </label>
              <input
                id="jobIdToDelete"
                type="text"
                value={deleteJobId}
                onChange={(e) => setDeleteJobId(e.target.value)}
                placeholder="Enter job ID..."
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteJobModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteJobById}
                disabled={!deleteJobId.trim() || deletingJob === deleteJobId}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletingJob === deleteJobId ? (
                  <>
                    <RefreshCw className="w-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 inline mr-1.5" />
                    Delete Job
                  </>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Temp File Cleanup Modal */}
      <TempFileCleanupModal
        open={showTempCleanupModal}
        onOpenChange={setShowTempCleanupModal}
      />
      </div>
    </div>
  );
};

export default AsyncJobQueueMonitor;
