/**
 * XML Import Job Card Component
 *
 * Displays detailed information about an XML import job including:
 * - Job status and progress
 * - Product counts (total, processed, failed)
 * - Source information
 * - Error details
 * - Actions (retry, view details, cancel)
 */

import React from 'react';
import { FileText, CheckCircle, XCircle, AlertCircle, Clock, RefreshCw, Eye, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';

export interface XMLImportJob {
  id: string;
  import_type: 'xml' | 'pdf';
  source_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_products: number;
  processed_products: number;
  failed_products: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
  source_url?: string;
  category?: string;
  is_scheduled?: boolean;
  cron_schedule?: string;
  last_run_at?: string;
  next_run_at?: string;
}

interface XMLImportJobCardProps {
  job: XMLImportJob;
  onRetry?: (jobId: string) => void;
  onViewDetails?: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onDelete?: (jobId: string) => void;
}

export const XMLImportJobCard: React.FC<XMLImportJobCardProps> = ({
  job,
  onRetry,
  onViewDetails,
  onCancel,
  onDelete,
}) => {
  const getStatusBadge = (status: string) => {
    const variants = {
      pending: { variant: 'secondary' as const, icon: Clock, text: 'Pending' },
      processing: { variant: 'default' as const, icon: RefreshCw, text: 'Processing' },
      completed: { variant: 'default' as const, icon: CheckCircle, text: 'Completed', className: 'bg-green-600' },
      failed: { variant: 'destructive' as const, icon: XCircle, text: 'Failed' },
    };

    const config = variants[status as keyof typeof variants] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {config.text}
      </Badge>
    );
  };

  const getProgressPercentage = () => {
    if (job.total_products === 0) return 0;
    return Math.round((job.processed_products / job.total_products) * 100);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDuration = () => {
    if (!job.completed_at) return 'In progress...';
    const start = new Date(job.created_at).getTime();
    const end = new Date(job.completed_at).getTime();
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Card className="bg-gray-700/30 border-gray-600">
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
        {/* Job Metrics */}
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
        {job.status === 'processing' && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">Progress</p>
              <p className="text-xs text-white font-medium">{getProgressPercentage()}%</p>
            </div>
            <Progress value={getProgressPercentage()} className="h-2" />
          </div>
        )}

        {/* Additional Info */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
          <div>
            <p className="text-gray-400 mb-1">Created</p>
            <p className="text-white">{formatDate(job.created_at)}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1">Duration</p>
            <p className="text-white">{getDuration()}</p>
          </div>
        </div>

        {/* Source URL */}
        {job.source_url && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 mb-1">Source URL</p>
            <p className="text-xs text-blue-400 truncate">{job.source_url}</p>
          </div>
        )}

        {/* Scheduled Job Info */}
        {job.is_scheduled && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/30 rounded">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-400" />
              <p className="text-sm text-blue-400 font-medium">Scheduled Job</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-400">Schedule</p>
                <p className="text-white">{job.cron_schedule}</p>
              </div>
              {job.next_run_at && (
                <div>
                  <p className="text-gray-400">Next Run</p>
                  <p className="text-white">{formatDate(job.next_run_at)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {job.error_message && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <p className="text-sm text-red-400 font-medium">Error</p>
            </div>
            <p className="text-xs text-gray-300">{job.error_message}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-600">
          {onViewDetails && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(job.id)}
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </Button>
          )}

          {job.status === 'failed' && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRetry(job.id)}
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          )}

          {(job.status === 'pending' || job.status === 'processing') && onCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(job.id)}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}

          {(job.status === 'completed' || job.status === 'failed') && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(job.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};


