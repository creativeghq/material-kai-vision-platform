/**
 * Import History Tab
 *
 * Displays past import jobs with status, progress, and details
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { useToast } from '@/hooks/use-toast';
import ScheduleImportModal from './ScheduleImportModal';
import { XMLImportJobCard, XMLImportJob } from './XMLImportJobCard';

interface ImportJob {
  id: string;
  import_type: string;
  source_name: string;
  status: string;
  total_products: number;
  processed_products: number;
  failed_products: number;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  original_xml_content: string | null;
  field_mappings: Record<string, string> | null;
  mapping_template_id: string | null;
  category: string;
  is_scheduled: boolean;
  cron_schedule: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  source_url: string | null;
}

const ImportHistoryTab: React.FC = () => {
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const { toast } = useToast();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJobForSchedule, setSelectedJobForSchedule] = useState<ImportJob | null>(null);
  const [isRerunning, setIsRerunning] = useState<string | null>(null);

  // Load workspace ID on mount
  useEffect(() => {
    const loadWorkspace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (workspaceData) {
        setWorkspaceId(workspaceData.workspace_id);
      }
    };

    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadImportHistory();

      // Set up real-time subscriptions for import jobs
      const importJobsChannel = supabase
        .channel(`data_import_jobs_${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'data_import_jobs',
            filter: `workspace_id=eq.${workspaceId}`,
          },
          () => {
            console.log('data_import_jobs changed - refreshing data');
            loadImportHistory();
          },
        )
        .subscribe();

      const backgroundJobsChannel = supabase
        .channel(`background_jobs_pdf_${workspaceId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'background_jobs',
            filter: 'job_type=eq.pdf_processing',
          },
          () => {
            console.log('background_jobs (PDF) changed - refreshing data');
            loadImportHistory();
          },
        )
        .subscribe();

      return () => {
        importJobsChannel.unsubscribe();
        backgroundJobsChannel.unsubscribe();
        supabase.removeChannel(importJobsChannel);
        supabase.removeChannel(backgroundJobsChannel);
      };
    }
  }, [workspaceId]);

  const loadImportHistory = async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    try {
      // Load both XML import jobs and PDF processing jobs
      const [xmlJobsResult, pdfJobsResult] = await Promise.all([
        supabase
          .from('data_import_jobs')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('background_jobs')
          .select('*')
          .eq('job_type', 'pdf_processing')
          .order('created_at', { ascending: false })
          .limit(25),
      ]);

      const xmlJobs = xmlJobsResult.data || [];
      const pdfJobs = (pdfJobsResult.data || []).map((job: any) => ({
        id: job.id,
        import_type: 'pdf',
        source_name: job.metadata?.title || job.metadata?.file_name || 'PDF Processing',
        status: job.status,
        total_products: job.metadata?.products_discovered || 0,
        processed_products: job.metadata?.products_created || 0,
        failed_products: 0,
        created_at: job.created_at,
        completed_at: job.completed_at,
        error_message: job.error_message,
        original_xml_content: null,
        field_mappings: null,
        mapping_template_id: null,
        category: job.metadata?.category || 'products',
        is_scheduled: false,
        cron_schedule: null,
        last_run_at: null,
        next_run_at: null,
        source_url: null,
      }));

      // Combine and sort by created_at
      const allJobs = [...xmlJobs, ...pdfJobs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setJobs(allJobs);
    } catch (error) {
      console.error('Error loading import history:', error);
      toast({ title: 'Error', description: 'Failed to load import history', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualRerun = async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    if (!workspaceId || !job.original_xml_content) {
      toast({
        title: 'Cannot Re-run',
        description: 'Original XML content not available for this import',
        variant: 'destructive',
      });
      return;
    }

    setIsRerunning(job.id);

    try {
      const { data, error } = await supabase.functions.invoke('xml-import-orchestrator', {
        body: {
          workspace_id: workspaceId,
          category: job.category,
          xml_content: job.original_xml_content,
          source_name: `${job.source_name} (Re-run)`,
          field_mappings: job.field_mappings,
          mapping_template_id: job.mapping_template_id,
          parent_job_id: job.id,
        },
      });

      if (error) throw await edgeError(error);

      if (!data.success) {
        throw new Error(data.error || 'Re-run failed');
      }

      toast({
        title: 'Import Re-run Started',
        description: `New import job created: ${data.job_id}`,
      });

      // Reload jobs to show new one
      await loadImportHistory();
    } catch (error: any) {
      console.error('Re-run error:', error);
      toast({
        title: 'Re-run Failed',
        description: error.message || 'Failed to start re-run',
        variant: 'destructive',
      });
    } finally {
      setIsRerunning(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg">No import history yet</p>
        <p className="text-sm mt-2">Import jobs will appear here once you start importing data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <XMLImportJobCard
          key={job.id}
          job={job as XMLImportJob}
          onRetry={handleManualRerun}
          onViewDetails={(jobId) => {
            navigate(`/admin/async-queue-monitor?jobId=${jobId}`);
          }}
        />
      ))}

      {/* Schedule Modal */}
      {selectedJobForSchedule && (
        <ScheduleImportModal
          isOpen={true}
          onClose={() => setSelectedJobForSchedule(null)}
          job={selectedJobForSchedule}
          onScheduled={loadImportHistory}
        />
      )}
    </div>
  );
};

export default ImportHistoryTab;

