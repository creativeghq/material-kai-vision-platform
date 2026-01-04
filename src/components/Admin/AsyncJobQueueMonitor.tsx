import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface ProductProgress {
  id: string;
  job_id: string;
  product_id: string;
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

const PRODUCT_STAGES = [
  { id: 'extraction', name: 'Page Extraction', icon: FileText },
  { id: 'chunking', name: 'Text Chunking', icon: FileText },
  { id: 'images', name: 'Image Processing', icon: ImageIcon },
  { id: 'creation', name: 'Product Creation', icon: Package },
  { id: 'relationships', name: 'Relationships', icon: Link },
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

      // Query product_progress table directly
      const { data, error } = await supabase
        .from('product_progress')
        .select('*')
        .eq('job_id', jobId)
        .order('product_index', { ascending: true });

      if (error) {
        console.error('Error fetching product progress:', error);
        setProductProgress([]);
        return;
      }

      setProductProgress(data || []);
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
        const productsDiscoveredCount = typedJobData.metadata?.products_discovered || 0;
        const previousProductsCount = selectedJob.metadata?.products_discovered || 0;

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
    // Include interrupted jobs in the clear queue operation
    const jobsToClear = jobs.filter(
      (job) => job.status === 'pending' || job.status === 'failed' || job.status === 'interrupted',
    );

    if (jobsToClear.length === 0) {
      toast.info('No pending, failed, or interrupted jobs to clear');
      return;
    }

    // Count jobs by status for confirmation message
    const statusCounts = {
      pending: jobsToClear.filter(j => j.status === 'pending').length,
      failed: jobsToClear.filter(j => j.status === 'failed').length,
      interrupted: jobsToClear.filter(j => j.status === 'interrupted').length,
    };

    const statusMessage = [
      statusCounts.pending > 0 && `${statusCounts.pending} pending`,
      statusCounts.failed > 0 && `${statusCounts.failed} failed`,
      statusCounts.interrupted > 0 && `${statusCounts.interrupted} interrupted`,
    ].filter(Boolean).join(', ');

    if (
      !confirm(
        `Are you sure you want to clear ${jobsToClear.length} jobs (${statusMessage})? This action cannot be undone.`,
      )
    ) {
      return;
    }

    setClearingQueue(true);
    let successCount = 0;
    let failCount = 0;

    try {
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
          console.error(`Failed to cancel job ${job.id}:`, error);
          logger.error(`Failed to cancel job ${job.id}`, error);
          failCount++;
        }
      }

      // Refresh the job list
      await fetchQueueData();

      alert(
        `Queue cleared: ${successCount} jobs cancelled successfully${failCount > 0 ? `, ${failCount} failed` : ''}`,
      );
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
    if (!confirm('Are you sure you want to permanently delete this job? This action cannot be undone.')) {
      return;
    }

    setDeletingJob(jobId);
    try {
      // Delete from Supabase directly (removes job and all related data)
      const { error } = await supabase
        .from('background_jobs')
        .delete()
        .eq('id', jobId);

      if (error) {
        throw error;
      }

      // Refresh the job list
      await fetchQueueData();

      // Close the dialog if this was the selected job
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }

      toast.success('Job deleted successfully');
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
                          <Trash2
                            className="w-4 h-4 text-red-600 hover:text-red-800 cursor-pointer transition"
                            onClick={() => handleDeleteJob(job.id)}
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
                          <Trash2
                            className="w-4 h-4 text-red-600 hover:text-red-800 cursor-pointer transition"
                            onClick={() => handleDeleteJob(job.id)}
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
                          <Trash2
                            className="w-4 h-4 text-red-600 hover:text-red-800 cursor-pointer transition"
                            onClick={() => handleDeleteJob(job.id)}
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
                        {selectedJob.status === 'processing' ? <LiveTimer job={selectedJob} /> : getElapsedTime(selectedJob)}
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
                const productsDiscovered = selectedJob?.metadata?.products_discovered || 0;

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
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">Global Overview</TabsTrigger>
                <TabsTrigger value="products">Product Extraction</TabsTrigger>
                <TabsTrigger value="logs">Technical Logs</TabsTrigger>
              </TabsList>

              {/* Global Overview Tab */}
              <TabsContent value="overview" className="space-y-6 mt-6">
                {/* Process Flow */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Pipeline Process Flow
                    </CardTitle>
                    <CardDescription>
                      Real-time monitoring of all pipeline stages and system metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8 relative">
                    {GLOBAL_PIPELINE_FLOW.map((stage, index) => {
                      const checkpoint = jobCheckpoints.find(cp => cp.stage === stage.checkpoint);
                      const isCompleted = !!checkpoint || (selectedJob?.status === 'completed');
                      const isActive = selectedJob?.status === 'processing' && !isCompleted && 
                                      (index === 0 || !!jobCheckpoints.find(cp => cp.stage === GLOBAL_PIPELINE_FLOW[index-1].checkpoint));
                      const isPending = !isCompleted && !isActive;
                      
                      const Icon = stage.icon;
                      const isLast = index === GLOBAL_PIPELINE_FLOW.length - 1;
                      
                      const previousCheckpoint = index > 0 
                        ? jobCheckpoints.find(cp => cp.stage === GLOBAL_PIPELINE_FLOW[index-1].checkpoint)
                        : null;
                      const stageDuration = isCompleted ? getStageDuration(checkpoint, previousCheckpoint) : null;

                      // Extract stage-specific metrics
                      const getStageMetrics = () => {
                        if (stage.id === 'extraction') {
                          const total = selectedJob?.metadata?.total_pages || selectedJob?.metadata?.extracted_pages || 0;
                          const processed = selectedJob?.metadata?.result?.pages_processed || 0;
                          if (total > 0) return `${processed}/${total} pages extracted`;
                        }
                        if (stage.id === 'discovery') {
                          const discovered = selectedJob?.metadata?.products_discovered || 0;
                          if (discovered > 0) return `${discovered} products identified`;
                        }
                        if (stage.id === 'processing') {
                          const total = productProgress.length;
                          const completed = productProgress.filter(p => p.status === 'completed').length;
                          if (total > 0) return `${completed}/${total} products processed`;
                        }
                        if (stage.id === 'entities' && isCompleted) {
                          const relations = (selectedJob?.metadata?.result?.total_relations || 0);
                          if (relations > 0) return `${relations} relationship links created`;
                        }
                        return null;
                      };

                      const stageMetrics = getStageMetrics();

                      // Get sub-action durations if they exist within this stage
                      const getSubActions = () => {
                        const subActions: { name: string; duration: string; timestamp: string }[] = [];
                        
                        if (stage.id === 'extraction') {
                          const imgCp = jobCheckpoints.find(cp => cp.stage === 'images_extracted');
                          const chunkCp = jobCheckpoints.find(cp => cp.stage === 'chunks_created');
                          
                          if (imgCp) {
                            subActions.push({ 
                              name: 'Image Extraction', 
                              duration: getStageDuration(imgCp, previousCheckpoint),
                              timestamp: imgCp.created_at
                            });
                          }
                          if (chunkCp) {
                            subActions.push({ 
                              name: 'Semantic Chunking', 
                              duration: getStageDuration(chunkCp, imgCp || previousCheckpoint),
                              timestamp: chunkCp.created_at
                            });
                          }
                        }
                        return subActions;
                      };

                      const subActions = getSubActions();

                      return (
                        <div key={stage.id} className="relative flex gap-6">
                          {/* Connector Line */}
                          {!isLast && (
                            <div className={`absolute left-[19px] top-10 w-0.5 h-[calc(100%+8px)] ${isCompleted ? 'bg-primary' : 'bg-slate-200'}`} />
                          )}

                          {/* Icon Container */}
                          <div className="relative z-10">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                              isCompleted ? 'bg-primary border-primary text-primary-foreground' :
                              isActive ? 'bg-white border-primary text-primary animate-pulse shadow-md' :
                              'bg-slate-50 border-slate-200 text-slate-400'
                            }`}>
                              {isCompleted ? (
                                <CheckCircle className="h-6 w-6" />
                              ) : isActive ? (
                                <RefreshCw className="h-5 w-5 animate-spin" />
                              ) : (
                                <Icon className="h-5 w-5" />
                              )}
                            </div>
                          </div>

                          {/* Stage Details */}
                          <div className="flex-1 pt-1 pb-4">
                            <div className="flex items-center justify-between">
                              <h4 className={`font-semibold text-sm ${isActive ? 'text-primary' : isPending ? 'text-slate-500' : 'text-slate-900'}`}>
                                {stage.name}
                              </h4>
                              {isCompleted && checkpoint?.created_at && (
                                <div className="flex items-center gap-2">
                                  {stageDuration && stageDuration !== 'N/A' && (
                                    <Badge variant="outline" className="text-[9px] bg-slate-50 text-slate-500 border-slate-200 py-0 h-4 uppercase font-bold tracking-tighter">
                                      Took {stageDuration}
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {formatDate(checkpoint.created_at)}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {isCompleted ? 'Task finished successfully' :
                               isActive ? 'System is currently working on this step' :
                               'Waiting for previous steps to complete'}
                            </p>

                            {/* Real-time Metrics Display */}
                            {(isActive || isCompleted) && stageMetrics && (
                              <div className="mt-3 bg-slate-50 border border-slate-100 rounded-md p-2 flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                <Activity className="h-3 w-3 text-primary" />
                                <span className="text-xs font-medium text-slate-700">{stageMetrics}</span>
                              </div>
                            )}

                            {/* Sub-actions Breakdown */}
                            {subActions.length > 0 && (
                              <div className="mt-3 space-y-2 pl-2 border-l-2 border-slate-100 ml-1">
                                {subActions.map((sub, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px]">
                                    <div className="flex items-center gap-2 text-slate-600">
                                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                      {sub.name}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-500">Took {sub.duration}</span>
                                      <span className="text-slate-300">|</span>
                                      <span className="text-muted-foreground">{new Date(sub.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Stage-specific detail content */}
                            {isCompleted && checkpoint?.metadata && Object.keys(checkpoint.metadata).length > 0 && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {Object.entries(checkpoint.metadata).slice(0, 4).map(([key, value]) => (
                                  <div key={key} className="text-[10px] flex gap-1">
                                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                                    <span className="font-medium text-slate-700">
                                      {typeof value === 'object' ? '...' : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Technical Logs Tab */}
              <TabsContent value="logs" className="space-y-4 mt-6">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Checkpoint Stream</h3>
                    <p className="text-sm text-muted-foreground">Raw chronological sequence of system events and operation metadata</p>
                  </div>
                </div>
                
                <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="bg-slate-50 border-b px-4 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-6">
                      <span className="w-20">Timestamp</span>
                      <span className="w-32">Stage/Operation</span>
                      <span>Details / Metadata</span>
                    </div>
                    <span>Status</span>
                  </div>
                  <div className="divide-y max-h-[500px] overflow-y-auto">
                    {jobCheckpoints.length > 0 ? (
                      [...jobCheckpoints].reverse().map((cp, idx) => (
                        <div key={cp.id || idx} className="px-4 py-3 hover:bg-slate-50/50 transition-colors flex items-start justify-between">
                          <div className="flex items-start gap-6">
                            <span className="text-[10px] font-mono text-slate-400 w-20 pt-0.5">
                              {new Date(cp.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <div className="w-32">
                              <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-600 border-none font-bold uppercase py-0 leading-4">
                                {cp.stage}
                              </Badge>
                            </div>
                            <div className="flex-1 max-w-md">
                              <p className="text-xs font-medium text-slate-700">
                                {cp.checkpoint_data?.message || cp.checkpoint_data?.status || 'Operation successful'}
                              </p>
                              {cp.metadata && Object.keys(cp.metadata).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                  {Object.entries(cp.metadata).map(([k, v]) => (
                                    <span key={k} className="text-[9px] text-muted-foreground">
                                      <span className="font-semibold">{k}:</span> {typeof v === 'object' ? '...' : String(v)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge className="bg-green-50 text-green-700 border-green-100 text-[9px] h-4">OK</Badge>
                        </div>
                      ))
                    ) : (
                      <div className="p-12 text-center text-muted-foreground">
                        <Terminal className="h-8 w-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No technical logs available for this job yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Product Extraction Tab */}
              <TabsContent value="products" className="space-y-6 mt-6">
                {/* Product Detail Header */}
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Extracted Products</h3>
                    <p className="text-sm text-muted-foreground">Detailed status tracking for individual products identified in the document</p>
                  </div>
                  <Badge variant="outline" className="px-3 py-1 bg-white">
                    {productProgress.length} items
                  </Badge>
                </div>
                {/* Product Accordions */}
                {productProgress.length > 0 ? (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="pb-3 border-b bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Package className="h-4 w-4 text-primary" />
                            Active Extractions
                          </CardTitle>
                          <div className="text-[11px] text-muted-foreground font-medium">
                            {productProgress.filter(p => p.status === 'completed').length} COMPLETED | {productProgress.filter(p => p.status === 'failed').length} FAILED
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Accordion type="multiple" className="w-full">
                          {productProgress.map((product) => {
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
                                      <div className="font-semibold text-slate-900 leading-tight">{product.product_name}</div>
                                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">ID: {product.product_id.slice(0, 8)}</span>
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

                                    {/* Product Pipeline Flow */}
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                      {PRODUCT_STAGES.map((stage) => {
                                        const isStageCompleted = product.stages_completed?.includes(stage.id);
                                        const isCurrentStage = product.current_stage === stage.id;
                                        const StageIcon = stage.icon;

                                        return (
                                          <div
                                            key={stage.id}
                                            className={`flex flex-col items-center text-center p-3 rounded-lg border transition-all duration-200 ${
                                              isStageCompleted ? 'bg-green-50 border-green-100 text-green-900' :
                                              isCurrentStage ? 'bg-blue-50 border-blue-200 text-blue-900 ring-1 ring-blue-100' :
                                              'bg-slate-50/50 border-slate-100 text-slate-400'
                                            }`}
                                          >
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center mb-2 ${
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
                                            <span className="text-[10px] font-bold uppercase tracking-tight">{stage.name}</span>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Product Metrics Grid */}
                                    <div className="grid grid-cols-3 gap-3">
                                      <div className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-2 mb-1">
                                          <FileText className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-[10px] text-muted-foreground font-medium uppercase">Chunks</span>
                                        </div>
                                        <div className="text-lg font-bold text-slate-900">
                                          {product.metrics.chunks_created || 0}
                                        </div>
                                      </div>
                                      <div className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-2 mb-1">
                                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-[10px] text-muted-foreground font-medium uppercase">Images</span>
                                        </div>
                                        <div className="text-lg font-bold text-slate-900">
                                          {product.metrics.images_processed || 0}
                                        </div>
                                      </div>
                                      <div className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center gap-2 mb-1">
                                          <Link className="h-3 w-3 text-muted-foreground" />
                                          <span className="text-[10px] text-muted-foreground font-medium uppercase">Relational Links</span>
                                        </div>
                                        <div className="text-lg font-bold text-slate-900">
                                          {product.metrics.relationships_created || 0}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Action Shortcuts */}
                                    {isCompleted && (
                                      <div className="flex gap-2 justify-end">
                                        <button className="text-[10px] font-medium bg-slate-900 text-white px-3 py-1 rounded hover:bg-slate-800 transition-colors uppercase tracking-wider">
                                          View Data
                                        </button>
                                        <button className="text-[10px] font-medium border px-3 py-1 rounded hover:bg-slate-50 transition-colors uppercase tracking-wider">
                                          Re-sync
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </CardContent>
                    </Card>

                  </div>
                ) : (
                  <Card className="border-dashed border-2 bg-slate-50/50">
                    <CardContent className="py-20 text-center">
                      <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-4 border ring-4 ring-slate-100">
                        <Package className="h-8 w-8 text-slate-300" />
                      </div>
                      <h4 className="text-base font-semibold text-slate-900">No products discovered yet</h4>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                        Wait for the "Product Discovery" stage of the pipeline to identify materials and items in the document.
                      </p>
                    </CardContent>
                  </Card>
                )}
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
                      {selectedJob?.metadata?.products_discovered || productProgress.length || 0}
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
