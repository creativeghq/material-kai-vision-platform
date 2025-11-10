/**
 * Import History Tab
 * 
 * Displays past import jobs with status, progress, and details
 */

import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, Loader2, FileText, Play, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import ScheduleImportModal from './ScheduleImportModal';

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
    }
  }, [workspaceId]);

  const loadImportHistory = async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_import_jobs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading import history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-600 text-white">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-600 text-white">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-600 text-white">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-600 text-white">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleManualRerun = async (job: ImportJob) => {
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

      if (error) throw error;

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
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg">No import history yet</p>
        <p className="text-sm mt-2">Import jobs will appear here once you start importing data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <Card key={job.id} className="bg-gray-700/30 border-gray-600">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                {job.source_name || 'Unnamed Import'}
              </CardTitle>
              {getStatusBadge(job.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Type</p>
                <p className="text-sm text-white font-medium uppercase">{job.import_type}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Total Products</p>
                <p className="text-sm text-white font-medium">{job.total_products}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Processed</p>
                <p className="text-sm text-green-400 font-medium">{job.processed_products}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Failed</p>
                <p className="text-sm text-red-400 font-medium">{job.failed_products}</p>
              </div>
            </div>

            {/* Progress Bar */}
            {job.status === 'processing' && job.total_products > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span>
                  <span>
                    {Math.round((job.processed_products / job.total_products) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-600 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{
                      width: `${(job.processed_products / job.total_products) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Started: {formatDate(job.created_at)}</span>
              {job.completed_at && <span>Completed: {formatDate(job.completed_at)}</span>}
            </div>

            {job.error_message && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded text-sm text-red-300">
                <strong>Error:</strong> {job.error_message}
              </div>
            )}

            {/* Action Buttons */}
            {job.status === 'completed' && job.import_type === 'xml' && (
              <div className="mt-4 flex gap-2 pt-3 border-t border-gray-600">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleManualRerun(job)}
                  disabled={isRerunning === job.id || !job.original_xml_content}
                  className="bg-blue-600/20 border-blue-600 text-blue-300 hover:bg-blue-600/30"
                >
                  {isRerunning === job.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Re-running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Manual Re-run
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedJobForSchedule(job)}
                  className="bg-purple-600/20 border-purple-600 text-purple-300 hover:bg-purple-600/30"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {job.is_scheduled ? 'Update Schedule' : 'Schedule Cron'}
                </Button>

                {job.is_scheduled && job.next_run_at && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="h-3 w-3" />
                    Next run: {formatDate(job.next_run_at)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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

