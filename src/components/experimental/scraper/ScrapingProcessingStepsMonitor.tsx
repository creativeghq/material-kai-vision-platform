/**
 * Scraping Processing Steps Monitor
 * Expandable step-by-step UI matching PDF processing pattern
 * Shows scraping stages with real-time updates
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';
import { Separator } from '@/components/core/ui/separator';
import { Badge } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface ProcessingStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  metrics?: Record<string, any>;
  error?: string;
}

interface ScrapingProcessingStepsMonitorProps {
  sessionId: string;
  sourceUrl: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

/**
 * Scraping Processing Pipeline Steps
 */
const SCRAPING_STEPS: Array<{ id: number; name: string; description: string }> = [
  {
    id: 1,
    name: 'Session Initialization',
    description: 'Creating scraping session and background job',
  },
  {
    id: 2,
    name: 'URL Discovery',
    description: 'Discovering pages to scrape (sitemap/crawl)',
  },
  {
    id: 3,
    name: 'Page Scraping',
    description: 'Scraping pages with Firecrawl',
  },
  {
    id: 4,
    name: 'Content Extraction',
    description: 'Extracting materials using AI prompts',
  },
  {
    id: 5,
    name: 'Material Creation',
    description: 'Creating materials in database',
  },
  {
    id: 6,
    name: 'Image Processing',
    description: 'Downloading and processing material images',
  },
  {
    id: 7,
    name: 'Finalization',
    description: 'Final validation and cleanup',
  },
];

export const ScrapingProcessingStepsMonitor: React.FC<ScrapingProcessingStepsMonitorProps> = ({
  sessionId,
  sourceUrl,
  onComplete,
  onError,
  className,
}) => {
  const [steps, setSteps] = useState<ProcessingStep[]>(
    SCRAPING_STEPS.map(step => ({
      ...step,
      status: 'pending' as const,
      progress: 0,
    })),
  );
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [startTime] = useState(new Date());
  const [sessionData, setSessionData] = useState<any>(null);
  const [jobData, setJobData] = useState<any>(null);

  // Poll for session and job updates
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        // Get session data
        const { data: session, error: sessionError } = await supabase
          .from('scraping_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError) throw sessionError;
        setSessionData(session);

        // Get job data if background_job_id exists
        if (session?.background_job_id) {
          const { data: job, error: jobError } = await supabase
            .from('background_jobs')
            .select('*')
            .eq('id', session.background_job_id)
            .single();

          if (!jobError && job) {
            setJobData(job);
            updateStepsFromJob(job, session);
          }
        }

        // Check completion
        if (session?.status === 'completed') {
          clearInterval(pollInterval);
          onComplete?.();
        } else if (session?.status === 'failed') {
          clearInterval(pollInterval);
          onError?.(session.error_message || 'Scraping failed');
        }
      } catch (error) {
        console.error('Error polling scraping status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [sessionId, onComplete, onError]);

  const updateStepsFromJob = (job: any, session: any) => {
    const newSteps = [...steps];

    // Map job status to steps
    if (job.status === 'pending') {
      newSteps[0].status = 'running';
    } else if (job.status === 'processing') {
      newSteps[0].status = 'completed';

      // Update based on current_stage
      const stage = job.current_stage || 'scraping';
      if (stage.includes('initializing')) {
        newSteps[1].status = 'running';
      } else if (stage.includes('discovering') || stage.includes('crawling')) {
        newSteps[1].status = 'completed';
        newSteps[2].status = 'running';
      } else if (stage.includes('scraping')) {
        newSteps[1].status = 'completed';
        newSteps[2].status = 'running';
        newSteps[2].progress = session.progress_percentage || 0;
      }
    }

    setSteps(newSteps);
  };

  return null; // Component implementation continues...
};

