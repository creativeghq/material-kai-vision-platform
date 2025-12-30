import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { TempFileCleanupModal } from './TempFileCleanupModal';
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
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { GlobalAdminHeader } from './GlobalAdminHeader';

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

// 14-stage processing pipeline
const PROCESSING_STAGES = [
  { id: 1, name: 'Job Initialization', checkpoint: 'initialized' },
  { id: 2, name: 'Product Discovery', checkpoint: 'products_detected' },
  { id: 3, name: 'Focused Extraction', checkpoint: 'pdf_extracted' },
  { id: 4, name: 'Chunking', checkpoint: 'chunks_created' },
  { id: 5, name: 'Text Embeddings', checkpoint: 'text_embeddings_generated' },
  { id: 6, name: 'Image Extraction', checkpoint: 'images_extracted' },
  { id: 7, name: 'Image Classification', checkpoint: 'images_extracted' },
  { id: 8, name: 'Image Analysis', checkpoint: 'images_extracted' },
  { id: 9, name: 'CLIP Embeddings', checkpoint: 'image_embeddings_generated' },
  { id: 10, name: 'Product Creation', checkpoint: 'products_created' },
  { id: 11, name: 'Relationship Mapping', checkpoint: 'relationships_created' },
  { id: 12, name: 'Document Entities', checkpoint: 'document_entities_created' },
  { id: 13, name: 'Metadata Extraction', checkpoint: 'metadata_extracted' },
  { id: 14, name: 'Quality Enhancement', checkpoint: 'completed' },
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

      // Fetch background jobs (PDF, Web Scraping, and Product Discovery)
      const { data: bgJobsData, error: bgJobsError } = await supabase
        .from('background_jobs')
        .select('*')
        .in('job_type', ['pdf_processing', 'web_scraping', 'product_discovery_upload'])
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
            j.job_type === 'product_discovery_upload'
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
        job.job_type === 'product_discovery_upload'
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
        }
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
        }
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
        }
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
        }
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

        // Update selected job ONLY if data actually changed
        setSelectedJob(prev => {
          if (!prev) return prev;

          // Deep comparison to prevent unnecessary re-renders
          if (prev.status === jobData.status &&
              prev.progress === jobData.progress &&
              JSON.stringify(prev.metadata) === JSON.stringify(jobData.metadata)) {
            return prev; // No change, keep same reference to prevent modal blink
          }

          return jobData as BackgroundJob;
        });

        // Refresh checkpoints with deep comparison to prevent unnecessary re-renders
        const { data: checkpoints } = await supabase
          .from('job_checkpoints')
          .select('*')
          .eq('job_id', selectedJob.id)
          .order('created_at', { ascending: true });

        if (checkpoints) {
          setJobCheckpoints(prev => {
            // Only update if checkpoints actually changed
            if (JSON.stringify(prev) === JSON.stringify(checkpoints)) {
              return prev; // No change, keep same reference
            }
            return checkpoints;
          });
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

  const getStatusBadge = (status: string) => {
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
    return (
      <Badge className={config.color}>
        {config.icon} {status}
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
      // Use admin endpoint with cleanup=true to delete all partial data
      const response = await fetch(`https://v1api.materialshub.gr/api/admin/jobs/${jobId}?cleanup=true`, {
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

      alert('Job cancelled successfully');
    } catch (error) {
      console.error('Error cancelling job:', error);
      alert(`Failed to cancel job: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCancellingJob(null);
    }
  };

  const handleClearQueue = async () => {
    // Include interrupted jobs in the clear queue operation
    const jobsToClear = jobs.filter(
      (job) => job.status === 'pending' || job.status === 'failed' || job.status === 'interrupted'
    );

    if (jobsToClear.length === 0) {
      alert('No pending, failed, or interrupted jobs to clear');
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
        `Are you sure you want to clear ${jobsToClear.length} jobs (${statusMessage})? This action cannot be undone.`
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
            `https://v1api.materialshub.gr/api/rag/documents/jobs/${job.id}`,
            {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(`Failed to cancel job ${job.id}:`, error);
          failCount++;
        }
      }

      // Refresh the job list
      await fetchQueueData();

      alert(
        `Queue cleared: ${successCount} jobs cancelled successfully${failCount > 0 ? `, ${failCount} failed` : ''}`
      );
    } catch (error) {
      console.error('Error clearing queue:', error);
      alert(`Failed to clear queue: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setClearingQueue(false);
    }
  };

  const handleDeleteJobById = async () => {
    if (!deleteJobId.trim()) {
      alert('Please enter a job ID');
      return;
    }

    if (!confirm(`Are you sure you want to delete job ${deleteJobId} and ALL its associated data? This action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`https://v1api.materialshub.gr/api/rag/documents/jobs/${deleteJobId.trim()}`, {
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

      alert(`Job deleted successfully!\n\nDeleted: ${statsMessage || 'Job record'}`);

      // Close modal and refresh
      setShowDeleteJobModal(false);
      setDeleteJobId('');
      await fetchQueueData();

    } catch (error) {
      console.error('Error deleting job:', error);
      alert(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      alert('Job deleted successfully');
    } catch (error) {
      console.error('Error deleting job:', error);
      alert(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="all" className="flex items-center gap-2">
            All Jobs
            <Badge variant="secondary" className="ml-1">{metrics.all_jobs.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pdf_processing" className="flex items-center gap-2">
            PDF Processing
            <Badge variant="secondary" className="ml-1">{metrics.pdf_processing.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="web_scraping" className="flex items-center gap-2">
            Web Scraping
            <Badge variant="secondary" className="ml-1">{metrics.web_scraping.total}</Badge>
          </TabsTrigger>
          <TabsTrigger value="xml_import" className="flex items-center gap-2">
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
                          {getStatusBadge(job.status)}
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
                          {getStatusBadge(job.status)}
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
                          {getStatusBadge(job.status)}
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
                          {getStatusBadge(job.status)}
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
                  <code className="px-2 py-0.5 bg-muted rounded text-xs font-mono">
                    {selectedJob?.id?.slice(0, 8)}...
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
              </div>
              <p className="text-muted-foreground mt-2">
                Complete pipeline workflow with all stages, metrics, and AI models used
              </p>
            </DialogDescription>
          </DialogHeader>

          {loadingCheckpoints ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Job Overview */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Job Overview</CardTitle>
                    <div className="flex items-center gap-2">
                      {selectedJob && (selectedJob.status === 'processing' || selectedJob.status === 'pending' || selectedJob.status === 'interrupted') && (
                        <button
                          onClick={() => handleCancelJob(selectedJob.id)}
                          disabled={cancellingJob === selectedJob.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {cancellingJob === selectedJob.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              {selectedJob.status === 'interrupted' ? 'Mark as Cancelled' : 'Cancel Job'}
                            </>
                          )}
                        </button>
                      )}
                      {selectedJob && (selectedJob.status === 'completed' || selectedJob.status === 'failed' || selectedJob.status === 'cancelled' || selectedJob.status === 'interrupted') && (
                        <button
                          onClick={() => handleDeleteJob(selectedJob.id)}
                          disabled={deletingJob === selectedJob.id}
                          className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {deletingJob === selectedJob.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Job
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-1 transition-all duration-300">{selectedJob && getStatusBadge(selectedJob.status)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Progress</div>
                    <div className="mt-1 font-semibold transition-all duration-300 animate-in fade-in">{selectedJob?.progress}%</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="mt-1 text-sm">{selectedJob && formatDate(selectedJob.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="mt-1 text-sm transition-all duration-300">
                      {selectedJob?.started_at && selectedJob?.completed_at
                        ? formatTime(
                            (new Date(selectedJob.completed_at).getTime() -
                              new Date(selectedJob.started_at).getTime()) /
                              1000
                          )
                        : 'N/A'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Interruption Reason Alert */}
              {selectedJob?.status === 'interrupted' && selectedJob?.error && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-800">
                      <AlertCircle className="h-5 w-5" />
                      Job Interrupted
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm text-orange-900">
                        <span className="font-semibold">Reason:</span> {selectedJob.error}
                      </div>
                      {selectedJob.interrupted_at && (
                        <div className="text-xs text-orange-700">
                          Interrupted at: {formatDate(selectedJob.interrupted_at)}
                        </div>
                      )}
                      <div className="text-xs text-orange-600 mt-2 p-2 bg-orange-100 rounded">
                        💡 <strong>Tip:</strong> This job was stopped before completion. You can delete it or mark it as cancelled.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Processing Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Processing Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Products</div>
                        <div className="font-semibold text-lg transition-all duration-300 animate-in fade-in">
                          {selectedJob?.metadata?.result?.products_created ||
                           selectedJob?.metadata?.products_created ||
                           selectedJob?.metadata?.products_discovered || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Chunks</div>
                        <div className="font-semibold text-lg transition-all duration-300 animate-in fade-in">
                          {selectedJob?.metadata?.result?.chunks_created ||
                           selectedJob?.metadata?.chunks_created || 0}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Images</div>
                        <div className="font-semibold text-lg transition-all duration-300 animate-in fade-in">
                          {selectedJob?.metadata?.result?.images_processed ||
                           selectedJob?.metadata?.images_saved ||
                           (jobCheckpoints.find(cp => cp.stage === 'images_extracted')?.checkpoint_data as any)?.images_saved || 0}
                          {selectedJob?.metadata?.total_images_extracted && (
                            <span className="text-xs text-muted-foreground ml-1">
                              / {selectedJob.metadata.total_images_extracted}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <div>
                        <div className="text-xs text-muted-foreground">Embeddings</div>
                        <div className="font-semibold text-lg transition-all duration-300 animate-in fade-in">
                          {(() => {
                            const imgCheckpoint = jobCheckpoints.find(cp => cp.stage === 'images_extracted');

                            // Debug: Log the checkpoint structure
                            if (imgCheckpoint) {
                              console.log('Images checkpoint data:', imgCheckpoint.checkpoint_data);
                              console.log('Images checkpoint metadata:', imgCheckpoint.metadata);
                            }

                            // Try metadata.clip_embeddings.total first (most accurate)
                            const metadataTotal = (imgCheckpoint?.metadata as any)?.clip_embeddings?.total;
                            if (metadataTotal) return metadataTotal;

                            // Fall back to data fields
                            const clipEmbeddings = (imgCheckpoint?.checkpoint_data as any)?.clip_embeddings || 0;
                            const specializedEmbeddings = (imgCheckpoint?.checkpoint_data as any)?.specialized_embeddings || 0;
                            const totalEmbeddings = clipEmbeddings + specializedEmbeddings;
                            return totalEmbeddings || selectedJob?.metadata?.embeddings_generated || 0;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Relations Row */}
                  {(() => {
                    const productsCheckpoint = jobCheckpoints.find(cp => cp.stage === 'products_created');
                    const entityLinks = (productsCheckpoint?.metadata as any)?.entity_links;
                    const hasRelations = entityLinks && (entityLinks.image_product_links || entityLinks.chunk_product_links || entityLinks.image_chunk_links);

                    return hasRelations && (
                      <div className="mt-4 pt-4 border-t">
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">Relations</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="text-xs text-muted-foreground">Product-Image</div>
                            <div className="font-semibold">{entityLinks.image_product_links || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Product-Chunk</div>
                            <div className="font-semibold">{entityLinks.chunk_product_links || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Chunk-Image</div>
                            <div className="font-semibold">{entityLinks.image_chunk_links || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Total Relations</div>
                            <div className="font-semibold text-primary">
                              {(entityLinks.image_product_links || 0) +
                               (entityLinks.chunk_product_links || 0) +
                               (entityLinks.image_chunk_links || 0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Additional Metrics Row */}
                  {(selectedJob?.metadata?.total_pages || selectedJob?.metadata?.extracted_pages || selectedJob?.metadata?.database_records_created) ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
                      {selectedJob?.metadata?.result?.pages_processed && (
                        <div>
                          <div className="text-xs text-muted-foreground">Pages Processed</div>
                          <div className="font-semibold">
                            {selectedJob.metadata.result.pages_processed}
                            {selectedJob.metadata.result.pages_skipped && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({selectedJob.metadata.result.pages_skipped} skipped)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedJob?.metadata?.knowledge_base_entries && (
                        <div>
                          <div className="text-xs text-muted-foreground">KB Entries</div>
                          <div className="font-semibold">{selectedJob.metadata.knowledge_base_entries}</div>
                        </div>
                      )}
                      {selectedJob?.metadata?.result?.confidence_score && (
                        <div>
                          <div className="text-xs text-muted-foreground">Confidence</div>
                          <div className="font-semibold">{(selectedJob.metadata.result.confidence_score * 100).toFixed(0)}%</div>
                        </div>
                      )}
                      {selectedJob?.metadata?.errors_count !== undefined && selectedJob.metadata.errors_count > 0 && (
                        <div>
                          <div className="text-xs text-muted-foreground">Errors</div>
                          <div className="font-semibold text-red-600">{selectedJob.metadata.errors_count}</div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* Pipeline Stages - 14-Stage Workflow (PDF only) */}
              {(selectedJob?.job_type === 'pdf_processing' || selectedJob?.job_type === 'product_discovery_upload') && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      14-Stage Processing Pipeline
                    </CardTitle>
                    <CardDescription>
                      Click on completed stages (green) to see detailed metrics, or skipped stages (amber) to understand why they were not applicable
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                    {PROCESSING_STAGES.map((stage, stageIndex) => {
                      // Find if this stage has a checkpoint
                      const checkpoint = jobCheckpoints.find(
                        (cp) => cp.stage.toLowerCase() === stage.checkpoint.toLowerCase()
                      );
                      const isCompleted = !!checkpoint;

                      // Find previous checkpoint for duration calculation
                      const previousCheckpoint = stageIndex > 0
                        ? jobCheckpoints.find(cp =>
                            cp.stage.toLowerCase() === PROCESSING_STAGES[stageIndex - 1].checkpoint.toLowerCase()
                          )
                        : null;

                      const stageDuration = isCompleted ? getStageDuration(checkpoint, previousCheckpoint) : null;

                      // Check if this stage was skipped (job completed but this checkpoint doesn't exist)
                      const isSkipped = selectedJob?.status === 'completed' && !isCompleted &&
                        jobCheckpoints.some(cp => cp.stage === 'completed');

                      const isFailed = selectedJob?.status === 'failed' && !isCompleted;
                      const isActive =
                        selectedJob?.status === 'processing' &&
                        !isCompleted &&
                        !isSkipped &&
                        stage.id === (jobCheckpoints.length + 1);
                      const isExpanded = expandedStages.has(stage.id);

                      const metadata = checkpoint?.metadata || {};
                      const checkpointData = checkpoint?.checkpoint_data || {};

                      return (
                        <div
                          key={stage.id}
                          className={`rounded-lg border ${
                            isFailed
                              ? 'bg-red-50 border-red-200'
                              : isActive
                              ? 'bg-blue-50 border-blue-200'
                              : isCompleted
                              ? 'bg-green-50 border-green-200'
                              : isSkipped
                              ? 'bg-amber-50 border-amber-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          {/* Stage Header - Clickable for completed and skipped stages */}
                          <button
                            onClick={() => (isCompleted || isSkipped) && toggleStage(stage.id)}
                            disabled={!isCompleted && !isSkipped}
                            className="w-full flex items-start gap-3 p-3 text-left hover:bg-black/5 transition-colors disabled:cursor-default"
                          >
                            {/* Status Icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              {isFailed ? (
                                <XCircle className="h-4 w-4 text-red-600" />
                              ) : isActive ? (
                                <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                              ) : isCompleted ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : isSkipped ? (
                                <div className="relative">
                                  <Clock className="h-4 w-4 text-amber-500" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-3 h-0.5 bg-amber-500 rotate-45"></div>
                                  </div>
                                </div>
                              ) : (
                                <Clock className="h-4 w-4 text-slate-400" />
                              )}
                            </div>

                            {/* Stage Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm flex items-center gap-2">
                                  <span>{stage.id}. {stage.name}</span>
                                  {isSkipped && (
                                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-normal">
                                      Skipped
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {checkpoint && stageDuration && (
                                    <div className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                                      ⏱️ {stageDuration}
                                    </div>
                                  )}
                                  {checkpoint && (
                                    <div className="text-xs text-muted-foreground">
                                      {formatDate(checkpoint.created_at)}
                                    </div>
                                  )}
                                  {(isCompleted || isSkipped) && (
                                    <div className="flex-shrink-0">
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Quick Summary - Always visible for completed stages */}
                              {isCompleted && !isExpanded && (
                                <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                  {metadata.discovery_model && (
                                    <span>🤖 {metadata.discovery_model}</span>
                                  )}
                                  {checkpointData.products_detected && (
                                    <span>📦 {checkpointData.products_detected} products</span>
                                  )}
                                  {/* Chunking step (step 4) - show chunks and embedding model */}
                                  {stage.id === 4 && checkpointData.chunks_created && (
                                    <>
                                      <span>📄 {checkpointData.chunks_created} chunks</span>
                                      <span>🔢 text-embedding-3-small (1536D)</span>
                                    </>
                                  )}
                                  {/* Text Embeddings step (step 5) - show embedding details */}
                                  {stage.id === 5 && (checkpointData.text_embeddings || checkpointData.text_embeddings_generated) && (
                                    <>
                                      <span>🔢 {checkpointData.text_embeddings || checkpointData.text_embeddings_generated} embeddings</span>
                                      <span>📐 1536 dimensions</span>
                                    </>
                                  )}
                                  {/* Other steps - show chunks if not step 4 */}
                                  {stage.id !== 4 && checkpointData.chunks_created && (
                                    <span>📄 {checkpointData.chunks_created} chunks</span>
                                  )}
                                  {checkpointData.images_saved && (
                                    <span>🖼️ {checkpointData.images_saved} images</span>
                                  )}
                                  {checkpointData.products_created && (
                                    <span>✅ {checkpointData.products_created} created</span>
                                  )}
                                </div>
                              )}

                              {/* Skipped Stage Explanation */}
                              {isSkipped && !isExpanded && (
                                <div className="mt-1 text-xs text-amber-600">
                                  This stage was not applicable for this document
                                </div>
                              )}

                              {/* Active Stage Indicator */}
                              {isActive && (
                                <div className="mt-2 text-xs text-blue-600 font-medium">
                                  Currently processing...
                                </div>
                              )}
                            </div>
                          </button>

                          {/* Expanded Details - Accordion Content */}
                          {isCompleted && isExpanded && (
                            <div className="px-3 pb-3 pt-0 border-t border-black/10">
                              <div className="mt-3 space-y-3">
                                {/* Checkpoint Data Section */}
                                {Object.keys(checkpointData).length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-muted-foreground mb-2">Stage Output Data</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs p-2 rounded">
                                      {Object.entries(checkpointData).map(([key, value]) => {
                                        // Special rendering for product_names with tooltip
                                        if (key === 'product_names' && Array.isArray(value) && value.length > 0) {
                                          return (
                                            <div key={key} className="break-words">
                                              <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="ml-1 font-medium transition-all duration-300 break-words cursor-help underline decoration-dotted">
                                                      Review ({value.length})
                                                    </span>
                                                  </TooltipTrigger>
                                                  <TooltipContent className="max-w-md max-h-60 overflow-y-auto">
                                                    <div className="space-y-1">
                                                      {value.map((name: string, idx: number) => (
                                                        <div key={idx} className="text-xs">• {name}</div>
                                                      ))}
                                                    </div>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={key} className="break-words">
                                            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                                            <span className="ml-1 font-medium transition-all duration-300 break-words">
                                              {formatValue(value, key)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Metadata Section */}
                                {Object.keys(metadata).length > 0 && (
                                  <div>
                                    <h5 className="text-xs font-semibold text-muted-foreground mb-2">Processing Metadata</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs p-2 rounded">
                                      {Object.entries(metadata).map(([key, value]) => {
                                        // Special rendering for product_names with tooltip
                                        if (key === 'product_names' && Array.isArray(value) && value.length > 0) {
                                          return (
                                            <div key={key} className="break-words">
                                              <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="ml-1 font-medium transition-all duration-300 break-words cursor-help underline decoration-dotted">
                                                      Review ({value.length})
                                                    </span>
                                                  </TooltipTrigger>
                                                  <TooltipContent className="max-w-md max-h-60 overflow-y-auto">
                                                    <div className="space-y-1">
                                                      {value.map((name: string, idx: number) => (
                                                        <div key={idx} className="text-xs">• {name}</div>
                                                      ))}
                                                    </div>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </TooltipProvider>
                                            </div>
                                          );
                                        }

                                        return (
                                          <div key={key} className="break-words">
                                            <span className="text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                                            <span className="ml-1 font-medium transition-all duration-300 break-words">
                                              {formatValue(value, key)}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Expanded Details - Accordion Content for Skipped Stages */}
                          {isSkipped && isExpanded && (
                            <div className="px-3 pb-3 pt-0 border-t border-amber-200">
                              <div className="mt-3 space-y-3">
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                                  <h5 className="text-sm font-semibold text-amber-800 mb-2">Why was this stage skipped?</h5>
                                  <div className="text-xs text-amber-700 space-y-1">
                                    {stage.name === 'Text Embeddings' && (
                                      <p>Text embeddings are generated as part of the Chunking stage. This separate checkpoint is only created in specific processing modes.</p>
                                    )}
                                    {stage.name === 'CLIP Embeddings' && (
                                      <p>CLIP embeddings are generated as part of the Image Extraction stage. This separate checkpoint is only created when specialized embedding generation is enabled.</p>
                                    )}
                                    {stage.name === 'Relationship Mapping' && (
                                      <p>Relationship mapping was not performed for this document, likely because there were no images or chunks to link to products.</p>
                                    )}
                                    {stage.name === 'Document Entities' && (
                                      <p>No document entities (certificates, logos, specifications) were detected in this document.</p>
                                    )}
                                    {stage.name === 'Metadata Extraction' && (
                                      <p>No factory metadata or product-level metadata was extracted from this document.</p>
                                    )}
                                    {!['Text Embeddings', 'CLIP Embeddings', 'Relationship Mapping', 'Document Entities', 'Metadata Extraction'].includes(stage.name) && (
                                      <p>This stage was not applicable or required for this particular document processing job.</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
              )}

              {/* REMOVED DUPLICATE METRICS SECTION - Metrics are now displayed at the top, before the 14-stage workflow */}
            </div>
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
              <label htmlFor="deleteJobId" className="block text-sm font-medium mb-2">
                Job ID
              </label>
              <input
                id="deleteJobId"
                type="text"
                value={deleteJobId}
                onChange={(e) => setDeleteJobId(e.target.value)}
                placeholder="Enter job ID (e.g., 123e4567-e89b-12d3-a456-426614174000)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleDeleteJobById();
                  }
                }}
              />
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-semibold mb-1">⚠️ Warning: This action cannot be undone!</p>
                  <p className="text-xs">This will permanently delete:</p>
                  <ul className="text-xs mt-1 ml-4 list-disc space-y-0.5">
                    <li>Job record</li>
                    <li>Document record</li>
                    <li>All chunks and embeddings</li>
                    <li>All images</li>
                    <li>All products</li>
                    <li>Storage files</li>
                    <li>Checkpoints</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteJobModal(false);
                  setDeleteJobId('');
                }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteJobById}
                disabled={!deleteJobId.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 inline mr-1.5" />
                Delete Job
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
